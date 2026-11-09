import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { analyzeImage, MINIMAX_BASE, MINIMAX_MODEL, type ToolResult } from "./tools.ts";

const runFile = promisify(execFile);
const IMAGE_MAX = 20 * 1024 * 1024;
// Raw MP4 limit: base64 expands this to 60 MiB before JSON overhead.
const VIDEO_MAX = 45 * 1024 * 1024;
const CHUNK_SECONDS = 480;
const ASR_MAX_BYTES = 50_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AUDIO_TYPES = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/x-flac",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/webm"
]);
const AUDIO_FORMATS = new Set([
    "mp3",
    "wav",
    "flac",
    "mov",
    "mp4",
    "aac",
    "ogg",
    "matroska",
    "webm"
]);

class InspectionError extends Error {
    readonly stage: string;
    readonly status?: number;

    constructor(stage: string, message: string, status?: number) {
        super(message);
        this.stage = stage;
        this.status = status;
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function seconds(value: unknown): number {
    if (typeof value !== "number" && typeof value !== "string") return NaN;
    if (value === "") return NaN;
    return Number(value);
}

async function probe(filePath: string): Promise<Record<string, unknown>> {
    const { stdout } = await runFile("ffprobe", [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mp3,wav,flac,mov,aac,ogg,matroska,webm",
        "-show_entries",
        "format=format_name,duration:stream=index,codec_type,duration,start_time",
        "-of",
        "json",
        filePath
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const data: unknown = JSON.parse(stdout);
    if (!record(data) || !record(data.format) || !Array.isArray(data.streams)) {
        throw new InspectionError("probe", "Invalid media metadata.");
    }
    return data;
}

async function providerJson(response: Response, stage: string): Promise<Record<string, unknown>> {
    if (!response.ok) {
        await response.body?.cancel();
        throw new InspectionError(stage, "Media provider request failed.", response.status);
    }
    const data: unknown = await response.json();
    if (!record(data)) throw new InspectionError(stage, "Malformed media provider response.");
    if (
        data.error || data.type === "error"
        || (record(data.base_resp) && data.base_resp.status_code !== 0)
    ) {
        throw new InspectionError(stage, "Media provider rejected inspection.");
    }
    return data;
}

async function observeVideo(filePath: string, question: string, apiKey: string): Promise<string> {
    const bytes = await readFile(filePath);
    if (bytes.length > VIDEO_MAX) throw new InspectionError("input", "Video exceeds 45 MiB limit.");
    // Reject QuickTime/other containers even when their demuxer also advertises MP4.
    if (bytes.toString("ascii", 4, 8) !== "ftyp" || bytes.toString("ascii", 8, 12) === "qt  ") {
        throw new InspectionError("input", "Only MP4 video inspection is supported.");
    }
    const response = await fetch(`${MINIMAX_BASE}/anthropic/v1/messages`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: MINIMAX_MODEL,
            stream: false,
            max_tokens: 4096,
            output_config: { effort: "low" },
            system:
                "Describe visual observations only. You cannot hear this video. Do not infer speech or sounds. Return observed text, never encoded media or private transport details.",
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: question },
                    {
                        type: "video",
                        source: {
                            type: "base64",
                            media_type: "video/mp4",
                            data: bytes.toString("base64"),
                            fps: 2
                        }
                    }
                ]
            }]
        })
    });
    const data = await providerJson(response, "visual");
    if (data.stop_reason !== "end_turn" || !Array.isArray(data.content)) {
        throw new InspectionError("visual", "Incomplete or malformed visual observation.");
    }
    const blocks = data.content.filter((block: unknown) => record(block) && block.type === "text");
    if (
        blocks.length === 0
        || blocks.some((block) => typeof block.text !== "string" || !block.text.trim())
    ) {
        throw new InspectionError("visual", "Missing visual observation.");
    }
    return blocks.map((block) => block.text).join("\n");
}

