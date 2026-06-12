/**
 * Tests for checkIterationGuard — the iteration cap logic in runAgentLoop.
 */

import { describe, it, expect } from "bun:test";
import { checkIterationGuard, MAX_AGENT_ITERATIONS } from "../../src/agent.ts";

describe("checkIterationGuard", () => {
    it("returns null when iterations are below the cap", () => {
        expect(checkIterationGuard(1)).toBeNull();
        expect(checkIterationGuard(49)).toBeNull();
        expect(checkIterationGuard(MAX_AGENT_ITERATIONS - 1)).toBeNull();
    });

    it("returns null when iterations equal the cap", () => {
        expect(checkIterationGuard(MAX_AGENT_ITERATIONS)).toBeNull();
    });

    it("returns an error message when iterations exceed the cap", () => {
        const result = checkIterationGuard(MAX_AGENT_ITERATIONS + 1);
        expect(result).not.toBeNull();
        expect(result).toContain("Max iterations");
    });

    it("returns an error message for far-over cap values", () => {
        expect(checkIterationGuard(100)).not.toBeNull();
        expect(checkIterationGuard(1000)).not.toBeNull();
    });

    it("respects custom maxIterations parameter", () => {
        // With default cap of 50, iteration 51 should fail
        expect(checkIterationGuard(51, 50)).not.toBeNull();
        // With custom cap of 100, iteration 51 should pass
        expect(checkIterationGuard(51, 100)).toBeNull();
        // With custom cap of 5, iteration 5 should pass, 6 should fail
        expect(checkIterationGuard(5, 5)).toBeNull();
        expect(checkIterationGuard(6, 5)).not.toBeNull();
    });

    it("zero iterations is allowed (first iteration)", () => {
        expect(checkIterationGuard(0)).toBeNull();
        expect(checkIterationGuard(1)).toBeNull();
    });
});
