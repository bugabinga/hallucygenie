/**
 *
 *      .  *  .
 *    *   \|/   *   trouble maker
 *  .  ----+----  .  hunts bugs that lurk in code
 *    *   /|\   *   null derefs, races, wrong logic
 *      .  *  .
 *
 * ╔═════════════════════════════════════════╗
 * ║ Pass 1: zai/glm-5.1  -> analyze (smart) ║
 * ║ Pass 2: minimax/M2.5 -> fix (coder)     ║
 * ╚═════════════════════════════════════════╝
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPi, readFindings } from "./lib.ts";

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
// No per-pass timeout — rely on job-level timeout-minutes (25m)
// Per-pass timeout was killing analyze before the model finished.
const timeout = 0;

// --- Pass 1: analyze ---
console.log("\n=== Pass 1: Analyze (zai/glm-5.1) ===\n");

runPi(
    "analyze",
    [
        "-p",
        ...piFlags,
        "--provider",
        "zai",
        "--model",
        "glm-5.1",
        "--thinking",
        "high",
        "--tools",
        "read,write,grep,find,ls",
        `Analyst. Write tool only. Target: /tmp/pi-agent-findings.md

KNOWN (skip)
${existingIssues || "none"}

JOB
Read all src/. Hunt real bugs:
- null/undefined deref, unhandled rejections
- wrong logic, race conditions, missing error handling
- off-by-one, wrong data shape assumptions

Write findings to /tmp/pi-agent-findings.md.

NO BUGS -> one word: NO_ISSUES_FOUND
BUGS -> per bug: file, line, wrong, fix. No intro. No summary.

Not style. Not naming. Not "could be better". Only crashes and wrong behavior.
No talk. No modify. Read. Write file. Done.`,
    ],
    timeout,
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
        `Coder. Fix bugs.

BUGS
${findings}

JOB
Fix every bug. Add tests for fixes.
Only touch src/ and test/. Never touch .system/.
Write PR body to /tmp/pi-agent-pr-body.md.

No talk. Read bugs. Fix code. Run tests. Write PR body. Done.`,
    ],
    timeout,
);

try {
    writeFileSync("/tmp/pi-agent-pr-body.md", "trouble-maker: see commit.", { flag: "wx" });
} catch {
    /* already written */
}
