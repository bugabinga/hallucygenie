/**
 * Tests for tool result ID error handling in runAgentLoop.
 * Uses globalThis.fetch override pattern for Bun.
 */

import { describe, it, expect, afterEach } from "bun:test";

describe("runAgentLoop tool result ID error handling", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function createToolUseStream() {
        let callCount = 0;
        return () => {
            callCount++;
            if (callCount === 1) {
                // First call: tool_use response
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                'event: content_block_start\ndata: {"content_block":{"type":"tool_use","id":"tc1","name":"test"},"index":0}\n\n',
                            ),
                        );
                        controller.enqueue(
                            new TextEncoder().encode(
                                'event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":"{}"},"index":0}\n\n',
                            ),
                        );
                        controller.enqueue(
                            new TextEncoder().encode("event: content_block_stop\ndata: {}\n\n"),
                        );
                        controller.enqueue(
                            new TextEncoder().encode(
                                'event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"}}\n\n',
                            ),
                        );
                        controller.close();
                    },
                });
                return new Response(stream);
            } else {
                // Subsequent calls: tool result id error
                return new Response("tool result's tool id(tc1) not found in the conversation", {
                    status: 400,
                });
            }
        };
    }

    it("scans back to last assistant with tool_calls when tool result id error occurs", async () => {
        const mockFetch = createToolUseStream();
        globalThis.fetch = mockFetch;

        const { runAgentLoop } = await import("../../src/agent.ts");

        const initialMessages = [
            { role: "system", content: "test" },
            { role: "user", content: "hi" },
        ];

        const events: string[] = [];
        await runAgentLoop(initialMessages, "fake-key", async (event) => {
            events.push(event.type);
        });

        // Should handle the error gracefully and emit done
        expect(events).toContain("done");
        // Should have emitted text (the summary)
        expect(events).toContain("text");
    });
});

describe("isToolResultIdError", () => {
    it("returns true for tool result id error", () => {
        const { isToolResultIdError } = require("../../src/agent.ts");
        expect(
            isToolResultIdError(400, "tool result's tool id(tc1) not found in the conversation"),
        ).toBe(true);
    });

    it("returns false for status != 400", () => {
        const { isToolResultIdError } = require("../../src/agent.ts");
        expect(isToolResultIdError(500, "tool result's tool id(tc1) not found")).toBe(false);
    });

    it("returns false for unrelated error text", () => {
        const { isToolResultIdError } = require("../../src/agent.ts");
        expect(isToolResultIdError(400, "something else went wrong")).toBe(false);
    });
});
