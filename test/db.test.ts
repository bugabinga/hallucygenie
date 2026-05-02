// HallucyGenie — Database tests (migrations, CRUD, quotas)

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    runMigrations,
    initDb,
    getActiveSessionId,
    getOrCreateActiveSessionId,
    getOrCreateActiveSession,
    createSession,
    listSessions,
    renameSession,
    archiveSession,
    setActiveSessionId,
    saveMessage,
    assertNoRawAssetDataInMessage,
    getMessages,
    savePreference,
    getPreferences,
    trackUsage,
    getUsageToday,
    checkQuota,
    saveAsset,
    getAssets,
    getAsset,
    QUOTAS,
} from "../src/db.ts";

// Helper: create a fresh in-memory DB with migrations applied
function freshDb(): Database {
    const db = new Database(":memory:");
    const migrationsDir = join(import.meta.dirname ?? ".", "..", "migrations");
    runMigrations(db, migrationsDir);
    return db;
}

// Helper: create a temp dir with specific migration files
function tempMigrationsDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "hg005-test-"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(dir, name), content);
    }
    return dir;
}

// ── Step 2: Migration Runner Tests ──────────────────────────────────

describe("runMigrations", () => {
    it("applies all migrations to a fresh database", () => {
        const db = freshDb();

        // Verify all tables exist
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all()
            .map((r: any) => r.name);
        assert.ok(tables.includes("schema_migrations"));
        assert.ok(tables.includes("messages"));
        assert.ok(tables.includes("preferences"));
        assert.ok(tables.includes("daily_usage"));
        assert.ok(tables.includes("app_state"));
        assert.ok(tables.includes("sessions"));

        const assetColumns = db
            .prepare("PRAGMA table_info(assets)")
            .all()
            .map((r: any) => r.name);
        assert.ok(assetColumns.includes("params_json"));

        // Verify all migrations recorded
        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r: any) => r.version);
        assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

        db.close();
    });

    it("only runs pending migrations on a partially migrated database", () => {
        const dir = tempMigrationsDir({
            "001-first.sql": "CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
            "002-second.sql": "CREATE TABLE t2 (id INTEGER PRIMARY KEY);",
        });

        const db = new Database(":memory:");

        // Apply first migration manually
        db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
        db.exec("CREATE TABLE t1 (id INTEGER PRIMARY KEY);");
        db.exec("INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'))");

        // Now run migrations — should only apply 002
        runMigrations(db, dir);

        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r: any) => r.version);
        assert.deepEqual(versions, [1, 2]);

        // Verify t2 exists
        const exists = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t2'")
            .get();
        assert.ok(exists);

        db.close();
        rmSync(dir, { recursive: true });
    });

    it("rolls back and throws on failed migration", () => {
        const dir = tempMigrationsDir({
            "001-good.sql": "CREATE TABLE good (id INTEGER PRIMARY KEY);",
            "002-bad.sql": "THIS IS NOT VALID SQL AT ALL;",
        });

        const db = new Database(":memory:");
        assert.throws(() => runMigrations(db, dir));

        // The bad migration should have been rolled back
        // schema_migrations table exists (created by runMigrations) but no versions recorded
        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r: any) => r.version);
        assert.deepEqual(versions, [], "No migrations should be recorded after rollback");

        db.close();
        rmSync(dir, { recursive: true });
    });

    it("handles empty migrations directory gracefully", () => {
        const dir = tempMigrationsDir({});

        const db = new Database(":memory:");
        // Should not throw
        runMigrations(db, dir);

        db.close();
        rmSync(dir, { recursive: true });
    });

    it("handles non-existent migrations directory gracefully", () => {
        const db = new Database(":memory:");
        // Should not throw
        runMigrations(db, "/nonexistent/path/migrations");

        db.close();
    });
});

