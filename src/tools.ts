// HallucyGenie — Tool definitions and execution
// Implements generate_image, text_to_speech, generate_lyrics, generate_music, analyze_image

// ── Types ────────────────────────────────────────────────────────────

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

export interface ToolResult {
    type: "image" | "audio" | "text" | "error";
    content: string;
    urls?: string[];
}

export interface GenerateImageOptions {
    prompt: string;
    aspect_ratio?: "1:1" | "16:9" | "4:3" | "3:2" | "2:3" | "3:4" | "9:16" | "21:9";
    n?: number;
    seed?: number;
    width?: number;
    height?: number;
    prompt_optimizer?: boolean;
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

export interface GenerateMusicCoverOptions {
    prompt: string;
    lyrics: string;
    cover_feature_id: string;
}

export interface MusicCoverPreprocessOptions {
    audio_url?: string;
    audio_base64?: string;
}

export interface MusicCoverPreprocessResult {
    cover_feature_id: string;
    lyrics: string;
}

export interface AnalyzeImageOptions {
    image_url: string;
    prompt?: string;
    allow_data_url?: boolean;
}

// ── Configuration ────────────────────────────────────────────────────

export const MINIMAX_BASE = "https://api.minimax.io";

const IMAGE_PROMPT_MAX = 1500;
const TTS_TEXT_MAX = 10000;
const LYRICS_PROMPT_MAX = 2000;
const LYRICS_EXISTING_MAX = 3500;
const MUSIC_PROMPT_MAX = 2000;
const MUSIC_LYRICS_MAX = 3500;
const MUSIC_COVER_PROMPT_MIN = 10;
const MUSIC_COVER_PROMPT_MAX = 300;
const MUSIC_COVER_LYRICS_MIN = 10;
const MUSIC_COVER_LYRICS_MAX = 1000;

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
                        maxLength: IMAGE_PROMPT_MAX,
                        description: "Text description of the image to generate",
                    },
                    aspect_ratio: {
                        type: "string",
                        enum: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
                        description: "Output aspect ratio. Defaults to 16:9 for Create UI.",
                    },
                    n: { type: "number", minimum: 1, maximum: 9 },
                    seed: { type: "number" },
                    width: { type: "number", minimum: 512, maximum: 2048 },
                    height: { type: "number", minimum: 512, maximum: 2048 },
                    prompt_optimizer: { type: "boolean" },
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
                        maxLength: TTS_TEXT_MAX,
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
                        exclusiveMinimum: 0,
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
                        maxLength: LYRICS_PROMPT_MAX,
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
                        maxLength: LYRICS_EXISTING_MAX,
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
                        maxLength: MUSIC_PROMPT_MAX,
                        description: "Description of the music to generate",
                    },
                    lyrics: {
                        type: "string",
                        maxLength: MUSIC_LYRICS_MAX,
                        description: "Optional lyrics. Omit or leave empty for instrumental music.",
                    },
                },
                required: ["prompt"],
            },
        },
        {
            name: "analyze_image",
            description:
                "Analyze an HTTPS image URL and answer a prompt about what is visible. Returns text only.",
            input_schema: {
                type: "object",
                properties: {
                    image_url: {
                        type: "string",
                        description: "HTTPS URL of a JPG, PNG, or WebP image to analyze.",
                    },
                    prompt: {
                        type: "string",
                        description:
                            "Question or instruction about the image. Defaults to a concise description.",
                    },
                },
                required: ["image_url"],
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
                    n: args.n as number | undefined,
                    seed: args.seed as number | undefined,
                    width: args.width as number | undefined,
                    height: args.height as number | undefined,
                    prompt_optimizer: args.prompt_optimizer as boolean | undefined,
                },
                apiKey,
            );
        case "text_to_speech":
            return textToSpeech(
                {
                    text: args.text as string,
                    voice_id: args.voice_id as string | undefined,
                    speed: clampAudioParam(args.speed, 0.5, 2),
                    volume: validateVolume(args.volume),
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
        case "generate_music_cover":
            return generateMusicCover(
                {
                    prompt: args.prompt as string,
                    lyrics: args.lyrics as string,
                    cover_feature_id: args.cover_feature_id as string,
                },
                apiKey,
            );
        case "analyze_image":
            return analyzeImage(
                {
                    image_url: args.image_url as string,
                    prompt: args.prompt as string | undefined,
                    allow_data_url: args.allow_data_url === true,
                },
                apiKey,
            );
        case "web_search":
            return webSearch(args.query as string, apiKey);

        default:
            return { type: "error", content: `Unknown tool: ${name}` };
    }
}

