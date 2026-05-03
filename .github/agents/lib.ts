/**
 * Shared runner for agent passes.
 * Clean errors. No prompt leaks. Timeout-aware.
 * Sets up PI_CODING_AGENT_DIR with models.json from this directory.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, cpSync } from "node:fs";
import { join } from "node:path";

export type PiRole = "analyze" | "code";

// Set up isolated agent dir with models.json for custom model definitions
const agentDir = "/tmp/pi-agent-cfg";
mkdirSync(agentDir, { recursive: true });
try {
    cpSync(join(import.meta.dirname, "models.json"), join(agentDir, "models.json"));
} catch {
    /* no models.json — use built-ins only */
}

export function runPi(role: PiRole, args: string[], timeout: number): void {
    const label = role === "analyze" ? "Pass 1 (analyze)" : "Pass 2 (code)";
    const result = spawnSync("pi", args, {
        stdio: "inherit",
        env: { ...process.env, PI_OFFLINE: "1", PI_CODING_AGENT_DIR: agentDir },
        timeout,
    });

    if (result.error) {
        const code = (result.error as NodeJS.ErrnoException).code;
        if (code === "ETIMEDOUT") {
            console.error(`\n❌ ${label} TIMED OUT after ${timeout / 1000}s`);
            console.error(`   Model too slow or prompt too large. Bump timeout or simplify task.`);
        } else {
            console.error(`\n❌ ${label} FAILED: ${code}`);
        }
        process.exit(1);
    }

    if (result.signal) {
        console.error(`\n❌ ${label} KILLED by signal ${result.signal}`);
        process.exit(1);
    }

    if (result.status && result.status !== 0) {
        console.error(`\n❌ ${label} exited with code ${result.status}`);
        process.exit(result.status);
    }
}

export function readFindings(context: string): string {
    try {
        return readFileSync("/tmp/pi-agent-findings.md", "utf-8").trim();
    } catch {
        console.error(`\n❌ PASS 1 DID NOT WRITE FINDINGS`);
        console.error(`   Model ran but did not write /tmp/pi-agent-findings.md`);
        console.error(
            `   Possible causes: model ignored instructions, tool call failed, or ran out of context.`,
        );
        process.exit(1);
        return context; // unreachable, keeps TS happy
    }
}
