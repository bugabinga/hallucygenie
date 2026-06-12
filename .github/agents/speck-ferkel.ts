/**
 *      SPECK ━━━━━╮
 *                 ╰━╮
 *                   ╰╮
 *         💩      ▁▂▆█▆▂▁      𓃟
 *                         𝙎𝙉𝙍𝙍𝙆!!
 *
 *      where contracts rot, the truffle nose knows
 *
 * ╔════════════════════════════════════════════╗
 * ║ Pass 1: minimax/M3 -> sniff                ║
 * ║ Pass 2: minimax/M2.5 -> mend               ║
 * ╚════════════════════════════════════════════╝
 */
import { randomInt } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareExistingPr, readFindings, runPi } from "./lib.ts";

const root = join(import.meta.dirname, "../..");
const SPECS_DIR = join(root, ".system/specs");
const piFlags = ["--no-session", "--no-prompt-templates"];
const timeout = 8 * 60 * 1000;
const existingPr = prepareExistingPr("speck-ferkel", "agent/speck-ferkel-");

if (existingPr) {
    const existingSpecName = existingPr.branch.replace("agent/speck-ferkel-", "");
    let specBlock = "";
    try {
        specBlock = `\nSPEC ${existingSpecName}\n${
            readFileSync(join(SPECS_DIR, `${existingSpecName}.md`), "utf-8")
        }`;
        writeFileSync("/tmp/pi-agent-spec-name", existingSpecName);
    } catch {
        /* PR context still has enough info */
    }

    console.log(
        `\n=== Repair existing PR #${existingPr.number} (minimax/MiniMax-M2.5-highspeed) ===\n`
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
            `Repair existing speck-ferkel PR #${existingPr.number}.

Read ${existingPr.contextPath}.
${specBlock}

Fix unchecked janitor checklist items and actionable review/comment findings.
Keep current spec scope. Add/update tests. Only touch src/ and test/.
Run relevant tests. Write repair summary/update notes to /tmp/pi-agent-pr-body.md.
If janitor asks for PR body/metadata changes, write the complete replacement PR body to /tmp/pi-agent-pr-update-body.md.
Use /tmp/pi-agent-pr-body.md only for run summary/update notes.

No talk. Repair. Test. Write notes. Done.`
        ],
        timeout
    );
    try {
        writeFileSync(
            "/tmp/pi-agent-pr-body.md",
            `speck-ferkel: addressed janitor feedback for PR #${existingPr.number}.`,
            { flag: "wx" }
        );
    } catch {
        /* already written */
    }
    process.exit(0);
}

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

// --- Pass 1: analyze ---
console.log("\n=== Pass 1: Analyze (minimax/MiniMax-M3) ===\n");

runPi(
    "analyze",
    [
        "-p",
        ...piFlags,
        "--provider",
        "minimax",
        "--model",
        "MiniMax-M3",
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

No talk. No modify. Read. Write file. Done.`
    ],
    timeout
);

const findings = readFindings(specName);

if (findings === "NO_ISSUES_FOUND" || findings.length === 0) {
    console.log("\nNo drift. Spec matches code.");
    writeFileSync(
        "/tmp/pi-agent-pr-body.md",
        `speck-ferkel: ${specName} -- no drift.\n`
    );
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

No talk. Read gaps. Fix code. Run tests. Write PR body. Done.`
    ],
    timeout
);

try {
    writeFileSync(
        "/tmp/pi-agent-pr-body.md",
        `speck-ferkel: ${specName}. See commit.`,
        {
            flag: "wx"
        }
    );
} catch {
    /* already written */
}
