/**
 *
 *      .  *  .
 *    *   \|/   *   trouble maker
 *  .  ----+----  .  hunts bugs that lurk in code
 *    *   /|\   *   null derefs, races, wrong logic
 *      .  *  .
 *
 * ╔═════════════════════════════════════════╗
 * ║ Pass 1: minimax/M2.7 -> analyze (smart) ║
 * ║ Pass 2: minimax/M2.5 -> fix (coder)     ║
 * ╚═════════════════════════════════════════╝
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareExistingPr, runPi, readFindings } from "./lib.ts";

const root = join(import.meta.dirname, "../..");

let existingIssues = "";
try {
    const issues = readdirSync(join(root, ".system/issues")).filter((f) => f.endsWith(".md"));
    existingIssues = issues
        .map((f) => f.replace(".md", ""))
        .slice(0, 10)
        .join(", ");
    if (issues.length > 10) existingIssues += `, ...+${issues.length - 10} more`;
} catch {
    /* no issues dir */
}

const piFlags = ["--no-session", "--no-prompt-templates"];
const existingPr = prepareExistingPr("trouble-maker", "agent/trouble-maker-");

if (existingPr) {
    console.log(
        `\n=== Repair existing PR #${existingPr.number} (minimax/MiniMax-M2.5-highspeed) ===\n`,
    );
    runPi(
        "code",
        [
            "-p",
            ...piFlags,
            "--provider",
            "minimax",
            "--model",
            "MiniMax-M2.5-highspeed",
            "--thinking",
            "off",
            "--tools",
            "read,edit,write,bash,grep,find",
            `Repair existing trouble-maker PR #${existingPr.number}.

Read ${existingPr.contextPath}.

Fix unchecked janitor checklist items and actionable review/comment findings.
Keep current PR scope. Add/update tests. Only touch src/ and test/.
Run relevant tests. Write PR body/update notes to /tmp/pi-agent-pr-body.md.

No talk. Repair. Test. Write PR body. Done.`,
        ],
        0,
    );
    try {
        writeFileSync(
            "/tmp/pi-agent-pr-body.md",
            `trouble-maker: addressed janitor feedback for PR #${existingPr.number}.`,
            { flag: "wx" },
        );
    } catch {
        /* already written */
    }
    process.exit(0);
}

// --- Pass 1: analyze ---
console.log("\n=== Pass 1: Analyze (minimax/MiniMax-M2.7-highspeed) ===\n");

runPi(
    "analyze",
    [
        "-p",
        ...piFlags,
        "--provider",
        "minimax",
        "--model",
        "MiniMax-M2.7-highspeed",
        "--thinking",
        "high",
        "--tools",
        "read,write,grep,find,ls",
        `Read src/. Find bugs only (crashes, wrong behavior, null derefs, races).

SKIP these known issues: ${existingIssues || "none"}

Write /tmp/pi-agent-findings.md NOW using the write tool.

If no bugs: write exactly "NO_ISSUES_FOUND" and nothing else.
If bugs: write one line per bug: "FILE:LINE — DESCRIPTION — FIX"

Do not explain. Do not summarize. Just write the file.`,
    ],
    0,
);

const findings = readFindings("trouble-maker");

if (findings === "NO_ISSUES_FOUND" || findings.length === 0) {
    console.log("\nNo bugs found.");
    writeFileSync("/tmp/pi-agent-pr-body.md", "trouble-maker: no bugs.\n");
    process.exit(0);
}

// --- Pass 2: fix ---
console.log("\n=== Pass 2: Fix (minimax/MiniMax-M2.5-highspeed) ===\n");

runPi(
    "code",
    [
        "-p",
        ...piFlags,
        "--provider",
        "minimax",
        "--model",
        "MiniMax-M2.5-highspeed",
        "--thinking",
        "off",
        "--tools",
        "read,edit,write,bash,grep,find",
        `Fix these bugs:

${findings}

Fix each one. Add tests. Only touch src/ and test/. Never touch .system/.
Write PR body to /tmp/pi-agent-pr-body.md.`,
    ],
    0,
);

try {
    writeFileSync("/tmp/pi-agent-pr-body.md", "trouble-maker: see commit.", { flag: "wx" });
} catch {
    /* already written */
}
