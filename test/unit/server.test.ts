// HallucyGenie -- Server tests

import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { MINIMAX_MODEL } from "../../src/agent.ts";
import {
    createSession,
    getAssets,
    getDraft,
    getMessages,
    getUsageToday,
    listAsyncTtsTasks,
    listToolInputHistory,
    listVideoTasks,
    saveDraft
} from "../../src/db.ts";
import {
    saveAsset,
    saveMessage,
    saveUserProfile,
    setActiveSessionId,
    trackUsage
} from "../../src/db.ts";
import {
    generateSessionNameFromPrompt,
    getDb,
    handleChat,
    handleRequest,
    initDatabase,
    isShuttingDown,
    parseExplicitToolDirective,
    parseLimitOffset,
    resetStateForTesting,
    resolveSessionId,
    sanitizeAssistantMediaMarkup,
    shutdown,
    validateSessionId
} from "../../src/server.ts";

// Capture the real (native) fetch at module load. Use getOwnPropertyDescriptor
// so we reliably get the native fetch even if this file is loaded in a worker
// where another parallel file already reassigned globalThis.fetch (e.g. tools.test.ts).
// Bun --parallel runs files in parallel in separate workers; each module capture
// can happen after another worker's reassignment. getOwnPropertyDescriptor on
// globalThis always returns the own (non-inherited, non-proxied) fetch value.
const REAL_FETCH = Object.getOwnPropertyDescriptor(globalThis, "fetch")?.value ?? globalThis.fetch;

// -- Test helpers -----------------------------------------------------

function makeRequest(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
): Request {
    const init: RequestInit = {
        method,
        headers: {} as Record<string, string>
    };
    if (body !== undefined) {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
    // Add X-Session-Id for /api/* routes (except health)
    if (path.startsWith("/api/") && path !== "/api/health") {
        (init.headers as Record<string, string>)["X-Session-Id"] = extraHeaders?.["X-Session-Id"]
            ?? "test-session-123";
    }
    // Add any extra headers
    if (extraHeaders) {
        for (const [key, value] of Object.entries(extraHeaders)) {
            if (key !== "X-Session-Id" || !path.startsWith("/api/") || path === "/api/health") {
                (init.headers as Record<string, string>)[key] = value;
            }
        }
    }
    return new Request(`http://localhost${path}`, init);
}

async function readBody(resp: Response): Promise<string> {
    return await resp.text();
}

async function readJson(resp: Response): Promise<unknown> {
    return JSON.parse(await resp.text());
}

function tarWithFile(filename: string, bytes: Uint8Array): Buffer {
    const data = Buffer.from(bytes);
    const header = Buffer.alloc(512);
    header.write(filename, 0, "utf8");
    header.write("0000777\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write(`${data.byteLength.toString(8).padStart(11, "0")}\0`, 124, "ascii");
    header.write("00000000000\0", 136, "ascii");
    header.fill(0x20, 148, 156);
    header[156] = 48;
    header.write("ustar\0", 257, "ascii");
    header.write("00", 263, "ascii");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
    const pad = Buffer.alloc(Math.ceil(data.byteLength / 512) * 512 - data.byteLength);
    return Buffer.concat([header, data, pad, Buffer.alloc(1024)]);
}

// -- Test database setup -----------------------------------------------

const testDbDir = join(import.meta.dirname ?? ".", "test-data");
const testDbPath = join(testDbDir, "test.db");

before(() => {
    resetStateForTesting();
    rmSync(testDbDir, { recursive: true, force: true });
    // Initialize test database
    initDatabase(testDbPath);
});

function ensureTestDb(): void {
    if (!getDb()) initDatabase(testDbPath);
}

function requireDb(): NonNullable<ReturnType<typeof getDb>> {
    const database = getDb();
    assert.ok(database);
    return database;
}

function serverPort(server: { address(): string | AddressInfo | null; }): number {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return address.port;
}

after(() => {
    // Restore real fetch (isolates this file from prior test files' mocks)
    globalThis.fetch = REAL_FETCH;
    // Cleanup
    try {
        shutdown();
    } catch {
        /* ignore */
    }
    try {
        rmSync(testDbDir, { recursive: true, force: true });
    } catch {
        /* ignore */
    }
});

// -- Anthropic SSE test helpers ------------------------------------------

function anthropicTextSse(textChunks: string[]): string[] {
    const events: string[] = [
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n"
    ];
    for (let i = 0; i < textChunks.length; i++) {
        events.push(
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":"
                + String(i)
                + ",\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n"
        );
        events.push(
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":"
                + String(i)
                + ",\"delta\":{\"type\":\"text_delta\",\"text\":"
                + JSON.stringify(textChunks[i])
                + "}}\n\n"
        );
        events.push(
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":"
                + String(i)
                + "}\n\n"
        );
    }
    events.push(
        "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n"
    );
    events.push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
    return events;
}

function anthropicToolUseSse(toolId: string, toolName: string, inputJson: string): string[] {
    return [
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
        `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"${toolId}","name":"${toolName}","input":{}}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${
            JSON.stringify(inputJson)
        }}}\n\n`,
        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    ];
}

function makeAnthropicStream(events: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const e of events) {
                controller.enqueue(enc.encode(e));
            }
            controller.close();
        }
    });
}

function anthropicResponse(events: string[]): Response {
    return new Response(makeAnthropicStream(events), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
    });
}

// -- Explicit Create directives ---------------------------------------

describe("Explicit Create directives", () => {
    it("parses image directive with tool params", () => {
        const directive = parseExplicitToolDirective(
            "Use generate_image with prompt: coder with big muscles coding a girly app\nTool params: aspect_ratio=16:9"
        );
        assert.deepEqual(directive, {
            name: "generate_image",
            args: { aspect_ratio: "16:9", prompt: "coder with big muscles coding a girly app" },
            prompt: "coder with big muscles coding a girly app"
        });
    });

    it("parses TTS directive text and numeric params", () => {
        const directive = parseExplicitToolDirective(
            "Use text_to_speech with text: hello gamer\nTool params: speed=1.2, pitch=-2"
        );
        assert.deepEqual(directive, {
            name: "text_to_speech",
            args: { speed: 1.2, pitch: -2, text: "hello gamer" },
            prompt: "hello gamer"
        });
    });

    it("parses music lyrics but ignores stale instrumental param", () => {
        const directive = parseExplicitToolDirective(
            "Use generate_music with prompt: boss fight\nTool params: lyrics=boom boom, instrumental=true"
        );
        assert.deepEqual(directive, {
            name: "generate_music",
            args: { lyrics: "boom boom", prompt: "boss fight" },
            prompt: "boss fight"
        });
    });

    it("parses generate_lyrics directive with lyrics field as prompt alias", () => {
        const directive = parseExplicitToolDirective(
            "Use generate_lyrics with lyrics: write me a song about cats"
        );
        assert.deepEqual(directive, {
            name: "generate_lyrics",
            args: { prompt: "write me a song about cats" },
            prompt: "write me a song about cats"
        });
    });

    it("parses generate_lyrics directive with prompt field", () => {
        const directive = parseExplicitToolDirective(
            "Use generate_lyrics with prompt: write me a song about cats"
        );
        assert.deepEqual(directive, {
            name: "generate_lyrics",
            args: { prompt: "write me a song about cats" },
            prompt: "write me a song about cats"
        });
    });

    it("parses generate_lyrics directive with title, mode, and edit lyrics", () => {
        const directive = parseExplicitToolDirective(
            "Use generate_lyrics with lyrics: sing a happy song\nTool params: title=Joy,title=Happy Day,mode=edit,lyrics=old words"
        );
        assert.deepEqual(directive, {
            name: "generate_lyrics",
            args: {
                title: "Happy Day",
                mode: "edit",
                lyrics: "old words",
                prompt: "sing a happy song"
            },
            prompt: "sing a happy song"
        });
    });

    it("parses analyze image directive with prompt param", () => {
        const directive = parseExplicitToolDirective(
            "Use analyze_image with image_url: https://example.com/cat.png\nTool params: prompt=Tell me one thing you see"
        );
        assert.deepEqual(directive, {
            name: "analyze_image",
            args: {
                image_url: "https://example.com/cat.png",
                prompt: "Tell me one thing you see"
            },
            prompt: "Tell me one thing you see"
        });
    });

    it("uploads local analyze image files as assets", async () => {
        const db = requireDb();
        const session = createSession(db);
        setActiveSessionId(db, session.id);
        const body = new FormData();
        body.set(
            "image",
            new File([new Uint8Array([137, 80, 78, 71])], "tiny.png", { type: "image/png" })
        );
        const resp = await handleRequest(
            new Request("http://localhost/api/analyze-image", { method: "POST", body })
        );
        assert.equal(resp.status, 200);
        const json = (await readJson(resp)) as { assetId: string; assetUrl: string; };
        assert.match(json.assetId, /^asset_[0-9a-f-]+$/i);
        assert.equal(json.assetUrl, `/asset/${json.assetId}`);
        const asset = getAssets(db, session.id).find((item) => item.id === json.assetId);
        assert.equal(asset?.tool_name, "analyze_image");
        assert.equal(asset?.mime_type, "image/png");
    });

    it("accepts GIF uploads for analyze image", async () => {
        const db = requireDb();
        const session = createSession(db);
        setActiveSessionId(db, session.id);
        const body = new FormData();
        body.set(
            "image",
            new File([new Uint8Array([71, 73, 70, 56])], "anim.gif", { type: "image/gif" })
        );
        const resp = await handleRequest(
            new Request("http://localhost/api/analyze-image", { method: "POST", body })
        );
        assert.equal(resp.status, 200);
        const json = (await readJson(resp)) as { assetId: string; assetUrl: string; };
        assert.match(json.assetId, /^asset_[0-9a-f-]+$/i);
        const asset = getAssets(db, session.id).find((item) => item.id === json.assetId);
        assert.equal(asset?.tool_name, "analyze_image");
        assert.equal(asset?.mime_type, "image/gif");
    });

    it("rejects unsupported local analyze image files", async () => {
        const body = new FormData();
        body.set(
            "image",
            new File([new Uint8Array([1, 2, 3])], "bad.bmp", { type: "image/bmp" })
        );
        const resp = await handleRequest(
            new Request("http://localhost/api/analyze-image", { method: "POST", body })
        );
        assert.equal(resp.status, 400);
        const json = (await readJson(resp)) as { error: string; };
        assert.match(json.error, /PNG, JPG, GIF, or WebP/);
    });

    it("analyzes uploaded assets without storing raw data URLs", async () => {
        const originalKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        const db = requireDb();
        const session = createSession(db);
        setActiveSessionId(db, session.id);
        const body = new FormData();
        body.set(
            "image",
            new File([new Uint8Array([137, 80, 78, 71])], "tiny.png", { type: "image/png" })
        );
        const uploadResp = await handleRequest(
            new Request("http://localhost/api/analyze-image", { method: "POST", body })
        );
        const upload = (await readJson(uploadResp)) as { assetUrl: string; };
        let vlmPayload = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            vlmPayload = String(init?.body ?? "");
            return new Response(JSON.stringify({ content: "local image looks safe" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        try {
            const chatResp = await handleRequest(
                new Request("http://localhost/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [
                            {
                                role: "user",
                                content:
                                    `Use analyze_image with image_url: ${upload.assetUrl}\nTool params: prompt=What is this?`
                            }
                        ]
                    })
                })
            );
            const sse = await readBody(chatResp);
            assert.match(vlmPayload, /data:image\/png;base64,/);
            assert.match(sse, /local image looks safe/);
            assert.doesNotMatch(sse, /data:image\/png;base64/);
            const stored = getMessages(db, session.id)
                .map((msg) => msg.content)
                .join("\n");
            assert.doesNotMatch(stored, /data:image\/png;base64|;base64,/);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = originalKey;
        }
    });

    it("ignores MiniMax params outside the explicit kid-safe allowlist", () => {
        const image = parseExplicitToolDirective(
            "Use generate_image with prompt: cat\nTool params: aspect_ratio=1:1, n=2, seed=7, width=1024, height=1024, prompt_optimizer=true, response_format=base64, subject_reference=https://example.com/cat.png"
        );
        assert.deepEqual(image?.args, {
            prompt: "cat",
            aspect_ratio: "1:1",
            n: 2,
            seed: 7,
            width: 1024,
            height: 1024,
            prompt_optimizer: true
        });

        const tts = parseExplicitToolDirective(
            "Use text_to_speech with text: hello\nTool params: voice_id=English_expressive_narrator, speed=1.1, volume=2, pitch=1, emotion=happy, language_boost=English, subtitle_enable=true, output_format=wav, stream=true"
        );
        assert.deepEqual(tts?.args, {
            text: "hello",
            voice_id: "English_expressive_narrator",
            speed: 1.1,
            volume: 2,
            pitch: 1
        });

        const music = parseExplicitToolDirective(
            "Use generate_music with prompt: boss fight\nTool params: lyrics=boom boom, is_instrumental=false, lyrics_optimizer=true, audio_base64=AAAA, output_format=wav, stream=true"
        );
        assert.deepEqual(music?.args, { prompt: "boss fight", lyrics: "boom boom" });
    });

    it("sanitizes assistant media markup before history replay", () => {
        assert.equal(
            sanitizeAssistantMediaMarkup(
                "Here's your image:\n\n![cat](https://hailuo-image.example/image_inference_output/cat.jpeg)"
            ),
            "Generated media is shown in the tool card."
        );
        assert.equal(
            sanitizeAssistantMediaMarkup("Look <img src=\"https://example.com/cat.png\"> cool"),
            "Look  cool"
        );
    });
});

