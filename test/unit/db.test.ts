// HallucyGenie — Database tests (migrations, CRUD, quotas)

import assert from "node:assert/strict";
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync as Database } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";

import {
    archiveSession,
    assertNoRawAssetDataInMessage,
    autoNameSession,
    checkQuota,
    consumeQuota,
    createSession,
    deleteDraft,
    deleteUserProfile,
    getActiveSessionId,
    getAsset,
    getAssets,
    getDraft,
    getMessages,
    getOrCreateActiveSession,
    getOrCreateActiveSessionId,
    getPreferences,
    getSession,
    getUsageToday,
    getUserProfile,
    hideToolInputHistory,
    initDb,
    listAsyncTtsTasks,
    listSessions,
    listToolInputHistory,
    QUOTAS,
    recordToolInputHistory,
    releaseQuota,
    renameSession,
    runMigrations,
    runTransaction,
    saveAsset,
    saveAsyncTtsTask,
    saveDraft,
    saveMessage,
    savePreference,
    saveUserProfile,
    setActiveSessionId,
    trackUsage,
    updateAsyncTtsTask
} from "../../src/db.ts";

// Helper: create a fresh in-memory DB with migrations applied
function freshDb(): Database {
    const db = new Database(":memory:");
    const migrationsDir = join(import.meta.dirname ?? ".", "..", "..", "migrations");
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
            .map((r) => (r as { name: string; }).name);
        assert.ok(tables.includes("schema_migrations"));
        assert.ok(tables.includes("messages"));
        assert.ok(tables.includes("preferences"));
        assert.ok(tables.includes("daily_usage"));
        assert.ok(tables.includes("app_state"));
        assert.ok(tables.includes("sessions"));
        assert.ok(tables.includes("async_tts_tasks"));

        const videoTaskColumns = db
            .prepare("PRAGMA table_info(video_tasks)")
            .all()
            .map((r) => (r as { name: string; }).name);
        assert.ok(videoTaskColumns.includes("provider_status_msg"));

        const toolHistoryColumns = db
            .prepare("PRAGMA table_info(tool_input_history)")
            .all()
            .map((r) => (r as { name: string; }).name);
        assert.ok(toolHistoryColumns.includes("provider_status_msg"));

        const assetColumns = db
            .prepare("PRAGMA table_info(assets)")
            .all()
            .map((r) => (r as { name: string; }).name);
        assert.ok(assetColumns.includes("params_json"));

        // Verify all migrations recorded
        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r) => (r as { version: number; }).version);
        assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

        db.close();
    });

    it("only runs pending migrations on a partially migrated database", () => {
        const dir = tempMigrationsDir({
            "001-first.sql": "CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
            "002-second.sql": "CREATE TABLE t2 (id INTEGER PRIMARY KEY);"
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
            .map((r) => (r as { version: number; }).version);
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
            "002-bad.sql": "THIS IS NOT VALID SQL AT ALL;"
        });

        const db = new Database(":memory:");
        assert.throws(() => runMigrations(db, dir));

        // The bad migration should have been rolled back
        // schema_migrations table exists (created by runMigrations) but no versions recorded
        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r) => (r as { version: number; }).version);
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

    it("refuses unknown future schema versions", () => {
        const dir = tempMigrationsDir({
            "001-first.sql": "CREATE TABLE t1 (id INTEGER PRIMARY KEY);"
        });
        const db = new Database(":memory:");
        db.exec(`
            CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );
        `);
        db.exec(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (999, datetime('now'))"
        );
        assert.throws(() => runMigrations(db, dir), /newer than code/);
        db.close();
        rmSync(dir, { recursive: true });
    });

    it("released v1.0.0 schema fixture migrates to current schema", () => {
        const db = new Database(":memory:");
        db.exec(readFileSync("test/fixtures/db/v1.0.0/schema.sql", "utf-8"));
        runMigrations(db, join(import.meta.dirname ?? ".", "..", "..", "migrations"));
        const versions = db
            .prepare("SELECT version FROM schema_migrations ORDER BY version")
            .all()
            .map((r) => (r as { version: number; }).version);
        assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
        assert.ok(getOrCreateActiveSession(db));
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
            "003-sessions.sql": `CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                name_source TEXT NOT NULL DEFAULT 'default',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                archived_at TEXT
            );`
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
            .map((r) => (r as { name: string; }).name);
        assert.ok(tables.includes("messages"));
        assert.ok(tables.includes("preferences"));
        assert.ok(tables.includes("daily_usage"));
        assert.ok(tables.includes("app_state"));
        assert.ok(tables.includes("sessions"));
        assert.match(getOrCreateActiveSessionId(db), /^[0-9a-f-]{36}$/);
        db.close();
    });

    it("initDb creates active session row via getOrCreateActiveSession after migrations", () => {
        // Verifies that initDb creates the active session row in the sessions table.
        // When sessions table exists (after migrations), initDb calls getOrCreateActiveSession.
        // After initDb, the sessions table must contain the active session.
        const db = initDb(":memory:");
        const sessionId = getActiveSessionId(db);
        assert.ok(sessionId, "active session ID must be set after initDb");
        const session = getSession(db, sessionId);
        assert.ok(session, "active session row must exist in sessions table after initDb");
        assert.equal(session?.name, "New Chat");
        assert.equal(session?.name_source, "default");
        db.close();
    });

    it("initDb falls back to getOrCreateActiveSessionId when sessions table does not exist", () => {
        // Verifies that initDb handles databases without the sessions table gracefully.
        // In this case, it should use getOrCreateActiveSessionId (legacy fallback).
        const dir = mkdtempSync(join(tmpdir(), "hg-no-sessions-"));
        const migrationsDir = join(dir, "migrations");
        mkdirSync(migrationsDir, { recursive: true });

        // Create a minimal migrations dir that has pre-sessions schema but no sessions table
        // We include all migrations EXCEPT 008-create-sessions.sql
        const allMigrations = readdirSync(join(import.meta.dirname, "..", "..", "migrations"));
        for (const file of allMigrations) {
            if (file === "008-create-sessions.sql") continue; // Skip sessions migration
            copyFileSync(
                join(import.meta.dirname, "..", "..", "migrations", file),
                join(migrationsDir, file)
            );
        }

        const db = initDb(join(dir, "legacy.db"), migrationsDir);
        const sessionId = getActiveSessionId(db);
        assert.ok(sessionId, "active session ID must be set even without sessions table");
        assert.match(sessionId, /^[0-9a-f-]{36}$/);

        // sessions table should NOT exist
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
            .all();
        assert.equal(tables.length, 0, "sessions table should not exist in legacy DB");

        db.close();
        rmSync(dir, { recursive: true });
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

describe("User profile state", () => {
    let db: Database;

    beforeEach(() => {
        db = freshDb();
    });

    it("stores normalized DB profile", () => {
        const saved = saveUserProfile(db, {
            username: "  GamerKid  ",
            interests: " Minecraft ",
            hates: " spam ",
            favorites: "redstone",
            avatar: { type: "asset", value: "asset_123abc" }
        });

        assert.equal(saved.username, "GamerKid");
        assert.equal(saved.interests, "Minecraft");
        assert.deepEqual(getUserProfile(db).avatar, { type: "asset", value: "asset_123abc" });
    });

    it("trims oversized profile fields", () => {
        const saved = saveUserProfile(db, {
            username: "x".repeat(50),
            interests: "i".repeat(350),
            hates: "h".repeat(350),
            favorites: "f".repeat(350),
            avatar: { type: "asset", value: "" }
        });

        assert.equal(saved.username.length, 40);
        assert.equal(saved.interests.length, 300);
        assert.equal(saved.hates.length, 300);
        assert.equal(saved.favorites.length, 300);
        assert.deepEqual(saved.avatar, { type: "asset", value: "" });
    });

    it("rejects raw asset data and invalid asset avatar refs", () => {
        assert.throws(
            () =>
                saveUserProfile(db, {
                    username: "data:audio/mpeg;base64,abc"
                }),
            /profile must not contain raw asset data/
        );
        assert.throws(
            () =>
                saveUserProfile(db, {
                    username: "x",
                    avatar: "asset_123abc"
                }),
            /avatar must be an object/
        );
        assert.throws(
            () =>
                saveUserProfile(db, {
                    username: "x",
                    avatar: { type: "asset", value: "data:image/png;base64,abc" }
                }),
            /data URL not allowed/
        );
        assert.throws(
            () =>
                saveUserProfile(db, {
                    username: "x",
                    avatar: { type: "asset", value: "/asset/123" }
                }),
            /avatar asset id invalid/
        );
        assert.throws(
            () =>
                saveUserProfile(db, {
                    username: "x",
                    avatar: { type: "emoji", value: "🦊" }
                }),
            /avatar type invalid/
        );
    });

    it("delete resets profile to default", () => {
        saveUserProfile(db, {
            username: "GamerKid",
            avatar: { type: "asset", value: "asset_123abc" }
        });
        const reset = deleteUserProfile(db);
        assert.deepEqual(reset.avatar, { type: "asset", value: "" });
        assert.equal(getUserProfile(db).username, "");
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
            false
        );
    });
});

// ── Drafts ──────────────────────────────────────────────────────────

describe("Draft CRUD", () => {
    let db: Database;
    beforeEach(() => {
        db = freshDb();
    });

    it("saves, reads, and deletes chat drafts scoped by session", () => {
        const session = createSession(db);
        saveDraft(db, session.id, "chat", { text: "unfinished prompt" });
        assert.deepEqual(JSON.parse(getDraft(db, session.id, "chat")?.value_json), {
            text: "unfinished prompt"
        });
        deleteDraft(db, session.id, "chat");
        assert.equal(getDraft(db, session.id, "chat"), null);
    });

    it("rejects raw asset data in drafts", () => {
        const session = createSession(db);
        assert.throws(() =>
            saveDraft(db, session.id, "create", { image: "data:image/png;base64,aaaa" })
        );
    });
});

// ── Tool Input History ──────────────────────────────────────────────

describe("Tool input history", () => {
    let db: Database;
    beforeEach(() => {
        db = freshDb();
    });

    it("records, lists, and soft-hides structured tool input", () => {
        const session = createSession(db);
        const row = recordToolInputHistory(db, {
            session_id: session.id,
            origin: "create",
            tool_name: "generate_image",
            input: { prompt: "cat", aspect_ratio: "16:9" },
            status: "succeeded",
            asset_id: "asset_123",
            provider: { stage: "query", status_msg: "ok", task_id: "task-1", file_id: "file-1" }
        });
        const items = listToolInputHistory(db, session.id, { kind: "image" });
        assert.equal(items.length, 1);
        assert.equal(items[0].id, row.id);
        assert.deepEqual(JSON.parse(items[0].input_json), {
            prompt: "cat",
            aspect_ratio: "16:9"
        });
        assert.equal(items[0].provider_stage, "query");
        assert.equal(items[0].provider_status_msg, "ok");
        assert.equal(items[0].provider_task_id, "task-1");
        assert.equal(items[0].provider_file_id, "file-1");
        hideToolInputHistory(db, session.id, row.id);
        assert.equal(listToolInputHistory(db, session.id, { kind: "image" }).length, 0);
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
            /raw asset data/
        );
        assert.throws(
            () => assertNoRawAssetDataInMessage(`x;base64,${"a".repeat(4096)}`),
            /raw base64 asset data/
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
            content: m.content
        }));
        assert.deepEqual(snapshot, [
            { session_id: "snap-session", role: "user", content: "What's 2+2?" },
            { session_id: "snap-session", role: "assistant", content: "4" },
            { session_id: "snap-session", role: "user", content: "Thanks!" }
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
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 7200)"
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 7200);
        assert.equal(status.warning, true);
        assert.equal(status.blocked, false);
    });

    it("blocks at 100% limit", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 9000)"
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 9000);
        assert.equal(status.warning, true);
        assert.equal(status.blocked, true);
    });

    it("blocks when over limit", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'speech', 9999)"
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 9999);
        assert.equal(status.blocked, true);
        assert.equal(status.remaining, 0);
    });

    it("resets for a different date (daily reset)", () => {
        // Insert usage for yesterday
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now', '-1 day'), 'speech', 9000)"
        ).run();

        const status = checkQuota(db, "speech");
        assert.equal(status.used, 0);
        assert.equal(status.blocked, false);
    });

    it("tracks multiple features independently for quotas", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 100)"
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
                blocked: status.blocked
            },
            { used: 2, limit: 100, remaining: 98, warning: false, blocked: false }
        );
    });

    it("snapshot: quota status at warning threshold", () => {
        // Image limit = 100, 80% = 80
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 80)"
        ).run();

        const status = checkQuota(db, "image");
        assert.deepEqual(
            {
                used: status.used,
                limit: status.limit,
                remaining: status.remaining,
                warning: status.warning,
                blocked: status.blocked
            },
            { used: 80, limit: 100, remaining: 20, warning: true, blocked: false }
        );
    });

    it("snapshot: quota status at blocked threshold", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'music', 100)"
        ).run();

        const status = checkQuota(db, "music");
        assert.deepEqual(
            {
                used: status.used,
                limit: status.limit,
                remaining: status.remaining,
                warning: status.warning,
                blocked: status.blocked
            },
            { used: 100, limit: 100, remaining: 0, warning: true, blocked: true }
        );
    });
});

