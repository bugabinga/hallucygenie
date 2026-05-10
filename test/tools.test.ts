// HallucyGenie — Tools tests

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    getToolDefinitions,
    executeTool,
    generateImage,
    textToSpeech,
    generateMusic,
    generateLyrics,
    webSearch,
    analyzeImage,
    MINIMAX_BASE,
} from "../src/tools.ts";

// ── Test helpers ─────────────────────────────────────────────────────

const API_KEY = "test-api-key";

let originalFetch: typeof globalThis.fetch;

function mockFetch(response: Response): void {
    globalThis.fetch = async () => response;
}

function mockFetchWithHandler(handler: (url: string, init?: RequestInit) => Response): void {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) =>
        handler(url.toString(), init);
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// ── Tool definitions ─────────────────────────────────────────────────

describe("getToolDefinitions", () => {
    it("returns six tool definitions", () => {
        const defs = getToolDefinitions();
        assert.equal(defs.length, 6);
    });

    it("defines generate_image with correct schema", () => {
        const defs = getToolDefinitions();
        const img = defs.find((d) => d.name === "generate_image");
        assert.ok(img);
        assert.equal(img.name, "generate_image");
        const schema = img.input_schema as {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
        };
        assert.equal(schema.type, "object");
        assert.ok(schema.properties.prompt);
        assert.ok(schema.properties.aspect_ratio);
        assert.deepEqual(schema.required, ["prompt"]);
    });

    it("defines text_to_speech with correct schema", () => {
        const defs = getToolDefinitions();
        const tts = defs.find((d) => d.name === "text_to_speech");
        assert.ok(tts);
        assert.equal(tts.name, "text_to_speech");
        const schema = tts.input_schema as {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
        };
        assert.equal(schema.type, "object");
        assert.ok(schema.properties.text);
        assert.ok(schema.properties.voice_id);
        assert.ok(schema.properties.speed);
        assert.ok(schema.properties.volume);
        assert.ok(schema.properties.pitch);
        assert.deepEqual(schema.required, ["text"]);
    });

    it("defines generate_lyrics with correct schema", () => {
        const defs = getToolDefinitions();
        const lyrics = defs.find((d) => d.name === "generate_lyrics");
        assert.ok(lyrics, "generate_lyrics tool should exist");
        assert.equal(lyrics.name, "generate_lyrics");
        const schema = lyrics.input_schema as {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
        };
        assert.equal(schema.type, "object");
        assert.ok(schema.properties.prompt);
        assert.ok(schema.properties.mode);
        assert.ok(schema.properties.lyrics);
        assert.ok(schema.properties.title);
        assert.deepEqual(schema.required, ["prompt"]);
    });

    it("defines generate_music with correct schema", () => {
        const defs = getToolDefinitions();
        const music = defs.find((d) => d.name === "generate_music");
        assert.ok(music);
        assert.equal(music.name, "generate_music");
        const schema = music.input_schema as {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
        };
        assert.equal(schema.type, "object");
        assert.ok(schema.properties.prompt);
        assert.ok(schema.properties.lyrics);
        assert.equal("instrumental" in schema.properties, false);
        assert.deepEqual(schema.required, ["prompt"]);
    });

    it("all definitions have descriptions", () => {
        const defs = getToolDefinitions();
        for (const def of defs) {
            assert.ok(def.description.length > 0);
        }
    });
});

// ── executeTool dispatcher ───────────────────────────────────────────

