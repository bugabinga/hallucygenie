/**
 * Tests for toAnthropicPayload — thinking block handling and block ordering.
 */

import { describe, it, expect } from "bun:test";
import { toAnthropicPayload } from "../../src/agent.ts";
import type { ChatMessage } from "../../src/server.ts";

describe("toAnthropicPayload", () => {
    const tools = [
        {
            name: "test_tool",
            description: "A test tool",
            input_schema: { type: "object", properties: {} },
        },
    ];

    it("includes thinking block even without signature", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "assistant",
                content: "Let me think about this.",
                thinking: "I need to consider the options carefully.",
                // Note: no thinking_signature
            },
        ];

        const payload = toAnthropicPayload(messages, tools);

        const assistantMsg = (payload.messages as Array<{ role: string; content: unknown }>).find(
            (m) => m.role === "assistant",
        );
        expect(assistantMsg).toBeDefined();

        const content = assistantMsg!.content as Array<{ type: string }>;
        const thinkingBlock = content.find((b) => b.type === "thinking");
        expect(thinkingBlock).toBeDefined();
        // @ts-expect-error — accessing extended type
        expect(thinkingBlock.thinking).toBe("I need to consider the options carefully.");
    });

    it("includes thinking block with signature", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "assistant",
                content: "Here's the answer.",
                thinking: "My thought process.",
                thinking_signature: "abc123signature",
            },
        ];

        const payload = toAnthropicPayload(messages, tools);

        const assistantMsg = (payload.messages as Array<{ role: string; content: unknown }>).find(
            (m) => m.role === "assistant",
        );
        const content = assistantMsg!.content as Array<{ type: string; signature?: string }>;
        const thinkingBlock = content.find((b) => b.type === "thinking");
        expect(thinkingBlock).toBeDefined();
        expect(thinkingBlock.signature).toBe("abc123signature");
    });

    it("maintains correct block order: thinking, text, tool_use", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "assistant",
                content: "Here's an image.",
                thinking: "Let me generate that image.",
                thinking_signature: "sig123",
                tool_calls: [{ id: "tc1", name: "generate_image", input: { prompt: "cat" } }],
            },
        ];

        const payload = toAnthropicPayload(messages, tools);

        const assistantMsg = (payload.messages as Array<{ role: string; content: unknown }>).find(
            (m) => m.role === "assistant",
        );
        const content = assistantMsg!.content as Array<{ type: string }>;
        const types = content.map((b) => b.type);

        // Anthropic expects: thinking?, text?, tool_use+
        expect(types).toEqual(["thinking", "text", "tool_use"]);
    });

    it("handles assistant message with only tool_calls (no thinking or text)", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "assistant",
                content: "",
                tool_calls: [{ id: "tc1", name: "test_tool", input: {} }],
            },
        ];

        const payload = toAnthropicPayload(messages, tools);

        const assistantMsg = (payload.messages as Array<{ role: string; content: unknown }>).find(
            (m) => m.role === "assistant",
        );
        const content = assistantMsg!.content as Array<{ type: string }>;

        // Should have tool_use, and an empty text block fallback
        expect(content.some((b) => b.type === "tool_use")).toBe(true);
        // The empty text fallback should be present when content is empty
        expect(content.length).toBeGreaterThanOrEqual(1);
    });

    it("groups consecutive tool results into one user message", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant." },
            { role: "tool", content: "result 1", tool_call_id: "tc1" },
            { role: "tool", content: "result 2", tool_call_id: "tc2" },
        ];

        const payload = toAnthropicPayload(messages, tools);

        const userMessages = (payload.messages as Array<{ role: string; content: unknown }>).filter(
            (m) => m.role === "user",
        );
        // Two consecutive tool results should be grouped into one user message
        expect(userMessages.length).toBe(1);
        const content = userMessages[0].content as Array<{ type: string }>;
        expect(content.filter((b) => b.type === "tool_result").length).toBe(2);
    });
});
