// @ts-nocheck
// HallucyGenie — Integration tests
// Real HTTP server (random port) + real SQLite (temp file)

import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { connect } from "node:net";
import { after, before, describe, it } from "node:test";
import { createSession, getMessages, getOrCreateActiveSessionId, saveAsset } from "../../src/db.ts";
import { getDb, handleNodeRequest, initDatabase, resetStateForTesting } from "../../src/server.ts";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

before(async () => {
    // Use temp DB file per test run
    initDatabase(`data/hg-integration-test-${Date.now()}.db`);
    // Start real HTTP server on random port
    server = createServer((nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
        handleNodeRequest(nodeReq, nodeRes).catch(() => {
            try {
                nodeRes.end();
            } catch {}
        });
    });

    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as { port: number; };
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        })
    );
});

after(() => {
    server.close();
    resetStateForTesting();
});

type FontManifest = {
    fonts: Array<{ id: string; file: string; sha256: string; }>;
};

async function api(
    method: string,
    path: string,
    body?: string,
    extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: unknown; }> {
    const r = await fetch(`${baseUrl}${path}`, {
        method,
        body,
        headers: { "Content-Type": "application/json", ...extraHeaders }
    });
    let j: unknown;
    try {
        j = await r.json();
    } catch {
        j = null;
    }
    return { status: r.status, body: j };
}

async function httpGet(path: string): Promise<Response> {
    return await fetch(`${baseUrl}${path}`);
}

async function httpHead(path: string): Promise<Response> {
    return await fetch(`${baseUrl}${path}`, { method: "HEAD" });
}

function anthropicTextStream(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const chunks = [
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
        `event: content_block_delta\ndata: ${
            JSON.stringify({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text }
            })
        }\n\n`,
        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    ];
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        }
    });
}

async function rawHttpGet(path: string): Promise<number> {
    const url = new URL(baseUrl);
    return await new Promise<number>((resolve, reject) => {
        let data = "";
        const socket = connect(Number(url.port), url.hostname, () => {
            socket.write(`GET ${path} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`);
        });
        socket.setEncoding("utf-8");
        socket.on("data", (chunk) => {
            data += chunk;
        });
        socket.on("end", () => {
            const status = Number(data.match(/^HTTP\/1\.1 (\d+)/)?.[1] ?? 0);
            resolve(status);
        });
        socket.on("error", reject);
    });
}

function loadFontManifest(): FontManifest {
    return JSON.parse(readFileSync("public/fonts/fonts.manifest.json", "utf-8")) as FontManifest;
}

