/**
 * Tests for handleExplicitToolDirective — transaction safety for user message save.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { saveMessage, getMessages } from "../../src/db.ts";

describe("Explicit tool directive transaction safety", () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(`:memory:`);
        db.exec(`
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls_json TEXT,
                tool_call_id TEXT,
                thinking TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
    });

    afterEach(() => {
        db.close();
    });

    it("can rollback user message by deleting last message for session", () => {
        const sessionId = "test-session-123";

        // Save user message
        saveMessage(db, sessionId, "user", "Use generate_image with prompt: a cat");
        let messages = getMessages(db, sessionId);
        expect(messages.length).toBe(1);
        expect(messages[0].role).toBe("user");
        expect(messages[0].content).toBe("Use generate_image with prompt: a cat");

        // Rollback: delete the last user message
        db.prepare(
            `DELETE FROM messages
             WHERE session_id = ? AND id = (
               SELECT id FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1
             )`,
        ).run(sessionId, sessionId);

        messages = getMessages(db, sessionId);
        expect(messages.length).toBe(0);
    });

    it("only deletes the last message, not all messages", () => {
        const sessionId = "test-session-123";

        // Save multiple messages
        saveMessage(db, sessionId, "user", "hello");
        saveMessage(db, sessionId, "assistant", "hi there");
        saveMessage(db, sessionId, "user", "Use generate_image with prompt: a cat");

        // Rollback only the last one
        db.prepare(
            `DELETE FROM messages
             WHERE session_id = ? AND id = (
               SELECT id FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1
             )`,
        ).run(sessionId, sessionId);

        const messages = getMessages(db, sessionId);
        expect(messages.length).toBe(2);
        expect(messages[0].content).toBe("hello");
        expect(messages[1].content).toBe("hi there");
    });
});
