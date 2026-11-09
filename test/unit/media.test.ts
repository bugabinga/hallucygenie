import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs, {
    access,
    copyFile,
    mkdtemp,
    open,
    readdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { promisify } from "node:util";
import { inspectMediaFile } from "../../src/media.ts";
import { MINIMAX_BASE, MINIMAX_MODEL, type ToolResult } from "../../src/tools.ts";

const API_KEY = "mock-media-subscription-key";
const runFile = promisify(execFile);
const originalFetch = globalThis.fetch;
const originalTmpdir = process.env.TMPDIR;
let fixtures: string;
let png: string;
let wav: string;
let silentVideo: string;
let spokenVideo: string;
let longWav: string;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function visual(text = "Red first, then blue.", stop = "end_turn"): Response {
    return json({
        content: [{ type: "thinking", thinking: "Not returned." }, { type: "text", text }],
        stop_reason: stop
    });
}

function mockNetwork(
    handler: (url: string, init: RequestInit) => Response | Promise<Response>
): void {
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.ok(url.startsWith(MINIMAX_BASE));
        assert.equal(init?.method, "POST");
        assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${API_KEY}`);
        return handler(url, init);
    };
}

async function uploadDuration(init: RequestInit, expectedFrequency?: number): Promise<number> {
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("model"), "asr-1.0");
    assert.equal(init.body.get("response_format"), "verbose_json");
    const file = init.body.get("file");
    assert.ok(file instanceof File);
    assert.equal(file.name, "speech.wav");
    assert.equal(file.type, "audio/wav");
    assert.ok(file.size < 50_000_000);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.ok(bytes.toString("ascii", 0, 4) === "RIFF");
    let position = 12;
    while (position + 8 <= bytes.length) {
        const type = bytes.toString("ascii", position, position + 4);
        const size = bytes.readUInt32LE(position + 4);
        if (type === "fmt ") {
            assert.equal(bytes.readUInt16LE(position + 8), 1);
            assert.equal(bytes.readUInt16LE(position + 10), 1);
            assert.equal(bytes.readUInt32LE(position + 12), 16000);
            assert.equal(bytes.readUInt16LE(position + 22), 16);
        }
        if (type === "data") {
            if (expectedFrequency !== undefined) {
                let crossings = 0;
                for (let sample = 1; sample < 1600; sample++) {
                    const previous = bytes.readInt16LE(position + 8 + (sample - 1) * 2);
                    const current = bytes.readInt16LE(position + 8 + sample * 2);
                    if (previous <= 0 && current > 0) crossings++;
                }
                assert.ok(
                    Math.abs(crossings * 10 - expectedFrequency) < 20,
                    "Chunk must contain its own source interval."
                );
            }
            return size / 32000;
        }
        position += 8 + size + (size % 2);
    }
    throw new Error("Missing WAV samples.");
}

async function asr(
    init: RequestInit,
    text = "The orange robot found seven blue stars."
): Promise<Response> {
    const duration = await uploadDuration(init);
    return json({
        text,
        duration,
        n_speakers: 1,
        segments: [{ start: 0, end: duration, speaker: "S1", text }]
    });
}

async function scratchNames(): Promise<string[]> {
    return (await readdir(tmpdir())).filter((name) => name.startsWith("hallucygenie-media-"));
}

function assertSafe(result: ToolResult): void {
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(fixtures));
    assert.ok(!serialized.includes(API_KEY));
    assert.ok(!/data:|https?:\/\/|file:\/\/|base64/i.test(serialized));
    assert.ok(!result.urls);
    assert.ok(result.type === "text" || result.type === "error");
}

before(async () => {
    fixtures = await mkdtemp(join(tmpdir(), "hallucygenie-media-test-"));
    process.env.TMPDIR = fixtures;
    png = join(fixtures, "red.png");
    wav = join(fixtures, "voice ; $(not-a-command).wav");
    silentVideo = join(fixtures, "red-blue.mp4");
    spokenVideo = join(fixtures, "red-blue-audio.mp4");
    longWav = join(fixtures, "long.wav");
    const generate = async (args: string[]) => {
        await runFile("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { timeout: 60_000 });
    };
    await generate([
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=16x16",
        "-frames:v",
        "1",
        "-threads",
        "1",
        png
    ]);
    await generate([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=16000:duration=0.25",
        "-c:a",
        "pcm_s16le",
        wav
    ]);
    await generate([
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=16x16:r=2:d=1",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=16x16:r=2:d=1",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-threads",
        "1",
        silentVideo
    ]);
    await generate([
        "-i",
        silentVideo,
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=16000:duration=2",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        spokenVideo
    ]);
    await generate([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=16000:duration=480",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=16000:duration=480",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1320:sample_rate=16000:duration=1",
        "-filter_complex",
        "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
        "-map",
        "[a]",
        "-c:a",
        "pcm_s16le",
        longWav
    ]);
});

after(async () => {
    globalThis.fetch = originalFetch;
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
    if (fixtures) await rm(fixtures, { recursive: true, force: true });
});
beforeEach(() => {
    globalThis.fetch = async () => {
        throw new Error("Unexpected network request.");
    };
});
afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("stored media inspection", () => {
    it("sends stored images only through existing VLM transport and returns text only", async () => {
        let calls = 0;
        mockNetwork((url, init) => {
            calls++;
            assert.equal(url, `${MINIMAX_BASE}/v1/coding_plan/vlm`);
            const body = JSON.parse(String(init.body));
            assert.equal(body.prompt, "What color?");
            assert.ok(body.image_url.startsWith("data:image/png;base64,"));
            assert.ok(!String(init.body).includes(png));
            return json({ content: "A red square." });
        });
        const result = await inspectMediaFile(
            png,
            "image/png; charset=binary",
            "What color?",
            API_KEY
        );
        assert.equal(result.type, "text");
        assert.match(result.content, /Visual observation.*\nA red square\./);
        assert.equal(calls, 1);
        assertSafe(result);
    });

    it("decodes audio to mono16k WAV, preserves speech, timings and speakers, cleans scratch", async () => {
        const baseline = await scratchNames();
        let scratch: string[] = [];
        mockNetwork(async (url, init) => {
            assert.equal(url, `${MINIMAX_BASE}/v1/speech_to_text`);
            scratch = (await scratchNames()).filter((name) => !baseline.includes(name));
            assert.equal(scratch.length, 1);
            return asr(init);
        });
        const result = await inspectMediaFile(wav, "audio/wav", "What is said?", API_KEY);
        assert.equal(result.type, "text");
        assert.match(result.content, /Audio transcript/);
        assert.match(result.content, /not an analysis of music or non-speech sounds/);
        assert.match(result.content, /orange robot found seven blue stars/);
        assert.match(result.content, /\[0-0\.25s\] chunk 1 speaker S1/);
        for (const name of scratch) await assert.rejects(access(join(tmpdir(), name)));
        assertSafe(result);
    });

    it("inspects MP4 visuals natively without pretending to hear absent audio", async () => {
        let calls = 0;
        mockNetwork((url, init) => {
            calls++;
            assert.equal(url, `${MINIMAX_BASE}/anthropic/v1/messages`);
            const body = JSON.parse(String(init.body));
            assert.equal(body.model, MINIMAX_MODEL);
            assert.equal(body.stream, false);
            assert.equal(body.output_config.effort, "low");
            const content = body.messages[0].content;
            assert.equal(content[0].text, "What changes?");
            assert.equal(content[1].type, "video");
            assert.equal(content[1].source.type, "base64");
            assert.equal(content[1].source.media_type, "video/mp4");
            assert.equal(content[1].source.fps, 2);
            assert.ok(Buffer.from(content[1].source.data, "base64").length > 100);
            return visual();
        });
        const result = await inspectMediaFile(silentVideo, "video/mp4", "What changes?", API_KEY);
        assert.equal(result.type, "text");
        assert.match(result.content, /Visual observation \(no audio\)/);
        assert.match(result.content, /Red first, then blue/);
        assert.match(result.content, /no audio track/);
        assert.ok(!result.content.includes("Not returned."));
        assert.equal(calls, 1);
        assertSafe(result);
    });

    it("combines video visual observation with ASR from its extracted audio track", async () => {
        const endpoints: string[] = [];
        mockNetwork(async (url, init) => {
            endpoints.push(url);
            return url.endsWith("/messages") ? visual() : asr(init);
        });
        const result = await inspectMediaFile(
            spokenVideo,
            "video/mp4",
            "Describe speech and colors.",
            API_KEY
        );
        assert.equal(result.type, "text");
        assert.match(result.content, /Visual observation \(no audio\):\nRed first, then blue/);
        assert.match(result.content, /Audio transcript/);
        assert.match(result.content, /The orange robot found seven blue stars\./);
        assert.equal(endpoints.length, 2);
        assert.ok(endpoints[1].endsWith("/speech_to_text"));
        assertSafe(result);
    });

    it("chunks long speech without truncation, offsets later timestamps, keeps speakers chunk-local", async () => {
        const durations: number[] = [];
        mockNetwork(async (url, init) => {
            assert.ok(url.endsWith("/speech_to_text"));
            const duration = await uploadDuration(init, [440, 880, 1320][durations.length]);
            durations.push(duration);
            return json({
                text: `Sentence ${durations.length}.`,
                duration,
                n_speakers: 2,
                segments: [
                    { start: 0.25, end: 0.75, speaker: 1, text: `Sentence ${durations.length}.` }
                ]
            });
        });
        const result = await inspectMediaFile(longWav, "audio/wav", "Transcribe.", API_KEY);
        assert.equal(result.type, "text");
        assert.deepEqual(durations, [480, 480, 1]);
        assert.match(result.content, /\[480\.25-480\.75s\] chunk 2 speaker 1: Sentence 2/);
        assert.match(result.content, /\[960\.25-960\.75s\] chunk 3 speaker 1: Sentence 3/);
        assert.match(result.content, /Chunk 3 speakers: 2/);
        assertSafe(result);
    });

    it("does not extract an extra chunk at an exact 480-second boundary", async () => {
        const exact = join(fixtures, "exact.wav");
        await runFile("ffmpeg", [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            longWav,
            "-t",
            "480",
            "-c:a",
            "copy",
            exact
        ]);
        let calls = 0;
        mockNetwork(async (_url, init) => {
            calls++;
            return asr(init);
        });
        const result = await inspectMediaFile(exact, "audio/wav", "Transcribe.", API_KEY);
        assert.equal(result.type, "text");
        assert.equal(calls, 1);
    });

    it("normalizes ordinary standalone MP3 encoder delay rather than rejecting speech", async () => {
        const mp3 = join(fixtures, "encoder-delay.mp3");
        await runFile("ffmpeg", [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            wav,
            "-c:a",
            "libmp3lame",
            mp3
        ]);
        mockNetwork(async (_url, init) => asr(init));
        const result = await inspectMediaFile(mp3, "audio/mpeg", "Transcribe.", API_KEY);
        assert.equal(result.type, "text");
        assert.match(result.content, /orange robot/);
        assertSafe(result);
    });

    it("accepts valid no-speech ASR without claiming acoustic understanding", async () => {
        mockNetwork(async (_url, init) =>
            json({ text: "", duration: await uploadDuration(init), n_speakers: 0, segments: [] })
        );
        const result = await inspectMediaFile(wav, "audio/wav", "What sound?", API_KEY);
        assert.equal(result.type, "text");
        assert.match(result.content, /No speech recognized/);
        assert.match(result.content, /speech recognition only/);
    });

    it("keeps long valid output rather than imposing a reduced character cap", async () => {
        const description = "A red square appears. ".repeat(2000);
        mockNetwork(() => json({ content: description }));
        const result = await inspectMediaFile(png, "image/png", "Describe.", API_KEY);
        assert.equal(result.type, "text");
        assert.ok(result.content.endsWith(description));
    });

    for (const mode of ["http", "provider", "malformed", "exception", "empty"] as const) {
        it(`fails closed for image ${mode} errors without returning provider content`, async () => {
            mockNetwork(() => {
                if (mode === "http") {
                    return json({ error: `${png} data:image/png;base64,SECRET` }, 403);
                }
                if (mode === "provider") {
                    return json({
                        base_resp: { status_code: 1004, status_msg: `${png} ${API_KEY}` }
                    });
                }
                if (mode === "exception") {
                    throw new Error(`${png} ${API_KEY} data:image/png;base64,SECRET`);
                }
                if (mode === "malformed") return json({ content: 123 });
                return json({});
            });
            const result = await inspectMediaFile(png, "image/png", "Describe.", API_KEY);
            assert.equal(result.type, "error");
            assertSafe(result);
        });
    }

    for (
        const mode of [
            "http",
            "provider",
            "invalid_json",
            "missing_text",
            "bad_duration",
            "bad_segments",
            "reversed_time",
            "past_chunk",
            "bad_speaker"
        ] as const
    ) {
        it(`rejects ASR ${mode} without leaking or returning partial speech`, async () => {
            mockNetwork(async (_url, init) => {
                const duration = await uploadDuration(init);
                if (mode === "http") return json({ error: `${wav} ${API_KEY}` }, 429);
                if (mode === "provider") {
                    return json({
                        base_resp: { status_code: 1004, status_msg: `${wav} ${API_KEY}` }
                    });
                }
                if (mode === "invalid_json") return new Response("not json");
                const body: Record<string, unknown> = {
                    text: "Partial speech.",
                    duration,
                    segments: []
                };
                if (mode === "missing_text") delete body.text;
                if (mode === "bad_duration") body.duration = 800;
                if (mode === "bad_segments") body.segments = {};
                if (mode === "reversed_time") {
                    body.segments = [{ start: 0.2, end: 0.1, text: "bad" }];
                }
                if (mode === "past_chunk") body.segments = [{ start: 0, end: 9, text: "bad" }];
                if (mode === "bad_speaker") {
                    body.segments = [{ start: 0, end: 0.1, text: "bad", speaker: {} }];
                }
                return json(body);
            });
            const result = await inspectMediaFile(wav, "audio/wav", "Transcribe.", API_KEY);
            assert.equal(result.type, "error");
            assert.ok(!result.content.includes("Partial speech"));
            if (mode === "http") assert.equal(result.provider?.status_code, 429);
            assertSafe(result);
        });
    }

    for (const mode of ["http", "provider", "missing", "malformed", "truncated"] as const) {
        it(`rejects video visual ${mode} response`, async () => {
            mockNetwork(() => {
                if (mode === "http") return json({ error: `${silentVideo} ${API_KEY}` }, 500);
                if (mode === "provider") {
                    return json({ type: "error", error: { message: API_KEY } });
                }
                if (mode === "missing") return json({ stop_reason: "end_turn", content: [] });
                if (mode === "malformed") {
                    return json({ stop_reason: "end_turn", content: [{ type: "text", text: 1 }] });
                }
                return visual("Partial observation.", "max_tokens");
            });
            const result = await inspectMediaFile(silentVideo, "video/mp4", "Describe.", API_KEY);
            assert.equal(result.type, "error");
            assertSafe(result);
        });
    }

    it("cleans temp files after a later ASR chunk fails and discards partial success", async () => {
        const baseline = await scratchNames();
        let scratch: string[] = [];
        let calls = 0;
        mockNetwork(async (_url, init) => {
            calls++;
            scratch = (await scratchNames()).filter((name) => !baseline.includes(name));
            if (calls === 2) throw new Error(`${wav} ${API_KEY}`);
            return asr(init, "Partial transcript must not escape.");
        });
        const result = await inspectMediaFile(longWav, "audio/wav", "Transcribe.", API_KEY);
        assert.equal(result.type, "error");
        assert.equal(calls, 2);
        assert.ok(!result.content.includes("Partial transcript"));
        assert.equal(scratch.length, 1);
        for (const name of scratch) await assert.rejects(access(join(tmpdir(), name)));
        assertSafe(result);
    });

    for (
        const unsafe of [
            "data:image/png;base64,AAAA",
            "A".repeat(4096),
            API_KEY
        ]
    ) {
        it("rejects recognizable raw transport or sensitive content on every output route", async () => {
            mockNetwork(async (url, init) => {
                if (url.endsWith("/vlm")) return json({ content: unsafe });
                if (url.endsWith("/messages")) return visual(unsafe);
                return asr(init, unsafe);
            });
            for (
                const [path, mime] of [[png, "image/png"], [wav, "audio/wav"], [
                    silentVideo,
                    "video/mp4"
                ]]
            ) {
                const result = await inspectMediaFile(path, mime, "Inspect.", API_KEY);
                assert.equal(result.type, "error");
                assertSafe(result);
            }
        });
    }

    it("preserves URLs and path-like words actually observed in media", async () => {
        const observed = "Visit https://example.org and open /docs/mermaids.txt.";
        mockNetwork(async (url, init) =>
            url.endsWith("/messages") ? visual(observed) : asr(init, observed)
        );
        for (const [path, mime] of [[wav, "audio/wav"], [silentVideo, "video/mp4"]]) {
            const result = await inspectMediaFile(path, mime, "Inspect.", API_KEY);
            assert.equal(result.type, "text");
            assert.ok(result.content.includes(observed));
            assert.equal(result.content.includes(path), false);
        }
    });

    it("rejects unsupported, empty, absent, directory and oversized inputs before network", async () => {
        let calls = 0;
        mockNetwork(() => {
            calls++;
            return visual();
        });
        const empty = join(fixtures, "empty");
        await writeFile(empty, "");
        const largeVideo = join(fixtures, "large.mp4");
        const largeImage = join(fixtures, "large.png");
        for (
            const [path, size] of [[largeVideo, 45 * 1024 * 1024 + 1], [
                largeImage,
                20 * 1024 * 1024 + 1
            ]] as const
        ) {
            const file = await open(path, "w");
            try {
                await file.truncate(size);
            } finally {
                await file.close();
            }
        }
        for (
            const [path, mime, question, key] of [
                [png, "text/plain", "Inspect.", API_KEY],
                [png, "video/webm", "Inspect.", API_KEY],
                [empty, "audio/wav", "Inspect.", API_KEY],
                [join(fixtures, "missing"), "image/png", "Inspect.", API_KEY],
                [fixtures, "image/png", "Inspect.", API_KEY],
                [largeVideo, "video/mp4", "Inspect.", API_KEY],
                [largeImage, "image/png", "Inspect.", API_KEY],
                ["relative.wav", "audio/wav", "Inspect.", API_KEY],
                [wav, "audio/wav", " ", API_KEY],
                [wav, "audio/wav", "Inspect.", ""]
            ]
        ) {
            const result = await inspectMediaFile(path, mime, question, key);
            assert.equal(result.type, "error");
            assertSafe(result);
        }
        assert.equal(calls, 0);
    });

    it("rejects invalid containers, missing video tracks, external-reference playlists and corrupt media", async () => {
        let calls = 0;
        mockNetwork(() => {
            calls++;
            return visual();
        });
        const corrupt = join(fixtures, "corrupt.wav");
        const playlist = join(fixtures, "indirect.m3u8");
        const mov = join(fixtures, "quicktime.mov");
        await writeFile(corrupt, "not media; private diagnostics must not escape");
        await writeFile(
            playlist,
            "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttps://invalid.local/secret.ts\n#EXT-X-ENDLIST\n"
        );
        await runFile("ffmpeg", [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            silentVideo,
            "-c",
            "copy",
            mov
        ]);
        for (
            const [path, mime] of [[corrupt, "audio/wav"], [playlist, "audio/mpeg"], [
                wav,
                "video/mp4"
            ], [mov, "video/mp4"]]
        ) {
            const result = await inspectMediaFile(path, mime, "Inspect.", API_KEY);
            assert.equal(result.type, "error");
            assertSafe(result);
        }
        assert.equal(calls, 0);
    });

    it("rejects nonzero audio offsets instead of inventing audiovisual timing alignment", async () => {
        const delayed = join(fixtures, "delayed.mp4");
        await runFile("ffmpeg", [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            silentVideo,
            "-itsoffset",
            "0.5",
            "-i",
            wav,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            delayed
        ]);
        let asrCalls = 0;
        mockNetwork((url) => {
            if (url.endsWith("/speech_to_text")) asrCalls++;
            return visual();
        });
        const result = await inspectMediaFile(delayed, "video/mp4", "Inspect.", API_KEY);
        assert.equal(result.type, "error");
        assert.equal(asrCalls, 0);
        assert.match(result.content, /offset/);
        assertSafe(result);
    });

    it("returns a sanitized error when final directory cleanup fails", async () => {
        const realRm = fs.rm;
        let leftover: string | undefined;
        const replacement = mock.method(
            fs,
            "rm",
            async (path: Parameters<typeof fs.rm>[0], options: Parameters<typeof fs.rm>[1]) => {
                if (options?.recursive && String(path).includes("hallucygenie-media-")) {
                    leftover = String(path);
                    throw new Error(`${path} ${API_KEY}`);
                }
                return realRm(path, options);
            }
        );
        syncBuiltinESMExports();
        mockNetwork(async (_url, init) => asr(init));
        try {
            const result = await inspectMediaFile(wav, "audio/wav", "Inspect.", API_KEY);
            assert.equal(result.type, "error");
            assert.equal(result.provider?.stage, "cleanup");
            assertSafe(result);
            assert.ok(leftover);
        } finally {
            replacement.mock.restore();
            syncBuiltinESMExports();
            if (leftover) await realRm(leftover, { recursive: true, force: true });
        }
    });

    it("rejects a shortened extraction even when ASR could agree with its shorter duration", async () => {
        const baseline = await scratchNames();
        const truncated = join(fixtures, "truncated.flac");
        await runFile("ffmpeg", [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=16000:duration=10",
            "-c:a",
            "flac",
            truncated
        ]);
        const bytes = await readFile(truncated);
        await writeFile(truncated, bytes.subarray(0, Math.floor(bytes.length * 0.7)));
        const metadata = await runFile("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            truncated
        ]);
        assert.equal(Number(JSON.parse(metadata.stdout).format.duration), 10);
        let calls = 0;
        mockNetwork(async (_url, init) => {
            calls++;
            return asr(init);
        });
        const result = await inspectMediaFile(truncated, "audio/flac", "Inspect.", API_KEY);
        assert.equal(result.type, "error");
        assert.match(result.content, /extracted audio duration/);
        assert.equal(calls, 0);
        assert.deepEqual((await scratchNames()).filter((name) => !baseline.includes(name)), []);
        assertSafe(result);
    });

    it("does not invoke providers merely by importing module or copying stored files", async () => {
        let calls = 0;
        mockNetwork(() => {
            calls++;
            return visual();
        });
        await import("../../src/media.ts");
        await copyFile(wav, join(fixtures, "stored.wav"));
        assert.equal(calls, 0);
    });
});