// ── Tool implementations ─────────────────────────────────────────────

function validateAspectRatio(value: unknown): GenerateImageOptions["aspect_ratio"] | undefined {
    return value === "1:1" ||
        value === "16:9" ||
        value === "4:3" ||
        value === "3:2" ||
        value === "2:3" ||
        value === "3:4" ||
        value === "9:16" ||
        value === "21:9"
        ? value
        : undefined;
}

function clampIntegerParam(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

function clampAudioParam(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

function validateVolume(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    if (value <= 0) return undefined;
    return Math.min(10, value);
}

function baseRespError(
    data: { base_resp?: { status_code?: number; status_msg?: string } },
    label: string,
): ToolResult | null {
    if (!data.base_resp || data.base_resp.status_code === 0) return null;
    return {
        type: "error",
        content: `${label} failed: ${data.base_resp.status_msg ?? "unknown error"}`,
    };
}

function isObject(val: unknown): val is Record<string, unknown> {
    return typeof val === "object" && val !== null && !Array.isArray(val);
}

function validateLyricsMode(value: unknown): GenerateLyricsOptions["mode"] | undefined {
    return value === "write_full_song" || value === "edit" ? value : undefined;
}

function boundedText(value: unknown, label: string, maxLength: number): string {
    if (typeof value !== "string") throw new Error(`${label} required`);
    const text = value.trim();
    if (!text) throw new Error(`${label} required`);
    if (text.length > maxLength) throw new Error(`${label} too long`);
    return text;
}

function optionalBoundedText(value: unknown, label: string, maxLength: number): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new Error(`${label} must be text`);
    const text = value.trim();
    if (!text) return undefined;
    if (text.length > maxLength) throw new Error(`${label} too long`);
    return text;
}

function boundedTextRange(value: unknown, label: string, minLength: number, maxLength: number): string {
    const text = boundedText(value, label, maxLength);
    if (text.length < minLength) throw new Error(`${label} too short`);
    return text;
}

/**
 * Generate an image from a text prompt.
 * Calls POST /v1/image_generation with model "image-01".
 */
export async function generateImage(
    input: string | GenerateImageOptions,
    apiKey: string,
): Promise<ToolResult> {
    const options = (isObject(input) ? input : { prompt: input }) as GenerateImageOptions;
    try {
        const prompt = boundedText(options.prompt, "image prompt", IMAGE_PROMPT_MAX);
        const payload: Record<string, unknown> = {
            model: "image-01",
            prompt,
            response_format: "url",
        };
        const aspectRatio = validateAspectRatio(options.aspect_ratio);
        if (aspectRatio) payload.aspect_ratio = aspectRatio;
        const n = clampIntegerParam(options.n, 1, 9);
        if (n !== undefined) payload.n = n;
        if (typeof options.seed === "number" && Number.isInteger(options.seed))
            payload.seed = options.seed;
        const width = clampIntegerParam(options.width, 512, 2048);
        const height = clampIntegerParam(options.height, 512, 2048);
        if (width !== undefined && height !== undefined) {
            payload.width = width - (width % 8);
            payload.height = height - (height % 8);
        }
        if (typeof options.prompt_optimizer === "boolean")
            payload.prompt_optimizer = options.prompt_optimizer;

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
            base_resp?: { status_code?: number; status_msg?: string };
        };
        const baseResp = baseRespError(data, "Image generation");
        if (baseResp) return baseResp;

        const urls = data?.data?.image_urls;
        if (!urls || urls.length === 0) {
            return {
                type: "error",
                content: "Image generation returned no image URLs",
            };
        }

        return urls.length === 1
            ? { type: "image", content: urls[0] }
            : { type: "image", content: urls[0], urls };
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
    const options = (
        isObject(input) ? input : { text: input, voice_id: voiceId }
    ) as TextToSpeechOptions;
    const voice = options.voice_id || "English_expressive_narrator";

    try {
        const text = boundedText(options.text, "speech text", TTS_TEXT_MAX);
        const voiceSetting: Record<string, unknown> = { voice_id: voice };
        const speed = clampAudioParam(options.speed, 0.5, 2);
        const volume = validateVolume(options.volume);
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
                text,
                output_format: "hex",
                voice_setting: voiceSetting,
                audio_setting: { format: "mp3" },
            }),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            return {
                type: "error",
                content: `TTS API error: ${resp.status} — ${errorText}`,
            };
        }

        const data = (await resp.json()) as {
            data?: { audio?: string };
            base_resp?: { status_code?: number; status_msg?: string };
        };
        const baseResp = baseRespError(data, "TTS");
        if (baseResp) return baseResp;

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
export async function generateMusicCover(
    input: GenerateMusicCoverOptions,
    apiKey: string,
): Promise<ToolResult> {
    try {
        const prompt = boundedTextRange(
            input.prompt,
            "music cover prompt",
            MUSIC_COVER_PROMPT_MIN,
            MUSIC_COVER_PROMPT_MAX,
        );
        const lyrics = boundedTextRange(
            input.lyrics,
            "music cover lyrics",
            MUSIC_COVER_LYRICS_MIN,
            MUSIC_COVER_LYRICS_MAX,
        );
        const resp = await fetch(`${MINIMAX_BASE}/v1/music_generation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "music-cover",
                prompt,
                lyrics,
                cover_feature_id: input.cover_feature_id,
                output_format: "hex",
                audio_setting: { format: "mp3" },
            }),
        });
        if (!resp.ok) return { type: "error", content: `Music cover API error: ${resp.status}` };
        const data = (await resp.json()) as {
            data?: { audio?: string };
            base_resp?: { status_code?: number; status_msg?: string };
        };
        const baseResp = baseRespError(data, "Music cover");
        if (baseResp) return baseResp;
        const audioHex = data.data?.audio;
        if (!audioHex) return { type: "error", content: "Music cover returned no audio" };
        const audioBase64 = Buffer.from(audioHex, "hex").toString("base64");
        return { type: "audio", content: `data:audio/mp3;base64,${audioBase64}` };
    } catch (err) {
        return { type: "error", content: `Music cover failed: ${String(err)}` };
    }
}

export async function musicCoverPreprocess(
    input: MusicCoverPreprocessOptions,
    apiKey: string,
): Promise<MusicCoverPreprocessResult> {
    if (!input.audio_url && !input.audio_base64) throw new Error("cover source required");
    if (input.audio_url && input.audio_base64)
        throw new Error("audio_url and audio_base64 are mutually exclusive");
    const payload: Record<string, unknown> = { model: "music-cover" };
    if (input.audio_url) payload.audio_url = input.audio_url;
    if (input.audio_base64) payload.audio_base64 = input.audio_base64;
    const resp = await fetch(`${MINIMAX_BASE}/v1/music_cover_preprocess`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`music cover preprocess API error: ${resp.status}`);
    const data = (await resp.json()) as {
        cover_feature_id?: string;
        lyrics?: string;
        formatted_lyrics?: string;
        data?: { cover_feature_id?: string; lyrics?: string; formatted_lyrics?: string };
        base_resp?: { status_code?: number; status_msg?: string };
    };
    const baseResp = baseRespError(data, "Music cover preprocess");
    if (baseResp) throw new Error(baseResp.content);
    const body = data.data ?? data;
    const coverFeatureId = body.cover_feature_id;
    if (!coverFeatureId) throw new Error("music cover preprocess returned no cover_feature_id");
    return {
        cover_feature_id: coverFeatureId,
        lyrics: body.formatted_lyrics ?? body.lyrics ?? "",
    };
}

export async function generateLyrics(
    input: string | GenerateLyricsOptions,
    apiKey: string,
): Promise<ToolResult> {
    const options = typeof input === "string" ? { prompt: input } : input;
    try {
        const prompt = boundedText(options.prompt, "lyrics prompt", LYRICS_PROMPT_MAX);
        const existingLyrics = optionalBoundedText(
            options.lyrics,
            "existing lyrics",
            LYRICS_EXISTING_MAX,
        );
        const mode = options.mode ?? (existingLyrics ? "edit" : "write_full_song");
        const payload: Record<string, unknown> = {
            mode,
            prompt,
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
        const baseResp = baseRespError(data, "Lyrics generation");
        if (baseResp) return baseResp;

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
    const options = (isObject(input) ? input : { prompt: input, lyrics }) as GenerateMusicOptions;
    try {
        const prompt = boundedText(options.prompt, "music prompt", MUSIC_PROMPT_MAX);
        const lyricsText = optionalBoundedText(options.lyrics, "music lyrics", MUSIC_LYRICS_MAX) ?? "";
        const isInstrumental = lyricsText.length === 0;
        const payload: Record<string, unknown> = {
            model: "music-2.6",
            prompt,
            is_instrumental: isInstrumental,
            output_format: "hex",
            audio_setting: { format: "mp3" },
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
        const baseResp = baseRespError(data, "Music generation");
        if (baseResp) return baseResp;

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

const YOUTUBE_OEMBED_LIMIT = 2;

type SearchResult = { title: string; link: string; snippet: string };
type RawSearchResult = { title?: string; link?: string; url?: string; snippet?: string };
type SearchResponse = { organic?: RawSearchResult[]; data?: { results?: RawSearchResult[] } };
type YouTubeMetadata = {
    source: string;
    title: string;
    authorName: string;
    thumbnailUrl: string;
};

function youtubeVideoRef(raw: string): { id: string; source: string } | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
        const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, source: raw } : null;
    }
    if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") {
        return null;
    }
    const watchId = url.searchParams.get("v") ?? "";
    if (/^[A-Za-z0-9_-]{11}$/.test(watchId)) return { id: watchId, source: raw };
    const parts = url.pathname.split("/").filter(Boolean);
    if (
        (parts[0] === "shorts" || parts[0] === "embed") &&
        /^[A-Za-z0-9_-]{11}$/.test(parts[1] ?? "")
    ) {
        return { id: parts[1]!, source: raw };
    }
    return null;
}

function youtubeRefsFromText(text: string): Array<{ id: string; source: string }> {
    return [...text.matchAll(/https?:\/\/[^\s<>)"]+/g)]
        .map((match) => match[0]!.replace(/[.,!?;:]+$/g, ""))
        .map(youtubeVideoRef)
        .filter((ref): ref is { id: string; source: string } => ref !== null);
}

function youtubeUrls(query: string, results: SearchResult[]): string[] {
    const refs = [
        ...youtubeRefsFromText(query),
        ...results.flatMap((result) => youtubeRefsFromText(result.link)),
    ];
    const sourcesById = new Map<string, string>();
    for (const ref of refs) {
        if (!sourcesById.has(ref.id)) sourcesById.set(ref.id, ref.source);
    }
    return [...sourcesById.values()].slice(0, YOUTUBE_OEMBED_LIMIT);
}

async function fetchYouTubeMetadata(source: string): Promise<YouTubeMetadata | null> {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", source);
    url.searchParams.set("format", "json");
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
    };
    if (!data.title || !data.author_name || !data.thumbnail_url) return null;
    return {
        source,
        title: data.title,
        authorName: data.author_name,
        thumbnailUrl: data.thumbnail_url,
    };
}

function formatYouTubeMetadata(items: YouTubeMetadata[]): string {
    return items
        .map(
            (item) =>
                `YouTube metadata:\n   Title: ${item.title}\n   Author: ${item.authorName}\n   Thumbnail: ${item.thumbnailUrl}\n   Source: ${item.source}`,
        )
        .join("\n\n");
}

function normalizeSearchResults(data: SearchResponse): SearchResult[] {
    return (data.organic ?? data.data?.results ?? [])
        .map((item) => ({
            title: item.title ?? "Untitled",
            link: item.link ?? item.url ?? "",
            snippet: item.snippet ?? "",
        }))
        .filter((item) => item.link);
}

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
        const data = (await resp.json()) as SearchResponse;
        const results = normalizeSearchResults(data).slice(0, 5);
        const metadata = (
            await Promise.all(youtubeUrls(query, results).map((url) => fetchYouTubeMetadata(url)))
        ).filter((item): item is YouTubeMetadata => item !== null);
        const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`);
        if (metadata.length > 0) lines.push(formatYouTubeMetadata(metadata));
        if (lines.length === 0) {
            return { type: "text", content: "No search results found." };
        }
        return { type: "text", content: lines.join("\n\n") };
    } catch (err) {
        return { type: "error", content: `Search failed: ${String(err)}` };
    }
}

