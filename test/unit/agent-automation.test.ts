import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { it } from "node:test";

const janitor = resolve(import.meta.dirname, "../../.github/agents/janitor.ts");

for (const mode of ["failed", "partial", "ready", "missing"]) {
    it(
        `janitor handles ${mode} review without real GitHub or provider calls`,
        { timeout: 15000 },
        () => {
            const directory = mkdtempSync(join(tmpdir(), "genie-janitor-test-"));
            try {
                const bin = join(directory, "bin");
                mkdirSync(bin);
                const calls = join(directory, "calls.jsonl");
                const fixture = {
                    number: 7,
                    title: "Fixture",
                    headRefName: "agent/fixture",
                    headRefOid: "a".repeat(40),
                    baseRefName: "trunk",
                    author: { login: "app/bugabinga-agent-bot" },
                    isDraft: false,
                    mergeStateStatus: "CLEAN",
                    files: [],
                    comments: [],
                    reviews: [],
                    labels: [],
                    statusCheckRollup: [{
                        name: "check",
                        status: "COMPLETED",
                        conclusion: "SUCCESS"
                    }]
                };
                writeFileSync(join(directory, "fixture.json"), JSON.stringify(fixture));
                writeFileSync(
                    join(bin, "gh"),
                    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const input = args.includes("--input") ? fs.readFileSync(0, "utf8") : "";
fs.appendFileSync(process.env.CALLS, JSON.stringify({args, input}) + "\\n");
const fixture = JSON.parse(fs.readFileSync(process.env.FIXTURE, "utf8"));
if (args[0] === "pr" && args[1] === "list") console.log(JSON.stringify([fixture]));
else if (args[0] === "pr" && args[1] === "view") console.log(JSON.stringify(fixture));
else if (args[0] === "pr" && args[1] === "diff") console.log("diff --git a/fixture b/fixture");
else if (args[0] === "api" && args[1] === "graphql") console.log(JSON.stringify({data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}}));
else if (args[0] === "api" && args.some(arg => arg.endsWith("/comments")) && !args.includes("POST")) console.log("[]");
else if (args[0] === "api" || args[0] === "label" || (args[0] === "pr" && args[1] === "edit")) console.log("{}");
else { console.error("Unexpected fixture command"); process.exit(2); }
`
                );
                writeFileSync(
                    join(bin, "pi"),
                    `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.CALLS + ".pi.json", JSON.stringify(process.argv.slice(2)));
const prompt = process.argv.at(-1);
const destination = prompt.match(/comment to (\\S+) using/)[1];
if (process.env.REVIEW_MODE !== "failed") fs.writeFileSync(destination, "<!-- hallucygenie-janitor -->\\n\\n## Janitor status: ready\\n\\n## Checklist\\n- [x] Fixture review complete.\\n\\n## CI\\nFixture CI passed.\\n\\n## Notes for owning agent\\nNo code action.");
process.exit(process.env.REVIEW_MODE === "ready" ? 0 : 23);
`
                );
                chmodSync(join(bin, "gh"), 0o755);
                chmodSync(join(bin, "pi"), 0o755);
                execFileSync(process.execPath, [janitor], {
                    cwd: directory,
                    env: {
                        ...process.env,
                        PATH: `${bin}:${process.env.PATH}`,
                        TMPDIR: directory,
                        GITHUB_REPOSITORY: "fixture/repo",
                        GITHUB_REPOSITORY_OWNER: "fixture",
                        JANITOR_HUMAN_REVIEWER: "reviewer",
                        ZAI_API_KEY: mode === "missing" ? "" : "fixture-zai-key",
                        MINIMAX_API_KEY: "fixture-minimax-key",
                        REVIEW_MODE: mode,
                        CALLS: calls,
                        FIXTURE: join(directory, "fixture.json")
                    },
                    timeout: 10000,
                    stdio: "pipe"
                });
                if (mode === "missing") {
                    assert.equal(
                        existsSync(calls + ".pi.json"),
                        false,
                        "missing ZAI key must not invoke Pi or fall back to MiniMax"
                    );
                } else {
                    assert.deepEqual(
                        JSON.parse(readFileSync(calls + ".pi.json", "utf8")).slice(0, 6),
                        [
                            "--provider",
                            "zai",
                            "--model",
                            "glm-5.3-flash",
                            "--thinking",
                            "high"
                        ]
                    );
                }
                const operations = readFileSync(calls, "utf8").trim().split("\n").map(line =>
                    JSON.parse(line)
                );
                const comment = operations.find(call =>
                    call.args.includes("POST") && call.args.some(arg => arg.endsWith("/comments"))
                );
                assert.ok(comment, "sticky comment published through fixture boundary");
                const status = mode === "ready" ? "ready" : "needs-human";
                const body = JSON.parse(comment.input).body;
                assert.match(body, new RegExp(`## Janitor status: ${status}`));
                if (mode !== "ready") assert.match(body, /did not complete successfully/);
                const labels = operations.find(call =>
                    call.args.includes("POST") && call.args.some(arg => arg.endsWith("/labels"))
                );
                assert.deepEqual(JSON.parse(labels.input).labels, [`janitor:${status}`]);
                assert.equal(
                    operations.some(call => call.args.includes("--add-reviewer")),
                    mode !== "ready"
                );
                assert.equal(
                    readdirSync(directory).some(name => /^(hg-janitor-|pi-agent-cfg-)/.test(name)),
                    false,
                    "owned scratch cleaned"
                );
            } finally {
                rmSync(directory, { recursive: true, force: true });
            }
        }
    );
}