// ── QUOTAS constant test ────────────────────────────────────────────

describe("QUOTAS constant", () => {
    it("has correct limits", () => {
        assert.equal(QUOTAS.speech, 9000);
        assert.equal(QUOTAS.image, 100);
        assert.equal(QUOTAS.music, 100);
        assert.equal(QUOTAS.lyrics, 100);
    });
});

// ── Transaction helper ──────────────────────────────────────────────

describe("runTransaction", () => {
    it("commits successful work and rolls back thrown work", () => {
        const db = freshDb();
        db.exec("CREATE TABLE tx_test (value TEXT NOT NULL)");

        assert.equal(
            runTransaction(db, () => db.prepare("INSERT INTO tx_test VALUES ('ok')").run().changes),
            1
        );
        assert.throws(
            () =>
                runTransaction(db, () => {
                    db.prepare("INSERT INTO tx_test VALUES ('nope')").run();
                    throw new Error("boom");
                }),
            /boom/
        );

        assert.deepEqual(db.prepare("SELECT value FROM tx_test").all().map((row) => ({ ...row })), [
            { value: "ok" }
        ]);
        db.close();
    });

    it("uses savepoints inside an existing transaction", () => {
        const db = freshDb();
        db.exec("CREATE TABLE tx_test (value TEXT NOT NULL)");

        runTransaction(db, () => {
            db.prepare("INSERT INTO tx_test VALUES ('outer')").run();
            assert.throws(
                () =>
                    runTransaction(db, () => {
                        db.prepare("INSERT INTO tx_test VALUES ('inner')").run();
                        throw new Error("nested");
                    }),
                /nested/
            );
            db.prepare("INSERT INTO tx_test VALUES ('after')").run();
        });

        assert.deepEqual(db.prepare("SELECT value FROM tx_test").all().map((row) => ({ ...row })), [
            { value: "outer" },
            { value: "after" }
        ]);
        db.close();
    });
});

