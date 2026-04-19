// HallucyGenie — Tool definitions and execution
// Implements generate_image, text_to_speech, generate_music

// ── Types ────────────────────────────────────────────────────────────

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

export interface ToolResult {
    type: "image" | "audio" | "text" | "error";
    content: string;
}

// ── Configuration ────────────────────────────────────────────────────

export const MINIMAX_BASE = "https://api.minimax.io";

// ── Auth note ───────────────────────────────────────────────────────
//
// CRITICAL: All MiniMax endpoints (except /anthropic/v1/messages) require
// "Authorization: Bearer <key>" — NOT "x-api-key". The anthropic endpoint
// accepts both, but all other endpoints (TTS, image, music, web search, VLM)
// return HTTP 200 with {"base_resp":{"status_code":1004,"status_msg":"login fail"}}
// if you use x-api-key.

// ── Tool schemas (Anthropic format) ───────────────────────────────────

export function getToolDefinitions(): ToolDefinition[] {
    return [
        {
            name: "generate_image",
            description:
                "Generate an image from a text prompt. Returns the URL of the generated image.",
            input_schema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Text description of the image to generate",
                    },
                },
                required: ["prompt"],
            },
        },
        {
            name: "text_to_speech",
            description:
                "Convert text to speech audio. Returns a base64-encoded MP3 audio data URL.",
            input_schema: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "The text to convert to speech",
                    },
                    voice_id: {
                        type: "string",
                        description: 'Voice ID to use. Defaults to "English_expressive_narrator".',
                    },
                },
                required: ["text"],
            },
        },
        {
            name: "generate_music",
            description:
                "Generate music from a prompt and optional lyrics. Returns a base64-encoded MP3 audio data URL.",
            input_schema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Description of the music to generate",
                    },
                    lyrics: {
                        type: "string",
                        description: "Optional lyrics for the generated music",
                    },
                },
                required: ["prompt"],
            },
        },
        {
            name: "web_search",
            description: "Search the web for information. Returns formatted search results.",
            input_schema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query",
                    },
                },
                required: ["query"],
            },
        },
        {
            name: "analyze_image",
            description: "Analyze or describe an image from a URL. Returns a text description.",
            input_schema: {
                type: "object",
                properties: {
                    image_url: {
                        type: "string",
                        description: "URL of the image to analyze",
                    },
                },
                required: ["image_url"],
            },
        },
    ];
}

// ── Tool execution ───────────────────────────────────────────────────

/**
 * Execute a tool by name with the given arguments.
 * Dispatches to the appropriate tool function.
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<ToolResult> {
    switch (name) {
        case "generate_image":
            return generateImage(args.prompt as string, apiKey);
        case "text_to_speech":
            return textToSpeech(args.text as string, apiKey, args.voice_id as string | undefined);
        case "generate_music":
            return generateMusic(args.prompt as string, apiKey, args.lyrics as string | undefined);
        case "web_search":
            return webSearch(args.query as string, apiKey);
        case "analyze_image":
            return analyzeImage(args.image_url as string, apiKey);
        default:
            return { type: "error", content: `Unknown tool: ${name}` };
    }
}

// ── Tool implementations ─────────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 * Calls POST /v1/image_generation with model "image-01".
 */