describe("initDb", () => {
    it("opens database and applies migrations", () => {
        const dir = tempMigrationsDir({
            "001-test.sql": "CREATE TABLE test_init (id INTEGER PRIMARY KEY);",
            "002-app-state.sql": `CREATE TABLE app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );`,
        });

        const db = initDb(":memory:", dir);
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_init'")
            .all();
        assert.equal(tables.length, 1);

        db.close();
        rmSync(dir, { recursive: true });
    });

    it("uses default migrations dir when not specified", () => {
        // initDb without migrationsDir should use the project migrations/ directory
        const db = initDb(":memory:");
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all()
            .map((r: any) => r.name);
        assert.ok(tables.includes("messages"));
        assert.ok(tables.includes("preferences"));
        assert.ok(tables.includes("daily_usage"));
        assert.ok(tables.includes("app_state"));
        assert.match(getOrCreateActiveSessionId(db), /^[0-9a-f-]{36}$/);
        db.close();
    });
});

// ── App State Tests ─────────────────────────────────────────────────

describe("Active session state", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("creates active session once and reuses it", () => {
        assert.equal(getActiveSessionId(db), null);

        const first = getOrCreateActiveSessionId(db);
        const second = getOrCreateActiveSessionId(db);

        assert.match(first, /^[0-9a-f-]{36}$/);
        assert.equal(second, first);
        assert.equal(getActiveSessionId(db), first);
    });

    it("setActiveSessionId updates and normalizes active session", () => {
        setActiveSessionId(db, "session-next");
        assert.equal(getActiveSessionId(db), "session-next");

        setActiveSessionId(db, "  session-final  ");
        assert.equal(getOrCreateActiveSessionId(db), "session-final");
    });

    it("initDb creates active session if missing", () => {
        const dir = mkdtempSync(join(tmpdir(), "hg-active-session-"));
        const path = join(dir, "app.db");

        const db1 = initDb(path);
        const first = getActiveSessionId(db1);
        db1.close();

        const db2 = initDb(path);
        assert.equal(getActiveSessionId(db2), first);
        db2.close();
        rmSync(dir, { recursive: true });
    });

    it("recreates missing active session and fails loud on blank ids", () => {
        const created = getOrCreateActiveSessionId(db);
        db.prepare("DELETE FROM app_state WHERE key = 'active_session_id'").run();
        const recreated = getOrCreateActiveSessionId(db);

        assert.notEqual(recreated, created);
        assert.throws(() => setActiveSessionId(db, "  "), /session id must not be blank/);
        db.prepare("UPDATE app_state SET value = '' WHERE key = 'active_session_id'").run();
        assert.throws(() => getActiveSessionId(db), /session id must not be blank/);
    });
});

describe("Sessions", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("creates active New Chat session on demand", () => {
        const session = getOrCreateActiveSession(db);
        assert.equal(session.id, getActiveSessionId(db));
        assert.equal(session.name, "New Chat");
        assert.equal(session.name_source, "default");
    });

    it("lists active sessions ordered by updated time", () => {
        createSession(db, "session-a", "Alpha");
        createSession(db, "session-b", "Beta");
        const names = listSessions(db).map((row) => row.name);
        assert.deepEqual(names.slice(0, 2), ["Beta", "Alpha"]);
    });

    it("rename sets name_source manual", () => {
        createSession(db, "session-rename", "Draft");
        const renamed = renameSession(db, "session-rename", "Boss Fight Ideas");
        assert.equal(renamed.name, "Boss Fight Ideas");
        assert.equal(renamed.name_source, "manual");
        assert.throws(() => renameSession(db, "session-rename", " "), /session name/);
    });

    it("archive hides sessions from list", () => {
        createSession(db, "session-archive", "Hide Me");
        archiveSession(db, "session-archive");
        assert.equal(
            listSessions(db).some((row) => row.id === "session-archive"),
            false,
        );
    });
});

// ── Step 3: Message CRUD Tests ──────────────────────────────────────

