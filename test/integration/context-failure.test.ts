import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { createSession, getMessages, saveMessage } from "../../src/db.ts";
import { getDb, handleRequest, initDatabase, resetStateForTesting } from "../../src/server.ts";
import { MINIMAX_BASE } from "../../src/tools.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.MINIMAX_API_KEY;
afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = originalKey;
    getDb()?.close();
    resetStateForTesting();
});
function stream(events: Array<[string, unknown]>): Response {
    return new Response(
        events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join("")
    );
}
function request(content: string): Request {
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": "fault-session" },
        body: JSON.stringify({ messages: [{ role: "user", content }] })
    });
}
for (const failure of ["stream", "connection", "http", "empty"] as const) {
    it(`retains visible lyrics, mixed prose and reasoning after ${failure} continuation failure`, async () => {
        resetStateForTesting();
        initDatabase(":memory:");
        const db = getDb();
        assert.ok(db);
        process.env.MINIMAX_API_KEY = "stub-only-context-key";
        createSession(db, "fault-session", "Fault test");
        saveMessage(db, "fault-session", "user", "Earlier committed request.");
        const lyrics = Array.from({ length: 150 }, () => "Arielle rappt mit dem Muschel-Mikrofon!")
            .join("\n");
        let turns = 0;
        globalThis.fetch = async (url, init) => {
            assert.equal(String(url), `${MINIMAX_BASE}/anthropic/v1/messages`);
            const body = JSON.parse(String(init?.body));
            if (body.stream !== true) {
                assert.ok(
                    getMessages(db, "fault-session").some(row =>
                        row.tool_calls_json?.includes("German mermaid rap")
                    ),
                    "call persisted before provider execution"
                );
                return Response.json({ content: [{ type: "text", text: lyrics }] });
            }
            if (++turns === 1) {
                return stream([
                    ["content_block_delta", {
                        index: 0,
                        delta: { type: "thinking_delta", thinking: "Keep the mermaid subject." }
                    }],
                    ["content_block_delta", {
                        index: 0,
                        delta: { type: "text_delta", text: "Your mermaid rap is coming." }
                    }],
                    ["content_block_start", {
                        index: 1,
                        content_block: {
                            type: "tool_use",
                            id: "lyrics-call",
                            name: "generate_lyrics"
                        }
                    }],
                    ["content_block_delta", {
                        index: 1,
                        delta: {
                            type: "input_json_delta",
                            partial_json: JSON.stringify({ prompt: "German mermaid rap" })
                        }
                    }],
                    ["message_delta", { delta: { stop_reason: "tool_use" } }]
                ]);
            }
            assert.ok(
                getMessages(db, "fault-session").some(row =>
                    row.role === "tool" && row.content === lyrics
                ),
                "output persisted before continuation"
            );
            const steering = await handleRequest(
                new Request("http://localhost/api/steer", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Session-Id": "fault-session"
                    },
                    body: JSON.stringify({ message: "Keep the mermaid lyrics." })
                })
            );
            assert.equal(steering.status, 200);
            if (failure === "connection") throw new Error("Synthetic connection failure");
            if (failure === "http") {
                return new Response("Synthetic provider failure", { status: 503 });
            }
            if (failure === "empty") return new Response(null);
            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(new Error("Synthetic stream failure"));
                    }
                })
            );
        };
        const response = await handleRequest(request("Write mermaid lyrics."));
        const events = await response.text();
        assert.ok(events.includes("tool_result"));
        assert.ok(events.includes("Arielle rappt"));
        const rows = getMessages(db, "fault-session");
        assert.equal(
            rows.filter(row => row.role === "user" && row.content === "Keep the mermaid lyrics.")
                .length,
            1,
            "pending steering is persisted even when continuation fails"
        );
        const prose = rows.filter(row =>
            row.role === "assistant" && row.content === "Your mermaid rap is coming."
        );
        assert.equal(prose.length, 1, "no duplicate assistant persistence");
        assert.equal(prose[0].thinking, "Keep the mermaid subject.");
        assert.equal(rows.filter(row => row.role === "tool" && row.content === lyrics).length, 1);
        let nextContext = "";
        globalThis.fetch = async (_url, init) => {
            nextContext = JSON.stringify(JSON.parse(String(init?.body)).messages);
            return stream([["content_block_delta", {
                index: 0,
                delta: { type: "text_delta", text: "Continue the mermaid project." }
            }], ["message_delta", { delta: { stop_reason: "end_turn" } }]]);
        };
        await (await handleRequest(request("Use those lyrics for the matching picture."))).text();
        assert.ok(nextContext.includes("Arielle rappt"));
        assert.ok(nextContext.includes("German mermaid rap"));
        assert.ok(nextContext.includes("Your mermaid rap is coming."));
        assert.ok(nextContext.includes("Keep the mermaid subject."));
        assert.equal(nextContext.includes("lyrics-call"), false);
    });
}

it("retains streamed partial prose and reasoning when the stream breaks before completion", async () => {
    resetStateForTesting();
    initDatabase(":memory:");
    const db = getDb();
    assert.ok(db);
    process.env.MINIMAX_API_KEY = "stub-only-context-key";
    createSession(db, "fault-session", "Partial test");
    saveMessage(db, "fault-session", "user", "Earlier request.");
    let sent = false;
    globalThis.fetch = async () =>
        new Response(
            new ReadableStream({
                pull(controller) {
                    if (!sent) {
                        sent = true;
                        controller.enqueue(
                            new TextEncoder().encode(
                                "event: content_block_delta\ndata: {\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Visible reasoning.\"}}\n\nevent: content_block_delta\ndata: {\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Visible partial answer.\"}}\n\n"
                            )
                        );
                    } else controller.error(new Error("Synthetic interruption"));
                }
            })
        );
    const events = await (await handleRequest(request("Start explaining."))).text();
    assert.ok(events.includes("Visible partial answer."));
    assert.ok(events.includes("event: error"));
    const partial = getMessages(db, "fault-session").find(row =>
        row.content === "Visible partial answer."
    );
    assert.ok(partial);
    assert.equal(partial.thinking, "Visible reasoning.");
});
