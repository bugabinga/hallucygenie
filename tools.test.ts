// HallucyGenie — Tools tests
// Uses Node.js test runner

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getToolDefinitions,
  executeTool,
  generateImage,
  textToSpeech,
  generateMusic,
  MINIMAX_BASE,
} from "./tools.ts";

// ── Test helpers ─────────────────────────────────────────────────────

const API_KEY = "test-api-key";

let originalFetch: typeof globalThis.fetch;

function mockFetch(response: Response): void {
  globalThis.fetch = async () => response;
}

function mockFetchWithHandler(
  handler: (url: string, init?: RequestInit) => Response
): void {
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
  it("returns three tool definitions", () => {
    const defs = getToolDefinitions();
    assert.equal(defs.length, 3);
  });

  it("defines generate_image with correct schema", () => {
    const defs = getToolDefinitions();
    const img = defs.find((d) => d.function.name === "generate_image");
    assert.ok(img);
    assert.equal(img.type, "function");
    assert.equal(img.function.name, "generate_image");
    const params = img.function.parameters as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.equal(params.type, "object");
    assert.ok(params.properties.prompt);
    assert.deepEqual(params.required, ["prompt"]);
  });

  it("defines text_to_speech with correct schema", () => {
    const defs = getToolDefinitions();
    const tts = defs.find((d) => d.function.name === "text_to_speech");
    assert.ok(tts);
    assert.equal(tts.type, "function");
    assert.equal(tts.function.name, "text_to_speech");
    const params = tts.function.parameters as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.equal(params.type, "object");
    assert.ok(params.properties.text);
    assert.ok(params.properties.voice_id);
    assert.deepEqual(params.required, ["text"]);
  });

  it("defines generate_music with correct schema", () => {
    const defs = getToolDefinitions();
    const music = defs.find((d) => d.function.name === "generate_music");
    assert.ok(music);
    assert.equal(music.type, "function");
    assert.equal(music.function.name, "generate_music");
    const params = music.function.parameters as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.equal(params.type, "object");
    assert.ok(params.properties.prompt);
    assert.ok(params.properties.lyrics);
    assert.deepEqual(params.required, ["prompt"]);
  });

  it("all definitions have descriptions", () => {
    const defs = getToolDefinitions();
    for (const def of defs) {
      assert.ok(def.function.description.length > 0);
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

    const result = await executeTool(
      "generate_image",
      { prompt: "a cat" },
      API_KEY
    );
    assert.equal(result.type, "image");
    assert.equal(result.content, "https://example.com/img.png");
    assert.ok(capturedUrl.includes("/v1/image_generation"));
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.prompt, "a cat");
  });

  it("dispatches to text_to_speech", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "48656c6c6f" } });

    const result = await executeTool(
      "text_to_speech",
      { text: "hello" },
      API_KEY
    );
    assert.equal(result.type, "audio");
    assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
  });

  it("dispatches to generate_music", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "4d75736963" } });

    const result = await executeTool(
      "generate_music",
      { prompt: "upbeat tune" },
      API_KEY
    );
    assert.equal(result.type, "audio");
    assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
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
          image_urls: [
            "https://example.com/img1.png",
            "https://example.com/img2.png",
          ],
        },
      })
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

  it("sends Authorization header with API key", async () => {
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
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "48656c6c6f" } });

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
    assert.equal(body.lyrics, undefined);
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
  });

  it("does not include lyrics field when not provided", async () => {
    let capturedBody = "";
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return jsonResponse({ data: { audio: "4d75736963" } });
    };

    await generateMusic("a song", API_KEY);
    const body = JSON.parse(capturedBody);
    assert.equal("lyrics" in body, false);
  });

  it("sends Authorization header with API key", async () => {
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
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "4d75736963" } });

    const result = await generateMusic("test", API_KEY);
    assert.ok(result.content.startsWith("data:audio/mp3;base64,"));
    assert.equal(result.type, "audio");
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
      })
    );

    const result = await generateImage("a colorful parrot", API_KEY);
    assert.deepEqual(result, {
      type: "image",
      content: "https://cdn.example.com/generated-image.png",
    });
  });

  it("snapshot: text_to_speech result", async () => {
    // Use known hex: "Hello" = 48656c6c6f
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "48656c6c6f" } });

    const result = await textToSpeech("Hello", API_KEY);
    assert.equal(result.type, "audio");
    // Verify exact base64 encoding
    const expectedBase64 = Buffer.from("48656c6c6f", "hex").toString("base64");
    assert.equal(result.content, `data:audio/mp3;base64,${expectedBase64}`);
  });

  it("snapshot: generate_music result", async () => {
    // Use known hex: "Music" = 4d75736963
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: "4d75736963" } });

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
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: hexWithID3 } });

    const result = await textToSpeech("test", API_KEY);
    assert.equal(result.type, "audio");
    const base64Part = result.content.replace("data:audio/mp3;base64,", "");
    const decoded = Buffer.from(base64Part, "base64").toString("hex");
    assert.equal(decoded, hexWithID3.toLowerCase());
  });

  it("handles long hex strings", async () => {
    // Simulate a larger audio payload
    const longHex = "fffb90440003000".repeat(100);
    globalThis.fetch = async () =>
      jsonResponse({ data: { audio: longHex } });

    const result = await generateMusic("test", API_KEY);
    assert.equal(result.type, "audio");
    const base64Part = result.content.replace("data:audio/mp3;base64,", "");
    const decoded = Buffer.from(base64Part, "base64").toString("hex");
    assert.equal(decoded, longHex.toLowerCase());
  });
});
