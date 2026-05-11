// HallucyGenie — Tool definitions and execution
// Implements generate_image, text_to_speech, generate_lyrics, generate_music

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

export interface GenerateImageOptions {
    prompt: string;
    aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3";
}

export interface TextToSpeechOptions {
    text: string;
    voice_id?: string;
    speed?: number;
    volume?: number;
    pitch?: number;
}

export interface GenerateLyricsOptions {
    prompt: string;
    mode?: "write_full_song" | "edit";
    lyrics?: string;
    title?: string;
}

export interface GenerateMusicOptions {
    prompt: string;
    lyrics?: string;
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
                    aspect_ratio: {
                        type: "string",
                        enum: ["1:1", "16:9", "9:16", "4:3"],
                        description: "Output aspect ratio. Defaults to 16:9 for Create UI.",
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
                    speed: {
                        type: "number",
                        minimum: 0.5,
                        maximum: 2,
                        description: "Speech speed multiplier. Defaults to 1.",
                    },
                    volume: {
                        type: "number",
                        minimum: 0,
                        maximum: 10,
                        description: "Speech volume. Defaults to MiniMax service default.",
                    },
                    pitch: {
                        type: "number",
                        minimum: -12,
                        maximum: 12,
                        description:
                            "Speech pitch adjustment. Defaults to MiniMax service default.",
                    },
                },
                required: ["text"],
            },
        },
        {
            name: "generate_lyrics",
            description:
                "Generate kid-friendly song lyrics from a music prompt. Returns plain text lyrics ready for editing or use in music generation.",
            input_schema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description:
                            "Description or topic for the lyrics (e.g., 'a happy birthday song', 'an adventure theme').",
                    },
                    mode: {
                        type: "string",
                        enum: ["write_full_song", "edit"],
                        description:
                            "Generation mode. Defaults to write_full_song unless existing lyrics are provided.",
                    },
                    lyrics: {
                        type: "string",
                        description: "Existing lyrics to edit or continue when mode is edit.",
                    },
                    title: {
                        type: "string",
                        description: "Optional song title to preserve in the generated output.",
                    },
                },
                required: ["prompt"],
            },
        },
        {
            name: "generate_music",
            description:
                "Generate music from a prompt. If lyrics are omitted or empty, the song is instrumental. Returns a base64-encoded MP3 audio data URL.",
            input_schema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Description of the music to generate",
                    },
                    lyrics: {
                        type: "string",
                        description: "Optional lyrics. Omit or leave empty for instrumental music.",
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
            return generateImage(
                {
                    prompt: args.prompt as string,
                    aspect_ratio: validateAspectRatio(args.aspect_ratio),
                },
                apiKey,
            );
        case "text_to_speech":
            return textToSpeech(
                {
                    text: args.text as string,
                    voice_id: args.voice_id as string | undefined,
                    speed: clampAudioParam(args.speed, 0.5, 2),
                    volume: clampAudioParam(args.volume, 0, 10),
                    pitch: clampAudioParam(args.pitch, -12, 12),
                },
                apiKey,
            );
        case "generate_lyrics":
            return generateLyrics(
                {
                    prompt: args.prompt as string,
                    mode: validateLyricsMode(args.mode),
                    lyrics: args.lyrics as string | undefined,
                    title: args.title as string | undefined,
                },
                apiKey,
            );
        case "generate_music":
            return generateMusic(
                {
                    prompt: args.prompt as string,
                    lyrics: args.lyrics as string | undefined,
                },
                apiKey,
            );
        case "web_search":
            return webSearch(args.query as string, apiKey);
        case "analyze_image":
            return analyzeImage(args.image_url as string, apiKey);
        default:
            return { type: "error", content: `Unknown tool: ${name}` };
    }
}

// ── Tool implementations ─────────────────────────────────────────────

function validateAspectRatio(value: unknown): GenerateImageOptions["aspect_ratio"] | undefined {
    return value === "1:1" || value === "16:9" || value === "9:16" || value === "4:3"
        ? value
        : undefined;
}

