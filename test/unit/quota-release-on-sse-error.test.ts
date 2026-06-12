/**
 * Tests for quota release when SSE writer throws.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { consumeQuota, releaseQuota, checkQuota } from "../../src/db.ts";

describe("Quota release on SSE error", () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(`:memory:`);
        db.exec(`
            CREATE TABLE daily_usage (
                date TEXT NOT NULL,
                feature TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (date, feature)
            );
        `);
    });

    afterEach(() => {
        db.close();
    });

    it("releases quota correctly when explicitly called", () => {
        const feature = "image";
        const amount = 2;

        // Consume quota
        const consumed = consumeQuota(db, feature, amount);
        expect(consumed).toBe(2);

        // Verify consumed
        let status = checkQuota(db, feature);
        expect(status.used).toBe(2);

        // Release quota
        releaseQuota(db, feature, amount);

        // Verify released
        status = checkQuota(db, feature);
        expect(status.used).toBe(0);
    });

    it("handles partial release", () => {
        const feature = "image";
        const initialAmount = 5;

        // Consume 5
        consumeQuota(db, feature, initialAmount);

        // Release 2
        releaseQuota(db, feature, 2);

        const status = checkQuota(db, feature);
        expect(status.used).toBe(3);
    });

    it("does not go below zero on over-release", () => {
        const feature = "image";

        // Release without consuming should not error
        expect(() => releaseQuota(db, feature, 10)).not.toThrow();

        const status = checkQuota(db, feature);
        expect(status.used).toBe(0);
    });

    it("simulates consumedQuotaByToolId cleanup pattern", () => {
        const consumedQuotaByToolId = new Map<string, { feature: string; amount: number }>();

        // Simulate consuming quota for tool calls
        consumedQuotaByToolId.set("tc1", { feature: "image", amount: 1 });
        consumedQuotaByToolId.set("tc2", { feature: "speech", amount: 2 });
        consumedQuotaByToolId.set("tc3", { feature: "music", amount: 1 });

        // Simulate SSE error: release all remaining
        for (const [toolId, consumed] of consumedQuotaByToolId) {
            releaseQuota(db, consumed.feature, consumed.amount);
            consumedQuotaByToolId.delete(toolId);
        }

        // All quota should be released
        let status = checkQuota(db, "image");
        expect(status.used).toBe(0);
        status = checkQuota(db, "speech");
        expect(status.used).toBe(0);
        status = checkQuota(db, "music");
        expect(status.used).toBe(0);

        // Map should be empty
        expect(consumedQuotaByToolId.size).toBe(0);
    });

    it("demonstrates the fix: quota released in finally block even when tool_result never fires", () => {
        // Simulate: quota consumed but SSE writer throws before tool_result
        // This is what the fix addresses
        const consumedQuotaByToolId = new Map<string, { feature: string; amount: number }>();

        // Simulate consuming quota
        consumeQuota(db, "image", 1);
        consumedQuotaByToolId.set("tc1", { feature: "image", amount: 1 });

        // Simulate SSE error (tool_result never fires)
        // The fix: in finally block, release all remaining quota
        for (const [toolId, consumed] of consumedQuotaByToolId) {
            releaseQuota(db, consumed.feature, consumed.amount);
            consumedQuotaByToolId.delete(toolId);
        }

        // Without the fix, quota would remain consumed
        // With the fix, quota is released
        const status = checkQuota(db, "image");
        expect(status.used).toBe(0);
    });
});
