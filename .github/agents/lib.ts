/**
 * Shared runner/helpers for agent passes.
 * Clean errors. No prompt leaks. Timeout-aware.
 * Sets up PI_CODING_AGENT_DIR with models.json from this directory.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PiRole = "analyze" | "code";

// Set up isolated agent dir with models.json for custom model definitions
const agentDir = "/tmp/pi-agent-cfg";
mkdirSync(agentDir, { recursive: true });
try {
    cpSync(
        join(import.meta.dirname, "models.json"),
        join(agentDir, "models.json")
    );
} catch {
    /* no models.json — use built-ins only */
}

const REPO = process.env.GITHUB_REPOSITORY || "bugabinga/hallucygenie";
const BOT_AUTHORS = new Set([
    "app/hallucygenie-agent-bot",
    "app/github-actions"
]);
const JANITOR_MARKER = "<!-- hallucygenie-janitor -->";
export const AGENT_PASS_TIMEOUT_MS = 20 * 60 * 1000;
const SOFT_FAIL_MARKER = "/tmp/pi-agent-soft-failed";

type ExistingPrListItem = {
    number: number;
    title: string;
    headRefName: string;
    headRefOid: string;
    baseRefName: string;
    author: { login: string; };
    isDraft: boolean;
    updatedAt: string;
};

type IssueComment = {
    id: number;
    body?: string;
    created_at?: string;
    user?: { login: string; };
};

type StatusCheck = {
    name?: string;
    status?: string;
    conclusion?: string;
    detailsUrl?: string;
};

type PrFile = {
    path?: string;
    additions?: number;
    deletions?: number;
};

type PrReview = {
    author?: { login?: string; };
    state?: string;
    commit?: { oid?: string; };
    body?: string;
};

type PrLabel = { name?: string; };

type PrDetail = {
    number?: number;
    title?: string;
    body?: string;
    author?: { login?: string; };
    headRefName?: string;
    headRefOid?: string;
    baseRefName?: string;
    isDraft?: boolean;
    mergeStateStatus?: string;
    reviewDecision?: string;
    comments?: unknown[];
    reviews?: PrReview[];
    files?: PrFile[];
    commits?: unknown[];
    statusCheckRollup?: StatusCheck[];
    labels?: PrLabel[];
    updatedAt?: string;
    createdAt?: string;
};

export type ExistingPrContext = {
    number: number;
    branch: string;
    contextPath: string;
};

type ExistingPrCandidate = {
    pr: ExistingPrListItem;
    comments: IssueComment[];
    sticky: string;
    status: string;
    owned: boolean;
};