describe("Message CRUD", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("saves and retrieves messages for a session", () => {
        saveMessage(db, "session-1", "user", "Hello!");
        saveMessage(db, "session-1", "assistant", "Hi there!");

        const msgs = getMessages(db, "session-1");
        assert.equal(msgs.length, 2);
        assert.equal(msgs[0].role, "user");
        assert.equal(msgs[0].content, "Hello!");
        assert.equal(msgs[1].role, "assistant");
        assert.equal(msgs[1].content, "Hi there!");
    });

    it("partitions messages by session", () => {
        saveMessage(db, "session-a", "user", "A message");
        saveMessage(db, "session-b", "user", "B message");

        const msgsA = getMessages(db, "session-a");
        const msgsB = getMessages(db, "session-b");
        assert.equal(msgsA.length, 1);
        assert.equal(msgsB.length, 1);
        assert.equal(msgsA[0].content, "A message");
        assert.equal(msgsB[0].content, "B message");
    });

    it("returns empty array for unknown session", () => {
        const msgs = getMessages(db, "nonexistent");
        assert.deepEqual(msgs, []);
    });

    it("saves messages with tool_calls_json and tool_call_id", () => {
        const toolCalls = JSON.stringify([{ id: "tc1", name: "search", arguments: "{}" }]);
        saveMessage(db, "session-1", "assistant", "Let me search", toolCalls, "tc1");

        const msgs = getMessages(db, "session-1");
        assert.equal(msgs[0].tool_calls_json, toolCalls);
        assert.equal(msgs[0].tool_call_id, "tc1");
    });

    it("saves assistant thinking separately", () => {
        saveMessage(db, "session-1", "assistant", "Answer", null, null, "hidden thinking");

        const msgs = getMessages(db, "session-1");
        assert.equal(msgs[0].content, "Answer");
        assert.equal(msgs[0].thinking, "hidden thinking");
    });

    it("handles special characters in content", () => {
        const special = "He said \"hello\" & <world> 'test'\n\ttabbed";
        saveMessage(db, "session-1", "user", special);

        const msgs = getMessages(db, "session-1");
        assert.equal(msgs[0].content, special);
    });

    it("handles large text messages", () => {
        const large = "x".repeat(100000);
        saveMessage(db, "session-1", "user", large);

        const msgs = getMessages(db, "session-1");
        assert.equal(msgs[0].content.length, 100000);
    });

    it("rejects raw asset data in messages", () => {
        assert.throws(
            () => saveMessage(db, "session-1", "tool", "data:audio/mp3;base64,aaaa"),
            /raw asset data/,
        );
        assert.throws(
            () => assertNoRawAssetDataInMessage(`x;base64,${"a".repeat(4096)}`),
            /raw base64 asset data/,
        );
    });

    it("orders messages by created_at then id", () => {
        saveMessage(db, "s1", "user", "first");
        saveMessage(db, "s1", "assistant", "second");
        saveMessage(db, "s1", "user", "third");

        const msgs = getMessages(db, "s1");
        assert.equal(msgs[0].content, "first");
        assert.equal(msgs[1].content, "second");
        assert.equal(msgs[2].content, "third");
    });

    it("snapshot: message history JSON output", () => {
        saveMessage(db, "snap-session", "user", "What's 2+2?");
        saveMessage(db, "snap-session", "assistant", "4");
        saveMessage(db, "snap-session", "user", "Thanks!");

        const msgs = getMessages(db, "snap-session");
        // Snapshot the structured output (minus dynamic fields)
        const snapshot = msgs.map((m) => ({
            session_id: m.session_id,
            role: m.role,
            content: m.content,
        }));
        assert.deepEqual(snapshot, [
            { session_id: "snap-session", role: "user", content: "What's 2+2?" },
            { session_id: "snap-session", role: "assistant", content: "4" },
            { session_id: "snap-session", role: "user", content: "Thanks!" },
        ]);
    });
});

// ── Step 3: Preference CRUD Tests ───────────────────────────────────

describe("Preference CRUD", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("saves and retrieves preferences", () => {
        savePreference(db, "theme", "dark");
        savePreference(db, "language", "en");

        const prefs = getPreferences(db);
        assert.equal(prefs.theme, "dark");
        assert.equal(prefs.language, "en");
    });

    it("upserts existing preference", () => {
        savePreference(db, "theme", "dark");
        savePreference(db, "theme", "light");

        const prefs = getPreferences(db);
        assert.equal(prefs.theme, "light");
        assert.equal(Object.keys(prefs).length, 1);
    });

    it("returns empty object when no preferences", () => {
        const prefs = getPreferences(db);
        assert.deepEqual(prefs, {});
    });

    it("handles special characters in values", () => {
        const special = "value with \"quotes\" & <tags> 'apostrophes'";
        savePreference(db, "special", special);

        const prefs = getPreferences(db);
        assert.equal(prefs.special, special);
    });
});

// ── Step 4: Usage Tracking Tests ────────────────────────────────────