function seedActiveAsset(id: string, bytes?: Uint8Array, params?: Record<string, unknown>): void {
    const db = getDb();
    assert.ok(db);
    const sessionId = getOrCreateActiveSessionId(db);
    const filename = `${id}.png`;

    if (bytes) {
        mkdirSync(`data/assets/${sessionId}`, { recursive: true });
        writeFileSync(`data/assets/${sessionId}/${filename}`, bytes);
    }

    saveAsset(db, {
        id,
        session_id: sessionId,
        type: "image",
        filename,
        mime_type: "image/png",
        prompt: id,
        tool_name: "generate_image",
        size_bytes: bytes?.byteLength ?? 0,
        created_at: Date.now(),
        params_json: params ? JSON.stringify(params) : null
    });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("GET /api/health", () => {
    it("returns 200 + ok", async () => {
        const r = await api("GET", "/api/health");
        assert.equal(r.status, 200);
        assert.equal((r.body as any).status, "ok");
    });
});

describe("GET /", () => {
    it("serves associated labels for all user-editable controls", async () => {
        const r = await httpGet("/");
        assert.equal(r.status, 200);
        const win = new Window();
        (win as unknown as { SyntaxError: typeof SyntaxError; }).SyntaxError = SyntaxError;
        win.document.write(await r.text());
        const offenders = Array.from(win.document.querySelectorAll("input, textarea, select"))
            .filter((el: any) => el.type !== "hidden")
            .filter((el: any) => (el.labels?.length ?? 0) === 0)
            .map((el: any) => el.id || el.outerHTML);
        assert.deepEqual(offenders, []);
    });

    it("serves profile avatar generation grouped with avatar controls", async () => {
        const r = await httpGet("/");
        assert.equal(r.status, 200);
        const win = new Window();
        (win as unknown as { SyntaxError: typeof SyntaxError; }).SyntaxError = SyntaxError;
        win.document.write(await r.text());
        const editor = win.document.querySelector(".profile-avatar-editor");
        const generate = win.document.querySelector("#profile-generate");
        const actions = win.document.querySelector(".profile-actions");
        assert.ok(editor?.contains(generate));
        assert.equal(actions?.contains(generate), false);
    });
});

describe("GET /style.css", () => {
    it("serves lightbox above modal stacking order", async () => {
        const r = await httpGet("/style.css");
        assert.equal(r.status, 200);
        const css = await r.text();
        const modalZ = Number(css.match(/\.modal \{[\s\S]*?z-index: (\d+);/)?.[1]);
        const lightboxZ = Number(css.match(/\.lightbox \{[\s\S]*?z-index: (\d+);/)?.[1]);
        assert.ok(lightboxZ > modalZ, `lightbox ${lightboxZ} <= modal ${modalZ}`);
    });

    it("serves wide assistant tool card layout", async () => {
        const r = await httpGet("/style.css");
        assert.equal(r.status, 200);
        const css = await r.text();
        assert.match(css, /\.message--assistant \.message-bubble:has\(\.tool-card\)/);
        assert.match(css, /\.tool-card \{[\s\S]*width: 100%;/);
        assert.match(css, /\.tool-result-audio,\n\.tool-result-video \{[\s\S]*display: block;/);
    });

    it("serves tool details and tweak control styles", async () => {
        const r = await httpGet("/style.css");
        assert.equal(r.status, 200);
        const css = await r.text();
        assert.match(css, /\.tool-input-details \{[\s\S]*margin-top: var\(--space-sm\);/);
        assert.match(css, /\.tool-input-details pre \{[\s\S]*white-space: pre-wrap;/);
        assert.match(css, /\.tool-tweak-button \{[\s\S]*min-height: 32px;/);
    });

    it("serves Create image proximity spacing", async () => {
        const r = await httpGet("/style.css");
        assert.equal(r.status, 200);
        const css = await r.text();
        assert.match(css, /\.create-option-group \{[\s\S]*margin-bottom: var\(--space-lg\);/);
        assert.match(css, /\.create-option-group \.checkbox-row \{[\s\S]*margin-bottom: 2px;/);
        assert.match(css, /\.create-submit \{[\s\S]*margin-top: var\(--space-sm\);/);
    });
});

describe("GET /fonts", () => {
    it("serves every vendored font with font/woff2 MIME and cache headers", async () => {
        for (const font of loadFontManifest().fonts) {
            const urlPath = font.file.replace(/^public/, "");
            const r = await httpGet(urlPath);
            assert.equal(r.status, 200, font.id);
            assert.equal(r.headers.get("content-type"), "font/woff2");
            assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
            assert.ok((await r.arrayBuffer()).byteLength > 0, `${font.id} body`);
        }
    });

    it("serves cache-busted font URLs with query params", async () => {
        const font = loadFontManifest().fonts.find((item) => item.id === "roboto-flex")!;
        const urlPath = `${font.file.replace(/^public/, "")}?v=${font.sha256.slice(0, 12)}`;
        const r = await httpGet(urlPath);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("content-type"), "font/woff2");
        assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
        assert.ok((await r.arrayBuffer()).byteLength > 0);
    });

    it("supports HEAD for container smoke checks", async () => {
        const font = loadFontManifest().fonts.find((item) => item.id === "pixelify-sans")!;
        const r = await httpHead(font.file.replace(/^public/, ""));
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("content-type"), "font/woff2");
        assert.equal(r.headers.get("cache-control"), "public, max-age=31536000, immutable");
        assert.ok(Number(r.headers.get("content-length")) > 0);
    });

    it("returns 404 for missing fonts and blocks raw traversal", async () => {
        assert.equal((await httpGet("/fonts/nope.woff2")).status, 404);
        assert.equal(await rawHttpGet("/fonts/%2e%2e/index.html"), 404);
    });
});

describe("GET /api/quota", () => {
    it("returns 503 when MINIMAX_API_KEY not set", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;
        const r = await api("GET", "/api/quota");
        if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
        assert.equal(r.status, 503);
    });

    it("returns MiniMax quota data through real HTTP server with mocked fetch", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(baseUrl)) return oldFetch(input, init);
            assert.equal(String(input), "https://api.minimax.io/v1/token_plan/remains");
            return new Response(
                JSON.stringify({
                    model_remains: [
                        {
                            model_name: "image-01",
                            current_interval_total_count: 100,
                            current_interval_usage_count: 7,
                            remains_time: 1000
                        },
                        {
                            model_name: "music-2.6",
                            current_interval_total_count: 100,
                            current_interval_usage_count: 3,
                            remains_time: 1000
                        }
                    ]
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const r = await api("GET", "/api/quota");
            assert.equal(r.status, 200);
            assert.deepEqual((r.body as any).image, { used: 7, total: 100, resetsInMs: 1000 });
            assert.deepEqual((r.body as any).music, { used: 3, total: 100, resetsInMs: 1000 });
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("returns 502 when MiniMax quota API fails through real HTTP server", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(baseUrl)) return oldFetch(input, init);
            return new Response("{}", { status: 500 });
        };

        try {
            const r = await api("GET", "/api/quota");
            assert.equal(r.status, 502);
            assert.equal((r.body as any).error, "Failed to fetch quota");
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("Music cover HTTP flow", () => {
    it("reports YouTube extractor disabled when COVER_EXTRACTOR_URL is missing", async () => {
        const oldExtractor = process.env.COVER_EXTRACTOR_URL;
        delete process.env.COVER_EXTRACTOR_URL;
        try {
            const r = await api("GET", "/api/music-cover/status");
            assert.equal(r.status, 200);
            assert.equal((r.body as any).youtubeEnabled, false);
        } finally {
            if (oldExtractor) process.env.COVER_EXTRACTOR_URL = oldExtractor;
            else delete process.env.COVER_EXTRACTOR_URL;
        }
    });

    it("preprocesses a direct audio URL through real HTTP server", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        let providerBody: Record<string, unknown> | null = null;
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(baseUrl)) return oldFetch(input, init);
            providerBody = JSON.parse(String(init?.body));
            return new Response(
                JSON.stringify({
                    data: {
                        cover_feature_id: "cover-integration",
                        formatted_lyrics: "[Verse]\nhi"
                    },
                    base_resp: { status_code: 0 }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const form = new FormData();
            form.set("source_kind", "direct");
            form.set("audio_url", "https://example.com/source.mp3");
            const resp = await oldFetch(`${baseUrl}/api/music-cover/preprocess`, {
                method: "POST",
                body: form
            });
            const body = await resp.json();

            assert.equal(resp.status, 200);
            assert.deepEqual(providerBody, {
                model: "music-cover",
                audio_url: "https://example.com/source.mp3"
            });
            assert.equal(body.cover_feature_id, "cover-integration");
            assert.equal(body.lyrics, "[Verse]\nhi");
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("generates cover music through Create tool endpoint and saves asset", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        const db = getDb();
        assert.ok(db);
        const sessionId = "integration-cover-session";
        createSession(db, sessionId, "Cover Test");
        let providerBody: Record<string, unknown> | null = null;
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(baseUrl)) return oldFetch(input, init);
            providerBody = JSON.parse(String(init?.body));
            return new Response(
                JSON.stringify({ data: { audio: "ff" }, base_resp: { status_code: 0 } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const r = await api(
                "POST",
                "/api/create-tool",
                JSON.stringify({
                    tool_name: "generate_music_cover",
                    input: {
                        prompt: "spooky boss battle",
                        lyrics: "[Verse]\nhi",
                        cover_feature_id: "cover-integration"
                    }
                }),
                { "X-Session-Id": sessionId }
            );
            assert.equal(r.status, 200);
            assert.equal(providerBody?.model, "music-cover");
            assert.equal(providerBody?.cover_feature_id, "cover-integration");

            const assets = await api("GET", "/assets", undefined, { "X-Session-Id": sessionId });
            assert.equal(assets.status, 200);
            const cover = (assets.body as any).assets.find(
                (asset: { tool_name: string; }) => asset.tool_name === "generate_music_cover"
            );
            assert.ok(cover);
            assert.equal(cover.type, "music");
            assert.equal(cover.params.cover_feature_id_present, true);
            assert.equal(String(cover.url).startsWith("/asset/"), true);
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("POST /api/create-tool web_search", () => {
    it("persists YouTube oEmbed enrichment through real HTTP flow", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        const db = getDb();
        assert.ok(db);
        const sessionId = "integration-search-session";
        createSession(db, sessionId, "Search Test");
        const fetched: string[] = [];
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith(baseUrl)) return oldFetch(input, init);
            fetched.push(url);
            if (url.includes("/v1/coding_plan/search")) {
                assert.equal(JSON.parse(String(init?.body)).query, undefined);
                assert.equal(JSON.parse(String(init?.body)).q, "https://youtu.be/dQw4w9WgXcQ");
                return new Response(JSON.stringify({ organic: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            if (url.startsWith("https://www.youtube.com/oembed?")) {
                return new Response(
                    JSON.stringify({
                        title: "Never Gonna Give You Up",
                        author_name: "Rick Astley",
                        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            throw new Error(`Unexpected fetch ${url}`);
        };

        try {
            const resp = await fetch(`${baseUrl}/api/create-tool`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
                body: JSON.stringify({
                    tool_name: "web_search",
                    input: { query: "https://youtu.be/dQw4w9WgXcQ" }
                })
            });
            assert.equal(resp.status, 200);
            const body = await resp.text();
            assert.match(body, /event: tool_result/);
            assert.match(body, /YouTube metadata/);
            assert.match(body, /Never Gonna Give You Up/);
            assert.match(body, /Rick Astley/);
            assert.ok(fetched.some((url) => url.startsWith("https://www.youtube.com/oembed?")));

            const history = await api("GET", "/api/create-history?kind=search", undefined, {
                "X-Session-Id": sessionId
            });
            assert.equal(history.status, 200);
            assert.equal((history.body as any).items[0].tool_name, "web_search");
            assert.equal((history.body as any).items[0].status, "succeeded");
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("GET /api/state", () => {
    it("returns active session metadata", async () => {
        const r = await api("GET", "/api/state");
        assert.equal(r.status, 200);
        assert.match((r.body as any).activeSession.id, /^[0-9a-f-]{36}$/);
        assert.equal((r.body as any).activeSession.name, "New Chat");
        assert.equal((r.body as any).activeSession.nameSource, "default");
        assert.equal((r.body as any).ui.maxMessageLength, 2000);
    });
});

describe("GET /assets (no session)", () => {
    it("uses active session without X-Session-Id", async () => {
        seedActiveAsset("integration-active-list");

        const r = await api("GET", "/assets");
        assert.equal(r.status, 200);
        assert.ok(
            (r.body as any).assets.some(
                (asset: { id: string; }) => asset.id === "integration-active-list"
            )
        );
    });

    it("returns parsed params and stable asset URLs without DB internals", async () => {
        seedActiveAsset("integration-active-details", undefined, {
            model: "image-01",
            aspect_ratio: "16:9"
        });

        const r = await api("GET", "/assets");
        assert.equal(r.status, 200);
        const asset = (r.body as any).assets.find(
            (item: { id: string; }) => item.id === "integration-active-details"
        );

        assert.deepEqual(asset.params, { model: "image-01", aspect_ratio: "16:9" });
        assert.equal(asset.url, "/asset/integration-active-details");
        assert.equal(asset.download_url, "/asset/integration-active-details");
        assert.equal("params_json" in asset, false);
        assert.equal(String(asset.url).includes("data/assets"), false);
        assert.equal(String(asset.download_url).includes("data/assets"), false);
    });

    it("returns explicit error for malformed params_json", async () => {
        seedActiveAsset("integration-bad-params");
        const database = getDb();
        assert.ok(database);
        database
            .prepare("UPDATE assets SET params_json = ? WHERE id = ?")
            .run("{", "integration-bad-params");

        const r = await api("GET", "/assets");
        assert.equal(r.status, 500);
        assert.equal((r.body as any).error, "Invalid asset metadata");
    });
});

describe("GET /asset (active session)", () => {
    it("serves active session asset without X-Session-Id or query param", async () => {
        seedActiveAsset("integration-active-file", new Uint8Array([1, 2, 3]));

        const r = await httpGet("/asset/integration-active-file");
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("content-type"), "image/png");
        assert.deepEqual(Array.from(new Uint8Array(await r.arrayBuffer())), [1, 2, 3]);
    });

    it("blocks wrong explicit session header for active asset", async () => {
        seedActiveAsset("integration-wrong-session-file", new Uint8Array([4, 5, 6]));

        const r = await api("GET", "/asset/integration-wrong-session-file", undefined, {
            "X-Session-Id": "wrong-session"
        });
        assert.equal(r.status, 404);
    });

    it("returns 404 for missing active session asset", async () => {
        const r = await api("GET", "/asset/nonexistent-id");
        assert.equal(r.status, 404);
    });

    it("ignores legacy asset session query param", async () => {
        seedActiveAsset("integration-query-ignored", new Uint8Array([7, 8, 9]));

        const r = await httpGet("/asset/integration-query-ignored?s=wrong-session");
        assert.equal(r.status, 200);
    });
});

describe("POST /api/chat (no session)", () => {
    it("persists to active session without X-Session-Id", async () => {
        const oldKey = process.env.MINIMAX_API_KEY;
        const oldFetch = globalThis.fetch;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(baseUrl)) return oldFetch(input, init);
            return new Response(anthropicTextStream("active reply"), { status: 200 });
        };

        try {
            const resp = await oldFetch(`${baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: "active chat" }] })
            });
            assert.equal(resp.status, 200);
            assert.match(await resp.text(), /active reply/);

            const db = getDb()!;
            const rows = getMessages(db, getOrCreateActiveSessionId(db));
            assert.ok(rows.some((row) => row.role === "user" && row.content === "active chat"));
            assert.ok(
                rows.some((row) => row.role === "assistant" && row.content === "active reply")
            );
        } finally {
            globalThis.fetch = oldFetch;
            if (oldKey) process.env.MINIMAX_API_KEY = oldKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("POST /api/steer (no session)", () => {
    it("uses active session without X-Session-Id", async () => {
        const r = await api("POST", "/api/steer", JSON.stringify({ message: "steer" }));
        assert.equal(r.status, 200);
    });
});

describe("GET /api/history (no session)", () => {
    it("uses active session without X-Session-Id", async () => {
        const r = await api("GET", "/api/history");
        assert.equal(r.status, 200);
        assert.ok(Array.isArray((r.body as any).messages));
    });
});
