import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import systemExtension from "../../.pi/extensions/system.ts";

type PiHost = Parameters<typeof systemExtension>[0];
type ToolCallHandler = Parameters<PiHost["on"]>[1];
type CommandSpec = Parameters<PiHost["registerCommand"]>[1];

function captureSystemExtension() {
    let beforeAgentStart: ToolCallHandler | null = null;
    let toolCall: ToolCallHandler | null = null;
    let command: CommandSpec | null = null;
    const sent: Array<{ content: string; options?: Record<string, unknown>; }> = [];
    const host: PiHost = {
        on(name, fn) {
            if (name === "before_agent_start") beforeAgentStart = fn;
            if (name === "tool_call") toolCall = fn;
        },
        registerCommand(name, spec) {
            if (name === "system") command = spec;
        },
        sendUserMessage(content: string, options?: Record<string, unknown>) {
            sent.push({ content, options });
        }
    };
    systemExtension(host);
    assert.ok(beforeAgentStart, "before_agent_start handler registered");
    assert.ok(toolCall, "tool_call handler registered");
    assert.ok(command, "system command registered");
    return { beforeAgentStart, toolCall, command, sent };
}

function tempSystemRoot(): string {
    const cwd = mkdtempSync(join(tmpdir(), "hg-system-extension-"));
    mkdirSync(join(cwd, ".system", "specs"), { recursive: true });
    mkdirSync(join(cwd, ".system", "issues"), { recursive: true });
    writeFileSync(join(cwd, ".system", "SYSTEM.md"), "System text", "utf-8");
    writeFileSync(join(cwd, ".system", "MISSION.md"), "Mission text", "utf-8");
    writeFileSync(join(cwd, ".system", "RULES.md"), "Rules text", "utf-8");
    writeFileSync(join(cwd, ".system", "specs", "HG-SPEC-001-real.md"), "# real", "utf-8");
    return cwd;
}

function cleanup(cwd: string): void {
    rmSync(cwd, { recursive: true, force: true });
}

function notifyCtx(cwd: string) {
    const notifications: Array<{ message: string; level: string; }> = [];
    return {
        ctx: {
            cwd,
            hasUI: true,
            ui: {
                notify(message: string, level: string) {
                    notifications.push({ message, level });
                }
            }
        },
        notifications
    };
}

