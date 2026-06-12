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