// ── Atomic quota consumption ────────────────────────────────────────

describe("consumeQuota", () => {
    let db: Database;
    beforeEach(() => {
        db = freshDb();
    });

    it("allows consumption when quota is available", () => {
        assert.equal(consumeQuota(db, "image"), 1);
        assert.equal(checkQuota(db, "image").used, 1);
    });

    it("returns null when quota is exhausted", () => {
        for (let i = 0; i < QUOTAS.image; i++) {
            assert.notEqual(consumeQuota(db, "image"), null);
        }

        assert.equal(consumeQuota(db, "image"), null);
        assert.equal(checkQuota(db, "image").used, QUOTAS.image);
    });

    it("does not increment count beyond limit", () => {
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 99)"
        ).run();

        assert.equal(consumeQuota(db, "image"), 100);
        assert.equal(consumeQuota(db, "image"), null);
        assert.equal(consumeQuota(db, "image"), null);
        assert.equal(checkQuota(db, "image").used, 100);
    });

    it("does not increment any quota feature beyond its limit", () => {
        for (const [feature, limit] of Object.entries(QUOTAS)) {
            db.prepare(
                "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), ?, ?)"
            ).run(feature, limit);

            assert.equal(consumeQuota(db, feature), null, feature);
            assert.equal(checkQuota(db, feature).used, limit, feature);
        }
    });

    it("returns 0 for features with no quota limit", () => {
        assert.equal(consumeQuota(db, "unknown_feature"), 0);
        assert.deepEqual(getUsageToday(db), {});
    });

    it("consumes independently for different features", () => {
        assert.equal(consumeQuota(db, "image"), 1);
        assert.equal(consumeQuota(db, "music"), 1);
        assert.equal(checkQuota(db, "image").used, 1);
        assert.equal(checkQuota(db, "music").used, 1);
    });

    it("consumes speech quota by character amount", () => {
        assert.equal(consumeQuota(db, "speech", 5), 5);
        assert.equal(checkQuota(db, "speech").used, 5);
        assert.equal(consumeQuota(db, "speech", QUOTAS.speech - 5), QUOTAS.speech);
        assert.equal(consumeQuota(db, "speech", 1), null);
        assert.equal(checkQuota(db, "speech").used, QUOTAS.speech);
    });

    it("releases consumed quota after failed attempts", () => {
        assert.equal(consumeQuota(db, "image"), 1);
        releaseQuota(db, "image");
        assert.equal(checkQuota(db, "image").used, 0);
    });

    it("releases speech quota by character amount", () => {
        assert.equal(consumeQuota(db, "speech", 5), 5);
        releaseQuota(db, "speech", 3);
        assert.equal(checkQuota(db, "speech").used, 2);
    });

    it("releaseQuota never decrements below zero", () => {
        releaseQuota(db, "image");
        assert.equal(checkQuota(db, "image").used, 0);
    });

    it("rejects consumption when remaining quota is insufficient", () => {
        // Simulate existing usage: 97 used out of 100 limit (3 remaining)
        db.prepare(
            "INSERT INTO daily_usage (date, feature, count) VALUES (date('now'), 'image', 97)"
        ).run();
        assert.equal(checkQuota(db, "image").used, 97);

        // Trying to consume 5 when only 3 remaining should fail
        assert.equal(consumeQuota(db, "image", 5), null);
        // Count should remain 97, not 102 (which would exceed limit of 100)
        assert.equal(checkQuota(db, "image").used, 97);
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

    it("getAsset returns null for unknown id", () => {
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
            size_bytes: 12345
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
                is_instrumental: true
            })
        });
        const asset = getAsset(db, id);
        assert.ok(asset);
        assert.ok(asset.params_json);
        assert.equal(JSON.parse(asset.params_json).model, "music-2.6");
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
                    params_json: JSON.stringify({ raw: "data:audio/mp3;base64,aaaa" })
                }),
            /raw asset data/
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
            size_bytes: 98765
        });
        const asset = getAsset(db, id);
        assert.notEqual(asset, undefined);
        assert.equal(asset?.filename, "song.mp3");
        assert.equal(asset?.session_id, "session-2");
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
            size_bytes: 100
        });
        saveAsset(db, {
            id: id2,
            session_id: "B",
            type: "image",
            filename: "b.png",
            mime_type: "image/png",
            prompt: null,
            tool_name: "img",
            size_bytes: 200
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
            created_at: now - 10
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
            created_at: now
        });
        const assets = getAssets(db, "order-test");
        assert.equal(assets.length, 2);
        // Newest first (by created_at DESC)
        assert.equal(assets[0].id, id2);
        assert.equal(assets[1].id, id1);
    });
});