export async function generateImage(prompt: string, apiKey: string): Promise<ToolResult> {
    try {
        const resp = await fetch(`${MINIMAX_BASE}/v1/image_generation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "image-01",
                prompt,
            }),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            return {
                type: "error",
                content: `Image generation API error: ${resp.status} — ${errorText}`,
            };
        }

        const data = (await resp.json()) as {
            data?: { image_urls?: string[] };
        };

        const urls = data?.data?.image_urls;
        if (!urls || urls.length === 0) {
            return {
                type: "error",
                content: "Image generation returned no image URLs",
            };
        }

        return { type: "image", content: urls[0] };
    } catch (err) {
        return {
            type: "error",
            content: `Image generation failed: ${String(err)}`,
        };
    }
}

/**
 * Convert text to speech.
 * Calls POST /v1/t2a_v2 with model "speech-2.8-hd".
 * Returns a data:audio/mp3;base64,... data URL.
 */
export async function textToSpeech(
    text: string,
    apiKey: string,
    voiceId?: string,
): Promise<ToolResult> {
    const voice = voiceId || "English_expressive_narrator";

    try {
        const resp = await fetch(`${MINIMAX_BASE}/v1/t2a_v2`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "speech-2.8-hd",
                text,
                voice_setting: { voice_id: voice },
            }),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            return {
                type: "error",
                content: `TTS API error: ${resp.status} — ${errorText}`,
            };
        }

        const data = (await resp.json()) as { data?: { audio?: string } };
        const hex = data?.data?.audio;

        if (!hex) {
            return {
                type: "error",
                content: "TTS returned empty audio data",
            };
        }

        const base64 = Buffer.from(hex, "hex").toString("base64");
        return {
            type: "audio",
            content: `data:audio/mp3;base64,${base64}`,
        };
    } catch (err) {
        return {
            type: "error",
            content: `TTS failed: ${String(err)}`,
        };
    }
}

/**
 * Generate music from a prompt and optional lyrics.
 * Calls POST /v1/music_generation with model "music-2.6".
 * Returns a data:audio/mp3;base64,... data URL.
 */
export async function generateMusic(
    prompt: string,
    apiKey: string,
    lyrics?: string,
): Promise<ToolResult> {
    try {
        const payload: Record<string, unknown> = {
            model: "music-2.6",
            prompt,
        };
        if (lyrics) {
            payload.lyrics = lyrics;
        }

        const resp = await fetch(`${MINIMAX_BASE}/v1/music_generation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            return {
                type: "error",
                content: `Music generation API error: ${resp.status} — ${errorText}`,
            };
        }

        const data = (await resp.json()) as { data?: { audio?: string } };
        const hex = data?.data?.audio;

        if (!hex) {
            return {
                type: "error",
                content: "Music generation returned empty audio data",
            };
        }

        const base64 = Buffer.from(hex, "hex").toString("base64");
        return {
            type: "audio",
            content: `data:audio/mp3;base64,${base64}`,
        };
    } catch (err) {
        return {
            type: "error",
            content: `Music generation failed: ${String(err)}`,
        };
    }
}

// ── Web Search ───────────────────────────────────────────────────

async function webSearch(query: string, apiKey: string): Promise<ToolResult> {
    try {
        const resp = await fetch(`${MINIMAX_BASE}/v1/coding_plan/search`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: query }),
        });
        if (!resp.ok) {
            return { type: "error", content: `Search failed: HTTP ${resp.status}` };
        }
        const data = (await resp.json()) as {
            organic?: Array<{ title: string; link: string; snippet: string }>;
        };
        const results = data.organic ?? [];
        if (results.length === 0) {
            return { type: "text", content: "No search results found." };
        }
        const lines = results
            .slice(0, 5)
            .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`);
        return { type: "text", content: lines.join("\n\n") };
    } catch (err) {
        return { type: "error", content: `Search failed: ${String(err)}` };
    }
}

// ── Image Analysis (Vision) ───────────────────────────────────────

async function analyzeImage(imageUrl: string, apiKey: string): Promise<ToolResult> {
    try {
        const resp = await fetch(`${MINIMAX_BASE}/v1/coding_plan/vlm`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt: "Describe this image in detail.", image_url: imageUrl }),
        });
        if (!resp.ok) {
            return { type: "error", content: `Image analysis failed: HTTP ${resp.status}` };
        }
        const data = (await resp.json()) as {
            content?: string;
            base_resp?: { status_code: number; status_msg: string };
        };
        if (data.base_resp && data.base_resp.status_code !== 0) {
            return {
                type: "error",
                content: `Image analysis failed: ${data.base_resp.status_msg}`,
            };
        }
        return { type: "text", content: data.content ?? "No description returned." };
    } catch (err) {
        return { type: "error", content: `Image analysis failed: ${String(err)}` };
    }
}