describe("executeTool", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("dispatches to generate_image", async () => {
        let capturedUrl = "";
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedBody = init?.body as string;
            return jsonResponse({
                data: { image_urls: ["https://example.com/img.png"] },
            });
        };

        const result = await executeTool("generate_image", { prompt: "a cat" }, API_KEY);
        assert.equal(result.type, "image");
        assert.equal(result.content, "https://example.com/img.png");
        assert.ok(capturedUrl.includes("/v1/image_generation"));
        const parsed = JSON.parse(capturedBody);
        assert.equal(parsed.prompt, "a cat");
    });

    it("dispatches to text_to_speech", async () => {
        globalThis.fetch = async () => jsonResponse({ data: { audio: "48656c6c6f" } });

        const result = await executeTool("text_to_speech", { text: "hello" }, API_KEY);
        assert.equal(result.type, "audio");
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
    });

    it("dispatches to generate_music", async () => {
        globalThis.fetch = async () => jsonResponse({ data: { audio: "4d75736963" } });

        const result = await executeTool("generate_music", { prompt: "upbeat tune" }, API_KEY);
        assert.equal(result.type, "audio");
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
    });

    it("dispatches to generate_lyrics", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ lyrics: "Verse: Hello world\nChorus: Hello again!" });

        const result = await executeTool("generate_lyrics", { prompt: "a happy song" }, API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Hello world"));
    });

    it("returns error for unknown tool", async () => {
        const result = await executeTool("unknown_tool", {}, API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Unknown tool"));
    });
});

// ── generateImage ────────────────────────────────────────────────────

describe("generateImage", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("calls correct API endpoint and returns image URL", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({
                data: { image_urls: ["https://cdn.minimax.io/img123.png"] },
            });
        };

        const result = await generateImage("a sunset over mountains", API_KEY);
        assert.equal(result.type, "image");
        assert.equal(result.content, "https://cdn.minimax.io/img123.png");
        assert.ok(capturedUrl.includes("/v1/image_generation"));
        assert.equal(capturedInit?.method, "POST");

        const body = JSON.parse(capturedInit!.body as string);
        assert.equal(body.model, "image-01");
        assert.equal(body.prompt, "a sunset over mountains");

        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
    });

    it("passes supported aspect ratio option", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init!.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/wide.png"] } });
        };

        await generateImage({ prompt: "wide cat", aspect_ratio: "16:9" }, API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.aspect_ratio, "16:9");
    });

    it("handles API error response", async () => {
        mockFetch(jsonResponse({ error: "bad request" }, 400));

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("400"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection refused");
        };

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Connection refused"));
    });

    it("handles response with no image URLs", async () => {
        mockFetch(jsonResponse({ data: { image_urls: [] } }));

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no image URLs"));
    });

    it("handles response with missing data field", async () => {
        mockFetch(jsonResponse({}));

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no image URLs"));
    });

    it("handles response with multiple URLs (returns first)", async () => {
        mockFetch(
            jsonResponse({
                data: {
                    image_urls: ["https://example.com/img1.png", "https://example.com/img2.png"],
                },
            }),
        );

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "image");
        assert.equal(result.content, "https://example.com/img1.png");
    });
});

// ── textToSpeech ─────────────────────────────────────────────────────