describe("Mutation-strength DB invariants", () => {
    it("autoNameSession only allows default sessions", () => {
        const db = freshDb();
        const defaultSession = createSession(db, undefined, "New Chat");
        const autoNamed = autoNameSession(db, defaultSession.id, "  Boss Fight  ");
        assert.equal(autoNamed.name, "Boss Fight");
        assert.equal(autoNamed.name_source, "auto");

        const session = createSession(db, undefined, "Manual");
        renameSession(db, session.id, "Manual Name");
        assert.throws(
            () => autoNameSession(db, session.id, "Auto Name"),
            /session not auto-nameable/
        );
        db.close();
    });

    it("rejects invalid draft kinds", () => {
        const db = freshDb();
        const session = createSession(db);
        assert.throws(
            () => saveDraft(db, session.id, "bad", { text: "x" }),
            /invalid draft kind/
        );
        db.close();
    });

    it("validates tool history status and maps kinds", () => {
        const cases = [
            ["generate_image", "image"],
            ["analyze_image", "analyze"],
            ["generate_music", "music"],
            ["generate_lyrics", "lyrics"],
            ["generate_music_cover", "cover"],
            ["text_to_speech", "voice"],
            ["generate_long_speech", "voice"],
            ["web_search", "search"],
            ["unknown", "other"]
        ] as const;
        for (const [tool_name, kind] of cases) {
            const db = freshDb();
            const session = createSession(db);
            recordToolInputHistory(db, {
                session_id: session.id,
                origin: "agent",
                tool_name,
                input: { prompt: tool_name },
                status: "succeeded"
            });
            assert.equal(
                listToolInputHistory(db, session.id, { kind }).at(0)?.tool_name,
                tool_name
            );
            db.close();
        }
        const db = freshDb();
        const session = createSession(db);
        assert.throws(
            () =>
                recordToolInputHistory(db, {
                    session_id: session.id,
                    origin: "agent",
                    tool_name: "generate_image",
                    input: {},
                    status: "done"
                }),
            /invalid history status/
        );
        db.close();
    });

    it("clamps create history pagination", () => {
        const db = freshDb();
        const session = createSession(db);
        for (let i = 0; i < 60; i++) {
            recordToolInputHistory(db, {
                session_id: session.id,
                origin: "agent",
                tool_name: "web_search",
                input: { query: String(i) },
                status: "succeeded"
            });
        }
        assert.equal(listToolInputHistory(db, session.id, { limit: 999 }).length, 50);
        assert.equal(listToolInputHistory(db, session.id, { limit: -5 }).length, 1);
        assert.equal(listToolInputHistory(db, session.id, { limit: 1, offset: -10 }).length, 1);
        db.close();
    });

    it("rejects invalid quota amounts and exact oversized amounts", () => {
        const db = freshDb();
        assert.throws(() => consumeQuota(db, "image", 0), /quota amount invalid/);
        assert.throws(() => consumeQuota(db, "image", 1.5), /quota amount invalid/);
        assert.equal(consumeQuota(db, "image", QUOTAS.image + 1), null);
        assert.equal(consumeQuota(db, "image", QUOTAS.image), QUOTAS.image);
        db.close();
    });

    it("raw asset guard catches compact base64 payloads", () => {
        assert.throws(
            () => assertNoRawAssetDataInMessage(`data:image/png;base64,${"A".repeat(4096)}`),
            /raw asset data/
        );
    });

    it("persists async TTS task state", () => {
        const db = freshDb();
        const now = Date.now();
        saveAsyncTtsTask(db, {
            id: "tts_1",
            session_id: "session-1",
            provider_task_id: "provider-1",
            status: "running",
            text_summary: "story (1000 chars)",
            voice_id: "English_expressive_narrator",
            file_id: null,
            asset_id: null,
            error: null,
            created_at: now,
            updated_at: now
        });
        updateAsyncTtsTask(db, "tts_1", {
            status: "succeeded",
            file_id: "file-1",
            asset_id: "asset_1"
        });
        const tasks = listAsyncTtsTasks(db, "session-1");
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].status, "succeeded");
        assert.equal(tasks[0].asset_id, "asset_1");
        db.close();
    });
});
