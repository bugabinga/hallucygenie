// HallucyGenie — E2E MiniMax mock tests

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
    cleanupMinimaxMocks,
    getMinimaxMockCalls,
    resetMinimaxMockCalls,
    setupMinimaxMocks
} from "../../e2e/minimax-mock.ts";

describe("E2E MiniMax fetch mocks", () => {
    afterEach(() => cleanupMinimaxMocks());

    it("intercepts quota fetch without nock", async () => {
        setupMinimaxMocks();

        const resp = await fetch("https://api.minimax.io/v1/token_plan/remains", {
            headers: { Authorization: "Bearer test" }
        });
        const body = (await resp.json()) as { model_remains: Array<{ model_name: string; }>; };

        assert.equal(resp.status, 200);
        assert.deepEqual(
            body.model_remains.map((model) => model.model_name),
            ["general", "video"]
        );
    });

    it("mocks every MiniMax endpoint used by the E2E runner", async () => {
        setupMinimaxMocks();

        const endpoints = [
            ["/anthropic/v1/messages", { method: "POST", body: "{}" }],
            ["/v1/image_generation", { method: "POST", body: JSON.stringify({ n: 3 }) }],
            ["/v1/t2a_v2", { method: "POST", body: "{}" }],
            ["/v1/lyrics_generation", { method: "POST", body: "{}" }],
            ["/v1/music_generation", { method: "POST", body: "{}" }],
            ["/v1/music_cover_preprocess", { method: "POST", body: "{}" }],
            ["/v1/video_generation", { method: "POST", body: "{}" }],
            ["/v1/query/video_generation", { method: "GET" }],
            ["/v1/files/retrieve", { method: "GET" }],
            ["/v1/coding_plan/search", { method: "POST", body: "{}" }],
            ["/v1/coding_plan/vlm", { method: "POST", body: "{}" }]
        ] as const;

        for (const [path, init] of endpoints) {
            const resp = await fetch(`https://api.minimax.io${path}`, init);
            assert.equal(resp.status, 200, path);
            assert.ok((await resp.text()).length > 0, path);
        }

        const imageResp = await fetch("https://example.com/generated/test-1.png");
        assert.equal(imageResp.headers.get("Content-Type"), "image/png");
        assert.ok((await imageResp.arrayBuffer()).byteLength > 0);
        const videoResp = await fetch("https://example.com/generated/test-video.mp4");
        assert.equal(videoResp.headers.get("Content-Type"), "video/mp4");
        assert.ok((await videoResp.arrayBuffer()).byteLength > 0);

        assert.equal(getMinimaxMockCalls().length, endpoints.length);
        resetMinimaxMockCalls();
        assert.deepEqual(getMinimaxMockCalls(), []);
    });

    it("handles malformed JSON bodies and falls back for unmatched URLs", async () => {
        const original = globalThis.fetch;
        let fallbackUrl = "";
        globalThis.fetch = async (input: RequestInfo | URL) => {
            fallbackUrl = String(input);
            return new Response("fallback", { status: 418 });
        };
        setupMinimaxMocks();

        const imageResp = await fetch("https://api.minimax.io/v1/image_generation", {
            method: "POST",
            body: "{"
        });
        const imageBody = (await imageResp.json()) as { data: { image_urls: string[]; }; };
        assert.equal(imageBody.data.image_urls.length, 1);

        const fallbackResp = await fetch("https://example.com/not-mocked.txt");
        assert.equal(fallbackResp.status, 418);
        assert.equal(await fallbackResp.text(), "fallback");
        assert.equal(fallbackUrl, "https://example.com/not-mocked.txt");

        cleanupMinimaxMocks();
        globalThis.fetch = original;
    });

    it("restores original fetch on cleanup", () => {
        const original = globalThis.fetch;
        setupMinimaxMocks();
        setupMinimaxMocks();
        assert.notEqual(globalThis.fetch, original);
        cleanupMinimaxMocks();
        assert.equal(globalThis.fetch, original);
    });
});