describe("textToSpeech", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("calls correct API endpoint and returns base64 audio", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        // Hex for "Hello" = 48656c6c6f
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        const result = await textToSpeech("Hello world", API_KEY);
        assert.equal(result.type, "audio");
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));

        // Verify base64 decodes correctly
        const base64Part = result.content.replace("data:audio/mp3;base64,", "");
        const decoded = Buffer.from(base64Part, "base64").toString("utf8");
        assert.equal(decoded, "Hello");

        assert.ok(capturedUrl.includes("/v1/t2a_v2"));
        assert.equal(capturedInit?.method, "POST");

        const body = JSON.parse(capturedInit!.body as string);
        assert.equal(body.model, "speech-2.8-hd");
        assert.equal(body.text, "Hello world");
        assert.equal(body.voice_setting.voice_id, "English_expressive_narrator");
    });

    it("uses custom voice_id when provided", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech("hello", API_KEY, "custom_voice");
        const body = JSON.parse(capturedBody);
        assert.equal(body.voice_setting.voice_id, "custom_voice");
    });

    it("passes supported voice tuning options", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech({ text: "hello", speed: 1.25, volume: 7, pitch: -2 }, API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.voice_setting.speed, 1.25);
        assert.equal(body.voice_setting.vol, 7);
        assert.equal(body.voice_setting.pitch, -2);
    });

    it("defaults to English_expressive_narrator voice", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech("hello", API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.voice_setting.voice_id, "English_expressive_narrator");
    });

    it("sends Authorization Bearer header with API key", async () => {
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech("hello", API_KEY);
        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
    });

    it("handles API error response", async () => {
        mockFetch(jsonResponse({ error: "unauthorized" }, 401));

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("401"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Network timeout");
        };

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Network timeout"));
    });

    it("handles empty audio in response", async () => {
        mockFetch(jsonResponse({ data: { audio: "" } }));

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("handles missing audio field in response", async () => {
        mockFetch(jsonResponse({ data: {} }));

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("handles malformed response (no data field)", async () => {
        mockFetch(jsonResponse({ something: "else" }));

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("returns correct MIME type in data URL", async () => {
        globalThis.fetch = async () => jsonResponse({ data: { audio: "48656c6c6f" } });

        const result = await textToSpeech("hello", API_KEY);
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
        assert.equal(result.type, "audio");
    });
});

// ── generateMusic ────────────────────────────────────────────────────

describe("generateMusic", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("calls correct API endpoint and returns base64 audio", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        // Hex for "Music" = 4d75736963
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        const result = await generateMusic("upbeat electronic", API_KEY);
        assert.equal(result.type, "audio");
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));

        const base64Part = result.content.replace("data:audio/mp3;base64,", "");
        const decoded = Buffer.from(base64Part, "base64").toString("utf8");
        assert.equal(decoded, "Music");

        assert.ok(capturedUrl.includes("/v1/music_generation"));
        assert.equal(capturedInit?.method, "POST");

        const body = JSON.parse(capturedInit!.body as string);
        assert.equal(body.model, "music-2.6");
        assert.equal(body.prompt, "upbeat electronic");
        assert.equal("lyrics" in body, false);
        assert.equal(body.is_instrumental, true);
        assert.equal("instrumental" in body, false);
    });

    it("includes lyrics when provided", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("a song", API_KEY, "la la la lyrics");
        const body = JSON.parse(capturedBody);
        assert.equal(body.lyrics, "la la la lyrics");
        assert.equal(body.is_instrumental, false);
        assert.equal("instrumental" in body, false);
    });

    it("auto-requests instrumental music when lyrics are empty", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic({ prompt: "a song", lyrics: "   " }, API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal("lyrics" in body, false);
        assert.equal(body.is_instrumental, true);
        assert.equal("instrumental" in body, false);
    });

    it("sends Authorization Bearer header with API key", async () => {
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("test", API_KEY);
        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
    });

    it("handles API error response", async () => {
        mockFetch(jsonResponse({ error: "server error" }, 500));

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("500"));
    });

    it("handles MiniMax base_resp error response", async () => {
        mockFetch(
            jsonResponse({
                data: null,
                base_resp: { status_code: 2013, status_msg: "invalid params, lyrics is required" },
            }),
        );

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("lyrics is required"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection reset");
        };

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Connection reset"));
    });

    it("handles empty audio in response", async () => {
        mockFetch(jsonResponse({ data: { audio: "" } }));

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("handles missing audio field in response", async () => {
        mockFetch(jsonResponse({ data: {} }));

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("handles malformed response (no data field)", async () => {
        mockFetch(jsonResponse({}));

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("empty audio"));
    });

    it("returns correct MIME type in data URL", async () => {
        globalThis.fetch = async () => jsonResponse({ data: { audio: "4d75736963" } });

        const result = await generateMusic("test", API_KEY);
        assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
        assert.equal(result.type, "audio");
    });
});

// ── generateLyrics ───────────────────────────────────────────────────

describe("generateLyrics", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("calls correct API endpoint and returns lyrics text", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({
                song_title: "Hello Song",
                style_tags: "Pop, Happy",
                lyrics: "Verse: Hello world\nChorus: Hello again!",
                base_resp: { status_code: 0, status_msg: "success" },
            });
        };

        const result = await generateLyrics("a happy birthday song", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Hello world"));

        assert.ok(capturedUrl.includes("/v1/lyrics_generation"));
        assert.equal(capturedInit?.method, "POST");

        const body = JSON.parse(capturedInit!.body as string);
        assert.equal(body.mode, "write_full_song");
        assert.equal(body.prompt, "a happy birthday song");
        assert.equal("model" in body, false);

        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
    });

    it("includes optional title and edit lyrics fields", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ lyrics: "Some lyrics" });
        };

        await generateLyrics(
            {
                prompt: "make this chorus stronger",
                mode: "edit",
                lyrics: "[Chorus]\nWe win today",
                title: "Victory Song",
            },
            API_KEY,
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.mode, "edit");
        assert.equal(body.lyrics, "[Chorus]\nWe win today");
        assert.equal(body.title, "Victory Song");
    });

    it("omits optional edit fields when not provided", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ lyrics: "Some lyrics" });
        };

        await generateLyrics("a fun song", API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.mode, "write_full_song");
        assert.equal("lyrics" in body, false);
        assert.equal("title" in body, false);
    });

    it("accepts string input shorthand", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ lyrics: "Lyrics here" });
        };

        await generateLyrics("a song about friendship", API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.prompt, "a song about friendship");
    });

    it("sends Authorization Bearer header with API key", async () => {
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({ lyrics: "Test lyrics" });
        };

        await generateLyrics("test", API_KEY);
        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
    });

    it("handles API error response", async () => {
        mockFetch(jsonResponse({ error: "server error" }, 500));

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("500"));
    });

    it("handles MiniMax base_resp error response", async () => {
        mockFetch(
            jsonResponse({
                data: null,
                base_resp: { status_code: 2001, status_msg: "invalid prompt" },
            }),
        );

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("invalid prompt"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection reset");
        };

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Connection reset"));
    });

    it("handles empty lyrics in response", async () => {
        mockFetch(jsonResponse({ lyrics: "" }));

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no lyrics text"));
    });

    it("handles missing lyrics field in response", async () => {
        mockFetch(jsonResponse({ song_title: "No Lyrics" }));

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no lyrics text"));
    });

    it("handles malformed response (no data field)", async () => {
        mockFetch(jsonResponse({}));

        const result = await generateLyrics("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no lyrics text"));
    });

    it("returns lyrics text on success", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                lyrics: "Verse: Jump up and down\nChorus: We are champions!",
            });

        const result = await generateLyrics("a fun gaming anthem", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Jump up and down"));
        assert.ok(result.content.includes("We are champions"));
    });

    it("snapshot: generate_lyrics result format", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                lyrics: "Verse: Happy birthday to you!\nChorus: Happy birthday!",
            });

        const result = await generateLyrics("a birthday song", API_KEY);
        assert.deepEqual(result, {
            type: "text",
            content: "Verse: Happy birthday to you!\nChorus: Happy birthday!",
        });
    });
});

