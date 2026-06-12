/**
 * Tests for runAgentLoop — iteration cap and constants.
 */

import { describe, it, expect } from "bun:test";
import { MAX_AGENT_ITERATIONS } from "../../src/agent.ts";

describe("MAX_AGENT_ITERATIONS", () => {
    it("has a reasonable cap of 50 iterations", () => {
        expect(MAX_AGENT_ITERATIONS).toBe(50);
    });

    it("prevents infinite loops", () => {
        // The cap should be high enough for normal use but low enough to prevent
        // runaway consumption
        expect(MAX_AGENT_ITERATIONS).toBeGreaterThan(10);
        expect(MAX_AGENT_ITERATIONS).toBeLessThan(100);
    });
});
