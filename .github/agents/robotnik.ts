/**
 *
 *         .-"""-.
 *        /  .-.  \      robotnik
 *       |  /   \  |     grabs the next open issue,
 *       |  \___/  |     bolts on a fix,
 *        \  ___  /      ships one PR at a time
 *         `-...-'
 *        /|     |\
 *
 * ╔═════════════════════════════════════════╗
 * ║ Single pass: zai/glm-5.1 -> fix issue   ║
 * ╚═════════════════════════════════════════╝
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareExistingPr, runPi } from "./lib.ts";

const root = join(import.meta.dirname, "../..");
const ISSUES_DIR = join(root, ".system/issues");
const SPECS_DIR = join(root, ".system/specs");
const piFlags = ["--no-session", "--no-prompt-templates"];
const timeout = 10 * 60 * 1000;

function issueIdFromName(name: string) {
    return name.match(/HG-ISSUE-\d{3}/)?.[0] || "";
}

function issueNumber(id: string) {
    return Number(id.match(/\d{3}/)?.[0] || Number.MAX_SAFE_INTEGER);
}

function issueSlug(name: string) {
    return name
        .replace(/\.md$/, "")
        .replace(/^HG-ISSUE-\d{3}-?/, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 64);
}

function statusOf(text: string) {
    return text.match(/"status":\s*"([^"]+)"/)?.[1] || "";
}

function specRefs(text: string) {
    return [...new Set(text.match(/HG-SPEC-\d{3}/g) ?? [])];
}

function nextOpenIssue() {
    if (!existsSync(ISSUES_DIR)) return undefined;
    return readdirSync(ISSUES_DIR)
        .filter((name) => name.endsWith(".md"))
        .map((name) => {
            const path = join(ISSUES_DIR, name);
            const text = readFileSync(path, "utf-8");
            return { name, path, text, id: issueIdFromName(name), status: statusOf(text) };
        })
        .filter((issue) => issue.id && issue.status === "open")
        .sort((a, b) => issueNumber(a.id) - issueNumber(b.id))[0];
}

function specsBlock(issueText: string) {
    return specRefs(issueText)
        .map((id) => {
            const path = join(SPECS_DIR, `${id}.md`);
            if (!existsSync(path)) return `## ${id}\nMissing spec file.`;
            return `## ${id}\n${readFileSync(path, "utf-8")}`;
        })
        .join("\n\n");
}

function issueFromExistingBranch(branch: string) {
    const id = branch.match(/HG-ISSUE-\d{3}/)?.[0];
    if (!id || !existsSync(ISSUES_DIR)) return undefined;
    const file = readdirSync(ISSUES_DIR).find(
        (name) => name.startsWith(id) && name.endsWith(".md"),
    );
    if (!file) return undefined;
    const path = join(ISSUES_DIR, file);
    return { id, path, name: file, text: readFileSync(path, "utf-8") };
}

const existingPr = prepareExistingPr("robotnik", "agent/robotnik-");

if (existingPr) {
    const issue = issueFromExistingBranch(existingPr.branch);
    const issueBlock = issue
        ? `\nISSUE ${issue.id}\nPath: ${issue.path}\n${issue.text}\n\nRELATED SPECS\n${specsBlock(issue.text) || "none"}`
        : "";

    console.log(`\n=== Repair existing PR #${existingPr.number} (zai/glm-5.1) ===\n`);
    runPi(
        "code",
        [
            "-p",
            ...piFlags,
            "--provider",
            "zai",
            "--model",
            "glm-5.1",
            "--thinking",
            "off",
            "--tools",
            "read,edit,write,bash,grep,find",
            `Repair existing robotnik PR #${existingPr.number}.

Read ${existingPr.contextPath}.
${issueBlock}

Fix unchecked janitor checklist items and actionable review/comment findings.
Keep current issue scope. Add/update tests.
If the issue is fully fixed, set its .system/issues status to "fixed"; otherwise leave it "open".
Run relevant tests. Write PR body/update notes to /tmp/pi-agent-pr-body.md.

No talk. Repair. Test. Write PR body. Done.`,
        ],
        timeout,
    );
    try {
        writeFileSync(
            "/tmp/pi-agent-pr-body.md",
            `robotnik: addressed janitor feedback for PR #${existingPr.number}.`,
            { flag: "wx" },
        );
    } catch {
        /* already written */
    }
    process.exit(0);
}

const issue = nextOpenIssue();
if (!issue) {
    console.log("No open issues found.");
    writeFileSync("/tmp/pi-agent-pr-body.md", "robotnik: no open issues.\n");
    process.exit(0);
}

const slug = issueSlug(issue.name);
writeFileSync("/tmp/pi-agent-issue-id", issue.id);
writeFileSync("/tmp/pi-agent-issue-slug", slug || "issue");

console.log(`Fixing issue: ${issue.id} (${issue.name})`);

runPi(
    "code",
    [
        "-p",
        ...piFlags,
        "--provider",
        "zai",
        "--model",
        "glm-5.1",
        "--thinking",
        "medium",
        "--tools",
        "read,edit,write,bash,grep,find",
        `You are robotnik, the issue fixer.

Fix the next open hallucygenie issue.

ISSUE ${issue.id}
Path: ${issue.path}
${issue.text}

RELATED SPECS
${specsBlock(issue.text) || "none"}

JOB
- Implement the smallest complete fix for ${issue.id}.
- Add/update tests proving the issue is fixed.
- Update ${issue.path} frontmatter status from "open" to "fixed" only if the fix and tests are complete.
- Keep scope to this issue. Prefer touching src/, public/, test/, and this one issue file.
- Run relevant tests or explain why not in PR body.
- Write PR body to /tmp/pi-agent-pr-body.md. Include issue id, summary, tests.

No talk. Fix. Test. Write PR body. Done.`,
    ],
    timeout,
);

try {
    writeFileSync("/tmp/pi-agent-pr-body.md", `robotnik: fixes ${issue.id}.`, { flag: "wx" });
} catch {
    /* already written */
}
