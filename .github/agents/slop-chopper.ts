/**
 *
 *       /|
 *      / |        slop chopper
 *     /  | <-axe  chops dead code, waste, cruft
 *    /___|        leaves only what earns its keep
 *     !  !        no mercy for slop
 *     !  !
 *     L_!
 *
 * ╔═════════════════════════════════════════╗
 * ║ Pass 1: minimax/M2.7 -> analyze (smart) ║
 * ║ Pass 2: minimax/M2.5 -> chop (coder)    ║
 * ╚═════════════════════════════════════════╝
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPi, readFindings } from "./lib.ts";

const root = join(import.meta.dirname, "../..");

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

SLOP LIST
- Dead code (unreachable, unused functions/variables/imports)
- console.log instead of createLogger
- TODO/FIXME/HACK that can be fixed right now
- Copy-paste needing shared function (ONLY 3+ places)
- Overly complex expressions simplifiable without behavior change
- Redundant conditions (if-return-else, double negation)
- Commented-out code blocks

NOT SLOP
- Working but inelegant code
- Code following a spec pattern
- Anything in .system/, test/, config

JOB
Read all src/. Find real slop from list.
Write findings to /tmp/pi-agent-findings.md.

NO SLOP -> one word: NO_SLOP_FOUND
SLOP -> per hit: file, line-range, kind, action. No intro. No summary.

No talk. No modify. Read. Write file. Done.`,
    ],
    timeout,
);

const findings = readFindings("slop-chopper");

if (findings === "NO_SLOP_FOUND" || findings.length === 0) {
    console.log("\nNo slop. Clean.");
    writeFileSync("/tmp/pi-agent-pr-body.md", "slop-chopper: no slop.\n");
    process.exit(0);
}

// --- Pass 2: clean ---
console.log("\n=== Pass 2: Clean (minimax/MiniMax-M2.5-highspeed) ===\n");

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
        `Coder. Remove slop.

SLOP
${findings}

JOB
Remove every slop listed. Run "just build" && "just test-unit" after.
Only touch src/. Never touch .system/, test/, config.
Write PR body to /tmp/pi-agent-pr-body.md.

No talk. Read slop. Remove. Build. Test. Write PR body. Done.`,
    ],
    timeout,
);

try {
    writeFileSync("/tmp/pi-agent-pr-body.md", "slop-chopper: see commit.", { flag: "wx" });
} catch {
    /* already written */
}
