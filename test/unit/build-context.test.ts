/**
 * Tests for buildContext — system message deduplication and orphan handling.
 */

import { describe, it, expect } from "bun:test";
import { buildContext } from "../../src/agent.ts";
import type { ChatMessage } from "../../src/server.ts";

describe("buildContext", () => {
    const systemMsg: ChatMessage = {
        role: "system",
        content: "You are a helpful assistant.",
    };

    it("does not duplicate system message when pairedIndex is 0", () => {
        // Simulate a turn starting at index 0 (pairedIndex=0)
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "hello" },
            {
                role: "assistant",
                content: "hi",
                tool_calls: [{ id: "tc1", name: "test_tool", input: {} }],
            },
            { role: "tool", content: "result", tool_call_id: "tc1" },
        ];

        const result = buildContext(messages, 100_000);

        // System message should appear exactly once
        const systemCount = result.filter((m) => m.role === "system").length;
        expect(systemCount).toBe(1);
    });

    it("includes full tool turn even when pairedIndex is 0", () => {
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "hello" },
            {
                role: "assistant",
                content: "hi",
                tool_calls: [{ id: "tc1", name: "test_tool", input: {} }],
            },
            { role: "tool", content: "result", tool_call_id: "tc1" },
        ];

        const result = buildContext(messages, 100_000);

        // Should include the assistant tool_use message and the tool result
        expect(result.length).toBeGreaterThanOrEqual(3); // system + assistant + tool
        const hasToolUse = result.some((m) => m.role === "assistant" && m.tool_calls?.length);
        const hasToolResult = result.some((m) => m.role === "tool");
        expect(hasToolUse).toBe(true);
        expect(hasToolResult).toBe(true);
    });

    it("returns only system message when budget is exceeded", () => {
        const messages: ChatMessage[] = [systemMsg, { role: "user", content: "a".repeat(10_000) }];

        // Very small budget — only system should fit
        const result = buildContext(messages, 100);

        expect(result.length).toBe(1);
        expect(result[0].role).toBe("system");
    });

    it("handles orphan tool results (no matching tool_use)", () => {
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "hello" },
            { role: "tool", content: "orphan result", tool_call_id: "nonexistent" },
        ];

        // Should not throw, orphan is skipped when budget is tight
        const result = buildContext(messages, 1000);
        expect(Array.isArray(result)).toBe(true);
    });

    it("skips i===0 when collecting turn (assistant with tool_calls)", () => {
        // Edge case: if we ever had an assistant message at index 0 (invalid but testing guard)
        const messages: ChatMessage[] = [
            // @ts-expect-error — intentionally malformed for testing edge case
            { role: "assistant", content: "invalid system replacement", tool_calls: [] },
            { role: "user", content: "hello" },
        ];

        const result = buildContext(messages, 100_000);

        // Should still include the system (which is actually at position 0 in this case)
        // and should not double-add
        expect(result.length).toBeGreaterThanOrEqual(1);
    });
});
