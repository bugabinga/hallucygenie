// HallucyGenie — Tools tests

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import {
    analyzeImage,
    executeTool,
    generateImage,
    generateLongSpeech,
    generateLyrics,
    generateMusic,
    generateMusicCover,
    generateVideo,
    getToolDefinitions,
    MINIMAX_BASE,
    MINIMAX_MODEL,
    MUSIC_DISABLED_MESSAGE,
    musicCoverPreprocess,
    textToSpeech,
    webSearch
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

function _mockFetchWithHandler(handler: (url: string, init?: RequestInit) => Response): void {
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) =>
        handler(url.toString(), init);
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function imageResponse(type = "image/png", bytes = new Uint8Array([1, 2, 3])): Response {
    return new Response(bytes, {
        headers: { "Content-Type": type, "Content-Length": String(bytes.byteLength) }
    });
}

function schemaFor(
    toolName: string
): { properties: Record<string, unknown>; required: string[]; } {
    const tool = getToolDefinitions().find((def) => def.name === toolName);
    assert.ok(tool, `missing tool schema: ${toolName}`);
    return tool.input_schema as { properties: Record<string, unknown>; required: string[]; };
}

// ── Tool definitions ─────────────────────────────────────────────────

describe("getToolDefinitions", () => {
    it("returns seven live tool definitions without music generation", () => {
        const defs = getToolDefinitions();
        assert.equal(defs.length, 7);
        assert.equal(defs.some((tool) => tool.name === "generate_music"), false);
        assert.equal(
            defs.some((tool) => tool.name === "analyze_image"),
            true
        );
        assert.equal(
            defs.some((tool) => tool.name === "generate_video"),
            true
        );
        assert.equal(
            defs.some((tool) => tool.name === "generate_long_speech"),
            true
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

    it("defines generate_video with preset schema", () => {
        const schema = schemaFor("generate_video");
        assert.ok(schema.properties.prompt);
        assert.ok(schema.properties.duration);
        assert.ok(schema.properties.resolution);
        assert.deepEqual(schema.required, ["prompt"]);
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
        { supported: string[]; forbidden: string[]; required: string[]; }
    > = {
        generate_image: {
            supported: [
                "prompt",
                "aspect_ratio",
                "n",
                "seed",
                "width",
                "height",
                "prompt_optimizer"
            ],
            forbidden: ["response_format", "subject_reference", "image_url"],
            required: ["prompt"]
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
                "output_format"
            ],
            required: ["text"]
        },
        generate_long_speech: {
            supported: ["text", "voice_id", "speed", "volume", "pitch"],
            forbidden: [
                "text_file_id",
                "subtitle_enable",
                "subtitle_type",
                "stream",
                "output_format",
                "file_id",
                "task_id"
            ],
            required: ["text"]
        },
        generate_lyrics: {
            supported: ["prompt", "mode", "lyrics", "title"],
            forbidden: [],
            required: ["prompt"]
        },
        generate_video: {
            supported: ["prompt", "duration", "resolution"],
            forbidden: ["model", "first_frame_image", "subject_reference", "prompt_optimizer"],
            required: ["prompt"]
        },
        analyze_image: {
            supported: ["image_url", "prompt"],
            forbidden: ["image_base64", "data_url"],
            required: ["image_url"]
        },
        web_search: {
            supported: ["query"],
            forbidden: [],
            required: ["query"]
        }
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
                subject_reference: "https://example.com/cat.png"
            } as unknown as Parameters<typeof generateImage>[0],
            API_KEY
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.response_format, "url");
        for (const key of ["subject_reference", "image_url", "height", "width"]) {
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
                stream: true
            } as unknown as Parameters<typeof textToSpeech>[0],
            API_KEY
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.output_format, "hex");
        assert.deepEqual(body.audio_setting, { format: "mp3" });
        for (
            const key of [
                "emotion",
                "language_boost",
                "subtitle_enable",
                "stream",
                "stream_options"
            ]
        ) {
            assert.equal(key in body, false, `${key} should stay omitted`);
            assert.equal(key in body.voice_setting, false, `${key} should not be voice_setting`);
        }
        assert.equal("audio_setting" in body.voice_setting, false);
        assert.equal("output_format" in body.voice_setting, false);
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
        assert.equal(called, false);
        assert.equal(image.type, "error");
        assert.equal(speech.type, "error");
        assert.equal(lyrics.type, "error");
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
                data: { image_urls: ["https://example.com/img.png"] }
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

    it("dispatches disabled music and cover without upstream calls", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls++;
            return jsonResponse({});
        };

        assert.deepEqual(
            await executeTool("generate_music", { prompt: "upbeat tune" }, API_KEY),
            { type: "error", content: MUSIC_DISABLED_MESSAGE }
        );
        assert.deepEqual(
            await executeTool("generate_music_cover", {}, API_KEY),
            { type: "error", content: MUSIC_DISABLED_MESSAGE }
        );
        assert.equal(calls, 0);
    });

    it("dispatches to generate_lyrics", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                content: [{ type: "text", text: "Verse: Hello world\nChorus: Hello again!" }]
            });

        const result = await executeTool("generate_lyrics", { prompt: "a happy song" }, API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Hello world"));
    });

    it("dispatches to analyze_image", async () => {
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
            capturedBody = init?.body as string;
            return jsonResponse({ content: "A mountain" });
        };

        const result = await executeTool(
            "analyze_image",
            { image_url: "https://example.com/mountain.png", prompt: "one thing" },
            API_KEY
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
                data: { image_urls: ["https://cdn.minimax.io/img123.png"] }
            });
        };

        const result = await generateImage("a sunset over mountains", API_KEY);
        assert.equal(result.type, "image");
        assert.equal(result.content, "https://cdn.minimax.io/img123.png");
        assert.ok(capturedUrl.includes("/v1/image_generation"));
        assert.equal(capturedInit?.method, "POST");

        const body = JSON.parse(capturedInit?.body as string);
        assert.equal(body.model, "image-01");
        assert.equal(body.prompt, "a sunset over mountains");

        const headers = capturedInit?.headers as Record<string, string>;
        assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
    });

    it("passes supported aspect ratio option", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/wide.png"] } });
        };

        await generateImage({ prompt: "wide cat", aspect_ratio: "16:9" }, API_KEY);
        const body = JSON.parse(capturedBody);
        assert.equal(body.aspect_ratio, "16:9");
    });

    it("passes and clamps optional image generation params", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/custom.png"] } });
        };

        await generateImage(
            {
                prompt: "custom cat",
                aspect_ratio: "21:9",
                n: 12,
                width: 517,
                height: 2055,
                prompt_optimizer: false
            },
            API_KEY
        );
        const body = JSON.parse(capturedBody);
        assert.equal(body.aspect_ratio, "21:9");
        assert.equal(body.n, 9);
        assert.equal(body.seed, undefined);
        assert.equal(body.width, 512);
        assert.equal(body.height, 2048);
        assert.equal(body.prompt_optimizer, false);
    });

    it("passes internal subject reference payload", async () => {
        let capturedBody = "";
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return jsonResponse({ data: { image_urls: ["https://example.com/ref.png"] } });
        };

        await generateImage(
            {
                prompt: "same fox in armor",
                subject_reference: [
                    { type: "character", image_file: "data:image/png;base64,cmVm" }
                ]
            },
            API_KEY
        );
        const body = JSON.parse(capturedBody);
        assert.deepEqual(body.subject_reference, [
            { type: "character", image_file: "data:image/png;base64,cmVm" }
        ]);
    });

    it("returns helpful error when seed is used with multiple images", async () => {
        let called = false;
        globalThis.fetch = async () => {
            called = true;
            return jsonResponse({ data: { image_urls: ["https://example.com/custom.png"] } });
        };

        const result = await generateImage({ prompt: "cat", n: 4, seed: 123 }, API_KEY);

        assert.equal(called, false);
        assert.equal(result.type, "error");
        assert.match(result.content, /omit seed when n is greater than 1/);
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
                    image_urls: ["https://example.com/img1.png", "https://example.com/img2.png"]
                }
            })
        );

        const result = await generateImage("test", API_KEY);
        assert.equal(result.type, "image");
        assert.equal(result.content, "https://example.com/img1.png");
        assert.deepEqual(result.urls, [
            "https://example.com/img1.png",
            "https://example.com/img2.png"
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

        const body = JSON.parse(capturedInit?.body as string);
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
        const headers = capturedInit?.headers as Record<string, string>;
        assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
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
        mockFetch(
            jsonResponse({ base_resp: { status_code: 2013, status_msg: "text too long" } })
        );

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

describe("disabled music generation", () => {
    it("returns the disabled error without calling upstream", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls++;
            return jsonResponse({});
        };

        const result = await generateMusic("upbeat electronic", API_KEY);
        assert.deepEqual(result, { type: "error", content: MUSIC_DISABLED_MESSAGE });
        assert.equal(calls, 0);
    });
});

