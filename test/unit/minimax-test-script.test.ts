// HallucyGenie — MiniMax smoke script tests

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    dataUrlSummary,
    handleMainError,
    hexSummary,
    imageDataUrlFromUrl,
    imageUrlSummary,
    main,
    musicInstrumentalPayload,
    statusLine,
    textSummary,
    vlmPayload
} from "../../scripts/minimax-test.ts";

describe("minimax-test script formatting", () => {
    it("prints explicit MiniMax status label", () => {
        assert.equal(
            statusLine({ base_resp: { status_code: 0, status_msg: "success" } }),
            "MiniMax status: 0 (success)"
        );
    });

    it("summarizes hex without printing raw media", () => {
        assert.equal(hexSummary("abcdef"), "present (6 hex chars)");
        assert.equal(hexSummary(""), "missing");
        assert.equal(hexSummary(undefined), "missing");
    });

    it("summarizes image URLs without signed URL", () => {
        assert.equal(
            imageUrlSummary(["https://example.com/path/file.png?Signature=secret"]),
            "present (1, host example.com)"
        );
        assert.equal(imageUrlSummary(["not a url"]), "present (1)");
        assert.equal(imageUrlSummary([]), "missing");
    });

    it("summarizes VLM image data URLs without printing raw media", () => {
        assert.equal(
            dataUrlSummary("data:image/jpeg;base64,abcdEF12=="),
            "present (image/jpeg, 10 base64 chars)"
        );
        assert.equal(dataUrlSummary("https://example.com/image.jpg"), "missing");
    });

    it("summarizes VLM text without printing content", () => {
        assert.equal(textSummary("a small red cube"), "present (16 chars)");
        assert.equal(textSummary(""), "missing");
    });

    it("uses current instrumental music payload shape", () => {
        const payload = musicInstrumentalPayload();
        assert.equal(payload.is_instrumental, true);
        assert.equal("instrumental" in payload, false);
        assert.equal("lyrics" in payload, false);
    });

    it("uses VLM data-url payload shape", () => {
        const payload = vlmPayload("data:image/png;base64,abc=");
        assert.equal(payload.prompt, "Describe this image in one short sentence.");
        assert.equal(payload.image_url, "data:image/png;base64,abc=");
    });

    it("fails loud when the API key is missing", async () => {
        const originalKey = process.env.MINIMAX_API_KEY;
        const originalLog = console.log;
        console.log = () => undefined;
        delete process.env.MINIMAX_API_KEY;
        try {
            await assert.rejects(() => main(), /MINIMAX_API_KEY is missing/);
        } finally {
            console.log = originalLog;
            if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalKey;
        }
    });

    it("reports malformed quota JSON without crashing the smoke flow", async () => {
        const originalFetch = globalThis.fetch;
        const originalKey = process.env.MINIMAX_API_KEY;
        const originalLog = console.log;
        const lines: string[] = [];
        process.env.MINIMAX_API_KEY = "test-key";
        console.log = (line?: unknown) => lines.push(String(line ?? ""));
        globalThis.fetch = async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/v1/token_plan/remains")) {
                return new Response("not-json", { status: 200 });
            }
            if (url.endsWith("/v1/t2a_v2")) {
                return new Response(JSON.stringify({ data: { audio: "ff" } }));
            }
            if (url.endsWith("/v1/image_generation")) {
                return new Response(JSON.stringify({ data: { image_urls: [] } }));
            }
            if (url.endsWith("/v1/music_generation")) {
                return new Response(JSON.stringify({ data: { audio: "ff" } }));
            }
            if (url.startsWith("https://www.gstatic.com/")) {
                return new Response(new Uint8Array([1]), { status: 200 });
            }
            if (url.endsWith("/v1/coding_plan/vlm")) {
                return new Response(JSON.stringify({ content: "ok" }));
            }
            throw new Error(`unexpected fetch ${url}`);
        };

        try {
            await main();
            const output = lines.join("\n");
            assert.match(output, /model_remains: missing/);
            assert.match(output, /raw/);
            assert.match(output, /content: present \(2 chars\)/);
        } finally {
            console.log = originalLog;
            globalThis.fetch = originalFetch;
            if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalKey;
        }
    });

    it("rejects unsupported VLM image downloads", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () =>
            new Response(new Uint8Array([1]), {
                headers: { "Content-Type": "application/octet-stream" }
            });
        try {
            await assert.rejects(
                () => imageDataUrlFromUrl("https://example.com/file.bin"),
                /Unsupported image content type: application\/octet-stream/
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("prints main errors and exits non-zero", () => {
        const originalError = console.error;
        const originalExit = process.exit;
        const errors: string[] = [];
        console.error = (line?: unknown) => errors.push(String(line ?? ""));
        process.exit = ((code?: string | number | null) => {
            throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;
        try {
            assert.throws(() => handleMainError(new Error("boom")), /exit:1/);
            assert.deepEqual(errors, ["Error: boom"]);
        } finally {
            console.error = originalError;
            process.exit = originalExit;
        }
    });

    it("runs live smoke flow with mocked network and never prints raw media", async () => {
        const originalFetch = globalThis.fetch;
        const originalKey = process.env.MINIMAX_API_KEY;
        const originalLog = console.log;
        const lines: string[] = [];
        process.env.MINIMAX_API_KEY = "test-key";
        console.log = (line?: unknown) => lines.push(String(line ?? ""));
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            assert.equal(
                new Headers(init?.headers as HeadersInit).get("Authorization"),
                url.startsWith("https://www.gstatic.com/") ? null : "Bearer test-key"
            );
            if (url.endsWith("/v1/token_plan/remains")) {
                return new Response(
                    JSON.stringify({
                        model_remains: [{ model_name: "general", current_interval_total_count: 7 }]
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            if (url.endsWith("/v1/t2a_v2")) {
                return new Response(
                    JSON.stringify({
                        base_resp: { status_code: 0, status_msg: "ok" },
                        data: { audio: "ff" }
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            if (url.endsWith("/v1/image_generation")) {
                return new Response(
                    JSON.stringify({
                        base_resp: { status_code: 0, status_msg: "ok" },
                        data: { image_urls: ["https://cdn.example/image.png?secret=1"] }
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            if (url.endsWith("/v1/music_generation")) {
                return new Response(
                    JSON.stringify({
                        base_resp: { status_code: 0, status_msg: "ok" },
                        data: { audio: "abcd" }
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            if (url.startsWith("https://www.gstatic.com/")) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "image/jpeg" }
                });
            }
            if (url.endsWith("/v1/coding_plan/vlm")) {
                return new Response(JSON.stringify({ content: "small cat" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            throw new Error(`unexpected fetch ${url}`);
        };

        try {
            await main();
            const output = lines.join("\n");
            assert.match(output, /MiniMax live API smoke test/);
            assert.match(output, /Raw media omitted from output/);
            assert.match(output, /audio: present \(2 hex chars\)/);
            assert.match(output, /image_urls: present \(1, host cdn\.example\)/);
            assert.match(output, /content: present \(9 chars\)/);
            assert.doesNotMatch(output, /ff|abcd|secret=1|data:image\/jpeg;base64,AQID/);
        } finally {
            console.log = originalLog;
            globalThis.fetch = originalFetch;
            if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalKey;
        }
    });
});
