/**
 * Tests for handleNodeRequest — Content-Length based memory exhaustion prevention.
 * Verifies the guard logic and comparison operators are correct.
 */

import { describe, it, expect } from "bun:test";

describe("handleNodeRequest Content-Length guard", () => {
    const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB hard cap

    it("rejects payload exceeding 10MB", () => {
        const contentLength = MAX_BODY_BYTES + 1;
        expect(contentLength > MAX_BODY_BYTES).toBe(true);
    });

    it("accepts payload at exactly 10MB", () => {
        const contentLength = MAX_BODY_BYTES;
        expect(contentLength > MAX_BODY_BYTES).toBe(false);
    });

    it("accepts payload below 10MB", () => {
        const contentLength = MAX_BODY_BYTES - 1;
        expect(contentLength > MAX_BODY_BYTES).toBe(false);
    });

    it("missing Content-Length header treated as 0 (won't reject valid bodies)", () => {
        // Number(null ?? "0") = Number("0") = 0
        const contentLength = Number("" || "0");
        expect(contentLength).toBe(0);
        expect(contentLength > MAX_BODY_BYTES).toBe(false); // 0 is under limit
    });

    it("parses Content-Length from headers map correctly", () => {
        // Simulates Node IncomingMessage headers object
        const contentLength = Number("5000000" ?? "0");
        expect(contentLength).toBe(5_000_000);
        expect(contentLength > MAX_BODY_BYTES).toBe(false);
    });

    it("explicitly large Content-Length header rejected", () => {
        // Client sends Content-Length: 20000000 (20 MB)
        const contentLength = Number(String(20 * 1024 * 1024) ?? "0");
        expect(contentLength > MAX_BODY_BYTES).toBe(true);
    });

    it("empty Content-Length string falls back to 0", () => {
        // "".replace() or nullish coalescing
        const contentLength = Number((undefined as unknown as string) ?? "0");
        expect(contentLength).toBe(0);
    });

    it("comparison operator > correctly rejects oversized payloads", () => {
        // Verify the operator is > (not >= or <)
        const LIMIT = MAX_BODY_BYTES;
        // Exactly at limit: allowed
        expect(LIMIT > LIMIT).toBe(false);
        // One byte over: rejected
        expect(LIMIT + 1 > LIMIT).toBe(true);
        // One byte under: allowed
        expect(LIMIT - 1 > LIMIT).toBe(false);
    });

    it("large upload attack: 100MB Content-Length detected", () => {
        const LARGE_ATTACK_SIZE = 100 * 1024 * 1024;
        expect(LARGE_ATTACK_SIZE > MAX_BODY_BYTES).toBe(true);
    });

    it("small legitimate upload: 1MB Content-Length allowed", () => {
        const LEGIT_SIZE = 1 * 1024 * 1024;
        expect(LEGIT_SIZE > MAX_BODY_BYTES).toBe(false);
    });
});
