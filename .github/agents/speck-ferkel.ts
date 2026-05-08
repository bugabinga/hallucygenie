/**
 *
 *     ,---.
 *    / o o \    speck ferkel
 *   (  =_=  )   sniffs out drift between spec and code
 *    \  ~  /    picks a random spec, roots around in src/
 *    /|   |\
 *   (_|   |_)   the truffle hog of code quality
 *
 * ╔═════════════════════════════════════════╗
 * ║ Pass 1: minimax/M2.7 -> analyze (smart) ║
 * ║ Pass 2: minimax/M2.5 -> fix (coder)     ║
 * ╚═════════════════════════════════════════╝
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { runPi, readFindings } from "./lib.ts";

const root = join(import.meta.dirname, "../..");
const SPECS_DIR = join(root, ".system/specs");

const specs = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".md"));
if (specs.length === 0) {
    console.log("No specs found");
    process.exit(0);
}
const chosen = specs[randomInt(specs.length)];
const specName = chosen.replace(".md", "");
console.log(`Checking spec: ${specName}`);

writeFileSync("/tmp/pi-agent-spec-name", specName);

const specContent = readFileSync(join(SPECS_DIR, chosen), "utf-8");

const piFlags = ["--no-session", "--no-prompt-templates"];
const timeout = 8 * 60 * 1000;

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
        `Analyst. Write tool only. Target: /tmp/pi-agent-findings.md

SPEC ${specName}
${specContent}

JOB
Read src/. Check code vs spec. Check tests in test/.
Write findings to /tmp/pi-agent-findings.md.

MATCH -> one word: NO_ISSUES_FOUND
MISMATCH -> per gap: file, spec-says, code-does, must-change. No intro. No summary.

No talk. No modify. Read. Write file. Done.`,
    ],
    timeout,
);

const findings = readFindings(specName);

if (findings === "NO_ISSUES_FOUND" || findings.length === 0) {
    console.log("\nNo drift. Spec matches code.");
    writeFileSync("/tmp/pi-agent-pr-body.md", `speck-ferkel: ${specName} -- no drift.\n`);
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
        `Coder. Fix code.

SPEC ${specName}
${specContent}

GAPS
${findings}

JOB
Fix every gap. Code must match spec. Add missing tests.
Only touch src/ and test/. Never touch .system/.
Write PR body to /tmp/pi-agent-pr-body.md.

No talk. Read gaps. Fix code. Run tests. Write PR body. Done.`,
    ],
    timeout,
);

try {
    writeFileSync("/tmp/pi-agent-pr-body.md", `speck-ferkel: ${specName}. See commit.`, {
        flag: "wx",
    });
} catch {
    /* already written */
}
