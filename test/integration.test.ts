// @ts-nocheck
// HallucyGenie — Integration tests
// Real HTTP server (random port) + real SQLite (temp file)

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { initDatabase, resetStateForTesting, handleNodeRequest, getDb } from "../src/server.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getMessages, getOrCreateActiveSessionId, saveAsset } from "../src/db.ts";

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
            const addr = server.address() as { port: number };
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        }),
    );
});

after(() => {
    server.close();
    resetStateForTesting();
});

type FontManifest = {
    fonts: Array<{ id: string; file: string; sha256: string }>;
};

async function api(
    method: string,
    path: string,
    body?: string,
    extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
    const r = await fetch(`${baseUrl}${path}`, {
        method,
        body,
        headers: { "Content-Type": "application/json", ...extraHeaders },
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
        'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
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

// ── Tests ───────────────────────────────────────────────────────────

describe("GET /api/health", () => {
    it("returns 200 + ok", async () => {
        const r = await api("GET", "/api/health");
        assert.equal(r.status, 200);
        assert.equal((r.body as any).status, "ok");
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
                            remains_time: 1000,
                        },
                        {
                            model_name: "music-2.6",
                            current_interval_total_count: 100,
                            current_interval_usage_count: 3,
                            remains_time: 1000,
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
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

describe("GET /assets (no session)", () => {
    it("uses active session without X-Session-Id", async () => {
        const db = getDb()!;
        const sessionId = getOrCreateActiveSessionId(db);
        saveAsset(db, {
            id: "active-asset-1",
            session_id: sessionId,
            type: "image",
            filename: "active.png",
            mime_type: "image/png",
            prompt: "active asset",
            tool_name: "generate_image",
            size_bytes: 12,
        });

        const r = await api("GET", "/assets");
        assert.equal(r.status, 200);
        assert.equal((r.body as any).assets.at(-1).id, "active-asset-1");
    });
});

describe("GET /asset/nonexistent (no session)", () => {
    it("returns 400 without X-Session-Id or query param", async () => {
        const r = await api("GET", "/asset/nonexistent-id");
        assert.equal(r.status, 400);
    });

    it("returns 404 with ?s= query param (session ok, asset not found)", async () => {
        const r = await api("GET", "/asset/nonexistent-id?s=test-session");
        assert.equal(r.status, 404);
    });

    it("returns 400 with ?s= empty query param", async () => {
        const r = await api("GET", "/asset/nonexistent-id?s=");
        assert.equal(r.status, 400);
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
                body: JSON.stringify({ messages: [{ role: "user", content: "active chat" }] }),
            });
            assert.equal(resp.status, 200);
            assert.match(await resp.text(), /active reply/);

            const db = getDb()!;
            const rows = getMessages(db, getOrCreateActiveSessionId(db));
            assert.ok(rows.some((row) => row.role === "user" && row.content === "active chat"));
            assert.ok(
                rows.some((row) => row.role === "assistant" && row.content === "active reply"),
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
