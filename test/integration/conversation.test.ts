import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { createSession, getMessages, saveMessage, setActiveSessionId } from "../../src/db.ts";
import { getDb, handleRequest, initDatabase, resetStateForTesting } from "../../src/server.ts";
import { MINIMAX_BASE } from "../../src/tools.ts";

type Block = { type: string; tool_use_id?: string; content?: string; text?: string; };
type Payload = {
    tools: Array<{ name: string; }>;
    messages: Array<{ role: string; content: string | Block[]; }>;
};
const originalFetch = globalThis.fetch;
const originalKey = process.env.MINIMAX_API_KEY;

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = originalKey;
    getDb()?.close();
    resetStateForTesting();
});

function sse(events: Array<[string, unknown]>): Response {
    return new Response(
        events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(
            ""
        ),
        {
            headers: { "Content-Type": "text/event-stream" }
        }
    );
}

it("routes provider-requested conversation retrieval through real chat with scoped saved context", async () => {
    resetStateForTesting();
    initDatabase(":memory:");
    const database = getDb();
    assert.ok(database);
    process.env.MINIMAX_API_KEY = "conversation-integration-test-key";
    const session = createSession(database, "retrieval-chat-session", "Mermaid project");
    const other = createSession(database, "retrieval-other-session", "Other project");
    const lyrics = "Arielle rappt mit Muschel-Mikrofon.\n".repeat(180);
    saveMessage(database, session.id, "user", "Make funny German mermaid lyrics.");
    saveMessage(
        database,
        session.id,
        "assistant",
        "Here is your mermaid rap.",
        JSON.stringify([
            {
                id: "old-mermaid-provider-id",
                name: "generate_lyrics",
                input: {
                    prompt: "funny german rap about mermaids",
                    mode: "edit",
                    lyrics: "Arielle im Meer"
                }
            }
        ]),
        null,
        "Keep the requested mermaid subject."
    );
    saveMessage(database, session.id, "tool", lyrics, null, "old-mermaid-provider-id");
    const saved = getMessages(database, session.id).at(-1)!;
    saveMessage(database, other.id, "user", "PRIVATE OTHER SESSION CONTENT");
    const foreign = getMessages(database, other.id).at(-1)!;
    const requests: Payload[] = [];
    globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `${MINIMAX_BASE}/anthropic/v1/messages`);
        requests.push(JSON.parse(String(init?.body)) as Payload);
        if (requests.length === 1) {
            // A different tab changing active state must not change this request's scope.
            setActiveSessionId(database, other.id);
            return sse([
                ["content_block_start", {
                    index: 0,
                    content_block: {
                        type: "tool_use",
                        id: "retrieve-own",
                        name: "read_conversation"
                    }
                }],
                ["content_block_delta", {
                    index: 0,
                    delta: {
                        type: "input_json_delta",
                        partial_json: JSON.stringify({ operation: "message", message_id: saved.id })
                    }
                }],
                ["content_block_stop", { index: 0 }],
                ["content_block_start", {
                    index: 1,
                    content_block: {
                        type: "tool_use",
                        id: "retrieve-foreign",
                        name: "read_conversation"
                    }
                }],
                ["content_block_delta", {
                    index: 1,
                    delta: {
                        type: "input_json_delta",
                        partial_json: JSON.stringify({
                            operation: "message",
                            message_id: foreign.id,
                            session_id: other.id
                        })
                    }
                }],
                ["content_block_stop", { index: 1 }],
                ["message_delta", { delta: { stop_reason: "tool_use" } }]
            ]);
        }
        assert.equal(
            requests.length,
            2,
            "retrieval needs one continuation, not an unbounded retry"
        );
        return sse([
            ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
            ["content_block_delta", {
                index: 0,
                delta: { type: "text_delta", text: "Mermaid lyrics recovered." }
            }],
            ["message_delta", { delta: { stop_reason: "end_turn" } }]
        ]);
    };
    const response = await handleRequest(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": session.id },
            body: JSON.stringify({
                messages: [{ role: "user", content: "Use the saved lyrics for the next picture." }]
            })
        })
    );
    const stream = await response.text();
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].tools.some(tool => tool.name === "read_conversation"));
    const initialHistory = JSON.stringify(requests[0].messages);
    assert.ok(initialHistory.includes("funny german rap about mermaids"));
    assert.ok(initialHistory.includes("Here is your mermaid rap."));
    assert.ok(initialHistory.includes("Keep the requested mermaid subject."));
    assert.equal(initialHistory.includes("old-mermaid-provider-id"), false);
    assert.equal(initialHistory.includes("PRIVATE OTHER SESSION CONTENT"), false);
    const results = requests[1].messages.flatMap(message =>
        Array.isArray(message.content) ? message.content : []
    ).filter(block => block.type === "tool_result");
    assert.equal(results.length, 2);
    const own = results.find(block => block.tool_use_id === "retrieve-own");
    assert.ok(own?.content);
    const page = JSON.parse(own.content);
    assert.equal(page.next_offset, null);
    assert.equal(JSON.parse(page.text).content, lyrics);
    const denied = results.find(block => block.tool_use_id === "retrieve-foreign");
    assert.match(denied?.content ?? "", /Invalid message_id for this session/);
    assert.equal(JSON.stringify(requests).includes("PRIVATE OTHER SESSION CONTENT"), false);
    assert.ok(stream.includes("Mermaid lyrics recovered."));
    assert.ok(stream.includes("event: tool_result"));
    assert.equal(getMessages(database, other.id).length, 1);
    assert.ok(
        getMessages(database, session.id).some(row =>
            row.content.includes("Mermaid lyrics recovered.")
        )
    );
});
