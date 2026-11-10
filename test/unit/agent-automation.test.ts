import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    chmodSync,
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

for (const mode of ["failed", "partial", "ready"]) {
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
                        REVIEW_MODE: mode,
                        CALLS: calls,
                        FIXTURE: join(directory, "fixture.json")
                    },
                    timeout: 10000,
                    stdio: "pipe"
                });
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
