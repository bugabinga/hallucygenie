// HallucyGenie — Tools tests

import { describe, it, beforeEach, afterEach, after } from "node:test";
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
    generateMusicCover,
    musicCoverPreprocess,
    MINIMAX_BASE,
} from "../../src/tools.ts";

// ── Test helpers ─────────────────────────────────────────────────────

const API_KEY = "test-api-key";

// Capture the real (native) fetch. Use getOwnPropertyDescriptor so we
// reliably get the native fetch even if this file is loaded in a worker
// where another parallel file already reassigned globalThis.fetch.
// Bun --parallel runs files in parallel in separate workers; each worker
// has its own globalThis, but the own-property descriptor still gives us
// the value currently assigned in this global scope.
const REAL_FETCH = Object.getOwnPropertyDescriptor(globalThis, "fetch")?.value ?? globalThis.fetch;
let originalFetch: typeof globalThis.fetch;

after(() => {
    globalThis.fetch = REAL_FETCH;
});

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

function imageResponse(type = "image/png", bytes = new Uint8Array([1, 2, 3])): Response {
    return new Response(bytes, {
        headers: { "Content-Type": type, "Content-Length": String(bytes.byteLength) },
    });
}

function schemaFor(toolName: string): { properties: Record<string, unknown>; required: string[] } {
    const tool = getToolDefinitions().find((def) => def.name === toolName);
    assert.ok(tool, `missing tool schema: ${toolName}`);
    return tool.input_schema as { properties: Record<string, unknown>; required: string[] };
}

// ── Tool definitions ─────────────────────────────────────────────────