function clampAudioParam(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

function imageOptionsFromInput(input: string | GenerateImageOptions): GenerateImageOptions {
    return typeof input === "string" ? { prompt: input } : input;
}

function ttsOptionsFromInput(
    input: string | TextToSpeechOptions,
    voiceId?: string,
): TextToSpeechOptions {
    return typeof input === "string" ? { text: input, voice_id: voiceId } : input;
}

function musicOptionsFromInput(
    input: string | GenerateMusicOptions,
    lyrics?: string,
): GenerateMusicOptions {
    return typeof input === "string" ? { prompt: input, lyrics } : input;
}

function validateLyricsMode(value: unknown): GenerateLyricsOptions["mode"] | undefined {
    return value === "write_full_song" || value === "edit" ? value : undefined;
}

/**
 * Generate an image from a text prompt.
 * Calls POST /v1/image_generation with model "image-01".
 */
export async function generateImage(
    input: string | GenerateImageOptions,
    apiKey: string,
): Promise<ToolResult> {
    const options = imageOptionsFromInput(input);
    try {
        const payload: Record<string, unknown> = {
            model: "image-01",
            prompt: options.prompt,
        };
        const aspectRatio = validateAspectRatio(options.aspect_ratio);
        if (aspectRatio) payload.aspect_ratio = aspectRatio;

        const resp = await fetch(`${MINIMAX_BASE}/v1/image_generation`, {
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
    input: string | TextToSpeechOptions,
    apiKey: string,
    voiceId?: string,
): Promise<ToolResult> {
    const options = ttsOptionsFromInput(input, voiceId);
    const voice = options.voice_id || "English_expressive_narrator";

    try {
        const voiceSetting: Record<string, unknown> = { voice_id: voice };
        const speed = clampAudioParam(options.speed, 0.5, 2);
        const volume = clampAudioParam(options.volume, 0, 10);
        const pitch = clampAudioParam(options.pitch, -12, 12);
        if (speed !== undefined) voiceSetting.speed = speed;
        if (volume !== undefined) voiceSetting.vol = volume;
        if (pitch !== undefined) voiceSetting.pitch = pitch;

        const resp = await fetch(`${MINIMAX_BASE}/v1/t2a_v2`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "speech-2.8-hd",
                text: options.text,
                voice_setting: voiceSetting,
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
 * Generate kid-friendly song lyrics from a music prompt.
 * Calls POST /v1/lyrics_generation.
 * Returns plain text lyrics.
 */
export async function generateLyrics(
    input: string | GenerateLyricsOptions,
    apiKey: string,
): Promise<ToolResult> {
    const options = typeof input === "string" ? { prompt: input } : input;
    try {
        const existingLyrics = options.lyrics?.trim() ?? "";
        const mode = options.mode ?? (existingLyrics ? "edit" : "write_full_song");
        const payload: Record<string, unknown> = {
            mode,
            prompt: options.prompt,
        };
        if (existingLyrics) payload.lyrics = existingLyrics;
        if (options.title?.trim()) payload.title = options.title.trim();

        const resp = await fetch(`${MINIMAX_BASE}/v1/lyrics_generation`, {
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
                content: `Lyrics generation API error: ${resp.status} — ${errorText}`,
            };
        }

        const data = (await resp.json()) as {
            song_title?: string;
            style_tags?: string;
            lyrics?: string;
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (data.base_resp && data.base_resp.status_code !== 0) {
            return {
                type: "error",
                content: `Lyrics generation failed: ${data.base_resp.status_msg ?? "unknown error"}`,
            };
        }

        const lyrics = data.lyrics;
        if (!lyrics) {
            return { type: "error", content: "Lyrics generation returned no lyrics text" };
        }

        return { type: "text", content: lyrics };
    } catch (err) {
        return { type: "error", content: `Lyrics generation failed: ${String(err)}` };
    }
}

/**
 * Generate music from a prompt and optional lyrics.
 * Empty lyrics automatically request instrumental music.
 * Calls POST /v1/music_generation with model "music-2.6".
 * Returns a data:audio/mp3;base64,... data URL.
 */
export async function generateMusic(
    input: string | GenerateMusicOptions,
    apiKey: string,
    lyrics?: string,
): Promise<ToolResult> {
    const options = musicOptionsFromInput(input, lyrics);
    try {
        const lyricsText = options.lyrics?.trim() ?? "";
        const isInstrumental = lyricsText.length === 0;
        const payload: Record<string, unknown> = {
            model: "music-2.6",
            prompt: options.prompt,
            is_instrumental: isInstrumental,
        };
        if (!isInstrumental) {
            payload.lyrics = lyricsText;
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

        const data = (await resp.json()) as {
            data?: { audio?: string } | null;
            base_resp?: { status_code?: number; status_msg?: string };
        };
        if (data.base_resp && data.base_resp.status_code !== 0) {
            return {
                type: "error",
                content: `Music generation failed: ${data.base_resp.status_msg ?? "unknown error"}`,
            };
        }

        const hex = data.data?.audio;

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

export async function webSearch(query: string, apiKey: string): Promise<ToolResult> {
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

export async function analyzeImage(imageUrl: string, apiKey: string): Promise<ToolResult> {
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
        return { type: "text", content: data.content || "No description returned." };
    } catch (err) {
        return { type: "error", content: `Image analysis failed: ${String(err)}` };
    }
}