// ── Image Analysis (Vision) ───────────────────────────────────────

const MAX_ANALYZE_IMAGE_BYTES = 20 * 1024 * 1024;

function vlmMime(contentType: string): "jpeg" | "png" | "webp" | "gif" {
    const mime = contentType.split(";")[0]!.trim().toLowerCase();
    if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    throw new Error(`unsupported image type: ${mime || "unknown"}`);
}

async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("image URL must be http(s)");
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`image download failed: HTTP ${resp.status}`);
    const mime = vlmMime(resp.headers.get("Content-Type") ?? "");
    const contentLength = Number(resp.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_ANALYZE_IMAGE_BYTES) throw new Error("image too large");
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength > MAX_ANALYZE_IMAGE_BYTES) throw new Error("image too large");
    return `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function validateAnalyzeDataUrl(value: string): string {
    const match = value.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("unsupported image data URL");
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.byteLength > MAX_ANALYZE_IMAGE_BYTES) throw new Error("image too large");
    return value;
}

export async function analyzeImage(
    input: string | AnalyzeImageOptions,
    apiKey: string,
): Promise<ToolResult> {
    const options = typeof input === "string" ? { image_url: input } : input;
    try {
        if (/^data:/i.test(options.image_url) && !options.allow_data_url)
            throw new Error("image data URLs are not allowed");
        const dataUrl = /^data:/i.test(options.image_url)
            ? validateAnalyzeDataUrl(options.image_url)
            : await imageUrlToDataUrl(options.image_url);
        const resp = await fetch(`${MINIMAX_BASE}/v1/coding_plan/vlm`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: options.prompt?.trim() || "Describe this image in detail.",
                image_url: dataUrl,
            }),
        });
        if (!resp.ok) {
            return { type: "error", content: `Image analysis failed: HTTP ${resp.status}` };
        }
        const data = (await resp.json()) as {
            content?: string;
            choices?: { message?: { content?: string } }[];
            base_resp?: { status_code: number; status_msg: string };
        };
        if (data.base_resp && data.base_resp.status_code !== 0) {
            return {
                type: "error",
                content: `Image analysis failed: ${data.base_resp.status_msg}`,
            };
        }
        const content = data.content ?? data.choices?.[0]?.message?.content ?? "";
        return { type: "text", content: content || "No description returned." };
    } catch (err) {
        return { type: "error", content: `Image analysis failed: ${String(err)}` };
    }
}