function run(
    command: string,
    args: string[],
    opts: { input?: string; allowFail?: boolean; } = {}
) {
    const result = spawnSync(command, args, {
        encoding: "utf-8",
        input: opts.input,
        maxBuffer: 16 * 1024 * 1024,
        env: process.env
    });
    if (!opts.allowFail && result.status !== 0) {
        throw new Error(
            `${command} ${
                args.join(" ")
            } failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
        );
    }
    return result;
}

function gh(
    args: string[],
    opts: { input?: string; allowFail?: boolean; } = {}
) {
    return run("gh", args, opts);
}

function ghJson<T>(args: string[]): T {
    const result = gh(args);
    return JSON.parse(result.stdout) as T;
}

function truncate(text: string, max = 12_000) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

function shellBlock(text: string) {
    return `\`\`\`txt\n${text.replaceAll("```", "` ` `")}\n\`\`\``;
}

function janitorStatus(body: string) {
    return (
        body
            .match(/## Janitor status:\s*([^\n]+)/i)?.[1]
            ?.trim()
            .toLowerCase() || ""
    );
}

function findJanitorComment(comments: IssueComment[]) {
    return comments.find((comment) => comment.body?.includes(JANITOR_MARKER));
}

function resetWorkingTree() {
    run("git", ["reset", "--hard"], { allowFail: true });
}

function softFail(message: string): never {
    const body = `SOFT_FAIL: ${message}\n`;
    console.error(`\n${body}`);
    resetWorkingTree();
    writeFileSync(SOFT_FAIL_MARKER, body);
    writeFileSync("/tmp/pi-agent-pr-body.md", body);
    process.exit(0);
}

function checkoutBranch(branch: string) {
    run("git", [
        "fetch",
        "origin",
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`
    ]);
    run("git", ["checkout", "-B", branch, `origin/${branch}`]);
}

function updateBranchWithBase(baseRefName: string) {
    run("git", [
        "fetch",
        "origin",
        `+refs/heads/${baseRefName}:refs/remotes/origin/${baseRefName}`
    ]);
    const result = run("git", ["merge", "--no-edit", `origin/${baseRefName}`], {
        allowFail: true
    });
    if (result.status === 0) {
        const output = `${result.stdout}${result.stderr}`.trim();
        if (output) console.log(output);
        return;
    }

    console.log(
        `Automatic base update failed; leaving PR branch unchanged for agent repair.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    run("git", ["merge", "--abort"], { allowFail: true });
}

function buildExistingPrContext(
    pr: ExistingPrListItem,
    comments: IssueComment[]
) {
    const detail = ghJson<PrDetail>([
        "pr",
        "view",
        String(pr.number),
        "--json",
        "number,title,body,author,headRefName,headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,comments,reviews,files,commits,statusCheckRollup,labels,updatedAt,createdAt"
    ]);
    const checks = detail.statusCheckRollup ?? [];
    const checksSummary = checks
        .map(
            (check) =>
                `- ${check.name}: status=${check.status || ""} conclusion=${
                    check.conclusion || ""
                } url=${check.detailsUrl || ""}`
        )
        .join("\n");
    const files = (detail.files ?? [])
        .map((file) => `- ${file.path} +${file.additions} -${file.deletions}`)
        .join("\n");
    const reviews = (detail.reviews ?? [])
        .map(
            (review) =>
                `- ${review.author?.login || "unknown"} state=${review.state} commit=${
                    review.commit?.oid || ""
                }\n  ${String(review.body || "").replace(/\n/g, "\n  ")}`
        )
        .join("\n\n");
    const conversation = comments
        .map(
            (comment) =>
                `- ${comment.user?.login || "unknown"} ${comment.created_at || ""}\n  ${
                    String(comment.body || "").replace(/\n/g, "\n  ")
                }`
        )
        .join("\n\n");
    const diff = gh(["pr", "diff", String(pr.number)], {
        allowFail: true
    }).stdout;
    const sticky = findJanitorComment(comments)?.body || "No janitor sticky comment.";

    return `# Existing Bot PR Repair Context

Repository: ${REPO}
PR: #${detail.number}
Title: ${detail.title}
Author: ${detail.author?.login}
Branch: ${detail.headRefName}
Head SHA: ${detail.headRefOid}
Base: ${detail.baseRefName}
Draft: ${detail.isDraft}
Merge state: ${detail.mergeStateStatus}
Review decision: ${detail.reviewDecision || "none"}
Labels: ${(detail.labels ?? []).map((label) => label.name).join(", ") || "none"}

## Goal
Repair this existing PR. Do not create unrelated work. Fix only unchecked janitor checklist items and actionable review/comment findings that are still in scope.

## Janitor sticky comment
${sticky}

## PR body
${detail.body || "(empty)"}

## Changed files
${files || "none"}

## CI checks
${checksSummary || "No checks found."}

## PR conversation comments
${conversation || "No conversation comments."}

## Reviews
${reviews || "No reviews."}

## Diff
${shellBlock(truncate(diff || "No diff available.", 20_000))}
`;
}

export function prepareExistingPr(
    agentName: string,
    branchPrefix: string
): ExistingPrContext | undefined {
    if (process.env.GITHUB_ACTIONS !== "true") return undefined;

    const probe = gh(["auth", "status"], { allowFail: true });
    if (probe.status !== 0) return undefined;

    const candidates = ghJson<ExistingPrListItem[]>([
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,title,headRefName,headRefOid,baseRefName,author,isDraft,updatedAt",
        "--limit",
        "50"
    ])
        .filter(
            (pr) =>
                pr.headRefName.startsWith("agent/")
                && BOT_AUTHORS.has(pr.author.login)
        )
        .map((pr): ExistingPrCandidate => {
            const comments = ghJson<IssueComment[]>([
                "api",
                `/repos/${REPO}/issues/${pr.number}/comments`,
                "--paginate"
            ]);
            const sticky = findJanitorComment(comments)?.body || "";
            return {
                pr,
                comments,
                sticky,
                status: janitorStatus(sticky),
                owned: pr.headRefName.startsWith(branchPrefix)
            };
        })
        .sort((a, b) => {
            if (a.owned !== b.owned) return a.owned ? -1 : 1;
            return a.pr.updatedAt.localeCompare(b.pr.updatedAt);
        });

    const repair = candidates.find((item) => item.status === "needs-fix");
    if (repair) {
        console.log(
            `Repairing existing ${agentName} PR #${repair.pr.number} (${repair.pr.headRefName}) from janitor checklist`
        );
        checkoutBranch(repair.pr.headRefName);
        updateBranchWithBase(repair.pr.baseRefName);

        const contextPath = "/tmp/pi-agent-pr-context.md";
        writeFileSync(
            contextPath,
            buildExistingPrContext(repair.pr, repair.comments)
        );
        writeFileSync("/tmp/pi-agent-existing-pr-number", String(repair.pr.number));
        writeFileSync("/tmp/pi-agent-existing-pr-branch", repair.pr.headRefName);

        return {
            number: repair.pr.number,
            branch: repair.pr.headRefName,
            contextPath
        };
    }

    const blocker = candidates[0];
    if (blocker) {
        const status = blocker.status || "awaiting-janitor";
        const message =
            `${agentName}: open bot PR #${blocker.pr.number} (${blocker.pr.headRefName}) is ${status}; skipping new work so patrol agents cooperate on existing PRs.\n`;
        console.log(message.trim());
        writeFileSync("/tmp/pi-agent-pr-body.md", message);
        process.exit(0);
    }

    return undefined;
}

export function runPi(role: PiRole, args: string[], timeout = AGENT_PASS_TIMEOUT_MS): void {
    const label = role === "analyze" ? "Pass 1 (analyze)" : "Pass 2 (code)";
    const result = spawnSync("pi", args, {
        stdio: "inherit",
        env: { ...process.env, PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agentDir },
        timeout
    });

    if (result.error) {
        const code = (result.error as NodeJS.ErrnoException).code;
        if (code === "ETIMEDOUT") {
            softFail(`${label} TIMED OUT after ${timeout / 1000}s`);
        }
        softFail(`${label} FAILED: ${code || result.error.message}`);
    }

    if (result.signal) {
        softFail(`${label} KILLED by signal ${result.signal}`);
    }

    if (result.status && result.status !== 0) {
        softFail(`${label} exited with code ${result.status}`);
    }
}

export function readFindings(context: string): string {
    try {
        return readFileSync("/tmp/pi-agent-findings.md", "utf-8").trim();
    } catch {
        softFail(
            `PASS 1 DID NOT WRITE FINDINGS for ${context}: missing /tmp/pi-agent-findings.md`
        );
    }
}