// ── music cover ─────────────────────────────────────────────────────

describe("disabled music cover", () => {
    it("rejects generation and preprocessing without calling upstream", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls++;
            return jsonResponse({});
        };

        const generated = await generateMusicCover(
            { prompt: "spooky boss", lyrics: "[Verse] hi", cover_feature_id: "cover-1" },
            API_KEY
        );
        await assert.rejects(
            () => musicCoverPreprocess({ audio_url: "https://example.com/a.mp3" }, API_KEY),
            new RegExp(MUSIC_DISABLED_MESSAGE)
        );
        assert.deepEqual(generated, { type: "error", content: MUSIC_DISABLED_MESSAGE });
        assert.equal(calls, 0);
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

    it("uses text model with authenticated JSON request and returns only text blocks", async () => {
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        globalThis.fetch = async (url, init) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return jsonResponse({
                content: [
                    { type: "thinking", thinking: "plan" },
                    { type: "text", text: "[Verse] Hello" },
                    { type: "text", text: "[Chorus] Again" }
                ]
            });
        };

        const result = await generateLyrics({
            prompt: "make this chorus stronger",
            mode: "edit",
            lyrics: "[Chorus] Old words",
            title: "Victory Song"
        }, API_KEY);
        const body = JSON.parse(String(capturedInit?.body));
        assert.equal(capturedUrl, `${MINIMAX_BASE}/anthropic/v1/messages`);
        assert.equal(new Headers(capturedInit?.headers).get("Authorization"), `Bearer ${API_KEY}`);
        assert.equal(body.model, MINIMAX_MODEL);
        assert.equal(body.max_tokens, 2048);
        assert.deepEqual(body.output_config, { effort: "low" });
        assert.deepEqual(JSON.parse(body.messages[0].content), {
            prompt: "make this chorus stronger",
            mode: "edit",
            lyrics: "[Chorus] Old words",
            title: "Victory Song"
        });
        assert.equal(result.type, "text");
        assert.equal(result.content, "[Verse] Hello\n[Chorus] Again");
    });

    it("validates input before fetch and reports provider failures", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls++;
            throw new Error("offline");
        };
        const missingPrompt = await generateLyrics(" ", API_KEY);
        const longPrompt = await generateLyrics("x".repeat(2001), API_KEY);
        const longExistingLyrics = await generateLyrics(
            { prompt: "revise", lyrics: "x".repeat(3501) },
            API_KEY
        );
        assert.equal(missingPrompt.type, "error");
        assert.equal(longPrompt.type, "error");
        assert.equal(longExistingLyrics.type, "error");
        assert.equal(calls, 0);

        globalThis.fetch = async () => jsonResponse({}, 502);
        const http = await generateLyrics("song", API_KEY);
        assert.equal(http.provider?.status_code, 502);

        globalThis.fetch = async () => new Response("not json", { status: 200 });
        const invalidJson = await generateLyrics("song", API_KEY);
        assert.equal(invalidJson.type, "error");

        globalThis.fetch = async () => {
            throw new Error("offline");
        };
        const network = await generateLyrics("song", API_KEY);
        assert.equal(network.type, "error");
        assert.match(network.content, /offline/);
    });

    it("returns an error for an empty text response", async () => {
        mockFetch(jsonResponse({ content: [{ type: "thinking", thinking: "plan" }] }));
        const result = await generateLyrics("song", API_KEY);
        assert.equal(result.type, "error");
        assert.match(result.content, /no lyrics text/);
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
                data: { image_urls: ["https://cdn.example.com/generated-image.png"] }
            })
        );

        const result = await generateImage("a colorful parrot", API_KEY);
        assert.deepEqual(result, {
            type: "image",
            content: "https://cdn.example.com/generated-image.png"
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

        const result = await textToSpeech("test", API_KEY);
        assert.equal(result.type, "audio");
        const base64Part = result.content.replace("data:audio/mp3;base64,", "");
        const decoded = Buffer.from(base64Part, "base64").toString("hex");
        assert.equal(decoded, longHex.toLowerCase());
    });
});

