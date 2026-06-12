/**
 * System Extension
 *
 * - Injects MISSION and RULES into every system prompt.
 * - Protects readonly .system files (MISSION, RULES) from agent writes.
 * - Requires human approval for spec writes.
 * - Validates issue frontmatter on write/edit: blocks on bad syntax/status,
 *   advisory notifications for dangling spec refs.
 * - /system issues command to list collected advisory problems.
 *
 * Write-protection is advisory: catches direct write/edit/bash tool calls,
 * but is not exhaustive. The primary protection is the system prompt
 * instruction. The tool filter is a safety net, not a security boundary.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HARD_READONLY_FILES = ["MISSION.md", "RULES.md", "SYSTEM.md"];
const APPROVAL_DIRS = ["specs"];
const VALID_STATUSES = new Set(["open", "fixed"]);
const ISSUE_DIR_NAME = "issues";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function systemDir(cwd: string): string {
    return path.join(cwd, ".system");
}

function absPath(filePath: string, cwd: string): string {
    return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd, filePath);
}

function isHardReadonlyPath(filePath: string, cwd: string): boolean {
    const abs = absPath(filePath, cwd);
    const sysDir = systemDir(cwd);
    return HARD_READONLY_FILES.some((name) => abs === path.join(sysDir, name));
}

function isApprovalPath(filePath: string, cwd: string): boolean {
    const abs = absPath(filePath, cwd);
    const sysDir = systemDir(cwd);
    for (const dir of APPROVAL_DIRS) {
        const dirPath = path.join(sysDir, dir);
        if (abs.startsWith(dirPath + path.sep) || abs === dirPath) return true;
    }
    return false;
}

function isIssuePath(filePath: string, cwd: string): boolean {
    const abs = absPath(filePath, cwd);
    const issueDir = path.join(systemDir(cwd), ISSUE_DIR_NAME);
    return abs.startsWith(issueDir + path.sep) && abs.endsWith(".md");
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

interface IssueFrontmatter {
    status: string;
    specs: string[];
}

function parseFrontmatter(content: string): {
    meta: IssueFrontmatter | null;
    error: string | null;
} {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith("---")) {
        return { meta: null, error: "missing --- frontmatter delimiter" };
    }
    const secondDash = trimmed.indexOf("---", 3);
    if (secondDash === -1) {
        return { meta: null, error: "missing closing --- frontmatter delimiter" };
    }
    const jsonStr = trimmed.slice(3, secondDash).trim();
    if (!jsonStr) {
        return { meta: null, error: "empty frontmatter" };
    }
    try {
        const parsed = JSON.parse(jsonStr);
        return { meta: parsed, error: null };
    } catch (e) {
        return { meta: null, error: `invalid JSON in frontmatter: ${(e as Error).message}` };
    }
}

function validateFrontmatter(meta: unknown): {
    valid: IssueFrontmatter | null;
    errors: string[];
} {
    const errors: string[] = [];

    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
        return { valid: null, errors: ["frontmatter must be a JSON object"] };
    }

    const obj = meta as Record<string, unknown>;

    // status
    if (!("status" in obj)) {
        errors.push("missing required field: status");
    } else if (typeof obj.status !== "string") {
        errors.push("status must be a string");
    } else if (!VALID_STATUSES.has(obj.status.toLowerCase())) {
        errors.push(
            `invalid status "${obj.status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`
        );
    }

    // specs
    if (!("specs" in obj)) {
        errors.push("missing required field: specs");
    } else if (!Array.isArray(obj.specs)) {
        errors.push("specs must be an array");
    } else {
        for (let i = 0; i < obj.specs.length; i++) {
            if (typeof obj.specs[i] !== "string") {
                errors.push(`specs[${i}] must be a string`);
            }
        }
    }

    if (errors.length > 0) return { valid: null, errors };

    return {
        valid: {
            status: (obj.status as string).toLowerCase(),
            specs: obj.specs as string[]
        },
        errors: []
    };
}

// ---------------------------------------------------------------------------
// Spec ref checker
// ---------------------------------------------------------------------------

function checkSpecRefs(specs: string[], cwd: string): { missing: string[]; } {
    const specsDir = path.join(systemDir(cwd), "specs");
    const missing: string[] = [];
    for (const ref of specs) {
        // ref could be "HG-SPEC-014" or "HG-SPEC-014-slug.md"
        const id = ref.replace(/\.md$/, "");
        const exists = fs.readdirSync(specsDir).some((f) => f.startsWith(id));
        if (!exists) {
            missing.push(ref);
        }
    }
    return { missing };
}

// ---------------------------------------------------------------------------
// Advisory problems store (session-scoped)
// ---------------------------------------------------------------------------

const advisoryProblems = new Map<string, string[]>();

function addAdvisory(issueFile: string, problem: string): void {
    const existing = advisoryProblems.get(issueFile) ?? [];
    if (!existing.includes(problem)) {
        existing.push(problem);
        advisoryProblems.set(issueFile, existing);
    }
}

function clearAdvisory(issueFile: string): void {
    advisoryProblems.delete(issueFile);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function(pi: ExtensionAPI) {
    // -------------------------------------------------------------------------
    // before_agent_start: inject MISSION + RULES
    // -------------------------------------------------------------------------
    pi.on("before_agent_start", async (event, ctx) => {
        const sysDir = systemDir(ctx.cwd);
        let section = "";

        const files: [string, string][] = [
            ["SYSTEM.md", "System"],
            ["MISSION.md", "Mission"],
            ["RULES.md", "Rules"]
        ];

        for (const [name, heading] of files) {
            const p = path.join(sysDir, name);
            if (fs.existsSync(p)) {
                section += `\n\n## ${heading}\n\n` + fs.readFileSync(p, "utf-8");
            }
        }
        if (!section) return;

        return { systemPrompt: event.systemPrompt + section };
    });

    // -------------------------------------------------------------------------
    // tool_call: readonly protection + issue frontmatter validation
    // -------------------------------------------------------------------------
    pi.on("tool_call", async (event, ctx) => {
        const cwd = ctx.cwd;

        async function requireHumanApproval(targetPath: string, action: string) {
            const rel = path.relative(cwd, absPath(targetPath, cwd));
            if (!ctx.hasUI) {
                return {
                    block: true,
                    reason: `${rel} human approval required, but no UI is available.`
                };
            }
            const choice = await ctx.ui.select(
                `Human approval required\n\nAllow ${action} to ${rel}?`,
                ["Yes", "No", "Custom"]
            );
            if (choice === "Yes") return undefined;
            if (choice === "Custom") {
                const custom = (
                    await ctx.ui.input("Steer agent", "Tell agent what to do instead")
                )?.trim();
                if (custom) {
                    pi.sendUserMessage(custom, { deliverAs: "steer" });
                    return {
                        block: true,
                        reason: `${rel} blocked by human approval gate; custom steering queued.`
                    };
                }
            }
            ctx.abort();
            return { block: true, reason: `${rel} blocked by human approval gate.` };
        }

        // --- Readonly path protection ---
        if (event.toolName === "write" || event.toolName === "edit") {
            const targetPath = event.input?.path as string | undefined;
            if (targetPath && isHardReadonlyPath(targetPath, cwd)) {
                const rel = path.relative(cwd, absPath(targetPath, cwd));
                return { block: true, reason: `${rel} is readonly.` };
            }
            if (targetPath && isApprovalPath(targetPath, cwd)) {
                const approval = await requireHumanApproval(targetPath, event.toolName);
                if (approval) return approval;
            }
        }

        if (event.toolName === "bash") {
            const cmd = (event.input?.command as string) || "";
            const sysDir = systemDir(cwd);
            for (const name of HARD_READONLY_FILES) {
                const protectedPath = path.join(sysDir, name);
                const rel = path.relative(cwd, protectedPath);
                const pattern = new RegExp(
                    `(>>|>|tee\\s).*${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
                );
                if (pattern.test(cmd)) return { block: true, reason: `${rel} is readonly.` };
            }
            for (const dir of APPROVAL_DIRS) {
                const approvalPath = path.join(sysDir, dir);
                const rel = path.relative(cwd, approvalPath);
                const pattern = new RegExp(
                    `(>>|>|tee\\s).*${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
                );
                if (pattern.test(cmd)) {
                    const approval = await requireHumanApproval(approvalPath, "bash write");
                    if (approval) return approval;
                }
            }
        }

        // --- Issue frontmatter validation on write/edit ---
        if (event.toolName === "write" || event.toolName === "edit") {
            const targetPath = event.input?.path as string | undefined;
            if (!targetPath || !isIssuePath(targetPath, cwd)) return;

            // Get the content to validate
            const content = event.toolName === "write"
                ? (event.input.content as string | undefined)
                : undefined;

            // For edit, we need to reconstruct content from patches —
            // read the existing file and apply the edits
            let fullContent = content ?? "";
            if (event.toolName === "edit" && fs.existsSync(targetPath)) {
                fullContent = fs.readFileSync(targetPath, "utf-8");
            }

            if (!fullContent.trim()) return;

            // Parse frontmatter
            const { meta, error: parseError } = parseFrontmatter(fullContent);
            if (parseError) {
                return {
                    block: true,
                    reason:
                        `Issue frontmatter error: ${parseError}\n\nExpected format:\n---\n{ "status": "open", "specs": ["HG-SPEC-NNN"] }\n---`
                };
            }

            // Validate fields
            const { valid, errors: validationErrors } = validateFrontmatter(meta);
            if (validationErrors.length > 0) {
                return {
                    block: true,
                    reason: `Issue validation failed:\n${
                        validationErrors.map((e) => `- ${e}`).join("\n")
                    }`
                };
            }

            // Check spec refs (advisory, not blocking)
            clearAdvisory(path.resolve(targetPath));
            if (valid!.specs.length === 0) {
                const issueRel = path.relative(cwd, path.resolve(targetPath));
                addAdvisory(issueRel, "no spec refs — consider linking to a relevant spec");
            }
            const { missing } = checkSpecRefs(valid!.specs, cwd);
            if (missing.length > 0) {
                const issueRel = path.relative(cwd, path.resolve(targetPath));
                const problem = `dangling spec refs: ${missing.join(", ")}`;
                addAdvisory(issueRel, problem);
                ctx.ui.notify(
                    `⚠ ${issueRel}: ${problem}\nSpec may have been deleted, renamed, or merged. Run /system issues to review.`,
                    "warning"
                );
            }
        }
    });

    // -------------------------------------------------------------------------
    // /system command
    // -------------------------------------------------------------------------
    const SYSTEM_SUBCOMMANDS = ["issues"];

    pi.registerCommand("system", {
        description: "System extension commands",
        getArgumentCompletions: (prefix: string) => {
            const matches = SYSTEM_SUBCOMMANDS.filter((s) => s.startsWith(prefix));
            return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
        },
        handler: async (args, ctx) => {
            const sub = args.trim();

            if (sub === "issues") {
                if (advisoryProblems.size === 0) {
                    ctx.ui.notify("No advisory problems.", "info");
                    return;
                }

                const lines: string[] = ["⚠ Advisory problems:", ""];
                for (const [file, problems] of advisoryProblems) {
                    lines.push(`${file}:`);
                    for (const p of problems) {
                        lines.push(`  - ${p}`);
                    }
                }
                ctx.ui.notify(lines.join("\n"), "info");
                return;
            }

            ctx.ui.notify("Usage: /system issues — list collected advisory problems", "info");
        }
    });
}
