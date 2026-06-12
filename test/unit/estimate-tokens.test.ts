/**
 * Tests for estimateTokens — handles corrupt DB rows gracefully.
 */

import { describe, it, expect } from "bun:test";
import { estimateTokens } from "../../src/agent.ts";

describe("estimateTokens", () => {
    it("handles undefined tc.input (corrupt DB row)", () => {
        const msg = {
            role: "assistant" as const,
            content: "hello",
            tool_calls: [
                {
                    id: "abc123",
                    name: "generate_image",
                    // @ts-expect-error — intentional corrupt input for testing
                    input: undefined,
                },
            ],
        };
        // Should not throw TypeError from JSON.stringify(undefined).length
        expect(() => estimateTokens(msg)).not.toThrow();
        // Should still estimate based on other fields
        const tokens = estimateTokens(msg);
        expect(tokens).toBeGreaterThan(0);
    });

    it("coalescing undefined to {} produces different token count than real input", () => {
        // The fix: tc.input ?? {} — undefined input must coalesce to {} so that
        // JSON.stringify(undefined) doesn't produce the string "undefined" (length 9).
        // A mutant removing the ?? {} would make undefined produce ~9 extra chars,
        // so token counts must differ between the two cases.
        const undefinedInput = {
            role: "assistant" as const,
            content: "hello",
            tool_calls: [
                {
                    id: "abc123",
                    name: "generate_image",
                    // @ts-expect-error — intentional corrupt input
                    input: undefined,
                },
            ],
        };
        const emptyObjectInput = {
            role: "assistant" as const,
            content: "hello",
            tool_calls: [
                {
                    id: "abc123",
                    name: "generate_image",
                    input: {},
                },
            ],
        };
        const undefinedTokens = estimateTokens(undefinedInput);
        const emptyTokens = estimateTokens(emptyObjectInput);
        // Both should be non-zero
        expect(undefinedTokens).toBeGreaterThan(0);
        expect(emptyTokens).toBeGreaterThan(0);
        // Coalescing undefined→{} should NOT add 9 chars ("undefined".length)
        // The two counts should be equal (both use {} for input)
        expect(undefinedTokens).toBe(emptyTokens);
    });

    it("undefined input produces same count as empty object (the fix works)", () => {
        // Verify the fix: undefined tc.input → {} gives the same result as empty object input
        const undefinedMsg = {
            role: "assistant" as const,
            content: "test",
            tool_calls: [
                {
                    id: "tc1",
                    name: "tool",
                    // @ts-expect-error
                    input: undefined,
                },
            ],
        };
        const emptyMsg = {
            role: "assistant" as const,
            content: "test",
            tool_calls: [{ id: "tc1", name: "tool", input: {} }],
        };
        // If the mutant removes ?? {}, undefinedTokens would differ from emptyTokens
        expect(estimateTokens(undefinedMsg)).toBe(estimateTokens(emptyMsg));
    });

    it("handles normal tool_calls with defined input", () => {
        const msg = {
            role: "assistant" as const,
            content: "hello",
            tool_calls: [
                {
                    id: "abc123",
                    name: "generate_image",
                    input: { prompt: "a cat" },
                },
            ],
        };
        const tokens = estimateTokens(msg);
        expect(tokens).toBeGreaterThan(0);
    });

    it("handles null tc.input", () => {
        const msg = {
            role: "assistant" as const,
            content: "hello",
            tool_calls: [
                {
                    id: "abc123",
                    name: "generate_image",
                    // @ts-expect-error — intentional corrupt input for testing
                    input: null,
                },
            ],
        };
        expect(() => estimateTokens(msg)).not.toThrow();
    });

    it("handles empty messages array", () => {
        const tokens = estimateTokens({ role: "user", content: "" });
        expect(tokens).toBeGreaterThanOrEqual(0);
    });

    it("counts image patterns in content", () => {
        const msg = {
            role: "assistant" as const,
            content: "Here is an image: data:image/png;base64,abc123 and another image_url",
        };
        const tokens = estimateTokens(msg);
        // Should include base token count + image tokens
        expect(tokens).toBeGreaterThan(2400); // ~chars/4 + 2 images * 1200
    });
});