async function transcribe(
    filePath: string,
    stream: Record<string, unknown>,
    duration: number,
    directory: string,
    apiKey: string
): Promise<string> {
    const parts = [
        "Audio transcript (first audio track; speech recognition only; not an analysis of music or non-speech sounds).",
        "Times are seconds from media start; speaker labels are local to each chunk."
    ];
    for (let offset = 0; offset < duration; offset += CHUNK_SECONDS) {
        const length = Math.min(CHUNK_SECONDS, duration - offset);
        const chunk = join(directory, "speech.wav");
        try {
            await runFile("ffmpeg", [
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                "mp3,wav,flac,mov,aac,ogg,matroska,webm",
                "-ss",
                String(offset),
                "-i",
                filePath,
                "-t",
                String(length),
                "-map",
                `0:${stream.index}`,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                "-threads",
                "1",
                "-f",
                "wav",
                chunk
            ], { timeout: 300_000, maxBuffer: 1024 * 1024 });
            const size = (await stat(chunk)).size;
            if (size <= 44 || size > ASR_MAX_BYTES) {
                throw new InspectionError("audio", "Extracted audio exceeds ASR input limits.");
            }
            const metadata = await probe(chunk);
            const chunkDuration = seconds((metadata.format as Record<string, unknown>).duration);
            if (
                !Number.isFinite(chunkDuration) || chunkDuration <= 0
                || chunkDuration > CHUNK_SECONDS
                || Math.abs(chunkDuration - length) > 0.1
            ) {
                throw new InspectionError("audio", "Invalid extracted audio duration.");
            }
            const form = new FormData();
            form.set("model", "asr-1.0");
            form.set("response_format", "verbose_json");
            form.set(
                "file",
                new Blob([await readFile(chunk)], { type: "audio/wav" }),
                "speech.wav"
            );
            const response = await fetch(`${MINIMAX_BASE}/v1/speech_to_text`, {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(120_000),
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form
            });
            const data = await providerJson(response, "asr");
            // Allow 100ms of provider timestamp rounding, never silently accept missing chunks.
            const reportedDuration = seconds(data.duration);
            if (
                typeof data.text !== "string" || !Number.isFinite(reportedDuration)
                || Math.abs(reportedDuration - chunkDuration) > 0.1
                || (data.segments !== undefined && !Array.isArray(data.segments))
                || (data.n_speakers !== undefined
                    && (!Number.isInteger(data.n_speakers) || Number(data.n_speakers) < 0))
            ) {
                throw new InspectionError("asr", "Malformed speech recognition response.");
            }
            const chunkNumber = offset / CHUNK_SECONDS + 1;
            parts.push(
                `Chunk ${chunkNumber} [${offset}-${offset + chunkDuration}s]: ${
                    data.text.trim() || "No speech recognized."
                }`
            );
            if (data.n_speakers !== undefined) {
                parts.push(`Chunk ${chunkNumber} speakers: ${data.n_speakers}`);
            }
            let previousStart = 0;
            for (const segment of (data.segments ?? []) as unknown[]) {
                if (!record(segment)) throw new InspectionError("asr", "Malformed speech segment.");
                const start = seconds(segment.start);
                const end = seconds(segment.end);
                if (
                    !Number.isFinite(start) || !Number.isFinite(end) || start < previousStart
                    || start < 0 || end < start || end > chunkDuration + 0.1
                    || typeof segment.text !== "string"
                    || (segment.speaker !== undefined && typeof segment.speaker !== "string"
                        && typeof segment.speaker !== "number")
                    || (typeof segment.speaker === "number" && !Number.isFinite(segment.speaker))
                ) {
                    throw new InspectionError("asr", "Malformed speech segment.");
                }
                previousStart = start;
                const speaker = segment.speaker === undefined ? "" : ` speaker ${segment.speaker}`;
                parts.push(
                    `[${offset + start}-${
                        offset + end
                    }s] chunk ${chunkNumber}${speaker}: ${segment.text}`
                );
            }
        } finally {
            await rm(chunk, { force: true });
        }
    }
    return parts.join("\n");
}

// Fail closed rather than returning recognizable transport data or redacting evidence.
// This is not a general detector for arbitrary encodings inside natural-language text.
function safeOutput(content: string, filePath: string, apiKey: string): string {
    if (
        content.includes(filePath) || content.includes(apiKey)
        || /\bdata:(?:image|audio|video)\//i.test(content)
        || /[A-Za-z0-9+/]{4096,}={0,2}/.test(content)
    ) {
        throw new InspectionError("output", "Provider returned unsafe inspection content.");
    }
    return content;
}