// ── Snapshot tests ───────────────────────────────────────────────────

describe("Tool result snapshots", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("snapshot: generate_image result", async () => {
        mockFetch(
            jsonResponse({
                data: { image_urls: ["https://cdn.example.com/generated-image.png"] },
            }),
        );

        const result = await generateImage("a colorful parrot", API_KEY);
        assert.deepEqual(result, {
            type: "image",
            content: "https://cdn.example.com/generated-image.png",
        });
    });

    it("snapshot: text_to_speech result", async () => {
        // Use known hex: "Hello" = 48656c6c6f
        globalThis.fetch = async () => jsonResponse({ data: { audio: "48656c6c6f" } });

        const result = await textToSpeech("Hello", API_KEY);
        assert.equal(result.type, "audio");
        // Verify exact base64 encoding
        const expectedBase64 = Buffer.from("48656c6c6f", "hex").toString("base64");
        assert.equal(result.content, `data:audio/mp3;base64,${expectedBase64}`);
    });

    it("snapshot: generate_music result", async () => {
        // Use known hex: "Music" = 4d75736963
        globalThis.fetch = async () => jsonResponse({ data: { audio: "4d75736963" } });

        const result = await generateMusic("chill beats", API_KEY, "la la la");
        assert.equal(result.type, "audio");
        const expectedBase64 = Buffer.from("4d75736963", "hex").toString("base64");
        assert.equal(result.content, `data:audio/mp3;base64,${expectedBase64}`);
    });

    it("snapshot: error result format", async () => {
        globalThis.fetch = async () => {
            throw new Error("Network error");
        };

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Image generation failed:"));
        assert.ok(result.content.includes("Network error"));
    });
});

