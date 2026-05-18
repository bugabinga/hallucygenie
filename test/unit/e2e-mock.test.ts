// HallucyGenie — E2E MiniMax mock tests

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setupMinimaxMocks, cleanupMinimaxMocks } from "../../e2e/minimax-mock.ts";

describe("E2E MiniMax fetch mocks", () => {
    afterEach(() => cleanupMinimaxMocks());

    it("intercepts quota fetch without nock under Bun", async () => {
        setupMinimaxMocks();

        const resp = await fetch("https://api.minimax.io/v1/token_plan/remains", {
            headers: { Authorization: "Bearer test" },
        });
        const body = (await resp.json()) as { model_remains: Array<{ model_name: string }> };

        assert.equal(resp.status, 200);
        assert.ok(body.model_remains.some((model) => model.model_name === "image-01"));
    });

    it("restores original fetch on cleanup", () => {
        const original = globalThis.fetch;
        setupMinimaxMocks();
        assert.notEqual(globalThis.fetch, original);
        cleanupMinimaxMocks();
        assert.equal(globalThis.fetch, original);
    });
});