/** Trusted local path boundary: caller resolves asset identity and ownership before invocation. */
export async function inspectMediaFile(
    filePath: string,
    mimeType: string,
    question: string,
    apiKey: string
): Promise<ToolResult> {
    let directory: string | undefined;
    let stage = "input";
    let result: ToolResult;
    try {
        if (!isAbsolute(filePath) || !question.trim() || !apiKey.trim()) {
            throw new InspectionError(
                "input",
                "Inspection requires an absolute file path, question, and API key."
            );
        }
        const mime = mimeType.split(";")[0].trim().toLowerCase();
        const image = IMAGE_TYPES.has(mime);
        const video = mime === "video/mp4";
        if (!image && !video && !AUDIO_TYPES.has(mime)) {
            throw new InspectionError("input", "Unsupported media type.");
        }
        const file = await stat(filePath);
        if (!file.isFile() || file.size === 0) {
            throw new InspectionError("input", "Media must be a nonempty regular file.");
        }
        if ((image && file.size > IMAGE_MAX) || (video && file.size > VIDEO_MAX)) {
            throw new InspectionError(
                "input",
                image ? "Image exceeds 20 MiB limit." : "Video exceeds 45 MiB limit."
            );
        }
        if (image) {
            stage = "image";
            const bytes = await readFile(filePath);
            if (bytes.length > IMAGE_MAX) {
                throw new InspectionError("input", "Image exceeds 20 MiB limit.");
            }
            const imageResult = await analyzeImage({
                image_url: `data:${mime};base64,${bytes.toString("base64")}`,
                allow_data_url: true,
                prompt: question
            }, apiKey);
            if (
                imageResult.type !== "text" || typeof imageResult.content !== "string"
                || !imageResult.content.trim()
                || imageResult.content === "No description returned."
            ) {
                throw new InspectionError(
                    "image",
                    "Image inspection failed or returned no description."
                );
            }
            result = {
                type: "text",
                content: safeOutput(`Visual observation:\n${imageResult.content}`, filePath, apiKey)
            };
        } else {
            stage = "probe";
            const metadata = await probe(filePath);
            const format = metadata.format as Record<string, unknown>;
            const formats = String(format.format_name).split(",");
            const streams = (metadata.streams as unknown[]).filter(record);
            const audio = streams.find((stream) => stream.codec_type === "audio");
            if (
                (video
                    && (!formats.includes("mp4")
                        || !streams.some((stream) => stream.codec_type === "video")))
                || (!video && (!formats.some((name) => AUDIO_FORMATS.has(name)) || !audio))
            ) {
                throw new InspectionError(
                    "input",
                    "Unsupported media container or missing required track."
                );
            }
            const observations: string[] = [];
            if (video) {
                stage = "visual";
                observations.push(
                    `Visual observation (no audio):\n${await observeVideo(
                        filePath,
                        question,
                        apiKey
                    )}`
                );
            }
            if (audio) {
                if (!Number.isInteger(audio.index) || Number(audio.index) < 0) {
                    throw new InspectionError("probe", "Invalid audio track.");
                }
                const origin = seconds(audio.start_time ?? 0);
                if (video && (!Number.isFinite(origin) || Math.abs(origin) > 0.05)) {
                    throw new InspectionError(
                        "audio",
                        "Video audio with a nonzero start offset is not supported."
                    );
                }
                const duration = seconds(audio.duration ?? format.duration);
                if (!Number.isFinite(duration) || duration <= 0) {
                    throw new InspectionError("probe", "Invalid audio duration.");
                }
                stage = "audio";
                directory = await mkdtemp(join(tmpdir(), "hallucygenie-media-"));
                observations.push(await transcribe(filePath, audio, duration, directory, apiKey));
            } else {
                observations.push("Audio transcript: no audio track present.");
            }
            result = {
                type: "text",
                content: safeOutput(observations.join("\n\n"), filePath, apiKey)
            };
        }
    } catch (error) {
        const known = error instanceof InspectionError;
        result = {
            type: "error",
            content: known ? error.message : "Media inspection failed.",
            provider: {
                stage: known ? error.stage : stage,
                ...(known && error.status !== undefined ? { status_code: error.status } : {})
            }
        };
    } finally {
        if (directory) {
            try {
                await rm(directory, { recursive: true, force: true });
            } catch {
                result = {
                    type: "error",
                    content: "Media scratch cleanup failed.",
                    provider: { stage: "cleanup" }
                };
            }
        }
    }
    return result;
}
