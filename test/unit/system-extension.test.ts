import assert from "node:assert/strict";
import { describe, it } from "node:test";
import systemExtension from "../../.pi/extensions/system.ts";

type ToolCallHandler = Parameters<Parameters<typeof systemExtension>[0]["on"]>[1];

function captureToolCallHandler() {
    let handler: ToolCallHandler | null = null;
    const sent: Array<{ content: string; options?: Record<string, unknown>; }> = [];
    const host: Parameters<typeof systemExtension>[0] = {
        on(name, fn) {
            if (name === "tool_call") handler = fn;
        },
        registerCommand() {},
        sendUserMessage(content: string, options?: Record<string, unknown>) {
            sent.push({ content, options });
        }
    };
    systemExtension(host);
    assert.ok(handler, "tool_call handler registered");
    return { handler, sent };
}

describe("system extension approval gate", () => {
    it("aborts the current agent turn when human selects No", async () => {
        const { handler } = captureToolCallHandler();
        let aborted = false;
        const result = await handler(
            { toolName: "edit", input: { path: ".system/specs/HG-SPEC-005-x.md" } },
            {
                cwd: process.cwd(),
                hasUI: true,
                abort() {
                    aborted = true;
                },
                ui: {
                    select: async () => "No"
                }
            }
        );

        assert.equal(aborted, true);
        assert.equal(result.block, true);
        assert.match(result.reason, /blocked by human approval gate/);
    });

    it("queues custom human steering when human selects Custom", async () => {
        const { handler, sent } = captureToolCallHandler();
        const result = await handler(
            { toolName: "edit", input: { path: ".system/specs/HG-SPEC-005-x.md" } },
            {
                cwd: process.cwd(),
                hasUI: true,
                ui: {
                    select: async () => "Custom",
                    input: async () => "Do not edit specs; create an issue instead."
                }
            }
        );

        assert.equal(result.block, true);
        assert.deepEqual(sent, [
            {
                content: "Do not edit specs; create an issue instead.",
                options: { deliverAs: "steer" }
            }
        ]);
    });
});
