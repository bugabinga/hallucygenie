// @ts-nocheck
// HallucyGenie — Integration tests
// Real HTTP server (random port) + real SQLite (temp file)
// Runs: node --experimental-strip-types integration.test.ts

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { initDatabase, resetStateForTesting, handleNodeRequest } from "./server.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

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

// ── Tests ───────────────────────────────────────────────────────────

describe("GET /api/health", () => {
    it("returns 200 + ok", async () => {
        const r = await api("GET", "/api/health");
        assert.equal(r.status, 200);
        assert.equal((r.body as any).status, "ok");
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
});

describe("GET /assets (no session)", () => {
    it("returns 400 without X-Session-Id", async () => {
        const r = await api("GET", "/assets");
        assert.equal(r.status, 400);
    });
});

describe("GET /asset/nonexistent (no session)", () => {
    it("returns 400 without X-Session-Id", async () => {
        const r = await api("GET", "/asset/nonexistent-id");
        assert.equal(r.status, 400);
    });
});

describe("POST /api/chat (no session)", () => {
    it("returns 400 without X-Session-Id", async () => {
        const r = await api("POST", "/api/chat", JSON.stringify({ messages: [] }));
        assert.equal(r.status, 400);
    });
});

describe("POST /api/steer (no session)", () => {
    it("returns 400 without X-Session-Id", async () => {
        const r = await api("POST", "/api/steer", JSON.stringify({ message: "steer" }));
        assert.equal(r.status, 400);
    });
});

describe("GET /api/history (no session)", () => {
    it("returns 400 without X-Session-Id", async () => {
        const r = await api("GET", "/api/history");
        assert.equal(r.status, 400);
    });
});
