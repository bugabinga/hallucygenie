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