// ── Audio hex→base64 conversion edge cases ───────────────────────────

describe("Audio hex-to-base64 conversion", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("handles ID3 header hex (realistic MP3 start)", async () => {
        // ID3 header bytes: 49 44 33 = "ID3"
        const hexWithID3 = "49443303000000000000";
        globalThis.fetch = async () => jsonResponse({ data: { audio: hexWithID3 } });

        const result = await textToSpeech("test", API_KEY);
        assert.equal(result.type, "audio");
        const base64Part = result.content.replace("data:audio/mp3;base64,", "");
        const decoded = Buffer.from(base64Part, "base64").toString("hex");
        assert.equal(decoded, hexWithID3.toLowerCase());
    });

    it("handles long hex strings", async () => {
        // Simulate a larger audio payload
        const longHex = "fffb90440003000".repeat(100);
        globalThis.fetch = async () => jsonResponse({ data: { audio: longHex } });

        const result = await generateMusic("test", API_KEY);
        assert.equal(result.type, "audio");
        const base64Part = result.content.replace("data:audio/mp3;base64,", "");
        const decoded = Buffer.from(base64Part, "base64").toString("hex");
        assert.equal(decoded, longHex.toLowerCase());
    });
});

// ── web_search via executeTool ─────────────────────────────────────

describe("executeTool web_search", () => {
    const API_KEY = "test-key";

    it("returns formatted text with search results", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                organic: [
                    {
                        title: "Gaming News",
                        link: "https://example.com/1",
                        snippet: "Latest games",
                    },
                    { title: "Reviews", link: "https://example.com/2", snippet: "Top rated" },
                ],
            });

        const result = await executeTool("web_search", { query: "gaming news" }, API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Gaming News"));
        assert.ok(result.content.includes("https://example.com/1"));
    });

    it("returns error on HTTP failure", async () => {
        globalThis.fetch = async () => new Response(null, { status: 500 });
        const result = await executeTool("web_search", { query: "test" }, API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("500"));
    });

    it("returns text on empty results", async () => {
        globalThis.fetch = async () => jsonResponse({ organic: [] });
        const result = await executeTool("web_search", { query: "xyz" }, API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("No search results"));
    });
});

// ── analyze_image via executeTool ───────────────────────────────────

describe("executeTool analyze_image", () => {
    const API_KEY = "test-key";

    it("returns text description on success", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ content: "A colorful gaming logo with neon lights" });
        const result = await executeTool(
            "analyze_image",
            { image_url: "https://example.com/img.png" },
            API_KEY,
        );
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("gaming logo"));
    });

    it("returns error on HTTP failure", async () => {
        globalThis.fetch = async () => new Response(null, { status: 400 });
        const result = await executeTool(
            "analyze_image",
            { image_url: "https://example.com/img.png" },
            API_KEY,
        );
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("400"));
    });

    it("returns error on API error response", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ base_resp: { status_code: 1001, status_msg: "invalid image" } });
        const result = await executeTool(
            "analyze_image",
            { image_url: "https://example.com/bad.png" },
            API_KEY,
        );
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("invalid image"));
    });
});

// ── MINIMAX_BASE constant ───────────────────────────────────────────

describe("MINIMAX_BASE", () => {
    it("exports correct base URL", () => {
        assert.equal(MINIMAX_BASE, "https://api.minimax.io");
    });

    it("is a non-empty string", () => {
        assert.equal(typeof MINIMAX_BASE, "string");
        assert.ok(MINIMAX_BASE.length > 0);
    });
});

// ── generateMusic HTTP structure ────────────────────────────────────