describe("system extension", () => {
    it("injects system mission and rules into the agent prompt", async () => {
        const cwd = tempSystemRoot();
        try {
            const { beforeAgentStart } = captureSystemExtension();
            const result = await beforeAgentStart({ systemPrompt: "Base" }, { cwd });

            assert.match(result?.systemPrompt ?? "", /Base/);
            assert.match(result?.systemPrompt ?? "", /## System\n\nSystem text/);
            assert.match(result?.systemPrompt ?? "", /## Mission\n\nMission text/);
            assert.match(result?.systemPrompt ?? "", /## Rules\n\nRules text/);
        } finally {
            cleanup(cwd);
        }
    });

    it("blocks direct writes and shell redirects to readonly system files", async () => {
        const cwd = tempSystemRoot();
        try {
            const { toolCall } = captureSystemExtension();
            const write = await toolCall(
                { toolName: "write", input: { path: ".system/RULES.md" } },
                { cwd }
            );
            const bash = await toolCall(
                { toolName: "bash", input: { command: "echo nope > .system/MISSION.md" } },
                { cwd }
            );

            assert.equal(write?.block, true);
            assert.match(write?.reason ?? "", /readonly/);
            assert.equal(bash?.block, true);
            assert.match(bash?.reason ?? "", /readonly/);
        } finally {
            cleanup(cwd);
        }
    });

    it("requires approval for spec edits, allows Yes, blocks no UI, and steers Custom", async () => {
        const cwd = tempSystemRoot();
        try {
            const { toolCall, sent } = captureSystemExtension();
            let aborted = false;
            const yes = await toolCall(
                { toolName: "edit", input: { path: ".system/specs/HG-SPEC-001-real.md" } },
                { cwd, hasUI: true, ui: { select: async () => "Yes" } }
            );
            const noUi = await toolCall(
                { toolName: "write", input: { path: ".system/specs/HG-SPEC-002-new.md" } },
                { cwd, hasUI: false }
            );
            const no = await toolCall(
                { toolName: "edit", input: { path: ".system/specs/HG-SPEC-001-real.md" } },
                {
                    cwd,
                    hasUI: true,
                    abort() {
                        aborted = true;
                    },
                    ui: { select: async () => "No" }
                }
            );
            const custom = await toolCall(
                { toolName: "edit", input: { path: ".system/specs/HG-SPEC-001-real.md" } },
                {
                    cwd,
                    hasUI: true,
                    ui: {
                        select: async () => "Custom",
                        input: async () => "Create an issue instead."
                    }
                }
            );

            assert.equal(yes, undefined);
            assert.equal(noUi?.block, true);
            assert.match(noUi?.reason ?? "", /no UI is available/);
            assert.equal(aborted, true);
            assert.equal(no?.block, true);
            assert.equal(custom?.block, true);
            assert.deepEqual(sent, [
                { content: "Create an issue instead.", options: { deliverAs: "steer" } }
            ]);
        } finally {
            cleanup(cwd);
        }
    });

    it("reports command usage and completions before advisories exist", async () => {
        const cwd = tempSystemRoot();
        try {
            const { command } = captureSystemExtension();
            const { ctx, notifications } = notifyCtx(cwd);

            assert.deepEqual(command.getArgumentCompletions("iss"), [
                { value: "issues", label: "issues" }
            ]);
            assert.equal(command.getArgumentCompletions("x"), null);

            await command.handler("issues", ctx);
            await command.handler("nope", ctx);

            assert.match(notifications[0]?.message ?? "", /No advisory problems/);
            assert.match(notifications[1]?.message ?? "", /Usage: \/system issues/);
        } finally {
            cleanup(cwd);
        }
    });

    it("covers approval edge paths for bash and blank custom steering", async () => {
        const cwd = tempSystemRoot();
        try {
            const { toolCall } = captureSystemExtension();
            let aborted = false;
            const bashApproval = await toolCall(
                {
                    toolName: "bash",
                    input: { command: "cat x | tee .system/specs/HG-SPEC-001-real.md" }
                },
                { cwd, hasUI: true, ui: { select: async () => "Yes" } }
            );
            const blankCustom = await toolCall(
                { toolName: "edit", input: { path: ".system/specs/HG-SPEC-001-real.md" } },
                {
                    cwd,
                    hasUI: true,
                    abort() {
                        aborted = true;
                    },
                    ui: { select: async () => "Custom", input: async () => "   " }
                }
            );

            assert.equal(bashApproval, undefined);
            assert.equal(aborted, true);
            assert.equal(blankCustom?.block, true);
            assert.match(blankCustom?.reason ?? "", /blocked by human approval gate/);
        } finally {
            cleanup(cwd);
        }
    });

    it("validates issue frontmatter and records advisory spec problems", async () => {
        const cwd = tempSystemRoot();
        try {
            const { toolCall, command } = captureSystemExtension();
            const badCases: Array<[string, string, RegExp]> = [
                ["bad.md", "# bad", /missing --- frontmatter/],
                ["missing-close.md", "---\n{}", /missing closing --- frontmatter/],
                ["empty.md", "---\n\n---", /empty frontmatter/],
                ["bad-json.md", "---\n{ nope\n---", /invalid JSON/],
                ["not-object.md", "---\n[]\n---", /frontmatter must be a JSON object/],
                [
                    "missing-status.md",
                    "---\n{ \"specs\": [] }\n---",
                    /missing required field: status/
                ],
                [
                    "number-status.md",
                    "---\n{ \"status\": 1, \"specs\": [] }\n---",
                    /status must be a string/
                ],
                [
                    "bad-status.md",
                    "---\n{ \"status\": \"weird\", \"specs\": [] }\n---",
                    /invalid status/
                ],
                [
                    "missing-specs.md",
                    "---\n{ \"status\": \"open\" }\n---",
                    /missing required field: specs/
                ],
                [
                    "specs-string.md",
                    "---\n{ \"status\": \"open\", \"specs\": \"HG\" }\n---",
                    /specs must be an array/
                ],
                [
                    "specs-item.md",
                    "---\n{ \"status\": \"open\", \"specs\": [1] }\n---",
                    /specs\[0\] must be a string/
                ]
            ];
            for (const [file, content, expected] of badCases) {
                const result = await toolCall(
                    { toolName: "write", input: { path: `.system/issues/${file}`, content } },
                    { cwd }
                );
                assert.equal(result?.block, true, file);
                assert.match(result?.reason ?? "", expected, file);
            }

            const { ctx, notifications } = notifyCtx(cwd);
            const noSpec = await toolCall(
                {
                    toolName: "write",
                    input: {
                        path: ".system/issues/no-spec.md",
                        content: "---\n{ \"status\": \"fixed\", \"specs\": [] }\n---\n# no spec"
                    }
                },
                ctx
            );
            writeFileSync(
                join(cwd, ".system", "issues", "edited.md"),
                "---\n{ \"status\": \"open\", \"specs\": [\"HG-SPEC-001\", \"HG-SPEC-999\"] }\n---\n# edited",
                "utf-8"
            );
            const validEdit = await toolCall(
                { toolName: "edit", input: { path: join(cwd, ".system", "issues", "edited.md") } },
                ctx
            );
            await command.handler("issues", ctx);

            assert.equal(noSpec, undefined);
            assert.equal(validEdit, undefined);
            assert.equal(notifications[0]?.level, "warning");
            assert.match(notifications[0]?.message ?? "", /HG-SPEC-999/);
            assert.equal(notifications.at(-1)?.level, "info");
            assert.match(notifications.at(-1)?.message ?? "", /no spec refs/);
            assert.match(notifications.at(-1)?.message ?? "", /dangling spec refs/);
        } finally {
            cleanup(cwd);
        }
    });
});