describe("Usage Tracking", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("tracks usage for a feature", () => {
        trackUsage(db, "speech");
        trackUsage(db, "speech");
        trackUsage(db, "speech");

        const usage = getUsageToday(db);
        assert.equal(usage.speech, 3);
    });

    it("tracks multiple features independently", () => {
        trackUsage(db, "speech");
        trackUsage(db, "speech");
        trackUsage(db, "image");

        const usage = getUsageToday(db);
        assert.equal(usage.speech, 2);
        assert.equal(usage.image, 1);
        assert.equal(usage.music, undefined);
    });

    it("returns empty object when no usage", () => {
        const usage = getUsageToday(db);
        assert.deepEqual(usage, {});
    });
});

// ── Step 4: Quota Enforcement Tests ─────────────────────────────────

describe("Quota Enforcement", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("returns correct status when under limit", () => {
        trackUsage(db, "speech");

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 1);
        assert.equal(status.limit, 9000);
        assert.equal(status.remaining, 8999);
        assert.equal(status.warning, false);
        assert.equal(status.blocked, false);
    });

    it("shows warning at 80% threshold", () => {
        // Speech limit is 9000, 80% = 7200
        // Insert directly to set exact count
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 7200)",
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 7200);
        assert.equal(status.warning, true);
        assert.equal(status.blocked, false);
    });

    it("blocks at 100% limit", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 9000)",
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 9000);
        assert.equal(status.warning, true);
        assert.equal(status.blocked, true);
    });

    it("blocks when over limit", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 9999)",
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 9999);
        assert.equal(status.blocked, true);
        assert.equal(status.remaining, 0);
    });

    it("resets for a different date (daily reset)", () => {
        // Insert usage for yesterday
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now', '-1 day'), 'speech', 9000)",
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 0);
        assert.equal(status.blocked, false);
    });

    it("tracks multiple features independently for quotas", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 100)",
        ).run();

        const imageStatus = checkQuota(db, "image");
        assert.equal(imageStatus.blocked, true);

        const speechStatus = checkQuota(db, "speech");
        assert.equal(speechStatus.blocked, false);
        assert.equal(speechStatus.used, 0);
    });

    it("returns safe default for unknown feature", () => {
        const status = checkQuota(db, "unknown_feature");
        assert.equal(status.used, 0);
        assert.equal(status.limit, 0);
        assert.equal(status.remaining, 0);
        assert.equal(status.warning, false);
        assert.equal(status.blocked, false);
    });

    it("snapshot: quota status JSON at various usage levels", () => {
        trackUsage(db, "image");
        trackUsage(db, "image");

        const status = checkQuota(db, "image");
        assert.deepEqual(
            {
                used: status.used,
                limit: status.limit,
                remaining: status.remaining,
                warning: status.warning,
                blocked: status.blocked,
            },
            { used: 2, limit: 100, remaining: 98, warning: false, blocked: false },
        );
    });

    it("snapshot: quota status at warning threshold", () => {
        // Image limit = 100, 80% = 80
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 80)",
        ).run();

        const status = checkQuota(db, "image");
        assert.deepEqual(
            {
                used: status.used,
                limit: status.limit,
                remaining: status.remaining,
                warning: status.warning,
                blocked: status.blocked,
            },
            { used: 80, limit: 100, remaining: 20, warning: true, blocked: false },
        );
    });

    it("snapshot: quota status at blocked threshold", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'music', 100)",
        ).run();

        const status = checkQuota(db, "music");
        assert.deepEqual(
            {
                used: status.used,
                limit: status.limit,
                remaining: status.remaining,
                warning: status.warning,
                blocked: status.blocked,
            },
            { used: 100, limit: 100, remaining: 0, warning: true, blocked: true },
        );
    });
});

// ── QUOTAS constant test ────────────────────────────────────────────

describe("QUOTAS constant", () => {
    it("has correct limits", () => {
        assert.equal(QUOTAS.speech, 9000);
        assert.equal(QUOTAS.image, 100);
        assert.equal(QUOTAS.music, 100);
    });
});

// ── Assets ─────────────────────────────────────────────────────────

