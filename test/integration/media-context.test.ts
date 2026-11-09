import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it } from "node:test";
import { promisify } from "node:util";
import { createSession, getMessages, saveAsset, saveMessage } from "../../src/db.ts";
import { getDb, handleRequest, initDatabase, resetStateForTesting } from "../../src/server.ts";
import { MINIMAX_BASE } from "../../src/tools.ts";
const run = promisify(execFile);
const originalFetch = globalThis.fetch;
const originalKey = process.env.MINIMAX_API_KEY;
const originalCwd = process.cwd();
let root: string | undefined;
afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = originalKey;
    getDb()?.close();
    resetStateForTesting();
    process.chdir(originalCwd);
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
});
function stream(events: Array<[string, unknown]>): Response {
    return new Response(
        events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("")
    );
}
for (const kind of ["image", "audio", "video", "legacy_image", "foreign"] as const) {
    it(`actual chat dispatches ${kind} inspection with safe, scoped observation context`, async () => {
        root = await mkdtemp(join(tmpdir(), "genie-media-route-"));
        process.chdir(root);
        resetStateForTesting();
        initDatabase(":memory:");
        const db = getDb();
        assert.ok(db);
        process.env.MINIMAX_API_KEY = "stub-media-route-key";
        const session = createSession(db, "media-route-session", "Media route");
        const other = createSession(db, "media-other-session", "Other");
        saveMessage(db, session.id, "user", "Earlier request.");
        const mime = kind === "video" ? "video/mp4" : kind === "audio" ? "audio/wav" : "image/png";
        const filename = kind === "video"
            ? "clip.mp4"
            : kind === "audio"
            ? "voice.wav"
            : "image.png";
        const directory = join(root, "data/assets", kind === "foreign" ? other.id : session.id);
        await mkdir(directory, { recursive: true });
        const path = join(directory, filename);
        const inputs = kind === "video"
            ? [
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=160x120:r=10:d=1",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=160x120:r=10:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
                "-filter_complex",
                "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]",
                "-map",
                "[v]",
                "-map",
                "2:a",
                "-c:v",
                "libx264",
                "-c:a",
                "aac"
            ]
            : kind === "audio"
            ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "pcm_s16le"]
            : ["-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1", "-threads", "1"];
        await run("ffmpeg", ["-nostdin", "-v", "error", "-y", ...inputs, path]);
        const id = "asset_11111111-1111-1111-1111-111111111111";
        saveAsset(db, {
            id,
            session_id: kind === "foreign" ? other.id : session.id,
            type: kind === "video" ? "video" : kind === "audio" ? "audio" : "image",
            filename,
            mime_type: mime,
            prompt: "Source prompt is not observation evidence.",
            tool_name: "fixture",
            size_bytes: (await stat(path)).size
        });
        const speech = "The orange robot found seven blue stars.";
        let modelCalls = 0;
        let visualCalls = 0;
        let audioCalls = 0;
        let continuation = "";
        globalThis.fetch = async (url, init) => {
            const endpoint = String(url);
            assert.ok(endpoint.startsWith(MINIMAX_BASE));
            if (endpoint.endsWith("/speech_to_text")) {
                audioCalls++;
                assert.ok(init?.body instanceof FormData);
                const file = init.body.get("file");
                assert.ok(file instanceof File);
                assert.equal(Buffer.from(await file.arrayBuffer()).toString("ascii", 0, 4), "RIFF");
                return Response.json({
                    text: speech,
                    duration: 2,
                    n_speakers: 1,
                    segments: [{ start: 0, end: 1.5, speaker: "S1", text: speech }]
                });
            }
            const body = JSON.parse(String(init?.body));
            if (endpoint.endsWith("/vlm")) {
                visualCalls++;
                assert.match(body.image_url, /^data:image\/png;base64,/);
                return Response.json({ content: "A red square." });
            }
            assert.equal(endpoint, `${MINIMAX_BASE}/anthropic/v1/messages`);
            if (body.stream === false) {
                visualCalls++;
                assert.equal(body.messages[0].content[1].type, "video");
                assert.equal(body.messages[0].content[1].source.media_type, "video/mp4");
                return Response.json({
                    stop_reason: "end_turn",
                    content: [{ type: "text", text: "Red first, then blue." }]
                });
            }
            if (++modelCalls === 1) {
                assert.ok(
                    body.tools.some((tool: { name: string; }) => tool.name === "inspect_asset")
                );
                const name = kind === "legacy_image" ? "analyze_image" : "inspect_asset";
                const args = kind === "legacy_image"
                    ? { image_url: `/asset/${id}`, prompt: "Describe." }
                    : { asset_id: id, question: "What do you observe and what is said?" };
                return stream([["content_block_start", {
                    index: 0,
                    content_block: { type: "tool_use", id: "inspection-call", name }
                }], ["content_block_delta", {
                    index: 0,
                    delta: { type: "input_json_delta", partial_json: JSON.stringify(args) }
                }], ["message_delta", { delta: { stop_reason: "tool_use" } }]]);
            }
            assert.equal(modelCalls, 2);
            continuation = JSON.stringify(body.messages);
            return stream([["content_block_delta", {
                index: 0,
                delta: { type: "text_delta", text: "Observation received." }
            }], ["message_delta", { delta: { stop_reason: "end_turn" } }]]);
        };
        const response = await handleRequest(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Session-Id": session.id },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "Inspect the stored media." }]
                })
            })
        );
        const events = await response.text();
        assert.equal(modelCalls, 2);
        if (kind === "foreign") {
            assert.equal(visualCalls + audioCalls, 0);
            assert.ok(continuation.includes("Invalid asset for this session"));
        } else {
            assert.equal(audioCalls, kind === "audio" || kind === "video" ? 1 : 0);
            assert.equal(visualCalls, kind === "audio" ? 0 : 1);
            if (audioCalls) {
                assert.ok(continuation.includes(speech));
                assert.ok(events.includes(speech));
            }
            if (kind === "video") {
                assert.ok(continuation.includes("Red first, then blue."));
                assert.ok(events.includes("Red first, then blue."));
            }
            if (kind === "image" || kind === "legacy_image") {
                assert.ok(continuation.includes("A red square."));
            }
        }
        for (const text of [continuation, events, JSON.stringify(getMessages(db, session.id))]) {
            assert.equal(/data:(?:image|audio|video)\/|;base64,/i.test(text), false);
            assert.equal(text.includes(root), false);
        }
    });
}