// ── generateLongSpeech ──────────────────────────────────────────────

describe("generateLongSpeech", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("creates, polls, retrieves, and returns provider download URL", async () => {
        const calls: string[] = [];
        let createBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = url.toString();
            calls.push(urlStr);
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                createBody = String(init?.body ?? "");
                return jsonResponse({ task_id: "tts-task-1" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ data: { status: "Success", file_id: "file-1" } });
            }
            if (urlStr.includes("/v1/files/retrieve")) {
                return jsonResponse({ file: { download_url: "https://cdn.example/tts.tar" } });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await generateLongSpeech(
            { text: "Long narration", voice_id: "English_CaptivatingStoryteller", speed: 1.2 },
            API_KEY,
            { pollDelayMs: 0, maxPolls: 1 }
        );
        const payload = JSON.parse(createBody);

        assert.equal(result.type, "audio");
        assert.equal(result.content, "https://cdn.example/tts.tar");
        assert.deepEqual(
            calls.map((url) => new URL(url).pathname),
            ["/v1/t2a_async_v2", "/v1/query/t2a_async_query_v2", "/v1/files/retrieve"]
        );
        assert.equal(payload.model, "speech-2.8-hd");
        assert.equal(payload.voice_setting.voice_id, "English_CaptivatingStoryteller");
        assert.equal(payload.audio_setting.audio_sample_rate, 32000);
    });

    it("waits between pending async TTS polls when configured", async () => {
        let polls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ data: { task_id: "task_wait" } });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                polls++;
                return jsonResponse({
                    data: { status: polls < 2 ? "Processing" : "Success", file_id: "file_wait" }
                });
            }
            if (urlStr.includes("/v1/files/retrieve")) {
                return jsonResponse({
                    data: { file: { download_url: "https://example.com/wait.mp3" } }
                });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await generateLongSpeech("Wait", API_KEY, { pollDelayMs: 1, maxPolls: 3 });
        assert.equal(result.type, "audio");
        assert.equal(polls, 2);
    });

    it("returns timeout when provider never finishes", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "tts-task-1" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ data: { status: "Processing" } });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await generateLongSpeech("Long narration", API_KEY, {
            pollDelayMs: 0,
            maxPolls: 1
        });

        assert.equal(result.type, "error");
        assert.match(result.content, /timed out/);
    });

    it("accepts nested MiniMax async TTS response shapes", async () => {
        const calls: string[] = [];
        let polls = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            calls.push(urlStr);
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ data: { task_id: "nested-tts-task" } });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                polls++;
                return polls === 1
                    ? jsonResponse({ task_status: "Processing" })
                    : jsonResponse({
                        data: { task_status: "Succeeded", audio_file_id: "audio-file-2" }
                    });
            }
            if (urlStr.includes("/v1/files/retrieve")) {
                return jsonResponse({ data: { download_url: "https://cdn.example/nested.mp3" } });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await generateLongSpeech("Nested narration", API_KEY, {
            pollDelayMs: 0,
            maxPolls: 2
        });

        assert.equal(result.type, "audio");
        assert.equal(result.content, "https://cdn.example/nested.mp3");
        assert.equal(polls, 2);
        assert.ok(calls[1].includes("task_id=nested-tts-task"));
        assert.ok(calls[3].includes("file_id=audio-file-2"));
        assert.deepEqual(result.provider, {
            stage: "file",
            task_id: "nested-tts-task",
            file_id: "audio-file-2"
        });
    });

    it("wraps unexpected async TTS exceptions", async () => {
        globalThis.fetch = async () => {
            throw new Error("socket gone");
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY), {
            type: "error",
            content: "Long TTS failed: Error: socket gone"
        });
    });

    it("reports every MiniMax async TTS failure stage", async () => {
        globalThis.fetch = async () => new Response("broken", { status: 503 });
        assert.deepEqual(await generateLongSpeech("x", API_KEY), {
            type: "error",
            content: "Long TTS API error: 503",
            provider: { stage: "create", status_code: 503 }
        });

        mockFetch(jsonResponse({ base_resp: { status_code: 1004, status_msg: "login fail" } }));
        assert.deepEqual(await generateLongSpeech("x", API_KEY), {
            type: "error",
            content: "Long TTS failed: login fail",
            provider: { stage: "create", status_code: 1004, status_msg: "login fail" }
        });

        mockFetch(jsonResponse({ data: {} }));
        assert.deepEqual(await generateLongSpeech("x", API_KEY), {
            type: "error",
            content: "Long TTS returned no task_id"
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-q-http" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return new Response("nope", { status: 502 });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS query API error: 502",
            provider: { stage: "query", status_code: 502, task_id: "task-q-http" }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-q-base" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ base_resp: { status_code: 2013, status_msg: "bad query" } });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS query failed: bad query",
            provider: {
                stage: "query",
                status_code: 2013,
                status_msg: "bad query",
                task_id: "task-q-base"
            }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-q-fail" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ data: { status: "Error", message: "quota gone" } });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS failed: quota gone",
            provider: { stage: "query", status_msg: "quota gone", task_id: "task-q-fail" }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-file-http" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ data: { status: "Success", output_file_id: "file-http" } });
            }
            if (urlStr.includes("/v1/files/retrieve")) return new Response("nope", { status: 500 });
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS file API error: 500",
            provider: {
                stage: "file",
                status_code: 500,
                task_id: "task-file-http",
                file_id: "file-http"
            }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-file-base" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ data: { status: "Success", file_id: "file-base" } });
            }
            if (urlStr.includes("/v1/files/retrieve")) {
                return jsonResponse({
                    base_resp: { status_code: 3001, status_msg: "missing file" }
                });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS file retrieve failed: missing file",
            provider: {
                stage: "file",
                status_code: 3001,
                status_msg: "missing file",
                task_id: "task-file-base",
                file_id: "file-base"
            }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.endsWith("/v1/t2a_async_v2")) {
                return jsonResponse({ task_id: "task-file-empty" });
            }
            if (urlStr.includes("/v1/query/t2a_async_query_v2")) {
                return jsonResponse({ status: "Succeeded", file_id: "file-empty" });
            }
            if (urlStr.includes("/v1/files/retrieve")) return jsonResponse({ data: { file: {} } });
            throw new Error(`unexpected fetch ${urlStr}`);
        };
        assert.deepEqual(await generateLongSpeech("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Long TTS file retrieve returned no download_url",
            provider: {
                stage: "file",
                status_msg: "missing download_url",
                task_id: "task-file-empty",
                file_id: "file-empty"
            }
        });
    });
});