describe("saveAsset + getAssets + getAsset", () => {
    let db: Database;
    beforeEach(() => {
        db = freshDb();
    });

    it("getAssets returns empty array for new session", () => {
        const assets = getAssets(db, "new-session");
        assert.deepEqual(assets, []);
    });

    it("getAsset returns undefined for unknown id", () => {
        const asset = getAsset(db, "nonexistent");
        assert.equal(asset, null);
    });

    it("saveAsset then getAssets returns the asset", () => {
        const id = crypto.randomUUID();
        saveAsset(db, {
            id,
            session_id: "session-1",
            type: "image",
            filename: "img.png",
            mime_type: "image/png",
            prompt: "a cute cat",
            tool_name: "generate_image",
            size_bytes: 12345,
        });
        const assets = getAssets(db, "session-1");
        assert.equal(assets.length, 1);
        assert.equal(assets[0].id, id);
        assert.equal(assets[0].filename, "img.png");
        assert.equal(assets[0].tool_name, "generate_image");
        assert.equal(assets[0].params_json, null);
    });

    it("saves generation params JSON", () => {
        const id = crypto.randomUUID();
        saveAsset(db, {
            id,
            session_id: "session-params",
            type: "music",
            filename: "song.mp3",
            mime_type: "audio/mpeg",
            prompt: "boss fight",
            tool_name: "generate_music",
            size_bytes: 999,
            params_json: JSON.stringify({
                model: "music-2.6",
                prompt: "boss fight",
                lyrics_present: false,
                is_instrumental: true,
            }),
        });
        const asset = getAsset(db, id)!;
        assert.equal(JSON.parse(asset.params_json!).model, "music-2.6");
    });

    it("rejects raw media bytes in asset params", () => {
        assert.throws(
            () =>
                saveAsset(db, {
                    id: crypto.randomUUID(),
                    session_id: "session-params",
                    type: "audio",
                    filename: "voice.mp3",
                    mime_type: "audio/mpeg",
                    prompt: "hello",
                    tool_name: "text_to_speech",
                    size_bytes: 999,
                    params_json: JSON.stringify({ raw: "data:audio/mp3;base64,aaaa" }),
                }),
            /raw asset data/,
        );
    });

    it("saveAsset then getAsset returns the asset", () => {
        const id = crypto.randomUUID();
        saveAsset(db, {
            id,
            session_id: "session-2",
            type: "music",
            filename: "song.mp3",
            mime_type: "audio/mpeg",
            prompt: "upbeat tune",
            tool_name: "generate_music",
            size_bytes: 98765,
        });
        const asset = getAsset(db, id);
        assert.notEqual(asset, undefined);
        assert.equal(asset!.filename, "song.mp3");
        assert.equal(asset!.session_id, "session-2");
    });

    it("getAssets only returns assets for that session", () => {
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        saveAsset(db, {
            id: id1,
            session_id: "A",
            type: "image",
            filename: "a.png",
            mime_type: "image/png",
            prompt: null,
            tool_name: "img",
            size_bytes: 100,
        });
        saveAsset(db, {
            id: id2,
            session_id: "B",
            type: "image",
            filename: "b.png",
            mime_type: "image/png",
            prompt: null,
            tool_name: "img",
            size_bytes: 200,
        });
        const assetsA = getAssets(db, "A");
        const assetsB = getAssets(db, "B");
        assert.equal(assetsA.length, 1);
        assert.equal(assetsA[0].id, id1);
        assert.equal(assetsB.length, 1);
        assert.equal(assetsB[0].id, id2);
    });

    it("getAssets returns assets ordered by created_at DESC", () => {
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        const now = Date.now();
        // Older asset first, newer second
        saveAsset(db, {
            id: id1,
            session_id: "order-test",
            type: "audio",
            filename: "old.txt",
            mime_type: "text/plain",
            prompt: null,
            tool_name: "tts",
            size_bytes: 50,
            created_at: now - 10,
        });
        saveAsset(db, {
            id: id2,
            session_id: "order-test",
            type: "audio",
            filename: "new.txt",
            mime_type: "text/plain",
            prompt: null,
            tool_name: "tts",
            size_bytes: 60,
            created_at: now,
        });
        const assets = getAssets(db, "order-test");
        assert.equal(assets.length, 2);
        // Newest first (by created_at DESC)
        assert.equal(assets[0].id, id2);
        assert.equal(assets[1].id, id1);
    });
});
