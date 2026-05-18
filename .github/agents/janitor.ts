/**
 *
 *        _.-._
 *       /| | |\     janitor
 *       || | ||     sweeps bot PRs, reads CI/comments,
 *       \\_._//     leaves one sticky checklist comment
 *        `---'
 *
 * Uses zai/glm-5.1 for review synthesis.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runPi } from "./lib.ts";

const OWNER = process.env.GITHUB_REPOSITORY_OWNER || "bugabinga";
const REPO_NAME =
    (process.env.GITHUB_REPOSITORY || "bugabinga/hallucygenie").split("/")[1] || "hallucygenie";
const REPO = `${OWNER}/${REPO_NAME}`;
const MARKER = "<!-- hallucygenie-janitor -->";
const timeout = 8 * 60 * 1000;
const tmp = mkdtempSync(join(tmpdir(), "hg-janitor-"));

type PrListItem = {
    number: number;
    title: string;
    headRefName: string;
    headRefOid: string;
    author: { login: string };
    isDraft: boolean;
    mergeStateStatus: string;
    updatedAt: string;
};

type IssueComment = {
    id: number;
    body?: string;
    user?: { login: string };
};

function run(command: string, args: string[], opts: { input?: string; allowFail?: boolean } = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf-8",
        input: opts.input,
        maxBuffer: 16 * 1024 * 1024,
        env: process.env,
    });
    if (!opts.allowFail && result.status !== 0) {
        throw new Error(
            `${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        );
    }
    return result;
}

function gh(args: string[], opts: { input?: string; allowFail?: boolean } = {}) {
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

function listOpenBotPrs() {
    const prs = ghJson<PrListItem[]>([
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,title,headRefName,headRefOid,author,isDraft,mergeStateStatus,updatedAt",
        "--limit",
        "50",
    ]);

    return prs.filter(
        (pr) =>
            pr.headRefName.startsWith("agent/") &&
            ["app/hallucygenie-agent-bot", "app/github-actions"].includes(pr.author.login),
    );
}

function failedRunLogs(statusCheckRollup: any[]) {
    const urls = statusCheckRollup
        .filter((check) =>
            ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(check.conclusion),
        )
        .map((check) => String(check.detailsUrl || ""))
        .filter(Boolean);

    const seen = new Set<string>();
    const chunks: string[] = [];
    for (const url of urls) {
        const match = url.match(/\/actions\/runs\/(\d+)/);
        if (!match) continue;
        const runId = match[1];
        if (seen.has(runId)) continue;
        seen.add(runId);
        const result = gh(["run", "view", runId, "--log-failed"], { allowFail: true });
        const body = result.stdout.trim() || result.stderr.trim();
        if (body) chunks.push(`## Failed run ${runId}\n${truncate(body, 8_000)}`);
    }
    return chunks.join("\n\n");
}

function reviewThreads(number: number) {
    const query = `query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      reviewThreads(first:50) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first:20) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
              diffHunk
              path
              line
              originalLine
            }
          }
        }
      }
    }
  }
}`;
    const result = gh(
        [
            "api",
            "graphql",
            "-f",
            `owner=${OWNER}`,
            "-f",
            `repo=${REPO_NAME}`,
            "-F",
            `number=${number}`,
            "-f",
            `query=${query}`,
        ],
        { allowFail: true },
    );
    if (result.status !== 0) return `Could not fetch review threads:\n${result.stderr}`;
    const parsed = JSON.parse(result.stdout);
    const nodes = parsed?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    if (nodes.length === 0) return "No review threads.";
    return nodes
        .map((thread: any) => {
            const comments = (thread.comments?.nodes ?? [])
                .map(
                    (comment: any) =>
                        `- ${comment.author?.login || "unknown"} ${comment.path || thread.path}:${comment.line || thread.line || "?"} ${comment.createdAt}\n  ${String(comment.body || "").replace(/\n/g, "\n  ")}\n  ${comment.url || ""}`,
                )
                .join("\n");
            return `Thread ${thread.id} resolved=${thread.isResolved} outdated=${thread.isOutdated} path=${thread.path}:${thread.line || "?"}\n${comments}`;
        })
        .join("\n\n");
}

function existingStickyComment(number: number) {
    const comments = ghJson<IssueComment[]>([
        "api",
        `/repos/${REPO}/issues/${number}/comments`,
        "--paginate",
    ]);
    return comments.find((comment) => comment.body?.includes(MARKER));
}

function upsertStickyComment(number: number, body: string) {
    const normalized = body.includes(MARKER) ? body : `${MARKER}\n\n${body}`;
    const payload = JSON.stringify({ body: normalized });
    const comment = existingStickyComment(number);
    if (comment) {
        gh(
            [
                "api",
                "--method",
                "PATCH",
                `/repos/${REPO}/issues/comments/${comment.id}`,
                "--input",
                "-",
            ],
            {
                input: payload,
            },
        );
        console.log(`Updated janitor comment on PR #${number}`);
    } else {
        gh(
            ["api", "--method", "POST", `/repos/${REPO}/issues/${number}/comments`, "--input", "-"],
            {
                input: payload,
            },
        );
        console.log(`Created janitor comment on PR #${number}`);
    }
}

function normalizeCommentBody(body: string) {
    let normalized = body.trim();
    if (!normalized.includes(MARKER)) normalized = `${MARKER}\n\n${normalized}`;
    normalized = normalized.replace(/^Request-Copilot:.*\n?/gim, "");

    const status = normalized
        .match(/## Janitor status:\s*([^\n]+)/i)?.[1]
        ?.trim()
        .toLowerCase();
    const hasUncheckedItems = /^- \[ \]/m.test(normalized);
    const hasHumanOnlyUncheckedItems =
        /^- \[ \].*(action_required|unknown merge state|manual approval|human decision|\bsecurity\b|\bauth\b|\bdeploy\b|workflow risk|duplicate PR|(?:three|3) failed repair attempts|repeated (?:failed )?repair (?:attempts|failures?))/im.test(
            normalized,
        );
    const hasAgentRepairableUncheckedItems =
        /^- \[ \].*(PR body|metadata|CI|check|test|code|fix|frontmatter|logs?|branch behind|behind trunk|rebase|out[- ]of[- ]date|merge conflict|conflict)/im.test(
            normalized,
        );
    if (status === "ready" && hasUncheckedItems) {
        normalized = normalized.replace(
            /## Janitor status:\s*ready/i,
            "## Janitor status: needs-fix",
        );
    }
    if (
        status === "needs-human" &&
        hasAgentRepairableUncheckedItems &&
        !hasHumanOnlyUncheckedItems
    ) {
        normalized = normalized.replace(
            /## Janitor status:\s*needs-human/i,
            "## Janitor status: needs-fix",
        );
    }
    if (status === "needs-fix" && hasHumanOnlyUncheckedItems) {
        normalized = normalized.replace(
            /## Janitor status:\s*needs-fix/i,
            "## Janitor status: needs-human",
        );
    }

    return normalized.trim();
}

function buildContext(pr: PrListItem) {
    const detail = ghJson<any>([
        "pr",
        "view",
        String(pr.number),
        "--json",
        "number,title,body,author,headRefName,headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,comments,reviews,files,commits,statusCheckRollup,labels,updatedAt,createdAt",
    ]);
    const checks = detail.statusCheckRollup ?? [];
    const checksSummary = checks
        .map(
            (check: any) =>
                `- ${check.name}: status=${check.status || ""} conclusion=${check.conclusion || ""} url=${check.detailsUrl || ""}`,
        )
        .join("\n");
    const files = (detail.files ?? [])
        .map((file: any) => `- ${file.path} +${file.additions} -${file.deletions}`)
        .join("\n");
    const reviews = (detail.reviews ?? [])
        .map(
            (review: any) =>
                `- ${review.author?.login || "unknown"} state=${review.state} commit=${review.commit?.oid || ""}\n  ${String(review.body || "").replace(/\n/g, "\n  ")}`,
        )
        .join("\n\n");
    const comments = (detail.comments ?? [])
        .map(
            (comment: any) =>
                `- ${comment.author?.login || "unknown"} ${comment.createdAt}\n  ${String(comment.body || "").replace(/\n/g, "\n  ")}`,
        )
        .join("\n\n");

    const diff = gh(["pr", "diff", String(pr.number)], { allowFail: true }).stdout;
    const existingSticky =
        existingStickyComment(pr.number)?.body || "No janitor sticky comment yet.";
    const failures = failedRunLogs(checks);

    return `# Janitor PR Context

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
Labels: ${(detail.labels ?? []).map((label: any) => label.name).join(", ") || "none"}

## PR body
${detail.body || "(empty)"}

## Changed files
${files || "none"}

## CI checks
${checksSummary || "No checks found."}

## Failed logs
${failures ? shellBlock(failures) : "No failed logs."}

## Existing janitor sticky comment
${existingSticky}

## PR conversation comments
${comments || "No conversation comments."}

## Reviews
${reviews || "No reviews."}

## Review threads
${reviewThreads(pr.number)}

## Diff
${shellBlock(truncate(diff || "No diff available.", 20_000))}
`;
}

function reviewPr(pr: PrListItem) {
    const contextPath = join(tmp, `pr-${pr.number}-context.md`);
    const outputPath = join(tmp, `pr-${pr.number}-comment.md`);
    writeFileSync(contextPath, buildContext(pr));

    runPi(
        "analyze",
        [
            "-p",
            "--no-session",
            "--no-prompt-templates",
            "--provider",
            "zai",
            "--model",
            "glm-5.1",
            "--thinking",
            "medium",
            "--tools",
            "read,write",
            `You are hallucygenie janitor.

Read ${contextPath}. Write exactly one GitHub PR sticky comment to ${outputPath} using the write tool.

Hard requirements:
- Include this marker as the first line: ${MARKER}
- Keep it under 1200 words.
- Be concrete and terse.
- Use this shape:

${MARKER}

## Janitor status: needs-fix | ready | needs-human | waiting-for-ci

## Checklist
- [ ] ...
- [x] ...

## CI
...

## Notes for owning agent
...

Decision rules:
- waiting-for-ci: latest required checks are pending or missing.
- needs-fix: CI failed, branch is behind/out-of-date/rebase needed, merge conflicts need resolution, or code/test/PR body/metadata issues require changes the owning agent can make.
- ready: CI green, branch is current/mergeable, and no actionable unresolved issues.
- needs-human: three failed repair attempts on the same blocker, action_required check, unknown merge state, security/auth/deploy/workflow risk, broad unclear change, duplicate PR, or human decision needed.
- Do not use needs-human for failed CI, branch behind/out-of-date, rebase needed, or merge conflicts until the owning agent has failed that same repair three times.
- If status is ready, every checklist item must be checked.
- Use unchecked checklist items only for issues that block ready status.
- Do not request or mention Copilot review.
- Convert review findings into checklist items. Do not mention resolving GitHub review threads.
- Address owning agent directly. Tell it to fix only current PR scope.

No extra output. Just write the file.`,
        ],
        timeout,
    );

    if (!existsSync(outputPath)) throw new Error(`Janitor did not write ${outputPath}`);
    const body = normalizeCommentBody(readFileSync(outputPath, "utf-8"));
    if (!body.includes(MARKER))
        throw new Error(`Janitor output missing marker for PR #${pr.number}`);
    upsertStickyComment(pr.number, body);
}

const prs = listOpenBotPrs();
if (prs.length === 0) {
    console.log("No open bot PRs.");
    process.exit(0);
}

console.log(
    `Reviewing ${prs.length} open bot PR(s): ${prs.map((pr) => `#${pr.number}`).join(", ")}`,
);
for (const pr of prs) reviewPr(pr);