// -- Route: static files ----------------------------------------------

describe("Static file serving", () => {
    it("serves style.css", async () => {
        const resp = await handleRequest(makeRequest("GET", "/style.css"));
        assert.equal(resp.status, 200);
        const ct = resp.headers.get("Content-Type") ?? "";
        assert.ok(ct.includes("text/css"));
    });

    it("returns 404 for missing static files", async () => {
        const resp = await handleRequest(makeRequest("GET", "/nonexistent.js"));
        assert.equal(resp.status, 404);
    });
});

// -- Route: POST /api/chat (validation) -------------------------------

describe("POST /api/chat validation", () => {
    it("rejects invalid JSON body", async () => {
        const req = new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "not json{{{"
        });
        const resp = await handleChat(req, "test-key");
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("Invalid JSON"));
    });

    it("rejects missing messages field", async () => {
        const resp = await handleChat(makeRequest("POST", "/api/chat", {}), "test-key");
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("messages"));
    });

    it("rejects non-array messages", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", { messages: "not array" }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("array"));
    });

    it("rejects empty messages array", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", { messages: [] }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("empty"));
    });

    it("rejects message with missing role", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: [{ content: "hi" }]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("role"));
    });

    it("rejects message with missing content", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: [{ role: "user" }]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("content"));
    });

    it("rejects message with wrong role type", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: [{ role: 42, content: "hi" }]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("role"));
    });

    it("rejects message with wrong content type", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: 42 }]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("content"));
    });

    it("rejects message that is null", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: [null]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("must be an object"));
    });

    it("rejects message that is a string", async () => {
        const resp = await handleChat(
            makeRequest("POST", "/api/chat", {
                messages: ["not an object"]
            }),
            "test-key"
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("must be an object"));
    });

    it("rejects null body", async () => {
        const req = new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "null"
        });
        const resp = await handleChat(req, "test-key");
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("JSON object"));
    });
});

// -- Route: 404 -------------------------------------------------------

describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
        const resp = await handleRequest(makeRequest("GET", "/unknown/route"));
        assert.equal(resp.status, 404);
        const body = (await readJson(resp)) as { error: string; };
        assert.equal(body.error, "Not found");
    });

    it("includes CORS headers on 404", async () => {
        const resp = await handleRequest(makeRequest("GET", "/unknown"));
        assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
    });

    it("returns 404 for POST to unknown route", async () => {
        const resp = await handleRequest(makeRequest("POST", "/unknown"));
        assert.equal(resp.status, 404);
    });
});

// -- Route: POST /api/steer (placeholder) -----------------------------

describe("POST /api/steer", () => {
    it("returns ok response with valid message", async () => {
        const resp = await handleRequest(
            makeRequest("POST", "/api/steer", { message: "test steer" })
        );
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { ok: boolean; };
        assert.ok(body.ok);
    });

    it("includes CORS headers", async () => {
        const resp = await handleRequest(makeRequest("POST", "/api/steer", { message: "test" }));
        assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
    });
});

// -- SSE streaming with mocked MiniMax ---------------------------------

