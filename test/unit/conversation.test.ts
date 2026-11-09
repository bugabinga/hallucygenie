import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toAnthropicPayload } from "../../src/agent.ts";
import { projectConversation, readConversation } from "../../src/conversation.ts";
import { createSession, getMessages, initDb, saveAsset, saveMessage } from "../../src/db.ts";

function appendMessage(...args: Parameters<typeof saveMessage>) {
    saveMessage(...args);
    return getMessages(args[0], args[1]).at(-1)!;
}

function fixture() {
    const db = initDb(":memory:");
    createSession(db, "context-session", "Context");
    createSession(db, "other-session", "Other");
    return db;
}

describe("committed conversation context", () => {
    it("preserves Create inputs, full lyrics, prose and visible reasoning without replaying tool IDs", () => {
        const db = fixture();
        try {
            const lyrics = "Arielle rappt mit Muschel-Mikrofon.\n".repeat(200);
            const rows = [
                appendMessage(
                    db,
                    "context-session",
                    "assistant",
                    "Here are your mermaid lyrics.",
                    JSON.stringify([
                        {
                            id: "old-provider-id",
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
                ),
                appendMessage(db, "context-session", "tool", lyrics, null, "old-provider-id")
            ];
            const messages = projectConversation(rows);
            const text = messages.map(m => m.content).join("\n");
            assert.ok(text.includes("funny german rap about mermaids"));
            assert.ok(text.includes("Here are your mermaid lyrics."));
            assert.ok(text.includes("Keep the requested mermaid subject."));
            assert.ok(text.includes(JSON.stringify(lyrics).slice(1, -1)));
            assert.ok(text.includes("Arielle im Meer"));
            assert.equal(text.includes("old-provider-id"), false);
            assert.ok(messages.every(m => m.role !== "tool" && !m.tool_calls));
            assert.equal(
                JSON.stringify(toAnthropicPayload(messages, [])).includes("\"tool_use_id\""),
                false
            );
        } finally {
            db.close();
        }
    });

    it("keeps complete user text, errors and local asset handles", () => {
        const db = fixture();
        try {
            const rows = [
                appendMessage(
                    db,
                    "context-session",
                    "user",
                    "Use my exact words: Meerjungfrau 🧜\n```xml\n<image>\n```"
                ),
                appendMessage(
                    db,
                    "context-session",
                    "tool",
                    "Error: quota used up",
                    null,
                    "failed-call"
                ),
                appendMessage(
                    db,
                    "context-session",
                    "tool",
                    "/asset/asset_abcd",
                    null,
                    "image-call"
                )
            ];
            const projected = projectConversation(rows);
            assert.equal(projected[0].role, "user");
            assert.equal(JSON.parse(projected[0].content).content, rows[0].content);
            assert.match(projected[1].content, /Error: quota used up/);
            assert.match(projected[2].content, /\/asset\/asset_abcd/);
        } finally {
            db.close();
        }
    });

    it("retrieves full Unicode records in explicit pages and excludes other sessions", () => {
        const db = fixture();
        try {
            const row = appendMessage(db, "context-session", "assistant", "🧜".repeat(20000));
            const secret = appendMessage(
                db,
                "other-session",
                "user",
                "other-session private content"
            );
            const page = readConversation(db, "context-session", {
                operation: "message",
                message_id: row.id,
                max_chars: 100
            });
            assert.equal(page.type, "text");
            const first = JSON.parse(page.content);
            assert.equal(Array.from(first.text).length, 100);
            assert.equal(first.next_offset, 100);
            assert.ok(first.total_chars > first.next_offset);
            let combined = first.text;
            let offset: number | null = first.next_offset;
            let pages = 1;
            while (offset !== null) {
                const next = JSON.parse(
                    readConversation(db, "context-session", {
                        operation: "message",
                        message_id: row.id,
                        offset,
                        max_chars: 100
                    }).content
                );
                assert.equal(next.offset, offset);
                assert.equal(next.text.includes("�"), false);
                assert.ok(next.next_offset === null || next.next_offset > offset);
                combined += next.text;
                offset = next.next_offset;
                assert.ok(++pages < 300, "pagination must terminate");
            }
            assert.ok(pages > 2);
            assert.equal(combined, projectConversation([row])[0].content);
            assert.equal(JSON.parse(combined).content, row.content);
            const terminal = JSON.parse(
                readConversation(db, "context-session", {
                    operation: "message",
                    message_id: row.id,
                    offset: Array.from(combined).length
                }).content
            );
            assert.equal(terminal.text, "");
            assert.equal(terminal.next_offset, null);
            assert.equal(
                readConversation(db, "context-session", {
                    operation: "message",
                    message_id: secret.id
                }).type,
                "error"
            );
            assert.equal(
                readConversation(db, "context-session", {
                    operation: "message",
                    message_id: row.id,
                    offset: -1
                }).type,
                "error"
            );
            assert.equal(
                readConversation(db, "context-session", {
                    operation: "message",
                    message_id: row.id,
                    max_chars: 16001
                }).type,
                "error"
            );
        } finally {
            db.close();
        }
    });

    it("lists older records with a stable cursor despite new tool messages", () => {
        const db = fixture();
        try {
            const ids = Array.from(
                { length: 25 },
                (_, i) => appendMessage(db, "context-session", "user", `record ${i}`).id
            );
            const first = JSON.parse(readConversation(db, "context-session", {}).content);
            assert.equal(first.records.length, 20);
            assert.equal(first.next_before_id, ids[5]);
            appendMessage(db, "context-session", "assistant", "new retrieval action");
            const older = JSON.parse(
                readConversation(db, "context-session", { before_id: first.next_before_id }).content
            );
            assert.deepEqual(older.records.map((r: { id: number; }) => r.id), ids.slice(0, 5));
            assert.equal(older.next_before_id, null);
        } finally {
            db.close();
        }
    });

    it("lists scoped asset metadata, prompts and params without exposing storage paths", () => {
        const db = fixture();
        try {
            for (const session of ["context-session", "other-session"]) {
                saveAsset(db, {
                    id: `asset_${session}`,
                    session_id: session,
                    type: "video",
                    filename: "private-storage-name.mp4",
                    mime_type: "video/mp4",
                    prompt: `${session} mermaids`,
                    tool_name: "generate_video",
                    size_bytes: 12,
                    params_json: JSON.stringify({ duration: 4 })
                });
            }
            const result = readConversation(db, "context-session", { operation: "assets" });
            assert.equal(result.type, "text");
            assert.ok(result.content.includes("context-session mermaids"));
            assert.equal(result.content.includes("other-session"), false);
            assert.equal(result.content.includes("private-storage-name"), false);
            assert.equal(JSON.parse(result.content).assets[0].params.duration, 4);
            assert.equal(
                readConversation(db, "context-session", { operation: "unknown" }).type,
                "error"
            );
        } finally {
            db.close();
        }
    });
});