describe("getToolDefinitions", () => {
    it("returns six live tool definitions", () => {
        const defs = getToolDefinitions();
        assert.equal(defs.length, 6);
        assert.equal(
            defs.some((tool) => tool.name === "analyze_image"),
            true,
        );
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
        assert.ok(schema.properties.n);
        assert.ok(schema.properties.seed);
        assert.ok(schema.properties.width);
        assert.ok(schema.properties.height);
        assert.ok(schema.properties.prompt_optimizer);
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
        assert.equal(schema.properties.volume.exclusiveMinimum, 0);
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

    it("defines analyze_image with correct schema", () => {
        const defs = getToolDefinitions();
        const analyze = defs.find((d) => d.name === "analyze_image");
        assert.ok(analyze, "analyze_image tool should exist");
        const schema = analyze.input_schema as {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
        };
        assert.equal(schema.type, "object");
        assert.ok(schema.properties.image_url);
        assert.ok(schema.properties.prompt);
        assert.deepEqual(schema.required, ["image_url"]);
    });

    it("all definitions have descriptions", () => {
        const defs = getToolDefinitions();
        for (const def of defs) {
            assert.ok(def.description.length > 0);
        }
    });
});

// ── MiniMax parameter contract ───────────────────────────────────────

describe("MiniMax parameter contract", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const contract: Record<
        string,
        { supported: string[]; forbidden: string[]; required: string[] }
    > = {
        generate_image: {
            supported: [
                "prompt",
                "aspect_ratio",
                "n",
                "seed",
                "width",
                "height",
                "prompt_optimizer",
            ],
            forbidden: ["response_format", "subject_reference", "image_url"],
            required: ["prompt"],
        },
        text_to_speech: {
            supported: ["text", "voice_id", "speed", "volume", "pitch"],
            forbidden: [
                "emotion",
                "text_normalization",
                "latex_read",
                "audio_setting",
                "pronunciation_dict",
                "timbre_weights",
                "language_boost",
                "voice_modify",
                "subtitle_enable",
                "subtitle_type",
                "stream",
                "stream_options",
                "output_format",
            ],
            required: ["text"],
        },
        generate_lyrics: {
            supported: ["prompt", "mode", "lyrics", "title"],
            forbidden: [],
            required: ["prompt"],
        },
        generate_music: {
            supported: ["prompt", "lyrics"],
            forbidden: [
                "is_instrumental",
                "instrumental",
                "lyrics_optimizer",
                "audio_setting",
                "stream",
                "output_format",
                "audio_url",
                "audio_base64",
                "cover_feature_id",
            ],
            required: ["prompt"],
        },
        analyze_image: {
            supported: ["image_url", "prompt"],
            forbidden: ["image_base64", "data_url"],
            required: ["image_url"],
        },
        web_search: {
            supported: ["query"],
            forbidden: [],
            required: ["query"],
        },
    };

    for (const [toolName, { supported, forbidden, required }] of Object.entries(contract)) {
        it(`${toolName} schema matches covered MiniMax parameter subset`, () => {
            const schema = schemaFor(toolName);
            assert.deepEqual(Object.keys(schema.properties).sort(), [...supported].sort());
            assert.deepEqual(schema.required, required);
            for (const param of forbidden) {
                assert.equal(param in schema.properties, false, `${toolName} exposes ${param}`);
            }
        });
    }

    it("keeps image raw response and image-to-image params out of request payloads", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/custom.png"] } });
        };

        await generateImage(
            {
                prompt: "cat",
                width: 1024,
                response_format: "base64",
                subject_reference: "https://example.com/cat.png",
            } as unknown as Parameters<typeof generateImage>[0],
            API_KEY,
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.response_format, "url");
        for (const key of [
            "subject_reference",
            "image_url",
            "height",
            "width",
        ]) {
            assert.equal(key in body, false, `${key} should stay omitted`);
        }
    });

    it("keeps unsupported TTS extras and raw streaming params out of request payloads", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech(
            {
                text: "hello",
                emotion: "happy",
                language_boost: "English",
                subtitle_enable: true,
                audio_setting: { sample_rate: 32000 },
                output_format: "wav",
                stream: true,
            } as unknown as Parameters<typeof textToSpeech>[0],
            API_KEY,
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.output_format, "hex");
        assert.deepEqual(body.audio_setting, { format: "mp3" });
        for (const key of [
            "emotion",
            "language_boost",
            "subtitle_enable",
            "stream",
            "stream_options",
        ]) {
            assert.equal(key in body, false, `${key} should stay omitted`);
            assert.equal(key in body.voice_setting, false, `${key} should not be voice_setting`);
        }
        assert.equal("audio_setting" in body.voice_setting, false);
        assert.equal("output_format" in body.voice_setting, false);
    });

    it("keeps music cover/raw params out and derives instrumental state", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        await generateMusic(
            {
                prompt: "boss fight",
                lyrics: "   ",
                is_instrumental: false,
                instrumental: false,
                lyrics_optimizer: true,
                audio_setting: { sample_rate: 44100 },
                output_format: "wav",
                audio_url: "https://example.com/ref.mp3",
                audio_base64: "AAAA",
                cover_feature_id: "cover-1",
                stream: true,
            } as unknown as Parameters<typeof generateMusic>[0],
            API_KEY,
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.is_instrumental, true);
        assert.equal("lyrics" in body, false);
        assert.equal(body.output_format, "hex");
        assert.deepEqual(body.audio_setting, { format: "mp3" });
        for (const key of [
            "instrumental",
            "lyrics_optimizer",
            "audio_url",
            "audio_base64",
            "cover_feature_id",
            "stream",
        ]) {
            assert.equal(key in body, false, `${key} should stay omitted`);
        }
    });

    it("rejects over-limit MiniMax text before fetch", async () => {
        let called = false;
        globalThis.fetch = async () => {
            called = true;
            return jsonResponse({ data: { audio: "00" } });
        };

        const image = await generateImage({ prompt: "x".repeat(1501) }, API_KEY);
        const speech = await textToSpeech({ text: "x".repeat(10001) }, API_KEY);
        const lyrics = await generateLyrics({ prompt: "x".repeat(2001) }, API_KEY);
        const music = await generateMusic({ prompt: "x".repeat(2001) }, API_KEY);

        assert.equal(called, false);
        assert.equal(image.type, "error");
        assert.equal(speech.type, "error");
        assert.equal(lyrics.type, "error");
        assert.equal(music.type, "error");
    });

    it("rejects invalid music cover text before fetch", async () => {
        let called = false;
        globalThis.fetch = async () => {
            called = true;
            return jsonResponse({ data: { audio: "00" } });
        };

        const shortPrompt = await generateMusicCover(
            { prompt: "short", lyrics: "valid lyric", cover_feature_id: "cover-1" },
            API_KEY,
        );
        const longPrompt = await generateMusicCover(
            { prompt: "x".repeat(301), lyrics: "valid lyric", cover_feature_id: "cover-1" },
            API_KEY,
        );
        const shortLyrics = await generateMusicCover(
            { prompt: "valid style", lyrics: "short", cover_feature_id: "cover-1" },
            API_KEY,
        );
        const longLyrics = await generateMusicCover(
            { prompt: "valid style", lyrics: "x".repeat(1001), cover_feature_id: "cover-1" },
            API_KEY,
        );

        assert.equal(called, false);
        assert.equal(shortPrompt.type, "error");
        assert.equal(longPrompt.type, "error");
        assert.equal(shortLyrics.type, "error");
        assert.equal(longLyrics.type, "error");
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

    it("dispatches to generate_music_cover", async () => {
        globalThis.fetch = async () => jsonResponse({ data: { audio: "4d75736963" } });

        const result = await executeTool(
            "generate_music_cover",
            { prompt: "boss fight", lyrics: "valid lyric", cover_feature_id: "cover-1" },
            API_KEY,
        );
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

    it("dispatches to analyze_image", async () => {
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            capturedBody = init?.body as string;
            return jsonResponse({ content: "A mountain" });
        };

        const result = await executeTool(
            "analyze_image",
            { image_url: "https://example.com/mountain.png", prompt: "one thing" },
            API_KEY,
        );
        assert.equal(result.type, "text");
        assert.equal(result.content, "A mountain");
        assert.equal(JSON.parse(capturedBody).prompt, "one thing");
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

    it("passes and clamps optional image generation params", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init!.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/custom.png"] } });
        };

        await generateImage(
            {
                prompt: "custom cat",
                aspect_ratio: "21:9",
                n: 12,
                seed: 123,
                width: 517,
                height: 2055,
                prompt_optimizer: false,
            },
            API_KEY,
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.aspect_ratio, "21:9");
        assert.equal(body.n, 9);
        assert.equal(body.seed, 123);
        assert.equal(body.width, 512);
        assert.equal(body.height, 2048);
        assert.equal(body.prompt_optimizer, false);
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

    it("handles MiniMax base_resp error response", async () => {
        mockFetch(jsonResponse({ base_resp: { status_code: 1004, status_msg: "login fail" } }));

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("login fail"));
    });

    it("handles response with missing data field", async () => {
        mockFetch(jsonResponse({}));

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("no image URLs"));
    });

    it("handles response with multiple URLs", async () => {
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
        assert.deepEqual(result.urls, [
            "https://example.com/img1.png",
            "https://example.com/img2.png",
        ]);
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

    it("omits unsupported zero volume", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { audio: "48656c6c6f" } });
        };

        await textToSpeech({ text: "hello", volume: 0 }, API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal("vol" in body.voice_setting, false);
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

    it("handles MiniMax base_resp error response", async () => {
        mockFetch(jsonResponse({ base_resp: { status_code: 2013, status_msg: "text too long" } }));

        const result = await textToSpeech("hello", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("text too long"));
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

// ── music cover ─────────────────────────────────────────────────────

describe("music cover", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("preprocesses direct audio URL with music-cover model", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({
                data: { cover_feature_id: "cover-1", formatted_lyrics: "[Verse]\nhi" },
            });
        };

        const result = await musicCoverPreprocess(
            { audio_url: "https://example.com/a.mp3" },
            API_KEY,
        );

        assert.equal(result.cover_feature_id, "cover-1");
        assert.equal(result.lyrics, "[Verse]\nhi");
        const body = JSON.parse(capturedBody);
        assert.equal(body.model, "music-cover");
        assert.equal(body.audio_url, "https://example.com/a.mp3");
    });

    it("generates cover from cover_feature_id", async () => {
        let capturedUrl = "";
        let capturedBody = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedBody = init?.body as string;
            capturedInit = init;
            return jsonResponse({ data: { audio: "4d75736963" } });
        };

        const result = await generateMusicCover(
            { prompt: "spooky boss battle", lyrics: "[Verse]\nhi", cover_feature_id: "cover-1" },
            API_KEY,
        );

        const expectedBase64 = Buffer.from("4d75736963", "hex").toString("base64");
        assert.deepEqual(result, {
            type: "audio",
            content: `data:audio/mp3;base64,${expectedBase64}`,
        });
        assert.ok(capturedUrl.endsWith("/v1/music_generation"));
        assert.equal(capturedInit!.method, "POST");
        const body = JSON.parse(capturedBody);
        assert.deepEqual(body, {
            model: "music-cover",
            cover_feature_id: "cover-1",
            prompt: "spooky boss battle",
            lyrics: "[Verse]\nhi",
            output_format: "hex",
            audio_setting: { format: "mp3" },
        });
        assert.equal(body.output_format, "hex");
        assert.deepEqual(body.audio_setting, { format: "mp3" });
        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
        assert.equal(headers["Content-Type"], "application/json");
    });

    it("reports music cover API failures", async () => {
        globalThis.fetch = async () => new Response("broken", { status: 503 });

        const result = await generateMusicCover(
            { prompt: "spooky boss", lyrics: "[Verse]\nhi", cover_feature_id: "cover-1" },
            API_KEY,
        );

        assert.deepEqual(result, { type: "error", content: "Music cover API error: 503" });
    });

    it("reports music cover base_resp failures", async () => {
        mockFetch(jsonResponse({ base_resp: { status_code: 2013, status_msg: "bad cover" } }));

        const result = await generateMusicCover(
            { prompt: "spooky boss", lyrics: "[Verse]\nhi", cover_feature_id: "cover-1" },
            API_KEY,
        );

        assert.deepEqual(result, { type: "error", content: "Music cover failed: bad cover" });
    });

    it("reports music cover responses with no audio", async () => {
        mockFetch(jsonResponse({ data: {} }));

        const result = await generateMusicCover(
            { prompt: "spooky boss", lyrics: "[Verse]\nhi", cover_feature_id: "cover-1" },
            API_KEY,
        );

        assert.deepEqual(result, { type: "error", content: "Music cover returned no audio" });
    });

    it("reports music cover network failures", async () => {
        globalThis.fetch = async () => {
            throw new Error("offline");
        };

        const result = await generateMusicCover(
            { prompt: "spooky boss", lyrics: "[Verse]\nhi", cover_feature_id: "cover-1" },
            API_KEY,
        );

        assert.deepEqual(result, { type: "error", content: "Music cover failed: Error: offline" });
    });

    it("preprocesses audio_base64 and preserves formatted lyrics priority", async () => {
        let capturedUrl = "";
        let capturedBody = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            capturedUrl = url.toString();
            capturedBody = init?.body as string;
            capturedInit = init;
            return jsonResponse({
                data: { cover_feature_id: "cover-2", lyrics: "raw", formatted_lyrics: "formatted" },
            });
        };

        const result = await musicCoverPreprocess({ audio_base64: "QUJD" }, API_KEY);

        assert.deepEqual(result, { cover_feature_id: "cover-2", lyrics: "formatted" });
        assert.ok(capturedUrl.endsWith("/v1/music_cover_preprocess"));
        assert.equal(capturedInit!.method, "POST");
        assert.deepEqual(JSON.parse(capturedBody), { model: "music-cover", audio_base64: "QUJD" });
        const headers = capturedInit!.headers as Record<string, string>;
        assert.equal(headers["Authorization"], `Bearer ${API_KEY}`);
        assert.equal(headers["Content-Type"], "application/json");
    });

    it("preprocess returns raw lyrics fallback and empty default", async () => {
        globalThis.fetch = async () =>
            jsonResponse({ data: { cover_feature_id: "cover-3", lyrics: "raw" } });
        assert.deepEqual(
            await musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            {
                cover_feature_id: "cover-3",
                lyrics: "raw",
            },
        );

        globalThis.fetch = async () => jsonResponse({ data: { cover_feature_id: "cover-4" } });
        assert.deepEqual(
            await musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            {
                cover_feature_id: "cover-4",
                lyrics: "",
            },
        );
    });

    it("rejects preprocess without source", async () => {
        await assert.rejects(() => musicCoverPreprocess({}, API_KEY), /cover source required/);
    });

    it("rejects preprocess with both audio sources before fetch", async () => {
        let called = false;
        globalThis.fetch = async () => {
            called = true;
            return jsonResponse({ data: { cover_feature_id: "cover-1" } });
        };

        await assert.rejects(
            () =>
                musicCoverPreprocess(
                    { audio_url: "https://example.com/a.mp3", audio_base64: "QUJD" },
                    API_KEY,
                ),
            /audio_url and audio_base64 are mutually exclusive/,
        );
        assert.equal(called, false);
    });

    it("reports preprocess HTTP, base_resp, and missing-id failures", async () => {
        globalThis.fetch = async () => new Response("broken", { status: 502 });
        await assert.rejects(
            () => musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            /music cover preprocess API error: 502/,
        );

        mockFetch(jsonResponse({ base_resp: { status_code: 2013, status_msg: "bad source" } }));
        await assert.rejects(
            () => musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            /Music cover preprocess failed: bad source/,
        );

        mockFetch(jsonResponse({ data: {} }));
        await assert.rejects(
            () => musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            /music cover preprocess returned no cover_feature_id/,
        );
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

    it("enriches YouTube result links with oEmbed metadata", async () => {
        const urls: string[] = [];
        globalThis.fetch = async (url: string | URL | Request) => {
            urls.push(url.toString());
            if (url.toString().includes("/v1/coding_plan/search")) {
                return jsonResponse({
                    organic: [
                        {
                            title: "Watch this",
                            link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            snippet: "Video result",
                        },
                    ],
                });
            }
            return jsonResponse({
                title: "Minecraft Lava Challenge",
                author_name: "CoolGamer",
                thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            });
        };

        const result = await webSearch("minecraft challenge", API_KEY);

        assert.equal(result.type, "text");
        assert.ok(result.content.includes("YouTube metadata:"));
        assert.ok(result.content.includes("Title: Minecraft Lava Challenge"));
        assert.ok(result.content.includes("Author: CoolGamer"));
        assert.ok(
            result.content.includes("Thumbnail: https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"),
        );
        assert.ok(urls.some((url) => url.startsWith("https://www.youtube.com/oembed?")));
    });

    it("enriches YouTube URLs pasted directly into query when search has no results", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().includes("/v1/coding_plan/search"))
                return jsonResponse({ organic: [] });
            return jsonResponse({
                title: "Direct Video",
                author_name: "Direct Creator",
                thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            });
        };

        const result = await webSearch("ideas from https://youtu.be/dQw4w9WgXcQ", API_KEY);

        assert.equal(result.type, "text");
        assert.ok(result.content.includes("YouTube metadata:"));
        assert.ok(result.content.includes("Title: Direct Video"));
        assert.ok(result.content.includes("Source: https://youtu.be/dQw4w9WgXcQ"));
    });

    it("deduplicates YouTube oEmbed enrichment by video id", async () => {
        let oembedCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().includes("/v1/coding_plan/search")) {
                return jsonResponse({
                    organic: [
                        {
                            title: "Same video",
                            link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            snippet: "Video",
                        },
                    ],
                });
            }
            oembedCalls += 1;
            return jsonResponse({
                title: "Same Video",
                author_name: "Creator",
                thumbnail_url: "https://i.ytimg.com/thumb.jpg",
            });
        };

        const result = await webSearch("https://youtu.be/dQw4w9WgXcQ", API_KEY);

        assert.equal(oembedCalls, 1);
        assert.equal(result.content.split("YouTube metadata:").length - 1, 1);
        assert.ok(result.content.includes("Source: https://youtu.be/dQw4w9WgXcQ"));
    });

    it("caps YouTube oEmbed enrichment at 2 videos", async () => {
        let oembedCalls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().includes("/v1/coding_plan/search")) {
                return jsonResponse({
                    organic: ["dQw4w9WgXcQ", "abcdefghijk", "lmnopqrstuv"].map((id) => ({
                        title: id,
                        link: `https://www.youtube.com/watch?v=${id}`,
                        snippet: "Video",
                    })),
                });
            }
            oembedCalls += 1;
            return jsonResponse({
                title: `Video ${oembedCalls}`,
                author_name: "Creator",
                thumbnail_url: "https://i.ytimg.com/thumb.jpg",
            });
        };

        const result = await webSearch("videos", API_KEY);

        assert.equal(oembedCalls, 2);
        assert.ok(result.content.includes("Video 1"));
        assert.ok(result.content.includes("Video 2"));
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

    it("downloads image then POSTs provider-only data URL to VLM endpoint", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            const urlText = url.toString();
            if (!urlText.includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            capturedUrl = urlText;
            capturedInit = init;
            return jsonResponse({ content: "A cat" });
        };

        await analyzeImage("https://example.com/photo.png", API_KEY);

        assert.ok(capturedUrl.includes("/v1/coding_plan/vlm"), "should call VLM endpoint");
        assert.equal(capturedInit?.method, "POST", "should use POST method");
    });

    it("sends Authorization Bearer header", async () => {
        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/jpeg");
            capturedHeaders = init?.headers as Record<string, string>;
            return jsonResponse({ content: "A cat" });
        };

        await analyzeImage("https://example.com/img.jpg", API_KEY);

        assert.ok(
            capturedHeaders["Authorization"]?.includes(API_KEY),
            "Authorization header should contain API key",
        );
    });

    it("sends prompt and normalized data image_url in request body", async () => {
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm"))
                return imageResponse("image/png", new Uint8Array([1, 2, 3]));
            capturedBody = init?.body as string;
            return jsonResponse({ content: "A gaming logo" });
        };

        await analyzeImage(
            { image_url: "https://cdn.example.com/logo.png", prompt: "Find the logo" },
            API_KEY,
        );

        const body = JSON.parse(capturedBody);
        assert.equal(body.prompt, "Find the logo");
        assert.equal(body.image_url, "data:image/png;base64,AQID");
    });

    it("returns description on success", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return jsonResponse({ content: "A colorful gaming logo with neon lights" });
        };

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("gaming logo"));
    });

    it("returns choices message content on VLM success", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return jsonResponse({ choices: [{ message: { content: "A tiny red pixel" } }] });
        };

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "A tiny red pixel");
    });

    it("returns error on provider HTTP failure", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return new Response(null, { status: 502 });
        };

        const result = await analyzeImage("https://example.com/bad.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("502"));
    });

    it("returns error on base_resp status_code != 0", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return jsonResponse({ base_resp: { status_code: 1004, status_msg: "login fail" } });
        };

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

    it("rejects user-supplied data URLs", async () => {
        const result = await analyzeImage("data:image/png;base64,AQID", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("data URLs are not allowed"));
    });

    it("allows server-owned data URLs for uploaded analyze assets", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = String(init?.body ?? "");
            return jsonResponse({ content: "uploaded image description" });
        };
        const result = await analyzeImage(
            { image_url: "data:image/png;base64,AQID", allow_data_url: true },
            API_KEY,
        );
        assert.equal(result.type, "text");
        assert.equal(result.content, "uploaded image description");
        assert.match(capturedBody, /data:image\/png;base64,AQID/);
    });

    it("rejects unsupported image content types", async () => {
        globalThis.fetch = async () => imageResponse("image/gif");
        const result = await analyzeImage("https://example.com/no-content.gif", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("unsupported image type"));
    });

    it("handles empty content field gracefully", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return jsonResponse({ content: "" });
        };

        const result = await analyzeImage("https://example.com/empty.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "No description returned.");
    });

    it("handles missing content field gracefully", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) return imageResponse("image/png");
            return jsonResponse({});
        };

        const result = await analyzeImage("https://example.com/no-content.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "No description returned.");
    });
});

// ── Schema content validation ───────────────────────────────────────

describe("getToolDefinitions schema content", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

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
});