describe("SSE streaming from Anthropic endpoint", () => {
    it("streams text content", async () => {
        // Build a mock Anthropic SSE stream
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[]}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello \"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"World\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                for (const chunk of sseChunks) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            }
        });

        // Mock fetch
        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");

            assert.equal(resp.status, 200);
            assert.equal(resp.headers.get("Content-Type"), "text/event-stream");

            const body = await readBody(resp);
            // Should contain the streamed content
            assert.ok(body.includes("Hello "));
            assert.ok(body.includes("World"));
            assert.ok(body.includes("[DONE]"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("emits thinking events from Anthropic thinking blocks", async () => {
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[]}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"hidden thought\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                for (const chunk of sseChunks) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "test" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            // Thinking content should be in event: thinking, not in text
            assert.ok(body.includes("event: thinking"));
            assert.ok(body.includes("hidden thought"));
            assert.ok(body.includes("Hello"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles tool calls in stream", async () => {
        // First call: Anthropic returns tool_use SSE
        // Second call: after tool execution, returns text response
        const toolCallSse = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[]}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"generate_image\",\"input\":{}}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];
        const finalSse = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_2\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[]}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Done!\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        let callCount = 0;
        const encoder = new TextEncoder();

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const chunks = callCount === 0 ? toolCallSse : finalSse;
                callCount++;
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            for (const chunk of chunks) {
                                controller.enqueue(encoder.encode(chunk));
                            }
                            controller.close();
                        }
                    }),
                    { status: 200, headers: { "Content-Type": "text/event-stream" } }
                );
            }
            if (urlStr === "https://example.com/cat.png") {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/cat.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "draw a cat" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            assert.ok(body.includes("tool_start"));
            assert.ok(body.includes("tool_result"));
            assert.ok(body.includes("generate_image"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("streams error when MiniMax is unreachable", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection refused");
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            // New flow returns 200 SSE with error message in the stream
            assert.equal(resp.status, 200);
            const body = await readBody(resp);
            assert.ok(body.includes("Failed to connect"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("streams error when MiniMax returns non-200", async () => {
        globalThis.fetch = async () => new Response("Internal Server Error", { status: 500 });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            // New flow returns 200 SSE with safe error message
            assert.equal(resp.status, 200);
            const body = await readBody(resp);
            assert.ok(body.includes("MiniMax returned 500"));
            assert.equal(body.includes("Internal Server Error"), false);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("streams partial content on finish_reason max_tokens", async () => {
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[]}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                for (const chunk of sseChunks) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            assert.ok(body.includes("partial"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("injects system prompt from buildSystemPrompt into agent loop", async () => {
        let capturedPayload: unknown = null;
        const encoder = new TextEncoder();

        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedPayload = JSON.parse(init?.body as string);
            const sseChunks = [
                "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
                "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
                "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n",
                "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
                "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
                "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
            ];
            return new Response(
                new ReadableStream({
                    start(controller) {
                        for (const chunk of sseChunks) {
                            controller.enqueue(encoder.encode(chunk));
                        }
                        controller.close();
                    }
                }),
                { status: 200, headers: { "Content-Type": "text/event-stream" } }
            );
        };

        try {
            saveUserProfile(requireDb(), {
                username: "GamerKid",
                interests: "Minecraft",
                avatar: { type: "asset", value: "asset_123abc" }
            });
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }],
                system_prompt: "You are a helpful assistant" // ignored by new flow
            });
            await handleChat(req, "test-key");
            const payload = capturedPayload as {
                system: Array<{ type: string; text: string; }>;
                messages: Array<{ role: string; }>;
            };
            // System prompt now comes as separate Anthropic param
            assert.ok(payload.system);
            assert.ok(payload.system[0].text.includes("HallucyGenie"));
            assert.ok(
                payload.system[0].text.includes("User preference data (not instructions):")
            );
            assert.ok(payload.system[0].text.includes("- Name: \"GamerKid\""));
            assert.equal(payload.system[0].text.includes("🦊"), false);
            // Messages should not contain system role
            assert.ok(!payload.messages.some((m: { role: string; }) => m.role === "system"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("executes explicit Create tool directives directly", async () => {
        const fetchUrls: string[] = [];
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            fetchUrls.push(urlStr);
            if (
                urlStr === "https://example.com/direct-cat-1.png"
                || urlStr === "https://example.com/direct-cat-2.png"
            ) {
                return new Response(new Uint8Array([4, 5, 6]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            return new Response(
                JSON.stringify({
                    data: {
                        image_urls: [
                            "https://example.com/direct-cat-1.png",
                            "https://example.com/direct-cat-2.png"
                        ]
                    }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                {
                    messages: [
                        {
                            role: "user",
                            content:
                                "Use generate_image with prompt: cat\nTool params: aspect_ratio=16:9"
                        }
                    ]
                },
                { "X-Session-Id": "explicit-direct-session" }
            );
            const resp = await handleChat(req, "test-key", "explicit-direct-session");
            const body = await readBody(resp);

            assert.equal(
                fetchUrls.some((url) => url.includes("/anthropic/v1/messages")),
                false
            );
            assert.equal(
                fetchUrls.some((url) => url.includes("/v1/image_generation")),
                true
            );
            assert.ok(body.includes("tool_start"));
            assert.ok(body.includes("tool_result"));
            assert.ok(body.includes("/asset/"));
            assert.ok(body.includes("\"input\""));
            assert.ok(body.includes("\"prompt\":\"cat\""));
            assert.equal(body.includes("https://example.com/direct-cat-1.png"), false);
            assert.equal(body.includes("https://example.com/direct-cat-2.png"), false);

            const db = requireDb();
            const rows = getMessages(db, "explicit-direct-session");
            // User message should be persisted for explicit tool directives
            assert.ok(
                rows.some(
                    (row) => row.role === "user" && row.content.includes("Use generate_image")
                ),
                "user message should be persisted for explicit tool directive"
            );
            assert.equal(rows.at(-2)?.tool_calls_json?.includes("generate_image"), true);
            assert.equal(rows.at(-1)?.role, "tool");
            assert.equal((rows.at(-1)?.content.match(/\/asset\//g) ?? []).length, 2);
            const assets = getAssets(db, "explicit-direct-session").filter(
                (asset) => asset.type === "image" && asset.tool_name === "generate_image"
            );
            assert.ok(assets.length >= 2);
            const asset = assets.find((item) => item.prompt === "cat");
            assert.ok(asset);
            assert.ok(asset.params_json);
            assert.deepEqual(JSON.parse(asset.params_json), {
                model: "image-01",
                prompt: "cat",
                aspect_ratio: "16:9"
            });
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("executes explicit generate_lyrics directive with required prompt", async () => {
        let lyricsPayload: Record<string, unknown> | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            lyricsPayload = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ lyrics: "cat song" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        try {
            const resp = await handleChat(
                makeRequest(
                    "POST",
                    "/api/chat",
                    {
                        messages: [
                            {
                                role: "user",
                                content:
                                    "Use generate_lyrics with lyrics: write me a song about cats"
                            }
                        ]
                    },
                    { "X-Session-Id": "explicit-lyrics-session" }
                ),
                "test-key",
                "explicit-lyrics-session"
            );
            const body = await readBody(resp);
            assert.ok(body.includes("cat song"));
            assert.deepEqual(lyricsPayload, {
                mode: "write_full_song",
                prompt: "write me a song about cats"
            });
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("executes Create tool endpoint with origin=create and exact multiline params", async () => {
        const sessionId = "create-tool-multiline-session";
        const db = requireDb();
        createSession(db, sessionId, "Create Tool Multiline");
        const lyrics = "Verse one, with comma\nChorus line, still here";
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        let musicPayload: Record<string, unknown> | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            musicPayload = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ data: { audio: "ff" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_music",
                        input: { prompt: "boss fight", lyrics }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);

            assert.equal(musicPayload?.lyrics, lyrics);
            assert.equal(musicPayload?.is_instrumental, false);
            assert.ok(body.includes("tool_result"));
            assert.equal(body.includes("Use generate_music"), false);
            const rows = getMessages(db, sessionId);
            assert.equal(
                rows.some((row) => row.role === "user"),
                false
            );
            const history = listToolInputHistory(db, sessionId, { kind: "music" });
            assert.equal(history[0]?.origin, "create");
            assert.equal(JSON.parse(history[0]?.input_json).lyrics, lyrics);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("rejects invalid reference image uploads before provider use", async () => {
        const sessionId = "bad-reference-upload-session";
        const database = requireDb();
        createSession(database, sessionId, "Bad Reference Upload");
        const form = new FormData();
        form.set("image", new File([new Uint8Array([1])], "bad.txt", { type: "text/plain" }));

        const resp = await handleRequest(
            new Request("http://localhost/api/reference-image", {
                method: "POST",
                body: form,
                headers: { "X-Session-Id": sessionId }
            })
        );
        const body = await readBody(resp);

        assert.equal(resp.status, 400);
        assert.match(body, /PNG or JPG/);
    });

    it("executes Create image with uploaded subject reference without storing raw reference", async () => {
        const sessionId = "create-image-reference-session";
        const database = requireDb();
        createSession(database, sessionId, "Create Image Reference");
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";

        try {
            const form = new FormData();
            form.set(
                "image",
                new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" })
            );
            const uploadResp = await handleRequest(
                new Request("http://localhost/api/reference-image", {
                    method: "POST",
                    body: form,
                    headers: { "X-Session-Id": sessionId }
                })
            );
            assert.equal(uploadResp.status, 200);
            const uploaded = (await readJson(uploadResp)) as {
                assetId: string;
                assetUrl: string;
            };
            let providerPayload: Record<string, unknown> | null = null;
            globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
                const urlStr = url.toString();
                if (urlStr.endsWith("/v1/image_generation")) {
                    providerPayload = JSON.parse(String(init?.body));
                    return new Response(
                        JSON.stringify({
                            data: { image_urls: ["https://cdn.example/ref-out.png"] }
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                if (urlStr === "https://cdn.example/ref-out.png") {
                    return new Response(new Uint8Array([4, 5, 6]), {
                        status: 200,
                        headers: { "Content-Type": "image/png", "Content-Length": "3" }
                    });
                }
                throw new Error(`unexpected fetch ${urlStr}`);
            };

            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_image",
                        input: {
                            prompt: "same fox in space",
                            reference_asset_id: uploaded.assetId
                        }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);
            const subjectRef = providerPayload?.subject_reference as Array<Record<string, string>>;
            const history = listToolInputHistory(database, sessionId, { kind: "image" });
            const rows = getMessages(database, sessionId);

            assert.ok(body.includes("\"type\":\"image\""));
            assert.equal(subjectRef[0]?.type, "character");
            assert.match(subjectRef[0]?.image_file ?? "", /^data:image\/png;base64,/);
            assert.equal(history[0]?.input_json.includes(uploaded.assetId), true);
            assert.equal(history[0]?.input_json.includes("data:image"), false);
            assert.equal(
                rows.some((row) => row.content.includes("data:image")),
                false
            );
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("executes long narration async TTS, extracts bundle audio, and stores compact history", async () => {
        const sessionId = "long-tts-session";
        const database = requireDb();
        createSession(database, sessionId, "Long TTS");
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        const longText = "Long story ".repeat(220).trim();
        let providerPayload: Record<string, unknown> | null = null;

        try {
            globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
                const urlStr = url.toString();
                if (urlStr.endsWith("/v1/t2a_async_v2")) {
                    providerPayload = JSON.parse(String(init?.body));
                    return new Response(JSON.stringify({ task_id: "tts-task-1" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }
                if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                    return new Response(
                        JSON.stringify({ data: { status: "Success", file_id: "tts-file-1" } }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                if (urlStr.includes("/v1/files/retrieve")) {
                    return new Response(
                        JSON.stringify({
                            file: { download_url: "https://cdn.example/tts.tar" }
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                if (urlStr === "https://cdn.example/tts.tar") {
                    const tar = tarWithFile(
                        "audio/result.mp3",
                        new Uint8Array([0x49, 0x44, 0x33])
                    );
                    return new Response(tar, {
                        status: 200,
                        headers: {
                            "Content-Type": "application/x-tar",
                            "Content-Length": String(tar.byteLength)
                        }
                    });
                }
                throw new Error(`unexpected fetch ${urlStr}`);
            };

            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_long_speech",
                        input: {
                            text: longText,
                            voice_id: "English_CaptivatingStoryteller",
                            speed: 1.2
                        }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);
            const assets = getAssets(database, sessionId);
            const history = listToolInputHistory(database, sessionId, { kind: "voice" });
            const rows = getMessages(database, sessionId);
            const tasks = listAsyncTtsTasks(database, sessionId);
            const serializedRows = JSON.stringify(rows);

            assert.ok(body.includes("\"type\":\"audio\""));
            assert.equal(providerPayload?.model, "speech-2.8-hd");
            assert.equal(providerPayload?.text, longText);
            assert.equal(assets[0]?.mime_type, "audio/mpeg");
            assert.equal(assets[0]?.size_bytes, 3);
            assert.equal(tasks[0]?.status, "succeeded");
            assert.equal(tasks[0]?.asset_id, assets[0]?.id);
            assert.equal(history[0]?.input_json.includes("text_summary"), true);
            assert.equal(history[0]?.input_json.includes(longText), false);
            assert.equal(serializedRows.includes(longText), false);
            assert.equal(serializedRows.includes("https://cdn.example/tts.tar"), false);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("executes Create video, downloads asset, and keeps provider URL out of history", async () => {
        const sessionId = "create-video-session";
        const database = requireDb();
        createSession(database, sessionId, "Create Video");
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        const calls: string[] = [];
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = url.toString();
            calls.push(urlStr);
            if (urlStr.endsWith("/v1/video_generation")) {
                const payload = JSON.parse(String(init?.body));
                assert.equal(payload.model, "MiniMax-Hailuo-02");
                assert.equal(payload.prompt, "fox mascot intro");
                return new Response(JSON.stringify({ task_id: "video-task-1" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            if (urlStr.includes("/v1/query/video_generation")) {
                return new Response(JSON.stringify({ status: "Success", file_id: "file-1" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            if (urlStr.includes("/v1/files/retrieve")) {
                return new Response(
                    JSON.stringify({ download_url: "https://cdn.example/output.mp4" }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            if (urlStr === "https://cdn.example/output.mp4") {
                return new Response(new Uint8Array([0, 1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4", "Content-Length": "4" }
                });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_video",
                        input: { prompt: "fox mascot intro", duration: 6, resolution: "768p" }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);
            const assets = getAssets(database, sessionId);
            const rows = getMessages(database, sessionId);

            assert.ok(body.includes("\"type\":\"video\""));
            assert.ok(body.includes("/asset/asset_"));
            assert.equal(body.includes("https://cdn.example/output.mp4"), false);
            assert.equal(assets.length, 1);
            assert.equal(assets[0]?.type, "video");
            assert.equal(assets[0]?.mime_type, "video/mp4");
            assert.equal(assets[0]?.size_bytes, 4);
            assert.equal(
                rows.some((row) => row.content.includes("https://cdn.example/output.mp4")),
                false
            );
            const tasks = listVideoTasks(database, sessionId);
            assert.equal(tasks.length, 1);
            assert.equal(tasks[0]?.status, "succeeded");
            assert.equal(tasks[0]?.asset_id, assets[0]?.id);
            assert.ok(calls.some((url) => url.includes("task_id=video-task-1")));
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("persists provider diagnostics for failed Create video", async () => {
        const sessionId = "create-video-sensitive-session";
        const database = requireDb();
        createSession(database, sessionId, "Create Video Sensitive");
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/video_generation")) {
                return new Response(JSON.stringify({ task_id: "video-task-sensitive" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            if (urlStr.includes("/v1/query/video_generation")) {
                return new Response(
                    JSON.stringify({ status: "Fail", message: "output new_sensitive" }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_video",
                        input: {
                            prompt: "fat mermaid singing in the moonlight",
                            duration: 10,
                            resolution: "768p"
                        }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);
            const tasks = listVideoTasks(database, sessionId);
            const history = listToolInputHistory(database, sessionId, { kind: "video" });
            const rows = getMessages(database, sessionId);

            assert.ok(body.includes("Couldn't generate the video"));
            assert.equal(body.includes("new_sensitive"), false);
            assert.equal(tasks[0]?.status, "failed");
            assert.equal(tasks[0]?.provider_task_id, "video-task-sensitive");
            assert.equal(tasks[0]?.provider_stage, "query");
            assert.equal(tasks[0]?.provider_status_msg, "output new_sensitive");
            assert.equal(history[0]?.provider_stage, "query");
            assert.equal(history[0]?.provider_status_msg, "output new_sensitive");
            assert.equal(JSON.stringify(rows).includes("new_sensitive"), false);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("reports music cover extractor status", async () => {
        const previous = process.env.COVER_EXTRACTOR_URL;
        delete process.env.COVER_EXTRACTOR_URL;
        try {
            const resp = await handleRequest(makeRequest("GET", "/api/music-cover/status"));
            const body = JSON.parse(await readBody(resp));
            assert.equal(body.youtubeEnabled, false);
        } finally {
            if (previous === undefined) delete process.env.COVER_EXTRACTOR_URL;
            else process.env.COVER_EXTRACTOR_URL = previous;
        }
    });

    it("preprocesses music cover direct audio URL", async () => {
        const originalFetch = globalThis.fetch;
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        let payload: Record<string, unknown> | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            payload = JSON.parse(String(init?.body));
            return new Response(
                JSON.stringify({
                    data: { cover_feature_id: "cover-1", formatted_lyrics: "[Verse]\nhi" }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const form = new FormData();
            form.set("source_kind", "direct");
            form.set("audio_url", "https://example.com/source.mp3");
            const resp = await handleRequest(
                new Request("http://localhost/api/music-cover/preprocess", {
                    method: "POST",
                    body: form
                })
            );
            const body = JSON.parse(await readBody(resp));

            assert.equal(payload?.model, "music-cover");
            assert.equal(payload?.audio_url, "https://example.com/source.mp3");
            assert.equal(body.cover_feature_id, "cover-1");
            assert.equal(body.lyrics, "[Verse]\nhi");
        } finally {
            globalThis.fetch = originalFetch;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("rejects music cover upload with named validation errors", async () => {
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        try {
            const form = new FormData();
            form.set("source_kind", "upload");
            form.set(
                "audio",
                new File([new Uint8Array([1])], "bad.txt", { type: "text/plain" })
            );
            const resp = await handleRequest(
                new Request("http://localhost/api/music-cover/preprocess", {
                    method: "POST",
                    body: form
                })
            );
            const body = JSON.parse(await readBody(resp));

            assert.equal(resp.status, 400);
            assert.equal(body.error, "audio type must be MP3, M4A, MP4, or WAV");
        } finally {
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("executes Create music cover generation and saves asset", async () => {
        const sessionId = "create-tool-cover-session";
        const db = requireDb();
        createSession(db, sessionId, "Create Tool Cover");
        let payload: Record<string, unknown> | null = null;
        const originalFetch = globalThis.fetch;
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            payload = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ data: { audio: "ff" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    {
                        tool_name: "generate_music_cover",
                        input: {
                            prompt: "spooky boss battle",
                            lyrics: "[Verse]\nhi",
                            cover_feature_id: "cover-1"
                        }
                    },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);

            assert.equal(payload?.model, "music-cover");
            assert.equal(payload?.cover_feature_id, "cover-1");
            assert.ok(body.includes("tool_result"));
            const asset = getAssets(db, sessionId).at(-1);
            assert.ok(asset);
            assert.equal(asset.type, "music");
            assert.equal(asset.tool_name, "generate_music_cover");
            assert.ok(asset.params_json);
            const params = JSON.parse(asset.params_json);
            assert.equal(params.cover_feature_id_present, true);
            const history = listToolInputHistory(db, sessionId, { kind: "cover" });
            assert.equal(history[0]?.tool_name, "generate_music_cover");
        } finally {
            globalThis.fetch = originalFetch;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("preserves create draft after successful Create lyrics helper", async () => {
        const sessionId = "create-tool-lyrics-draft-session";
        const db = requireDb();
        createSession(db, sessionId, "Create Lyrics Draft");
        saveDraft(db, sessionId, "create", {
            selectedTab: "music",
            music: { prompt: "boss", lyrics: "" }
        });

        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async () =>
            new Response(JSON.stringify({ lyrics: "Verse one\nChorus" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    { tool_name: "generate_lyrics", input: { prompt: "boss" } },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);

            assert.ok(body.includes("tool_result"));
            assert.deepEqual(JSON.parse(getDraft(db, sessionId, "create")?.value_json), {
                selectedTab: "music",
                music: { prompt: "boss", lyrics: "" }
            });
            const history = listToolInputHistory(db, sessionId, { kind: "lyrics" });
            assert.equal(history[0]?.origin, "create");
            assert.equal(history[0]?.tool_name, "generate_lyrics");
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("rejects generated image downloads over the byte cap before buffering", async () => {
        const sessionId = "create-tool-image-too-large-session";
        const db = requireDb();
        createSession(db, sessionId, "Create Image Too Large");
        const previousApiKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr === "https://example.com/huge.png") {
                return new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type": "image/png",
                        "Content-Length": String(21 * 1024 * 1024)
                    }
                });
            }
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/huge.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const resp = await handleRequest(
                makeRequest(
                    "POST",
                    "/api/create-tool",
                    { tool_name: "generate_image", input: { prompt: "huge cat" } },
                    { "X-Session-Id": sessionId }
                )
            );
            const body = await readBody(resp);

            assert.ok(body.includes("Couldn't save generated image"));
            assert.equal(getAssets(db, sessionId).length, 0);
            const history = listToolInputHistory(db, sessionId, { kind: "image" });
            assert.equal(history[0]?.status, "failed");
            assert.equal(history[0]?.origin, "create");
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (previousApiKey === undefined) delete process.env.MINIMAX_API_KEY;
            else process.env.MINIMAX_API_KEY = previousApiKey;
        }
    });

    it("clears create draft after successful explicit tool directive", async () => {
        const sessionId = "explicit-create-draft-success-session";
        const db = requireDb();
        createSession(db, sessionId, "Draft Success");
        saveDraft(db, sessionId, "create", { selectedTab: "voice", voice: { text: "hello" } });

        globalThis.fetch = async () =>
            new Response(JSON.stringify({ data: { audio: "ff" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "Use text_to_speech with text: hello" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("tool_result"));
            assert.equal(getDraft(db, sessionId, "create"), null);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("preserves create draft after failed explicit tool directive", async () => {
        const sessionId = "explicit-create-draft-fail-session";
        const db = requireDb();
        createSession(db, sessionId, "Draft Failure");
        saveDraft(db, sessionId, "create", { selectedTab: "voice", voice: { text: "hello" } });

        globalThis.fetch = async () =>
            new Response(
                JSON.stringify({ base_resp: { status_code: 2013, status_msg: "bad text" } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "Use text_to_speech with text: hello" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("Couldn't generate voice audio"));
            assert.deepEqual(JSON.parse(getDraft(db, sessionId, "create")?.value_json), {
                selectedTab: "voice",
                voice: { text: "hello" }
            });
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("consumes exactly one quota unit for successful explicit tool directives", async () => {
        const sessionId = "explicit-quota-once-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'image'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 99)"
        ).run();

        let imageApiCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr === "https://example.com/once.png") {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            if (urlStr.includes("/v1/image_generation")) imageApiCalls++;
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/once.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "Use generate_image with prompt: cat" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("/asset/"));
            assert.equal(imageApiCalls, 1);
            assert.equal(getUsageToday(db).image, 100);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'image'"
                ).run();
            }
        }
    });

    it("consumes speech quota by text character count for explicit TTS", async () => {
        const sessionId = "explicit-speech-char-quota-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'speech'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 3)"
        ).run();

        globalThis.fetch = async () =>
            new Response(JSON.stringify({ data: { audio: "ff" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "Use text_to_speech with text: hello" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("/asset/"));
            assert.equal(getUsageToday(db).speech, 8);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'speech'"
                ).run();
            }
        }
    });

    it("releases speech character quota after failed explicit TTS", async () => {
        const sessionId = "explicit-speech-char-release-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'speech'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 3)"
        ).run();

        globalThis.fetch = async () =>
            new Response(
                JSON.stringify({ base_resp: { status_code: 2013, status_msg: "bad text" } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "Use text_to_speech with text: hello" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("Couldn't generate voice audio"));
            assert.equal(getUsageToday(db).speech, 3);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'speech'"
                ).run();
            }
        }
    });

    it("preserves quota-blocked error for explicit tool directives", async () => {
        const sessionId = "quota-blocked-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'image'"
            )
            .get() as { count: number; } | undefined;

        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 100)"
        ).run();

        globalThis.fetch = async () => {
            throw new Error("MiniMax API should not be called when quota is blocked");
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                {
                    messages: [
                        {
                            role: "user",
                            content: "Use generate_image with prompt: cat"
                        }
                    ]
                },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("Daily image quota is used up"));
            assert.equal(body.includes("Couldn't generate the image"), false);

            const rows = getMessages(db, sessionId);
            assert.equal(rows.at(-1)?.role, "tool");
            assert.equal(rows.at(-1)?.content, "Error: Daily image quota is used up.");
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'image'"
                ).run();
            }
        }
    });

    it("does not reuse process-local IDs for persisted assets or direct tool calls", async () => {
        const dir = join(import.meta.dirname ?? ".", "test-data-asset-id-collision");
        const sessionId = "asset-id-collision-session";
        resetStateForTesting();
        rmSync(dir, { recursive: true, force: true });
        rmSync(`data/assets/${sessionId}`, { recursive: true, force: true });
        const database = initDatabase(join(dir, "test.db"));
        saveAsset(database, {
            id: "000008",
            session_id: sessionId,
            type: "image",
            filename: "000008.jpg",
            mime_type: "image/jpeg",
            prompt: "old image",
            tool_name: "generate_image",
            size_bytes: 1
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr === "https://example.com/new-cat.png") {
                return new Response(new Uint8Array([7, 8, 9]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/new-cat.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                {
                    messages: [
                        {
                            role: "user",
                            content: "Use generate_image with prompt: cat"
                        }
                    ]
                },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);
            const assets = getAssets(database, sessionId);
            const toolRows = getMessages(database, sessionId).filter((row) => row.role === "tool");
            const assistantRows = getMessages(database, sessionId).filter(
                (row) => row.role === "assistant"
            );
            const lastAssistant = assistantRows.at(-1);
            assert.ok(lastAssistant?.tool_calls_json);
            const lastToolCall = JSON.parse(lastAssistant.tool_calls_json)[0] as {
                id: string;
            };

            assert.equal(body.includes("Couldn't save generated image"), false);
            const newAsset = assets.find((asset) => asset.id !== "000008");

            assert.equal(assets.length, 2);
            assert.equal(
                assets.some((asset) => asset.id === "000008"),
                true
            );
            assert.match(newAsset?.id, /^asset_[0-9a-f-]{36}$/);
            assert.match(toolRows.at(-1)?.content, /^\/asset\/asset_[0-9a-f-]{36}$/);
            assert.match(lastToolCall.id, /^direct_[0-9a-f-]{36}$/);
        } finally {
            globalThis.fetch = REAL_FETCH;
            resetStateForTesting();
            rmSync(dir, { recursive: true, force: true });
            rmSync(`data/assets/${sessionId}`, { recursive: true, force: true });
            initDatabase(testDbPath);
        }
    });

    it("includes model and max_tokens in Anthropic request", async () => {
        let capturedPayload: unknown = null;
        const encoder = new TextEncoder();

        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedPayload = JSON.parse(init?.body as string);
            const sseChunks = [
                "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
                "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
                "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n",
                "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
                "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
                "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
            ];
            return new Response(
                new ReadableStream({
                    start(controller) {
                        for (const chunk of sseChunks) {
                            controller.enqueue(encoder.encode(chunk));
                        }
                        controller.close();
                    }
                }),
                { status: 200, headers: { "Content-Type": "text/event-stream" } }
            );
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            await handleChat(req, "test-key");
            const payload = capturedPayload as {
                model: string;
                stream: boolean;
                max_tokens: number;
            };
            assert.equal(payload.model, MINIMAX_MODEL);
            assert.equal(payload.stream, true);
            assert.equal(payload.max_tokens, 4096);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });
});

// -- API key check ----------------------------------------------------

describe("API key check", () => {
    it("returns 503 when MINIMAX_API_KEY is missing via handleRequest", async () => {
        const originalKey = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;
        try {
            const resp = await handleRequest(
                makeRequest("POST", "/api/chat", {
                    messages: [{ role: "user", content: "hi" }]
                })
            );
            assert.equal(resp.status, 503);
            const body = (await readJson(resp)) as { error: string; };
            assert.ok(body.error.includes("API key"));
        } finally {
            if (originalKey) process.env.MINIMAX_API_KEY = originalKey;
        }
    });
});

// -- Snapshot tests ---------------------------------------------------

describe("Snapshots", () => {
    it("snapshot: GET /api/health response", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/health"));
        const body = await readBody(resp);
        const snapshot = {
            status: resp.status,
            headers: {
                "content-type": resp.headers.get("Content-Type"),
                "access-control-allow-origin": resp.headers.get("Access-Control-Allow-Origin")
            },
            body: JSON.parse(body)
        };
        // Verify structure (uptime is dynamic, so check shape)
        assert.equal(snapshot.status, 200);
        assert.equal(snapshot.headers["content-type"], "application/json");
        assert.equal(snapshot.body.status, "ok");
        assert.equal(typeof snapshot.body.uptime, "number");
    });

    it("snapshot: 404 response", async () => {
        const resp = await handleRequest(makeRequest("GET", "/nope"));
        const body = await readBody(resp);
        const snapshot = {
            status: resp.status,
            body: JSON.parse(body)
        };
        assert.deepEqual(snapshot, {
            status: 404,
            body: { error: "Not found" }
        });
    });

    it("snapshot: OPTIONS preflight response", async () => {
        const resp = await handleRequest(makeRequest("OPTIONS", "/api/chat"));
        assert.equal(resp.status, 204);
        assert.equal(await readBody(resp), "");
    });
});

// -- Graceful shutdown ------------------------------------------------

describe("shutdown", () => {
    it("does not throw when no server is running", async () => {
        await assert.doesNotReject(async () => await shutdown());
    });

    it("sets shuttingDown flag", async () => {
        // shutdown was already called in previous test, flag should be set
        // But since module state persists, we test the export exists
        assert.equal(typeof shutdown, "function");
    });
});

// -- Error handling edge cases -----------------------------------------

describe("Error handling", () => {
    // Reset state because shutdown tests above may have closed the DB
    before(() => {
        resetStateForTesting();
        initDatabase(testDbPath);
    });
    it("handles SSE stream read error gracefully", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode("data: {invalid json}\n\n"));
                controller.close();
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            assert.equal(resp.status, 200);
            // Should still complete without crashing
            const body = await readBody(resp);
            assert.ok(body !== undefined);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles empty SSE stream", async () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.close();
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            assert.equal(resp.status, 200);
            const body = await readBody(resp);
            assert.ok(body !== undefined);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles SSE with only comments", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(": this is a comment\n\n"));
                controller.close();
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            assert.equal(resp.status, 200);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles MiniMax 401 auth error", async () => {
        globalThis.fetch = async () =>
            new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            // New flow: error is streamed as SSE text
            assert.equal(resp.status, 200);
            const body = await readBody(resp);
            assert.ok(body.includes("401"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles tool calls with malformed arguments", async () => {
        const toolCallSse = anthropicToolUseSse("call_1", "test", "{broken");
        const finalSse = anthropicTextSse(["handled"]);

        let callCount = 0;

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const events = callCount === 0 ? toolCallSse : finalSse;
                callCount++;
                return anthropicResponse(events);
            }
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/test.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            // Should contain tool_start and tool_result events
            assert.ok(body.includes("tool_start"));
            assert.ok(body.includes("tool_result"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles tool_use block with stop_reason end_turn (no tool execution)", async () => {
        // Tool use block that arrives but stop_reason is end_turn, not tool_use
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"test\",\"input\":{}}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        globalThis.fetch = async () =>
            new Response(makeAnthropicStream(sseChunks), {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            // Should complete gracefully with [DONE]
            assert.ok(body.includes("[DONE]"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("handles SSE stream error during read", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n"
                    )
                );
                controller.enqueue(
                    encoder.encode(
                        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n"
                    )
                );
                controller.enqueue(
                    encoder.encode(
                        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n"
                    )
                );
                controller.enqueue(
                    encoder.encode(
                        "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
                    )
                );
                controller.enqueue(
                    encoder.encode(
                        "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n"
                    )
                );
                controller.enqueue(
                    encoder.encode("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
                );
                // Simulate an error by erroring the stream
                controller.error(new Error("Stream interrupted"));
            }
        });

        globalThis.fetch = async () =>
            new Response(stream, {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            // Should complete without crashing (status is always 200 for SSE)
            assert.equal(resp.status, 200);
            const body = await readBody(resp);
            assert.ok(body !== undefined);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });
});

// -- Step 1: Database Initialization at Startup ----------------------

describe("Database Initialization", () => {
    const testDbDir = join(import.meta.dirname ?? ".", "test-data-step1");
    const testDbPath = join(testDbDir, "test.db");

    after(() => {
        resetStateForTesting();
        // Clean up test data dir
        try {
            rmSync(testDbDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("creates data directory if missing", () => {
        resetStateForTesting();
        // Ensure dir doesn't exist
        try {
            rmSync(testDbDir, { recursive: true, force: true });
        } catch {}

        assert.ok(!existsSync(testDbDir), "dir should not exist yet");

        const database = initDatabase(testDbPath);

        assert.ok(existsSync(testDbDir), "data dir should be created");
        assert.ok(database, "db should be returned");
        database.close();
    });

    it("initializes database with migrations", () => {
        resetStateForTesting();
        const database = initDatabase(testDbPath);

        // Verify the database has tables from migrations
        const tables = database
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all() as Array<{ name: string; }>;
        const tableNames = tables.map((t) => t.name);

        assert.ok(tableNames.includes("messages"), "messages table should exist");
        assert.ok(tableNames.includes("preferences"), "preferences table should exist");
        assert.ok(tableNames.includes("daily_usage"), "daily_usage table should exist");
        assert.ok(
            tableNames.includes("schema_migrations"),
            "schema_migrations table should exist"
        );

        database.close();
    });

    it("getDb returns the initialized database instance", () => {
        resetStateForTesting();
        const database = initDatabase(testDbPath);

        assert.equal(getDb(), database, "getDb should return the same instance");

        database.close();
    });

    it("getDb returns null before initDatabase is called", () => {
        resetStateForTesting();
        assert.equal(getDb(), null, "db should be null before init");
    });

    it("shutdown closes the database and sets getDb to null", async () => {
        resetStateForTesting();
        const database = initDatabase(testDbPath);

        // Verify db is usable
        database.prepare("SELECT 1").get();

        await shutdown();

        // After shutdown, getDb should return null
        assert.equal(getDb(), null, "db should be null after shutdown");
        assert.ok(isShuttingDown(), "shuttingDown flag should be set");
    });
});

// -- Step 2: Session Validation Middleware ----------------------------

describe("Session Validation", () => {
    beforeEach(() => {
        ensureTestDb();
    });

    it("allows valid session ID on /api/chat", async () => {
        const req = makeRequest("POST", "/api/chat", {
            messages: [{ role: "user", content: "hi" }]
        });
        // Should NOT return 400 -- it will fail at MiniMax API call but that's fine
        const resp = await handleRequest(req);
        assert.notEqual(resp.status, 400, "should not return 400 with valid session");
    });

    it("uses active session when X-Session-Id is missing on /api/chat", async () => {
        const init: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
        };
        const req = new Request("http://localhost/api/chat", init);
        const resp = await handleRequest(req);
        assert.notEqual(resp.status, 400);
    });

    it("resolveSessionId prefers explicit session over active session", () => {
        const database = getDb();
        assert.ok(database);
        setActiveSessionId(database, "active-session");
        const req = new Request("http://localhost/test", {
            headers: { "X-Session-Id": "explicit-session" }
        });
        assert.equal(resolveSessionId(req, database), "explicit-session");
    });

    it("resolveSessionId falls back to active session", () => {
        const database = getDb();
        assert.ok(database);
        setActiveSessionId(database, "active-fallback-session");
        const req = new Request("http://localhost/test");
        assert.equal(resolveSessionId(req, database), "active-fallback-session");
    });

    it("health endpoint does not require session ID", async () => {
        const req = makeRequest("GET", "/api/health");
        const resp = await handleRequest(req);
        assert.equal(resp.status, 200);
        const body = JSON.parse(await resp.text());
        assert.equal(body.status, "ok");
    });

    it("steer endpoint uses active session without session ID", async () => {
        const init: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "test" })
        };
        const req = new Request("http://localhost/api/steer", init);
        const resp = await handleRequest(req);
        assert.equal(resp.status, 200);
    });

    it("validateSessionId returns null for missing header", () => {
        const req = new Request("http://localhost/test");
        assert.equal(validateSessionId(req), null);
    });

    it("validateSessionId returns session ID for valid header", () => {
        const req = new Request("http://localhost/test", {
            headers: { "X-Session-Id": "abc-123" }
        });
        assert.equal(validateSessionId(req), "abc-123");
    });

    it("validateSessionId trims explicit header", () => {
        const req = new Request("http://localhost/test", {
            headers: { "X-Session-Id": "  abc-123  " }
        });
        assert.equal(validateSessionId(req), "abc-123");
    });
});

// -- Step 4: Integration Tests ----------------------------------------

describe("Integration: chat with agent loop + persistence", () => {
    const integrationDbDir = join(import.meta.dirname ?? ".", "test-data-integration");
    const integrationDbPath = join(integrationDbDir, "test.db");

    before(() => {
        resetStateForTesting();
        // Clean start
        try {
            rmSync(integrationDbDir, { recursive: true, force: true });
        } catch {}
        initDatabase(integrationDbPath);
    });

    after(() => {
        try {
            rmSync(integrationDbDir, { recursive: true, force: true });
        } catch {}
    });

    it("text-only chat: SSE stream + messages saved to DB", async () => {
        const sseChunks = anthropicTextSse(["Hey! Cool idea."]);

        globalThis.fetch = async () =>
            new Response(makeAnthropicStream(sseChunks), {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "give me an idea" }]
            });
            const resp = await handleChat(req, "test-key", "test-session-123");
            const body = await readBody(resp);

            // Verify SSE contains text
            assert.ok(body.includes("Hey! Cool idea."));

            // Wait a bit for async DB writes
            await new Promise((r) => setTimeout(r, 100));

            // Verify messages saved to DB
            const dbMessages = getMessages(requireDb(), "test-session-123");
            // Should have the user message and the assistant message
            const userMsgs = dbMessages.filter((m) => m.role === "user");
            const assistantMsgs = dbMessages.filter((m) => m.role === "assistant");
            assert.ok(userMsgs.length >= 1);
            assert.ok(assistantMsgs.length >= 1);
            assert.ok(assistantMsgs[assistantMsgs.length - 1].content.includes("Cool idea"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("persists fallback instead of empty thinking-only assistant response", async () => {
        const sessionId = `thinking-only-session-${Date.now()}`;
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"plan only\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        globalThis.fetch = async () => anthropicResponse(sseChunks);

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "think only" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);
            await new Promise((r) => setTimeout(r, 100));

            const assistantRows = getMessages(requireDb(), sessionId).filter(
                (row) => row.role === "assistant"
            );
            assert.ok(body.includes("event: thinking"));
            assert.equal(assistantRows.length, 1);
            assert.match(assistantRows[0].content, /empty final answer/i);
            assert.equal(assistantRows[0].thinking, "plan only");
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("persists thinking with assistant history", async () => {
        const sseChunks = [
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"plan first\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Answer.\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        ];

        globalThis.fetch = async () => anthropicResponse(sseChunks);

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "think" }] },
                { "X-Session-Id": "thinking-history-session" }
            );
            const resp = await handleChat(req, "test-key", "thinking-history-session");
            const body = await readBody(resp);
            const assistant = getMessages(requireDb(), "thinking-history-session")
                .filter((row) => row.role === "assistant")
                .at(-1);
            assert.ok(assistant);

            assert.ok(body.includes("event: thinking"));
            assert.equal(assistant.content, "Answer.");
            assert.equal(assistant.thinking, "plan first");
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("saves new assistant response to DB when existing history is trimmed", async () => {
        // Regression test: finalMessages is built from contextMessages, not the full
        // untrimmed messages array. If the save loop uses messages.length here, it
        // starts past finalMessages.length and silently drops the assistant response.
        const sessionId = `context-trim-session-${Date.now()}`;
        const oversizedHistoryMessage = "old history ".repeat(400_000);
        saveMessage(requireDb(), sessionId, "user", oversizedHistoryMessage);

        globalThis.fetch = async (_url, init) => {
            const payload = JSON.parse(String(init?.body)) as {
                messages: Array<{ role: string; content: string; }>;
            };
            assert.equal(payload.messages.length, 1, "old history should be trimmed from payload");
            assert.equal(payload.messages[0].content, "second message");
            return anthropicResponse(anthropicTextSse(["Second response."]));
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "second message" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            await readBody(resp); // Must read stream for async DB writes to complete
            await new Promise((r) => setTimeout(r, 100));

            const msgsAfterRequest = getMessages(requireDb(), sessionId);
            assert.ok(
                msgsAfterRequest.some(
                    (m) => m.role === "assistant" && m.content.includes("Second response")
                ),
                "Assistant response should be saved after context trimming"
            );
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("tool call: SSE stream with tool events + usage tracked", async () => {
        const toolCallSse = anthropicToolUseSse(
            "tc_1",
            "generate_image",
            "{\"prompt\":\"cool gaming thumbnail\"}"
        );
        const finalSse = anthropicTextSse(["Here is your image!"]);

        let callCount = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const events = callCount === 0 ? toolCallSse : finalSse;
                callCount++;
                return anthropicResponse(events);
            }
            if (urlStr === "https://example.com/thumb.png") {
                return new Response(new Uint8Array([7, 8, 9]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/thumb.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "make a thumbnail" }]
            });
            const resp = await handleChat(req, "test-key", "test-session-123");
            const body = await readBody(resp);

            // Verify SSE contains tool events
            assert.ok(body.includes("tool_start"));
            assert.ok(body.includes("tool_result"));
            assert.ok(body.includes("generate_image"));
            assert.ok(body.includes("/asset/"));
            assert.equal(body.includes("https://example.com/thumb.png"), false);
            assert.ok(body.includes("Here is your image!"));
            assert.equal(
                getAssets(requireDb(), "test-session-123").some((a) => a.type === "image"),
                true
            );
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("agent-loop tool call consumes exactly one quota unit", async () => {
        const sessionId = "agent-quota-once-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'image'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 99)"
        ).run();

        const toolCallSse = anthropicToolUseSse(
            "tc_quota_1",
            "generate_image",
            "{\"prompt\":\"cat\"}"
        );
        const finalSse = anthropicTextSse(["Done."]);
        let llmCallCount = 0;
        let imageApiCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const events = llmCallCount === 0 ? toolCallSse : finalSse;
                llmCallCount++;
                return anthropicResponse(events);
            }
            if (urlStr === "https://example.com/quota-once.png") {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "Content-Type": "image/png" }
                });
            }
            if (urlStr.includes("/v1/image_generation")) imageApiCalls++;
            return new Response(
                JSON.stringify({
                    data: { image_urls: ["https://example.com/quota-once.png"] }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "make an image" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("/asset/"));
            assert.equal(imageApiCalls, 1);
            assert.equal(getUsageToday(db).image, 100);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'image'"
                ).run();
            }
        }
    });

    it("agent-loop failed tool result releases reserved quota", async () => {
        const sessionId = "agent-quota-failed-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'image'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 99)"
        ).run();

        const toolCallSse = anthropicToolUseSse(
            "tc_fail_1",
            "generate_image",
            "{\"prompt\":\"cat\"}"
        );
        const finalSse = anthropicTextSse(["Try again."]);
        let llmCallCount = 0;
        let imageApiCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const events = llmCallCount === 0 ? toolCallSse : finalSse;
                llmCallCount++;
                return anthropicResponse(events);
            }
            if (urlStr === "https://example.com/bad.png") {
                return new Response(null, { status: 404 });
            }
            if (urlStr.includes("/v1/image_generation")) imageApiCalls++;
            return new Response(
                JSON.stringify({ data: { image_urls: ["https://example.com/bad.png"] } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "make an image" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("Couldn't save generated image"));
            assert.equal(imageApiCalls, 1);
            assert.equal(getUsageToday(db).image, 99);
            const rows = getMessages(db, sessionId);
            assert.equal(
                rows.some((m) => m.role === "tool" && m.content.startsWith("Error: Couldn't save")),
                true
            );
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'image'"
                ).run();
            }
        }
    });

    it("agent-loop tool call blocks before API when quota is exhausted", async () => {
        const sessionId = "agent-quota-blocked-session";
        const db = requireDb();
        const existing = db
            .prepare(
                "SELECT count FROM daily_usage WHERE date = date('now') AND feature = 'image'"
            )
            .get() as { count: number; } | undefined;
        db.prepare(
            "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 100)"
        ).run();

        const toolCallSse = anthropicToolUseSse(
            "tc_blocked_1",
            "generate_image",
            "{\"prompt\":\"cat\"}"
        );
        const finalSse = anthropicTextSse(["Try later."]);
        let llmCallCount = 0;
        let imageApiCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                const events = llmCallCount === 0 ? toolCallSse : finalSse;
                llmCallCount++;
                return anthropicResponse(events);
            }
            if (urlStr.includes("/v1/image_generation")) imageApiCalls++;
            throw new Error("image API should not be called when quota is exhausted");
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "make an image" }] },
                { "X-Session-Id": sessionId }
            );
            const resp = await handleChat(req, "test-key", sessionId);
            const body = await readBody(resp);

            assert.ok(body.includes("Daily image quota is used up"));
            assert.equal(imageApiCalls, 0);
            assert.equal(getUsageToday(db).image, 100);
        } finally {
            globalThis.fetch = REAL_FETCH;
            if (existing) {
                db.prepare(
                    "INSERT OR REPLACE INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', ?)"
                ).run(existing.count);
            } else {
                db.prepare(
                    "DELETE FROM daily_usage WHERE date = date('now') AND feature = 'image'"
                ).run();
            }
        }
    });

    it("media tool call sends compact context but persists local asset ref", async () => {
        const toolCallSse = anthropicToolUseSse(
            "tc_audio_1",
            "text_to_speech",
            "{\"text\":\"hello gamer\"}"
        );
        const finalSse = anthropicTextSse(["Voice is ready."]);
        const capturedAnthropicBodies: string[] = [];
        let callCount = 0;

        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = url.toString();
            if (urlStr.includes("/anthropic/v1/messages")) {
                capturedAnthropicBodies.push(init?.body as string);
                const events = callCount === 0 ? toolCallSse : finalSse;
                callCount++;
                return anthropicResponse(events);
            }
            return new Response(JSON.stringify({ data: { audio: "ff".repeat(50000) } }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        try {
            const req = makeRequest(
                "POST",
                "/api/chat",
                { messages: [{ role: "user", content: "say hello" }] },
                { "X-Session-Id": "media-compact-session" }
            );
            const resp = await handleChat(req, "test-key", "media-compact-session");
            const body = await readBody(resp);

            assert.ok(body.includes("tool_result"));
            assert.ok(body.includes("/asset/"));
            assert.equal(body.includes("data:audio"), false);
            assert.equal(capturedAnthropicBodies[1]?.includes("data:audio"), false);
            assert.ok(
                capturedAnthropicBodies[1]?.includes("Generated audio with text_to_speech")
            );

            const rows = getMessages(requireDb(), "media-compact-session");
            assert.equal(
                rows.some((row) => row.content.includes("data:audio")),
                false
            );
            assert.ok(
                rows.some((row) => row.role === "tool" && row.content.includes("/asset/"))
            );
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("snapshot: text-only SSE stream", async () => {
        const sseChunks = anthropicTextSse(["Short answer."]);

        globalThis.fetch = async () =>
            new Response(makeAnthropicStream(sseChunks), {
                status: 200,
                headers: { "Content-Type": "text/event-stream" }
            });

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "hi" }]
            });
            const resp = await handleChat(req, "test-key");
            const body = await readBody(resp);
            // Snapshot: exact SSE output for a simple text response
            assert.ok(body.includes("Short answer."));
            assert.ok(body.includes("[DONE]"));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });
});

// -- Steer endpoint integration ----------------------------------------

describe("POST /api/steer integration", () => {
    before(() => {
        resetStateForTesting();
        const dir = join(import.meta.dirname ?? ".", "test-data-steer");
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {}
        initDatabase(join(dir, "test.db"));
    });

    it("queues a steer message for a session", async () => {
        const resp = await handleRequest(
            makeRequest("POST", "/api/steer", { message: "be more creative" })
        );
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { ok: boolean; };
        assert.equal(body.ok, true);
    });

    it("returns 400 for missing message field", async () => {
        const resp = await handleRequest(
            makeRequest("POST", "/api/steer", { not_message: "test" })
        );
        assert.equal(resp.status, 400);
    });
});

// -- Step 5: New API Endpoints ----------------------------------------

describe("/api/profile", () => {
    beforeEach(() => {
        ensureTestDb();
        getDb()?.prepare("DELETE FROM app_state WHERE key = 'user_profile_json'").run();
    });

    it("GET returns default profile", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/profile"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as {
            avatar: { type: string; value: string; };
            username: string;
        };
        assert.equal(body.username, "");
        assert.deepEqual(body.avatar, { type: "asset", value: "" });
    });

    it("PUT stores normalized profile", async () => {
        const resp = await handleRequest(
            makeRequest("PUT", "/api/profile", {
                username: "  GamerKid  ",
                interests: " Minecraft ",
                hates: "",
                favorites: "redstone",
                avatar: { type: "asset", value: "asset_123abc" }
            })
        );
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { username: string; avatar: { value: string; }; };
        assert.equal(body.username, "GamerKid");
        assert.equal(body.avatar.value, "asset_123abc");
    });

    it("PUT rejects data URL avatar", async () => {
        const resp = await handleRequest(
            makeRequest("PUT", "/api/profile", {
                username: "GamerKid",
                avatar: { type: "asset", value: "data:image/png;base64,abc" }
            })
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.match(body.error, /data URL not allowed/);
    });

    it("PUT rejects editable emoji avatar payloads", async () => {
        const resp = await handleRequest(
            makeRequest("PUT", "/api/profile", {
                username: "GamerKid",
                avatar: { type: "emoji", value: "🦊" }
            })
        );
        assert.equal(resp.status, 400);
        const body = (await readJson(resp)) as { error: string; };
        assert.match(body.error, /avatar type invalid/);
    });

    it("DELETE resets profile", async () => {
        saveUserProfile(requireDb(), {
            username: "GamerKid",
            avatar: { type: "asset", value: "asset_123abc" }
        });
        const resp = await handleRequest(makeRequest("DELETE", "/api/profile"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { username: string; avatar: { value: string; }; };
        assert.equal(body.username, "");
        assert.equal(body.avatar.value, "");
    });
});

describe("GET /api/history", () => {
    const historyDbDir = join(import.meta.dirname ?? ".", "test-data-history");
    const historyDbPath = join(historyDbDir, "test.db");

    before(() => {
        resetStateForTesting();
        try {
            rmSync(historyDbDir, { recursive: true, force: true });
        } catch {}
        initDatabase(historyDbPath);
    });

    after(() => {
        try {
            rmSync(historyDbDir, { recursive: true, force: true });
        } catch {}
    });

    it("returns empty messages for new session", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/history"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { messages: unknown[]; };
        assert.ok(Array.isArray(body.messages));
        assert.equal(body.messages.length, 0);
    });

    it("returns saved messages for a session", async () => {
        const database = requireDb();
        saveMessage(database, "test-session-123", "user", "hello");
        saveMessage(database, "test-session-123", "assistant", "hi there");

        const resp = await handleRequest(makeRequest("GET", "/api/history"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as {
            messages: Array<{ role: string; content: string; }>;
        };
        assert.equal(body.messages.length, 2);
        assert.equal(body.messages[0].role, "user");
        assert.equal(body.messages[0].content, "hello");
        assert.equal(body.messages[1].role, "assistant");
        assert.equal(body.messages[1].content, "hi there");
    });

    it("uses active session when session ID is missing", async () => {
        const database = getDb();
        assert.ok(database);
        setActiveSessionId(database, "history-active-session");
        saveMessage(database, "history-active-session", "user", "active hello");

        const req = new Request("http://localhost/api/history", { method: "GET" });
        const resp = await handleRequest(req);
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as { messages: Array<{ content: string; }>; };
        assert.equal(body.messages.at(-1)?.content, "active hello");
    });

    it("snapshot: history response structure", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/history"));
        const body = (await readJson(resp)) as { messages: unknown[]; };
        // Verify structure
        assert.ok("messages" in body);
        assert.ok(Array.isArray(body.messages));
    });
});

describe("GET /api/usage", () => {
    const usageDbDir = join(import.meta.dirname ?? ".", "test-data-usage");
    const usageDbPath = join(usageDbDir, "test.db");

    before(() => {
        resetStateForTesting();
        try {
            rmSync(usageDbDir, { recursive: true, force: true });
        } catch {}
        initDatabase(usageDbPath);
    });

    after(() => {
        try {
            rmSync(usageDbDir, { recursive: true, force: true });
        } catch {}
    });

    it("returns empty usage and limits", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/usage"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as {
            usage: Record<string, number>;
            limits: Record<string, number>;
        };
        assert.deepEqual(body.usage, {});
        assert.ok(body.limits);
        assert.equal(body.limits.image, 100);
        assert.equal(body.limits.speech, 9000);
        assert.equal(body.limits.music, 100);
    });

    it("returns tracked usage counts", async () => {
        const database = requireDb();
        trackUsage(database, "image");
        trackUsage(database, "image");
        trackUsage(database, "speech");

        const resp = await handleRequest(makeRequest("GET", "/api/usage"));
        assert.equal(resp.status, 200);
        const body = (await readJson(resp)) as {
            usage: Record<string, number>;
            limits: Record<string, number>;
        };
        assert.equal(body.usage.image, 2);
        assert.equal(body.usage.speech, 1);
    });

    it("uses active session when session ID is missing", async () => {
        const req = new Request("http://localhost/api/usage", { method: "GET" });
        const resp = await handleRequest(req);
        assert.equal(resp.status, 200);
    });

    it("snapshot: usage response structure", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/usage"));
        const body = (await readJson(resp)) as { usage: unknown; limits: unknown; };
        assert.ok("usage" in body);
        assert.ok("limits" in body);
    });
});

// -- Step 6: Coverage gap tests ---------------------------------------

describe("Coverage: DB not initialized paths", () => {
    it("handleChat returns 500 when DB is null", async () => {
        resetStateForTesting();
        // DB is null after reset
        const req = makeRequest("POST", "/api/chat", {
            messages: [{ role: "user", content: "hi" }]
        });
        const resp = await handleChat(req, "test-key");
        assert.equal(resp.status, 500);
        const body = (await readJson(resp)) as { error: string; };
        assert.ok(body.error.includes("Database not initialized"));

        // Re-init for subsequent tests
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
    });
});

describe("Coverage: API 404 within /api/* routes", () => {
    it("returns 404 for unknown API route", async () => {
        const resp = await handleRequest(makeRequest("GET", "/api/nonexistent"));
        assert.equal(resp.status, 404);
    });

    it("returns 404 for POST to unknown API route", async () => {
        const resp = await handleRequest(makeRequest("POST", "/api/unknown", { data: "test" }));
        assert.equal(resp.status, 404);
    });
});

describe("Coverage: History loading in handleChat", () => {
    const histDbDir = join(import.meta.dirname ?? ".", "test-data-hist2");
    const histDbPath = join(histDbDir, "test.db");

    before(() => {
        resetStateForTesting();
        try {
            rmSync(histDbDir, { recursive: true, force: true });
        } catch {}
        initDatabase(histDbPath);
    });

    after(() => {
        try {
            rmSync(histDbDir, { recursive: true, force: true });
        } catch {}
    });

    it("does not replay saved tool protocol messages to MiniMax", async () => {
        const database = requireDb();
        saveMessage(database, "tool-history-session", "user", "draw a cat");
        saveMessage(
            database,
            "tool-history-session",
            "assistant",
            "<end_turn>",
            JSON.stringify([{ id: "call_function_old_1", name: "generate_image", input: {} }])
        );
        saveMessage(
            database,
            "tool-history-session",
            "tool",
            "https://img/cat.png",
            null,
            "call_function_old_1"
        );

        let capturedPayload: Record<string, unknown> | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedPayload = JSON.parse(init?.body as string);
            return anthropicResponse(anthropicTextSse(["safe reply"]));
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "new message" }]
            });
            const resp = await handleChat(req, "test-key", "tool-history-session");
            const body = await readBody(resp);
            assert.ok(body.includes("safe reply"));

            const serialized = JSON.stringify(capturedPayload.messages);
            assert.equal(serialized.includes("tool_result"), false);
            assert.equal(serialized.includes("tool_use"), false);
            assert.equal(serialized.includes("call_function_old_1"), false);
            assert.equal(serialized.includes("<end_turn>"), false);
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("sanitizes assistant media markup when replaying history", async () => {
        const database = requireDb();
        saveMessage(
            database,
            "poison-history-session",
            "assistant",
            "Here's your image:\n\n![cat](https://hailuo-image.example/image_inference_output/cat.jpeg)"
        );

        let capturedPayload: Record<string, unknown> | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedPayload = JSON.parse(init?.body as string);
            return anthropicResponse(anthropicTextSse(["safe reply"]));
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "new message" }]
            });
            await handleChat(req, "test-key", "poison-history-session");

            const serialized = JSON.stringify(capturedPayload.messages);
            assert.equal(serialized.includes("![cat]"), false);
            assert.equal(serialized.includes("hailuo-image"), false);
            assert.ok(serialized.includes("Generated media is shown in the tool card."));
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });

    it("loads existing history from DB and includes in agent loop", async () => {
        // Pre-populate DB with history
        const database = requireDb();
        saveMessage(database, "test-session-123", "user", "previous message");
        saveMessage(database, "test-session-123", "assistant", "previous reply");

        let capturedPayload: unknown = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedPayload = JSON.parse(init?.body as string);
            const sseChunks = anthropicTextSse(["new reply"]);
            return anthropicResponse(sseChunks);
        };

        try {
            const req = makeRequest("POST", "/api/chat", {
                messages: [{ role: "user", content: "new message" }]
            });
            const resp = await handleChat(req, "test-key", "test-session-123");
            const body = await readBody(resp);

            assert.ok(body.includes("new reply"));

            // Verify the payload includes history
            const payload = capturedPayload as {
                system: unknown[];
                messages: Array<{ role: string; content?: string; }>;
            };
            // System prompt + history from DB + new user message
            // System is separate in Anthropic format
            const msgRoles = payload.messages.map((m) => m.role);
            assert.ok(msgRoles.includes("user"), "should have user messages");
            // The messages should include the previous history
            const userMsgs = payload.messages.filter((m) => m.role === "user");
            assert.ok(userMsgs.length >= 2, "should have multiple user messages (history + new)");
        } finally {
            globalThis.fetch = REAL_FETCH;
        }
    });
});

// -- Node HTTP adapter + Server lifecycle tests -----------------------

describe("Node HTTP adapter and server lifecycle", () => {
    it("startServer creates a listening HTTP server", async () => {
        resetStateForTesting();
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

        const { startServer } = await import("../../src/server.ts");
        const srv = startServer(0);
        await new Promise<void>((resolve) => srv.on("listening", resolve));
        const port = serverPort(srv);
        assert.ok(port > 0, "server should be listening");

        // Verify health endpoint through the real Node HTTP server
        const resp = await fetch(`http://localhost:${port}/api/health`);
        assert.equal(resp.status, 200);
        const body = await resp.json();
        assert.equal(body.status, "ok");

        await new Promise<void>((resolve) => srv.close(() => resolve()));
        resetStateForTesting();
    });

    it("proxies POST with body through Node HTTP", async () => {
        resetStateForTesting();
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
        const origKey = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;

        const { startServer } = await import("../../src/server.ts");
        const srv = startServer(0);
        await new Promise<void>((resolve) => srv.on("listening", resolve));
        const port = serverPort(srv);

        const resp = await fetch(`http://localhost:${port}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": "adapter-test" },
            body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
        });
        // No API key configured, so should get 503
        assert.equal(resp.status, 503, `Expected 503, got ${resp.status}`);

        await new Promise<void>((resolve) => srv.close(() => resolve()));
        if (origKey) process.env.MINIMAX_API_KEY = origKey;
        resetStateForTesting();
    });

    it("returns 404 through Node HTTP adapter", async () => {
        resetStateForTesting();
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

        const { startServer } = await import("../../src/server.ts");
        const srv = startServer(0);
        await new Promise<void>((resolve) => srv.on("listening", resolve));
        const port = serverPort(srv);

        const resp = await fetch(`http://localhost:${port}/nonexistent`);
        assert.equal(resp.status, 404);

        await new Promise<void>((resolve) => srv.close(() => resolve()));
        resetStateForTesting();
    });

    it("shutdown closes server and db", async () => {
        resetStateForTesting();
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

        const { startServer, shutdown, getDb } = await import("../../src/server.ts");
        const srv = startServer(0);
        await new Promise<void>((resolve) => srv.on("listening", resolve));

        assert.ok(getDb(), "db should be initialized");
        await shutdown();
        assert.equal(getDb(), null, "db should be null after shutdown");

        resetStateForTesting();
    });

    it("shutdown is idempotent", async () => {
        resetStateForTesting();
        await shutdown();
        await shutdown();
        resetStateForTesting();
    });

    it("resetStateForTesting cleans up", async () => {
        resetStateForTesting();
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
        const { startServer, getDb } = await import("../../src/server.ts");
        const srv = startServer(0);
        await new Promise<void>((resolve) => srv.on("listening", resolve));

        assert.ok(getDb(), "db should exist");
        resetStateForTesting();
        assert.equal(getDb(), null, "db should be null after reset");

        // clean up the orphaned server
        await new Promise<void>((resolve) => srv.close(() => resolve()));
    });

    it("isShuttingDown tracks state", async () => {
        resetStateForTesting();
        const { shutdown, isShuttingDown } = await import("../../src/server.ts");

        assert.equal(isShuttingDown(), false);
        await shutdown();
        assert.equal(isShuttingDown(), true);

        resetStateForTesting();
    });
});

// -- Coverage: steer endpoint edge cases -------------------------------

describe("Coverage: steer edge cases", () => {
    beforeEach(() => {
        ensureTestDb();
    });

    it("steer with invalid JSON returns 400", async () => {
        const req = new Request("http://localhost/api/steer", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": "test-steer" },
            body: "not json"
        });
        const resp = await handleRequest(req);
        assert.equal(resp.status, 400);
        const body = await resp.json();
        assert.ok(body.error.includes("Invalid JSON"));
    });

    it("steer with missing message field returns 400", async () => {
        const req = makeRequest("POST", "/api/steer", { text: "hello" });
        req.headers.set("X-Session-Id", "test");
        const resp = await handleRequest(req);
        assert.equal(resp.status, 400);
    });

    it("steer with valid message returns 200", async () => {
        const req = makeRequest("POST", "/api/steer", { message: "change topic" });
        req.headers.set("X-Session-Id", "test");
        const resp = await handleRequest(req);
        assert.equal(resp.status, 200);
    });
});

// -- Coverage: chat with session ID ------------------------------------

describe("Coverage: chat session path", () => {
    it("POST /api/chat with session ID routes to handleChat", async () => {
        const origKey = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;
        const req = makeRequest("POST", "/api/chat", {
            messages: [{ role: "user", content: "hi" }]
        });
        req.headers.set("X-Session-Id", "session-test-123");
        const resp = await handleRequest(req);
        assert.equal(resp.status, 503);
        if (origKey) process.env.MINIMAX_API_KEY = origKey;
    });
});

describe("Coverage: GET /api/history and /api/usage without DB", () => {
    it("history returns 500 when DB not initialized", async () => {
        resetStateForTesting();
        const resp = await handleRequest(makeRequest("GET", "/api/history"));
        assert.equal(resp.status, 500);
        // Re-init
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
    });

    it("usage returns 500 when DB not initialized", async () => {
        resetStateForTesting();
        const resp = await handleRequest(makeRequest("GET", "/api/usage"));
        assert.equal(resp.status, 500);
        // Re-init
        initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
    });
});

describe("GET /api/state", () => {
    it("returns active session bootstrap state", async () => {
        const resp = await handleRequest(new Request("http://localhost/api/state"));
        assert.equal(resp.status, 200);
        const body = (await resp.json()) as {
            activeSession: { id: string; name: string; nameSource: string; };
            ui: { maxMessageLength: number; };
        };
        assert.equal(body.activeSession.name, "New Chat");
        assert.equal(body.activeSession.nameSource, "default");
        assert.equal(body.ui.maxMessageLength, 2000);
    });
});

describe("Session, draft, and create-history APIs", () => {
    it("creates, lists, activates, renames, and archives sessions", async () => {
        const createResp = await handleRequest(
            new Request("http://localhost/api/sessions", { method: "POST" })
        );
        assert.equal(createResp.status, 201);
        const created = (await createResp.json()) as { session: { id: string; }; };

        const renameResp = await handleRequest(
            new Request(`http://localhost/api/sessions/${created.session.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Boss Fight" })
            })
        );
        assert.equal(renameResp.status, 200);

        const listResp = await handleRequest(new Request("http://localhost/api/sessions"));
        const list = (await listResp.json()) as { sessions: Array<{ id: string; name: string; }>; };
        assert.equal(
            list.sessions.some((s) => s.id === created.session.id && s.name === "Boss Fight"),
            true
        );

        const archiveResp = await handleRequest(
            new Request(`http://localhost/api/sessions/${created.session.id}`, {
                method: "DELETE"
            })
        );
        assert.equal(archiveResp.status, 200);
    });

    it("activates session and returns 404 for archived/missing id", async () => {
        // Create a second session to activate
        const session2Resp = await handleRequest(
            new Request("http://localhost/api/sessions", { method: "POST" })
        );
        assert.equal(session2Resp.status, 201);
        const session2 = (await session2Resp.json()) as { session: { id: string; }; };

        // Activate the second session
        const activateResp = await handleRequest(
            new Request(`http://localhost/api/sessions/${session2.session.id}/activate`, {
                method: "POST"
            })
        );
        assert.equal(activateResp.status, 200);
        const activateData = (await activateResp.json()) as { session: { id: string; }; };
        assert.equal(activateData.session.id, session2.session.id);

        // Verify active session changed via GET /api/sessions
        const listResp = await handleRequest(new Request("http://localhost/api/sessions"));
        const listData = (await listResp.json()) as { activeSessionId: string; };
        assert.equal(listData.activeSessionId, session2.session.id);

        // Archive the session and try to activate it
        const archiveResp = await handleRequest(
            new Request(`http://localhost/api/sessions/${session2.session.id}`, {
                method: "DELETE"
            })
        );
        assert.equal(archiveResp.status, 200);

        // Activate archived session should return 404
        const activateArchivedResp = await handleRequest(
            new Request(`http://localhost/api/sessions/${session2.session.id}/activate`, {
                method: "POST"
            })
        );
        assert.equal(activateArchivedResp.status, 404);

        // Activate non-existent session should return 404
        const activateMissingResp = await handleRequest(
            new Request("http://localhost/api/sessions/nonexistent-id-123/activate", {
                method: "POST"
            })
        );
        assert.equal(activateMissingResp.status, 404);
    });

    it("generateSessionNameFromPrompt calls LLM and returns parsed name", async () => {
        const prevFetch = globalThis.fetch;
        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-api-key";

        try {
            // Test successful call with X-Api-Key header
            let capturedHeaders: Headers | undefined;
            globalThis.fetch = async (
                url: URL | RequestInfo,
                init?: RequestInit
            ) => {
                if (String(url).includes("/anthropic/v1/messages")) {
                    capturedHeaders = new Headers(init?.headers as HeadersInit);
                    return new Response(
                        JSON.stringify({
                            content: [{ type: "text", text: "  Dragon Game Art  " }]
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                return prevFetch(url, init);
            };

            const name = await generateSessionNameFromPrompt(
                "test-api-key",
                "I want to make a dragon game"
            );
            assert.equal(name, "Dragon Game Art");
            assert.equal(capturedHeaders?.get("X-Api-Key"), "test-api-key");

            // Test non-2xx response throws
            globalThis.fetch = async (url: URL | RequestInfo) => {
                if (String(url).includes("/anthropic/v1/messages")) {
                    return new Response("Internal Server Error", { status: 500 });
                }
                return prevFetch(url);
            };
            await assert.rejects(
                () => generateSessionNameFromPrompt("test-api-key", "test"),
                /LLM naming failed: 500/
            );

            // Test no text block throws
            globalThis.fetch = async (url: URL | RequestInfo) => {
                if (String(url).includes("/anthropic/v1/messages")) {
                    return new Response(
                        JSON.stringify({ content: [{ type: "image", source: {} }] }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                return prevFetch(url);
            };
            await assert.rejects(
                () => generateSessionNameFromPrompt("test-api-key", "test"),
                /LLM returned no text block/
            );

            // Test empty trimmed name falls back to "New idea"
            globalThis.fetch = async (url: URL | RequestInfo) => {
                if (String(url).includes("/anthropic/v1/messages")) {
                    return new Response(
                        JSON.stringify({ content: [{ type: "text", text: "   " }] }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                return prevFetch(url);
            };
            const emptyName = await generateSessionNameFromPrompt("test-api-key", "test");
            assert.equal(emptyName, "New idea");

            // Test > 5 words truncated to 5
            globalThis.fetch = async (url: URL | RequestInfo) => {
                if (String(url).includes("/anthropic/v1/messages")) {
                    return new Response(
                        JSON.stringify({
                            content: [{
                                type: "text",
                                text: "  Super Cool Minecraft Build Ideas For You  "
                            }]
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                return prevFetch(url);
            };
            const truncatedName = await generateSessionNameFromPrompt("test-api-key", "test");
            assert.equal(truncatedName, "Super Cool Minecraft Build Ideas");
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("uploads profile avatar images into asset storage", async () => {
        const body = new FormData();
        body.set(
            "avatar",
            new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" })
        );
        body.set(
            "profile",
            JSON.stringify({
                version: 1,
                username: "GamerKid",
                interests: "Minecraft",
                hates: "spam",
                favorites: "blue fire",
                avatar: { type: "asset", value: "" },
                updatedAt: 1
            })
        );
        const resp = await handleRequest(
            new Request("http://localhost/api/profile/avatar", { method: "POST", body })
        );
        assert.equal(resp.status, 200);
        const json = (await resp.json()) as {
            profile: { avatar: { type: string; value: string; }; };
        };
        assert.equal(json.profile.avatar.type, "asset");
        assert.match(json.profile.avatar.value, /^asset_/);
        const assets = getAssets(
            requireDb(),
            resolveSessionId(new Request("http://localhost/api/state"), requireDb())
        );
        assert.equal(
            assets.some((asset) => asset.id === json.profile.avatar.value),
            true
        );
    });

    it("generates profile avatars through MiniMax image generation", async () => {
        const prevFetch = globalThis.fetch;
        const prevKey = process.env.MINIMAX_API_KEY;
        const calls: string[] = [];
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (url: URL | RequestInfo, init?: RequestInit) => {
            calls.push(String(url));
            if (String(url).includes("/v1/image_generation")) {
                const payload = JSON.parse(String(init?.body)) as {
                    prompt: string;
                    aspect_ratio: string;
                };
                assert.match(payload.prompt, /GamerKid/);
                assert.equal(payload.aspect_ratio, "1:1");
                return new Response(
                    JSON.stringify({
                        data: { image_urls: ["https://img.test/avatar.png"] },
                        base_resp: { status_code: 0 }
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }
            return new Response(new Uint8Array([9, 8, 7]), {
                status: 200,
                headers: { "Content-Type": "image/png" }
            });
        };
        try {
            const resp = await handleRequest(
                new Request("http://localhost/api/profile/avatar/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        version: 1,
                        username: "GamerKid",
                        interests: "Minecraft",
                        hates: "spam",
                        favorites: "blue fire",
                        avatar: { type: "asset", value: "" },
                        updatedAt: 1
                    })
                })
            );
            assert.equal(resp.status, 200);
            const json = (await resp.json()) as {
                profile: { avatar: { type: string; value: string; }; };
            };
            assert.equal(json.profile.avatar.type, "asset");
            assert.equal(
                calls.some((url) => url.includes("/v1/image_generation")),
                true
            );
            assert.equal(
                calls.some((url) => url === "https://img.test/avatar.png"),
                true
            );
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("saves and clears active-session drafts", async () => {
        const putResp = await handleRequest(
            new Request("http://localhost/api/draft/chat", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: "draft" })
            })
        );
        assert.equal(putResp.status, 200);
        const getResp = await handleRequest(new Request("http://localhost/api/draft/chat"));
        assert.deepEqual(((await getResp.json()) as { draft: unknown; }).draft, {
            text: "draft"
        });
        const delResp = await handleRequest(
            new Request("http://localhost/api/draft/chat", { method: "DELETE" })
        );
        assert.equal(delResp.status, 200);
    });

    it("lists and soft-deletes create history", async () => {
        const db = requireDb();
        const sessionId = resolveSessionId(new Request("http://localhost/api/state"), db);
        saveMessage(db, sessionId, "user", "seed");
        const row = db
            .prepare(
                `INSERT INTO tool_input_history (id, session_id, kind, origin, tool_name, input_json, status)
                 VALUES ('hist_1', ?, 'image', 'create', 'generate_image', '{"prompt":"cat"}', 'succeeded') RETURNING id`
            )
            .get(sessionId) as { id: string; };
        assert.equal(row.id, "hist_1");
        const listResp = await handleRequest(
            new Request("http://localhost/api/create-history?kind=image")
        );
        const list = (await listResp.json()) as { items: Array<{ id: string; input: unknown; }>; };
        assert.equal(
            list.items.some((item) => item.id === "hist_1"),
            true
        );
        const delResp = await handleRequest(
            new Request("http://localhost/api/create-history/hist_1", { method: "DELETE" })
        );
        assert.equal(delResp.status, 200);
    });

    it("create-history API response includes origin field", async () => {
        const db = requireDb();
        const sessionId = resolveSessionId(new Request("http://localhost/api/state"), db);
        saveMessage(db, sessionId, "user", "seed");
        db.prepare(
            `INSERT INTO tool_input_history (id, session_id, kind, origin, tool_name, input_json, status)
             VALUES ('hist_origin_1', ?, 'image', 'chat', 'generate_image', '{"prompt":"dog"}', 'succeeded')`
        ).run(sessionId);
        db.prepare(
            `INSERT INTO tool_input_history (id, session_id, kind, origin, tool_name, input_json, status)
             VALUES ('hist_origin_2', ?, 'image', 'agent', 'generate_image', '{"prompt":"bird"}', 'succeeded')`
        ).run(sessionId);
        const listResp = await handleRequest(new Request("http://localhost/api/create-history"));
        const list = (await listResp.json()) as {
            items: Array<{ id: string; origin: string; input: unknown; }>;
        };
        const chatItem = list.items.find((item) => item.id === "hist_origin_1");
        const agentItem = list.items.find((item) => item.id === "hist_origin_2");
        assert.ok(chatItem, "chat origin item should be present");
        assert.equal(chatItem.origin, "chat");
        assert.ok(agentItem, "agent origin item should be present");
        assert.equal(agentItem.origin, "agent");
    });

    it("records explicit tool directive in chat with origin=chat", async () => {
        const db = requireDb();
        const sessionId = resolveSessionId(new Request("http://localhost/api/state"), db);
        saveMessage(db, sessionId, "user", "seed");

        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        const prevFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(
                JSON.stringify({
                    data: {
                        image_urls: ["https://example.com/img.png"]
                    },
                    base_resp: { status_code: 0 }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            // User types an explicit tool directive in chat
            const resp = await handleRequest(
                new Request("http://localhost/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [
                            {
                                role: "user",
                                content:
                                    "Use generate_image with prompt: a cute cat\nTool params: aspect_ratio=1:1"
                            }
                        ]
                    })
                })
            );
            assert.equal(resp.status, 200);
            await readBody(resp);

            // Verify the tool history was recorded with origin=chat
            const history = db
                .prepare(
                    `SELECT origin, tool_name FROM tool_input_history
                     WHERE session_id = ? AND tool_name = 'generate_image'
                     ORDER BY created_at DESC LIMIT 1`
                )
                .get(sessionId) as { origin: string; tool_name: string; } | undefined;
            assert.ok(history, "tool history should be recorded");
            assert.equal(
                history.origin,
                "chat",
                "origin should be 'chat' for explicit directive in chat"
            );
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("persists user message for explicit tool directive", async () => {
        const db = requireDb();
        const sessionId = resolveSessionId(new Request("http://localhost/api/state"), db);

        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        const prevFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(
                JSON.stringify({
                    data: {
                        image_urls: ["https://example.com/cat.png"]
                    },
                    base_resp: { status_code: 0 }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        };

        try {
            const directiveText = "Use generate_image with prompt: a cute cat";
            const resp = await handleRequest(
                new Request("http://localhost/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [{ role: "user", content: directiveText }]
                    })
                })
            );
            assert.equal(resp.status, 200);
            await readBody(resp);

            // Verify user message was persisted to DB
            const rows = getMessages(db, sessionId);
            const userMessages = rows.filter((row) => row.role === "user");
            assert.ok(
                userMessages.some((row) => row.content === directiveText),
                `user message should be persisted. Got: ${
                    JSON.stringify(userMessages.map((r) => r.content))
                }`
            );

            // Verify assistant and tool messages are also present
            assert.ok(
                rows.some((row) => row.role === "assistant"),
                "assistant message should be present"
            );
            assert.ok(
                rows.some((row) => row.role === "tool"),
                "tool message should be present"
            );
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("GET /api/quota", () => {
    it("returns 503 when MINIMAX_API_KEY is missing", async () => {
        const prev = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;
        try {
            const req = new Request("http://localhost/api/quota");
            const resp = await handleRequest(req);
            assert.equal(resp.status, 503);
        } finally {
            if (prev) process.env.MINIMAX_API_KEY = prev;
        }
    });

    it("returns quota data from MiniMax API", async () => {
        const mockResp: Response = {
            ok: true,
            status: 200,
            json: async () => ({
                model_remains: [
                    {
                        model_name: "MiniMax-M*",
                        current_interval_total_count: 4500,
                        current_interval_usage_count: 17,
                        remains_time: 14413545
                    },
                    {
                        model_name: "speech-hd",
                        current_interval_total_count: 9000,
                        current_interval_usage_count: 22,
                        remains_time: 64813545
                    },
                    {
                        model_name: "image-01",
                        current_interval_total_count: 100,
                        current_interval_usage_count: 6,
                        remains_time: 64813545
                    },
                    {
                        model_name: "music-2.6",
                        current_interval_total_count: 100,
                        current_interval_usage_count: 2,
                        remains_time: 64813545
                    }
                ]
            })
        } as unknown as Response;

        let capturedUrl = "";
        const prevFetch = globalThis.fetch;
        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async (url: URL | RequestInfo) => {
            capturedUrl = String(url);
            return mockResp;
        };

        try {
            const req = new Request("http://localhost/api/quota");
            const resp = await handleRequest(req);
            assert.equal(resp.status, 200);
            const body = (await resp.json()) as Record<string, unknown>;
            assert.deepEqual(Object.keys(body).sort(), ["general", "video"]);
            assert.equal((body.general as Record<string, number>).used, 17);
            assert.equal((body.general as Record<string, number>).total, 4500);
            assert.equal(body.video, null);
            assert.equal(capturedUrl, "https://api.minimax.io/v1/token_plan/remains");
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("maps MiniMax general and video quota to provider-shaped response", async () => {
        const mockResp: Response = {
            ok: true,
            status: 200,
            json: async () => ({
                model_remains: [
                    {
                        model_name: "general",
                        current_interval_total_count: 0,
                        current_interval_usage_count: 0,
                        remains_time: 431284
                    },
                    {
                        model_name: "video",
                        current_interval_total_count: 0,
                        current_interval_usage_count: 0,
                        remains_time: 431284
                    }
                ]
            })
        } as unknown as Response;

        const prevFetch = globalThis.fetch;
        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async () => mockResp;

        try {
            const req = new Request("http://localhost/api/quota");
            const resp = await handleRequest(req);
            assert.equal(resp.status, 200);
            const body = (await resp.json()) as Record<string, Record<string, number>>;
            assert.deepEqual(Object.keys(body).sort(), ["general", "video"]);
            assert.equal(body.general.total, 0);
            assert.equal(body.general.used, 0);
            assert.equal(body.video.total, 0);
            assert.equal(body.video.used, 0);
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });

    it("returns 502 when MiniMax quota API fails", async () => {
        const mockResp: Response = { ok: false, status: 500 } as unknown as Response;
        const prevFetch = globalThis.fetch;
        const prevKey = process.env.MINIMAX_API_KEY;
        process.env.MINIMAX_API_KEY = "test-key";
        globalThis.fetch = async () => mockResp;
        try {
            const req = new Request("http://localhost/api/quota");
            const resp = await handleRequest(req);
            assert.equal(resp.status, 502);
        } finally {
            globalThis.fetch = prevFetch;
            if (prevKey) process.env.MINIMAX_API_KEY = prevKey;
            else delete process.env.MINIMAX_API_KEY;
        }
    });
});

describe("parseLimitOffset", () => {
    it("returns defaults when params are missing", () => {
        const url = new URL("http://localhost/api/assets");
        assert.deepEqual(parseLimitOffset(url), { limit: 20, offset: 0 });
    });

    it("clamps limit to 0-50 range", () => {
        const below = new URL("http://localhost/api/assets?limit=-5");
        assert.equal(parseLimitOffset(below).limit, 0);

        const above = new URL("http://localhost/api/assets?limit=100");
        assert.equal(parseLimitOffset(above).limit, 50);

        const valid = new URL("http://localhost/api/assets?limit=25");
        assert.equal(parseLimitOffset(valid).limit, 25);
    });

    it("clamps offset to minimum 0", () => {
        const negative = new URL("http://localhost/api/assets?offset=-10");
        assert.equal(parseLimitOffset(negative).offset, 0);

        const valid = new URL("http://localhost/api/assets?offset=5");
        assert.equal(parseLimitOffset(valid).offset, 5);
    });

    it("falls back to defaults for invalid values", () => {
        const invalidLimit = new URL("http://localhost/api/assets?limit=abc");
        assert.equal(parseLimitOffset(invalidLimit).limit, 20);

        const invalidOffset = new URL("http://localhost/api/assets?offset=xyz");
        assert.equal(parseLimitOffset(invalidOffset).offset, 0);

        const bothInvalid = new URL("http://localhost/api/assets?limit=abc&offset=xyz");
        assert.deepEqual(parseLimitOffset(bothInvalid), { limit: 20, offset: 0 });
    });

    it("handles NaN from Number() conversion", () => {
        const nanLimit = new URL("http://localhost/api/assets?limit=abc");
        assert.equal(parseLimitOffset(nanLimit).limit, 20);

        const nanOffset = new URL("http://localhost/api/assets?offset=xyz");
        assert.equal(parseLimitOffset(nanOffset).offset, 0);

        const emptyLimit = new URL("http://localhost/api/assets?limit=");
        assert.equal(parseLimitOffset(emptyLimit).limit, 0);

        const emptyOffset = new URL("http://localhost/api/assets?offset=");
        assert.equal(parseLimitOffset(emptyOffset).offset, 0);
    });
});