// ── generateVideo ───────────────────────────────────────────────────

describe("generateVideo", () => {
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("creates once, polls V2, and returns its output URL", async () => {
        const calls: string[] = [];
        let createPayload: unknown;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = url.toString();
            calls.push(urlStr);
            if (urlStr.endsWith("/v2/video_generation")) {
                createPayload = JSON.parse(String(init?.body));
                return jsonResponse({ task_id: "task_/1" });
            }
            if (urlStr.endsWith("/v2/query/video_generation/task_%2F1")) {
                return jsonResponse({
                    task: { status: "succeeded", content: { url: "https://cdn.example/video.mp4" } }
                });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await generateVideo(
            {
                prompt: "A fox mascot jumps through a neon portal",
                duration: 6,
                resolution: "2k"
            },
            API_KEY,
            { pollDelayMs: 0, maxPolls: 1 }
        );

        assert.deepEqual(createPayload, {
            model: "MiniMax-H3",
            content: [{ type: "text", text: "A fox mascot jumps through a neon portal" }],
            duration: 6,
            resolution: "2K",
            ratio: "16:9"
        });
        assert.deepEqual(result, {
            type: "video",
            content: "https://cdn.example/video.mp4",
            provider: { stage: "query", task_id: "task_/1" }
        });
        assert.deepEqual(calls, [
            `${MINIMAX_BASE}/v2/video_generation`,
            `${MINIMAX_BASE}/v2/query/video_generation/task_%2F1`
        ]);
    });

    it("defaults invalid presets without expanding provider parameters", async () => {
        let createPayload: Record<string, unknown> | undefined;
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                createPayload = JSON.parse(String(init?.body));
                return jsonResponse({ task_id: "task-defaults" });
            }
            return jsonResponse({
                task: { status: "succeeded", content: { url: "https://cdn.example/defaults.mp4" } }
            });
        };

        await generateVideo(
            { prompt: "Trailer", duration: 999 as 4, resolution: "4k" as "768p" },
            API_KEY,
            { pollDelayMs: 0, maxPolls: 1 }
        );

        assert.deepEqual(createPayload, {
            model: "MiniMax-H3",
            content: [{ type: "text", text: "Trailer" }],
            duration: 4,
            resolution: "768P",
            ratio: "16:9"
        });
    });

    for (const status of ["failed", "cancelled", "expired"]) {
        it(`reports terminal ${status} task diagnostics`, async () => {
            globalThis.fetch = async (url: string | URL | Request) => {
                if (url.toString().endsWith("/v2/video_generation")) {
                    return jsonResponse({ task_id: `task-${status}` });
                }
                return jsonResponse({
                    task: { status, error: { message: `${status} by provider` } }
                });
            };

            const result = await generateVideo("make a trailer", API_KEY, {
                pollDelayMs: 0,
                maxPolls: 1
            });

            assert.deepEqual(result, {
                type: "error",
                content: `Video generation ${status}: ${status} by provider`,
                provider: {
                    stage: "query",
                    status_msg: `${status} by provider`,
                    task_id: `task-${status}`
                }
            });
        });
    }

    it("reports missing successful output", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                return jsonResponse({ task_id: "task-empty" });
            }
            return jsonResponse({ task: { status: "succeeded", content: {} } });
        };

        assert.deepEqual(await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Video query returned no output URL",
            provider: { stage: "query", status_msg: "missing output URL", task_id: "task-empty" }
        });
    });

    it("polls a pending H3 task until its output is ready", async () => {
        let polls = 0;
        globalThis.fetch = async (url) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                return jsonResponse({ task_id: "pending-task" });
            }
            polls++;
            return jsonResponse({
                task: polls === 1
                    ? { status: "processing" }
                    : { status: "succeeded", content: { url: "https://cdn.example/ready.mp4" } }
            });
        };
        const result = await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 2 });
        assert.equal(polls, 2);
        assert.equal(result.type, "video");
        assert.equal(result.content, "https://cdn.example/ready.mp4");
    });

    it("fails immediately for a malformed task query", async () => {
        let polls = 0;
        globalThis.fetch = async (url) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                return jsonResponse({ task_id: "malformed-task" });
            }
            polls++;
            return jsonResponse({});
        };
        const result = await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 2 });
        assert.equal(polls, 1);
        assert.equal(result.type, "error");
        assert.equal(result.provider?.status_msg, "missing task status");
    });

    it("times out pending tasks without resubmitting", async () => {
        let creates = 0;
        let queries = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                creates++;
                return jsonResponse({ task_id: "task-pending" });
            }
            queries++;
            return jsonResponse({ task: { status: "processing" } });
        };

        assert.deepEqual(await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 2 }), {
            type: "error",
            content: "Video generation timed out",
            provider: { stage: "query", status_msg: "timeout", task_id: "task-pending" }
        });
        assert.equal(creates, 1);
        assert.equal(queries, 2);
    });

    it("bounds polling to 60 requests", async () => {
        let queries = 0;
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                return jsonResponse({ task_id: "task-bounded" });
            }
            queries++;
            return jsonResponse({ task: { status: "processing" } });
        };

        await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 61 });
        assert.equal(queries, 60);
    });

    it("reports V2 HTTP errors and unexpected exceptions", async () => {
        globalThis.fetch = async () => new Response("broken", { status: 503 });
        assert.deepEqual(await generateVideo("x", API_KEY), {
            type: "error",
            content: "Video generation API error: 503",
            provider: { stage: "create", status_code: 503 }
        });

        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().endsWith("/v2/video_generation")) {
                return jsonResponse({ task_id: "task-query-http" });
            }
            return new Response("nope", { status: 502 });
        };
        assert.deepEqual(await generateVideo("x", API_KEY, { pollDelayMs: 0, maxPolls: 1 }), {
            type: "error",
            content: "Video query API error: 502",
            provider: { stage: "query", status_code: 502, task_id: "task-query-http" }
        });

        globalThis.fetch = async () => {
            throw new Error("socket gone");
        };
        assert.deepEqual(await generateVideo("x", API_KEY), {
            type: "error",
            content: "Video generation failed: Error: socket gone"
        });
    });

    it("rejects missing task ids", async () => {
        mockFetch(jsonResponse({ data: { task_id: "legacy-task" } }));
        assert.deepEqual(await generateVideo("x", API_KEY), {
            type: "error",
            content: "Video generation returned no task_id"
        });
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
                        snippet: "Latest games"
                    },
                    { title: "Reviews", link: "https://example.com/2", snippet: "Top rated" }
                ]
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
            capturedHeaders.Authorization?.includes(API_KEY),
            "Authorization header should contain API key"
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
                    { title: "Game Tip 2", link: "https://ex.com/2", snippet: "Also this" }
                ]
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
                    snippet: `Snippet ${i}`
                }))
            });

        const result = await webSearch("many results", API_KEY);
        assert.ok(!result.content.includes("Result 6"), "should limit to 5 results");
    });

    it("parses nested data results with url field", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                data: {
                    results: [
                        {
                            title: "Nested Result",
                            url: "https://example.com/nested",
                            snippet: "Nested snippet"
                        }
                    ]
                }
            });

        const result = await webSearch("nested", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Nested Result"));
        assert.ok(result.content.includes("https://example.com/nested"));
        assert.ok(result.content.includes("Nested snippet"));
    });

    it("falls back to nested results when organic is empty", async () => {
        globalThis.fetch = async () =>
            jsonResponse({
                organic: [],
                data: {
                    results: [
                        {
                            title: "Fallback Result",
                            url: "https://example.com/fallback",
                            snippet: "Fallback snippet"
                        }
                    ]
                }
            });

        const result = await webSearch("fallback", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("Fallback Result"));
        assert.ok(result.content.includes("https://example.com/fallback"));
        assert.ok(result.content.includes("Fallback snippet"));
    });

    it("ignores malformed and invalid YouTube-looking URLs", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes("/v1/coding_plan/search")) {
                return jsonResponse({
                    organic: [
                        {
                            title: "Bad",
                            link: "https://example.com/a",
                            snippet: "bad https://% and https://youtube.com/shorts/not-valid"
                        }
                    ]
                });
            }
            if (urlStr.includes("youtube.com/oembed")) {
                throw new Error("should not call oembed");
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await webSearch("https://% https://youtube.com/embed/nope", API_KEY);
        assert.equal(result.type, "text");
        assert.doesNotMatch(result.content, /YouTube metadata/);
    });

    it("enriches YouTube shorts and embed links found in snippets", async () => {
        const oembedUrls: string[] = [];
        globalThis.fetch = async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes("/v1/coding_plan/search")) {
                return jsonResponse({
                    organic: [
                        {
                            title: "Short",
                            link: "https://youtube.com/shorts/dQw4w9WgXcQ",
                            snippet: "short"
                        },
                        {
                            title: "Embed",
                            link: "https://youtube.com/embed/abcdefghijk",
                            snippet: "embed"
                        }
                    ]
                });
            }
            if (urlStr.includes("youtube.com/oembed")) {
                oembedUrls.push(urlStr);
                return jsonResponse({ title: "YT", author_name: "Rick", thumbnail_url: "thumb" });
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        };

        const result = await webSearch("videos", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(oembedUrls.length, 2);
        assert.match(result.content, /YouTube metadata/);
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
                            snippet: "Video result"
                        }
                    ]
                });
            }
            return jsonResponse({
                title: "Minecraft Lava Challenge",
                author_name: "CoolGamer",
                thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
            });
        };

        const result = await webSearch("minecraft challenge", API_KEY);

        assert.equal(result.type, "text");
        assert.ok(result.content.includes("YouTube metadata:"));
        assert.ok(result.content.includes("Title: Minecraft Lava Challenge"));
        assert.ok(result.content.includes("Author: CoolGamer"));
        assert.ok(
            result.content.includes("Thumbnail: https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        );
        assert.ok(urls.some((url) => url.startsWith("https://www.youtube.com/oembed?")));
    });

    it("enriches YouTube URLs pasted directly into query when search has no results", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (url.toString().includes("/v1/coding_plan/search")) {
                return jsonResponse({ organic: [] });
            }
            return jsonResponse({
                title: "Direct Video",
                author_name: "Direct Creator",
                thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
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
                            snippet: "Video"
                        }
                    ]
                });
            }
            oembedCalls += 1;
            return jsonResponse({
                title: "Same Video",
                author_name: "Creator",
                thumbnail_url: "https://i.ytimg.com/thumb.jpg"
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
                        snippet: "Video"
                    }))
                });
            }
            oembedCalls += 1;
            return jsonResponse({
                title: `Video ${oembedCalls}`,
                author_name: "Creator",
                thumbnail_url: "https://i.ytimg.com/thumb.jpg"
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
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/jpeg");
            }
            capturedHeaders = init?.headers as Record<string, string>;
            return jsonResponse({ content: "A cat" });
        };

        await analyzeImage("https://example.com/img.jpg", API_KEY);

        assert.ok(
            capturedHeaders.Authorization?.includes(API_KEY),
            "Authorization header should contain API key"
        );
    });

    it("sends prompt and normalized data image_url in request body", async () => {
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png", new Uint8Array([1, 2, 3]));
            }
            capturedBody = init?.body as string;
            return jsonResponse({ content: "A gaming logo" });
        };

        await analyzeImage(
            { image_url: "https://cdn.example.com/logo.png", prompt: "Find the logo" },
            API_KEY
        );

        const body = JSON.parse(capturedBody);
        assert.equal(body.prompt, "Find the logo");
        assert.equal(body.image_url, "data:image/png;base64,AQID");
    });

    it("returns description on success", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
            return jsonResponse({ content: "A colorful gaming logo with neon lights" });
        };

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.includes("gaming logo"));
    });

    it("returns choices message content on VLM success", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
            return jsonResponse({ choices: [{ message: { content: "A tiny red pixel" } }] });
        };

        const result = await analyzeImage("https://example.com/img.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "A tiny red pixel");
    });

    it("returns error on provider HTTP failure", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
            return new Response(null, { status: 502 });
        };

        const result = await analyzeImage("https://example.com/bad.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("502"));
    });

    it("returns error on base_resp status_code != 0", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
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

    it("rejects non-http image URLs", async () => {
        const result = await analyzeImage("ftp://example.com/image.png", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("image URL must be http(s)"));
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
            API_KEY
        );
        assert.equal(result.type, "text");
        assert.equal(result.content, "uploaded image description");
        assert.match(capturedBody, /data:image\/png;base64,AQID/);
    });

    it("accepts gif images for analysis", async () => {
        let capturedBody = "";
        globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/gif");
            }
            capturedBody = String(init?.body ?? "");
            return jsonResponse({ content: "animated image description" });
        };
        const result = await analyzeImage("https://example.com/animated.gif", API_KEY);
        assert.deepEqual(result, { type: "text", content: "animated image description" });
        assert.match(capturedBody, /data:image\/gif;base64/);
    });

    it("rejects unsupported image content types", async () => {
        globalThis.fetch = async () => imageResponse("image/bmp");
        const result = await analyzeImage("https://example.com/no-content.bmp", API_KEY);
        assert.equal(result.type, "error");
        assert.ok(result.content.includes("unsupported image type"));
    });

    it("handles empty content field gracefully", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
            return jsonResponse({ content: "" });
        };

        const result = await analyzeImage("https://example.com/empty.png", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(result.content, "No description returned.");
    });

    it("handles missing content field gracefully", async () => {
        globalThis.fetch = async (url: string | URL | Request) => {
            if (!url.toString().includes("/v1/coding_plan/vlm")) {
                return imageResponse("image/png");
            }
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
            "fake-key"
        )) as ToolResult;
        assert.equal(result.type, "error");
        assert.ok((result.content as string).includes("Network timeout"));
    });
});
