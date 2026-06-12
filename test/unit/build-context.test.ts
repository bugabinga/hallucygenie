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

    it("system message appears exactly once (no duplication)", () => {
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi there" },
            { role: "user", content: "another" },
        ];

        const result = buildContext(messages, 100_000);

        // System message must appear exactly once — not twice
        const systemCount = result.filter((m) => m.role === "system").length;
        expect(systemCount).toBe(1);
    });

    it("system is always at index 0 in result", () => {
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
        ];

        const result = buildContext(messages, 100_000);
        expect(result[0].role).toBe("system");
        expect(result[0].content).toBe(systemMsg.content);
    });

    it("does not duplicate system message when pairedIndex is 0 (tool turn)", () => {
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
        // Result should have: system + user + assistant + tool = 4 messages
        expect(result.length).toBe(4);
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

    it("skips i===0 in regular message loop (k===0 guard)", () => {
        // When i reaches 0 in the regular message branch, it should be skipped
        // since system is prepended unconditionally
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "first" },
            { role: "assistant", content: "second" },
        ];

        const result = buildContext(messages, 100_000);

        // System appears exactly once (index 0)
        expect(result.filter((m) => m.role === "system").length).toBe(1);
        // Both user and assistant messages should be present
        expect(result.some((m) => m.role === "user")).toBe(true);
        expect(result.some((m) => m.role === "assistant")).toBe(true);
    });

    it("k===0 is skipped in turn-collection loop (tool pair case)", () => {
        // The fix: for loop skips k===0 to avoid duplicate system.
        // If the fix were reverted, system would appear twice.
        const messages: ChatMessage[] = [
            systemMsg,
            {
                role: "assistant",
                content: "using tool",
                tool_calls: [{ id: "tc1", name: "test", input: {} }],
            },
            { role: "tool", content: "tool result", tool_call_id: "tc1" },
        ];

        const result = buildContext(messages, 100_000);

        // System must appear exactly once — the k===0 skip is what makes this true
        expect(result.filter((m) => m.role === "system").length).toBe(1);
    });

    it("no other messages lost when system is deduplicated", () => {
        // Verify that skipping k===0 doesn't accidentally skip other messages
        const messages: ChatMessage[] = [
            systemMsg,
            { role: "user", content: "msg1" },
            { role: "user", content: "msg2" },
            { role: "assistant", content: "msg3" },
        ];

        const result = buildContext(messages, 100_000);

        // All user and assistant messages must be present (system deduplicated, not removed)
        expect(result.filter((m) => m.role === "user").length).toBe(2);
        expect(result.filter((m) => m.role === "assistant").length).toBe(1);
        expect(result.filter((m) => m.role === "system").length).toBe(1);
    });
});