describe("generateMusic HTTP request structure", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("POSTs to correct endpoint with music-2.6 model", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("epic gaming theme", API_KEY);

        assert.ok(
            capturedUrl.includes("/v1/music_generation"),
            "should call music generation endpoint",
        );
        assert.equal(capturedInit?.method, "POST", "should use POST method");

        const body = JSON.parse(capturedInit!.body as string);
        assert.equal(body.model, "music-2.6", "should specify music-2.6 model");
        assert.equal(body.prompt, "epic gaming theme", "should include prompt in body");
    });

    it("sends Authorization Bearer header", async () => {
        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedHeaders = init?.headers as Record<string, string>;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("test", API_KEY);

        assert.ok(
            capturedHeaders["Authorization"]?.startsWith("Bearer "),
            "should have Authorization Bearer header",
        );
        assert.ok(
            capturedHeaders["Authorization"]?.includes(API_KEY),
            "Authorization header should contain API key",
        );
        assert.equal(
            capturedHeaders["Content-Type"],
            "application/json",
            "should have Content-Type header",
        );
    });

    it("sends is_instrumental=true and omits lyrics when lyrics are not provided", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("song", API_KEY);

        const body = JSON.parse(capturedBody);
        assert.equal("lyrics" in body, false, "should omit lyrics for instrumental music");
        assert.equal(body.is_instrumental, true, "should auto-enable instrumental mode");
        assert.equal("instrumental" in body, false, "should not send stale field name");
    });

    it("includes lyrics field when provided", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic("song", API_KEY, "verse one, chorus one");

        const body = JSON.parse(capturedBody);
        assert.equal(body.lyrics, "verse one, chorus one", "should include lyrics when provided");
        assert.equal(
            body.is_instrumental,
            false,
            "should disable instrumental mode when lyrics exist",
        );
        assert.equal("instrumental" in body, false, "should not send stale field name");
    });
});

// ── webSearch HTTP structure ─────────────────────────────────────────

describe("webSearch HTTP request structure", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("POSTs to correct endpoint", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({ organic: [] });
        };

        await webSearch("minecraft tips", API_KEY);

        assert.ok(capturedUrl.includes("/v1/coding_plan/search"), "should call search endpoint");
        assert.equal(capturedInit?.method, "POST", "should use POST method");
    });

    it("sends Authorization Bearer header", async () => {
        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedHeaders = init?.headers as Record<string, string>;
            return jsonResponse({ organic: [] });
        };

        await webSearch("test", API_KEY);

        assert.ok(
            capturedHeaders["Authorization"]?.includes(API_KEY),
            "Authorization header should contain API key",
        );
    });

    it("sends query in request body", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ organic: [] });
        };

        await webSearch("fortnite season 6 news", API_KEY);

        const body = JSON.parse(capturedBody);
        assert.equal(body.q, "fortnite season 6 news", "should send query as 'q' field in body");
    });

    it("formats results with numbered items and newlines", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                organic: [
                    { title: "Game Tip 1", link: "https://ex.com/1", snippet: "Do this" },
                    { title: "Game Tip 2", link: "https://ex.com/2", snippet: "Also this" },
                ],
            });

        const result = await webSearch("tips", API_KEY);

        assert.ok(result.content.includes("1."), "should number results starting at 1");
        assert.ok(result.content.includes("2."), "should include second result");
        assert.ok(result.content.includes("https://ex.com/1"), "should include link");
        assert.ok(result.content.includes("Do this"), "should include snippet");
        assert.ok(result.content.includes("\n\n"), "should join with double newline");
    });

    it("limits results to 5", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                organic: Array.from({ length: 10 }, (_, i) => ({
                    title: `Result ${i}`,
                    link: `https://ex.com/${i}`,
                    snippet: `Snippet ${i}`,
                })),
            });

        const result = await webSearch("many results", API_KEY);
        assert.ok(!result.content.includes("Result 6"), "should limit to 5 results");
    });

    it("handles missing organic field gracefully", async () => {
        globalThis.fetch = async () => jsonResponse({});

        const result = await webSearch("test", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("No search results"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("DNS lookup failed");
        };

        const result = await webSearch("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("DNS lookup failed"));
    });
});