for (
    const [role, provider, model, exitCode] of [
        ["analyze", "zai", "glm-5.3-flash", 0],
        ["code", "minimax", "MiniMax-M3.1-Flash", 0],
        ["code", "minimax", "MiniMax-M3.1-Flash", 23]
    ] as const
) {
    it(`routes ${role} to ${provider}/${model}, exit ${exitCode}, without fallback`, {
        timeout: 15000
    }, () => {
        const directory = mkdtempSync(join(tmpdir(), "genie-patrol-route-"));
        try {
            const executable = join(directory, "pi");
            const calls = join(directory, "calls.jsonl");
            writeFileSync(
                executable,
                `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.CALLS, JSON.stringify({args:process.argv.slice(2),offline:process.env.PI_OFFLINE,config:JSON.parse(fs.readFileSync(process.env.PI_CODING_AGENT_DIR + "/models.json", "utf8"))}) + "\\n");
process.exit(Number(process.env.PI_EXIT));
`
            );
            chmodSync(executable, 0o755);
            const library = new URL("../../.github/agents/lib.ts", import.meta.url).href;
            execFileSync(process.execPath, [
                "--input-type=module",
                "-e",
                `import {runPi} from ${JSON.stringify(library)}; const ok = runPi(${
                    JSON.stringify(role)
                }, ["-p", "--no-session", "fixture prompt"], 5000, {allowFail:true}); if (ok !== ${
                    exitCode === 0
                }) process.exit(42);`
            ], {
                cwd: directory,
                env: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    TMPDIR: directory,
                    CALLS: calls,
                    PI_EXIT: String(exitCode),
                    ZAI_API_KEY: "fixture-zai-key",
                    MINIMAX_API_KEY: "fixture-minimax-key"
                },
                timeout: 10000,
                stdio: "pipe"
            });
            const invocations = readFileSync(calls, "utf8").trim().split("\n").map(line =>
                JSON.parse(line)
            );
            assert.equal(invocations.length, 1, "failure must not retry on another provider");
            assert.deepEqual(invocations[0].args, [
                "--provider",
                provider,
                "--model",
                model,
                "--thinking",
                "high",
                "-p",
                "--no-session",
                "fixture prompt"
            ]);
            assert.equal(invocations[0].offline, "1");
            assert.equal(
                invocations[0].config.providers[provider].apiKey,
                provider === "zai" ? "$ZAI_API_KEY" : "$MINIMAX_API_KEY"
            );
            assert.equal(
                readdirSync(directory).some(name => name.startsWith("pi-agent-cfg-")),
                false
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}

for (
    const [role, keyEnv, keyValue, allowFail] of [
        ["analyze", "ZAI_API_KEY", "", true],
        ["code", "MINIMAX_API_KEY", "   ", true],
        ["code", "MINIMAX_API_KEY", "", false]
    ] as const
) {
    it(`rejects missing ${keyEnv}, allowFail=${allowFail}, without launching Pi`, {
        timeout: 15000
    }, () => {
        const directory = mkdtempSync(join(tmpdir(), "genie-patrol-auth-"));
        try {
            const marker = join(directory, "unexpected-call");
            const executable = join(directory, "pi");
            writeFileSync(
                executable,
                `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.MARKER, "called");\n`
            );
            chmodSync(executable, 0o755);
            const library = new URL("../../.github/agents/lib.ts", import.meta.url).href;
            const result = spawnSync(process.execPath, [
                "--input-type=module",
                "-e",
                `import {runPi} from ${JSON.stringify(library)}; if(runPi(${
                    JSON.stringify(role)
                }, ["-p", "fixture"], 5000, {allowFail:${allowFail}}) !== false) process.exit(42);`
            ], {
                cwd: directory,
                env: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    TMPDIR: directory,
                    MARKER: marker,
                    ZAI_API_KEY: "fixture-zai-key",
                    MINIMAX_API_KEY: "fixture-minimax-key",
                    [keyEnv]: keyValue
                },
                encoding: "utf8",
                timeout: 10000
            });
            assert.equal(result.status, allowFail ? 0 : 1);
            assert.ok(result.stderr.includes(keyEnv), "diagnostic identifies required credential");
            assert.equal(
                existsSync(marker),
                false,
                "no model process may launch with missing credentials"
            );
            assert.equal(
                readdirSync(directory).some(name => name.startsWith("pi-agent-cfg-")),
                false
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}