// ── analyzeImage HTTP structure ─────────────────────────────────────

describe("analyzeImage HTTP request structure", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("POSTs to correct endpoint", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({ content: "A cat" });
        };

        await analyzeImage("https://example.com/photo.png", API_KEY);

        assert.ok(capturedUrl.includes("/v1/coding_plan/vlm"), "should call VLM endpoint");
        assert.equal(capturedInit?.method, "POST", "should use POST method");
    });

    it("sends Authorization Bearer header", async () => {
        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedHeaders = init?.headers as Record<string, string>;
            return jsonResponse({ content: "A cat" });
        };

        await analyzeImage("https://example.com/img.jpg", API_KEY);

        assert.ok(
            capturedHeaders["Authorization"]?.includes(API_KEY),
            "Authorization header should contain API key",
        );
    });

    it("sends prompt and image_url in request body", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ content: "A gaming logo" });
        };

        await analyzeImage("https://cdn.example.com/logo.png", API_KEY);

        const body = JSON.parse(capturedBody);
        assert.ok(body.prompt, "should have prompt field");
        assert.equal(
            body.image_url,
            "https://cdn.example.com/logo.png",
            "should include image URL",
        );
    });

    it("returns description on success", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ content: "A colorful gaming logo with neon lights" });

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("gaming logo"));
    });

    it("returns error on HTTP failure", async () => {
        globalThis.fetch = async () => new Response(null, { status: 502 });

        const result = await analyzeImage("https://example.com/bad.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("502"));
    });

    it("returns error on base_resp status_code != 0", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ base_resp: { status_code: 1004, status_msg: "login fail" } });

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("login fail"));
    });

    it("handles network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection refused");
        };

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("Connection refused"));
    });

    it("handles empty content field gracefully", async () => {
        globalThis.fetch = async () => jsonResponse({ content: "" });

        const result = await analyzeImage("https://example.com/empty.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "No description returned.");
    });

    it("handles missing content field gracefully", async () => {
        globalThis.fetch = async () => jsonResponse({});

        const result = await analyzeImage("https://example.com/no-content.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "No description returned.");
    });
});

// ── Schema content validation ───────────────────────────────────────

describe("getToolDefinitions schema content", () => {
    it("generate_image schema has required prompt field", async () => {
        const tool = getToolDefinitions().find((t) => t.name === "generate_image");
        assert.ok(tool, "generate_image tool should exist");
        assert.ok(tool.input_schema.properties?.prompt, "should have prompt property");
        assert.deepEqual(tool.input_schema.required, ["prompt"]);
    });

    it("web_search schema has required query field", async () => {
        const tool = getToolDefinitions().find((t) => t.name === "web_search");
        assert.ok(tool, "web_search tool should exist");
        assert.ok(tool.input_schema.properties?.query, "should have query property");
        assert.equal(tool.input_schema.required?.[0], "query");
    });

    it("analyze_image schema has required image_url field", async () => {
        const tool = getToolDefinitions().find((t) => t.name === "analyze_image");
        assert.ok(tool, "analyze_image tool should exist");
        assert.ok(tool.input_schema.properties?.image_url, "should have image_url property");
        assert.equal(tool.input_schema.required?.[0], "image_url");
    });

    it("web_search returns error on network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Network timeout");
        };
        const result = (await executeTool(
            "web_search",
            { query: "test" },
            "fake-key",
        )) as ToolResult;
        assert.equal(result.type, "error");
        assert.ok((result.content as string).includes("Network timeout"));
    });

    it("analyze_image returns error on network failure", async () => {
        globalThis.fetch = async () => {
            throw new Error("Connection reset");
        };
        const result = (await executeTool(
            "analyze_image",
            { image_url: "https://example.com/img.jpg" },
            "fake-key",
        )) as ToolResult;
        assert.equal(result.type, "error");
        assert.ok((result.content as string).includes("Connection reset"));
    });
});
