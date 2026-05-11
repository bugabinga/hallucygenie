// HallucyGenie — SQLite persistence, migrations, and quota tracking
// Uses bun:sqlite

import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Quota Limits (MiniMax Plus-Highspeed plan) ──────────────────────

export const QUOTAS: Record<string, number> = {
    speech: 9000,
    image: 100,
    music: 100,
    lyrics: 100,
};

const QUOTA_WARNING_THRESHOLD = 0.8;

// ── Database Initialization ─────────────────────────────────────────

/**
 * Run all pending migrations from the migrations directory.
 * Migrations are numbered SQL files (001-*.sql, 002-*.sql, etc.).
 * Applied versions are tracked in the schema_migrations table.
 */
export function runMigrations(db: Database, migrationsDir: string): void {
    // Ensure the schema_migrations table exists
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

    // Get already-applied versions
    const applied = new Set<number>();
    const rows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{
        version: number;
    }>;
    for (const row of rows) {
        applied.add(row.version as number);
    }

    // Read and sort migration files
    let files: string[];
    try {
        files = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort();
    } catch {
        // No migrations directory — nothing to do
        return;
    }

    // Run pending migrations in a transaction
    const pending = files.filter((f) => {
        const version = parseInt(f.split("-")[0], 10);
        return !applied.has(version);
    });

    if (pending.length === 0) return;

    db.exec("BEGIN TRANSACTION");
    try {
        for (const file of pending) {
            const version = parseInt(file.split("-")[0], 10);
            const sql = readFileSync(join(migrationsDir, file), "utf-8");
            db.exec(sql);
            db.prepare(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
            ).run(version);
        }
        db.exec("COMMIT");
    } catch (err) {
        db.exec("ROLLBACK");
        throw err;
    }
}

/**
 * Open a SQLite database and run all pending migrations.
 */
export function initDb(dbPath: string, migrationsDir?: string): Database {
    const db = new Database(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    const mDir = migrationsDir ?? join(import.meta.dirname ?? ".", "..", "migrations");
    runMigrations(db, mDir);
    if (tableExists(db, "sessions")) {
        getOrCreateActiveSession(db);
    } else {
        getOrCreateActiveSessionId(db);
    }

    return db;
}

// ── App State ───────────────────────────────────────────────────────

const ACTIVE_SESSION_KEY = "active_session_id";
const USER_PROFILE_KEY = "user_profile_json";
const DEFAULT_SESSION_NAME = "New Chat";
const DEFAULT_SESSION_NAME_SOURCE = "default";

export interface UserProfile {
    version: 1;
    username: string;
    interests: string;
    hates: string;
    favorites: string;
    avatar: { type: "emoji" | "asset"; value: string };
    updatedAt: number;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
    version: 1,
    username: "",
    interests: "",
    hates: "",
    favorites: "",
    avatar: { type: "emoji", value: "🎮" },
    updatedAt: 0,
};

function tableExists(db: Database, name: string): boolean {
    const row = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name);
    return row != null;
}

function normalizeSessionId(sessionId: string, context: string): string {
    const trimmed = sessionId.trim();
    if (!trimmed) throw new Error(`${context}: session id must not be blank`);
    return trimmed;
}

export function getActiveSessionId(db: Database): string | null {
    const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(ACTIVE_SESSION_KEY) as
        | { value: string }
        | undefined;
    if (!row) return null;
    return normalizeSessionId(row.value, "getActiveSessionId");
}

export function setActiveSessionId(db: Database, sessionId: string): void {
    const normalized = normalizeSessionId(sessionId, "setActiveSessionId");
    db.prepare(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(ACTIVE_SESSION_KEY, normalized);
}

export function getOrCreateActiveSessionId(db: Database): string {
    const sessionId = getActiveSessionId(db);
    if (sessionId) {
        if (tableExists(db, "sessions")) ensureSession(db, sessionId);
        return sessionId;
    }

    const newSessionId = randomUUID();
    if (tableExists(db, "sessions")) createSession(db, newSessionId, DEFAULT_SESSION_NAME);
    setActiveSessionId(db, newSessionId);
    return newSessionId;
}

function truncateCodepoints(value: string, max: number): string {
    return Array.from(value.trim()).slice(0, max).join("");
}

function rejectRawProfileText(value: string): void {
    assertNoRawAssetDataInMessage(value);
    if (/data:(?:image|audio|video)\//i.test(value)) {
        throw new Error("profile must not contain raw asset data");
    }
}

function normalizeProfileText(value: unknown, field: string, max: number): string {
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    rejectRawProfileText(value);
    return truncateCodepoints(value, max);
}

function normalizeProfileAvatar(value: unknown): UserProfile["avatar"] {
    if (!value || typeof value !== "object") return DEFAULT_USER_PROFILE.avatar;
    const avatar = value as Record<string, unknown>;
    if (avatar.type !== "emoji" && avatar.type !== "asset") throw new Error("avatar type invalid");
    if (typeof avatar.value !== "string") throw new Error("avatar value must be a string");
    const trimmed = avatar.value.trim();
    if (/^data:/i.test(trimmed)) throw new Error("avatar data URL not allowed");
    assertNoRawAssetDataInMessage(trimmed);
    if (avatar.type === "emoji") {
        if (!trimmed) return DEFAULT_USER_PROFILE.avatar;
        const emoji = truncateCodepoints(trimmed, 4);
        if (!emoji) return DEFAULT_USER_PROFILE.avatar;
        return { type: "emoji", value: emoji };
    }
    if (!/^asset_[0-9a-f-]+$/i.test(trimmed)) throw new Error("avatar asset id invalid");
    return { type: "asset", value: trimmed };
}

export function normalizeUserProfile(input: unknown, now = Date.now()): UserProfile {
    if (!input || typeof input !== "object") throw new Error("profile must be an object");
    const obj = input as Record<string, unknown>;
    return {
        version: 1,
        username: normalizeProfileText(obj.username ?? "", "username", 40),
        interests: normalizeProfileText(obj.interests ?? "", "interests", 300),
        hates: normalizeProfileText(obj.hates ?? "", "hates", 300),
        favorites: normalizeProfileText(obj.favorites ?? "", "favorites", 300),
        avatar: normalizeProfileAvatar(obj.avatar),
        updatedAt: now,
    };
}

export function getUserProfile(db: Database): UserProfile {
    const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(USER_PROFILE_KEY) as
        | { value: string }
        | undefined;
    if (!row) return { ...DEFAULT_USER_PROFILE, avatar: { ...DEFAULT_USER_PROFILE.avatar } };
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
    return normalizeUserProfile(parsed, updatedAt);
}

export function saveUserProfile(db: Database, input: unknown): UserProfile {
    const profile = normalizeUserProfile(input);
    db.prepare(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(USER_PROFILE_KEY, JSON.stringify(profile));
    return profile;
}

export function deleteUserProfile(db: Database): UserProfile {
    db.prepare("DELETE FROM app_state WHERE key = ?").run(USER_PROFILE_KEY);
    return { ...DEFAULT_USER_PROFILE, avatar: { ...DEFAULT_USER_PROFILE.avatar } };
}

// ── Sessions ────────────────────────────────────────────────────────

export interface SessionRow {
    id: string;
    name: string;
    name_source: "default" | "manual" | "auto";
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}

function normalizeSessionName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("session name must not be blank");
    return trimmed;
}

export function createSession(
    db: Database,
    id: string = randomUUID(),
    name = DEFAULT_SESSION_NAME,
): SessionRow {
    const normalized = normalizeSessionName(name);
    db.prepare(
        `INSERT INTO sessions (id, name, name_source, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    ).run(id, normalized, DEFAULT_SESSION_NAME_SOURCE);
    return getSession(db, id)!;
}

function ensureSession(db: Database, id: string): SessionRow {
    const existing = getSession(db, id);
    if (existing) return existing;
    return createSession(db, id, DEFAULT_SESSION_NAME);
}

export function getOrCreateActiveSession(db: Database): SessionRow {
    const sessionId = getOrCreateActiveSessionId(db);
    return ensureSession(db, sessionId);
}

export function getSession(db: Database, id: string): SessionRow | null {
    return db
        .prepare(
            `SELECT id, name, name_source, created_at, updated_at, archived_at
             FROM sessions
             WHERE id = ?`,
        )
        .get(id) as SessionRow | null;
}

export function listSessions(db: Database): SessionRow[] {
    return db
        .prepare(
            `SELECT id, name, name_source, created_at, updated_at, archived_at
             FROM sessions
             WHERE archived_at IS NULL
             ORDER BY updated_at DESC, created_at DESC, id DESC`,
        )
        .all() as SessionRow[];
}

export function renameSession(db: Database, id: string, name: string): SessionRow {
    const normalized = normalizeSessionName(name);
    const result = db
        .prepare(
            `UPDATE sessions
             SET name = ?, name_source = 'manual', updated_at = datetime('now')
             WHERE id = ? AND archived_at IS NULL`,
        )
        .run(normalized, id);
    if (result.changes !== 1) throw new Error(`session not found: ${id}`);
    return getSession(db, id)!;
}

export function archiveSession(db: Database, id: string): void {
    const result = db
        .prepare(
            `UPDATE sessions
             SET archived_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ? AND archived_at IS NULL`,
        )
        .run(id);
    if (result.changes !== 1) throw new Error(`session not found: ${id}`);
}

export function autoNameSession(db: Database, id: string, name: string): SessionRow {
    const normalized = normalizeSessionName(name);
    const result = db
        .prepare(
            `UPDATE sessions
             SET name = ?, name_source = 'auto', updated_at = datetime('now')
             WHERE id = ? AND archived_at IS NULL AND name_source = 'default'`,
        )
        .run(normalized, id);
    if (result.changes !== 1) throw new Error(`session not auto-nameable: ${id}`);
    return getSession(db, id)!;
}

// ── Drafts ─────────────────────────────────────────────────────────

export interface DraftRow {
    session_id: string;
    kind: "chat" | "create";
    value_json: string;
    updated_at: string;
}

function validateDraftKind(kind: string): "chat" | "create" {
    if (kind === "chat" || kind === "create") return kind;
    throw new Error(`invalid draft kind: ${kind}`);
}

export function getDraft(
    db: Database,
    sessionId: string,
    kind: "chat" | "create",
): DraftRow | null {
    return db
        .prepare(
            "SELECT session_id, kind, value_json, updated_at FROM drafts WHERE session_id = ? AND kind = ?",
        )
        .get(sessionId, kind) as DraftRow | null;
}

export function saveDraft(
    db: Database,
    sessionId: string,
    kind: "chat" | "create",
    value: unknown,
): DraftRow {
    const validKind = validateDraftKind(kind);
    const valueJson = JSON.stringify(value);
    assertNoRawAssetDataInMessage(valueJson);
    db.prepare(
        `INSERT INTO drafts (session_id, kind, value_json, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(session_id, kind) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`,
    ).run(sessionId, validKind, valueJson);
    return getDraft(db, sessionId, validKind)!;
}

export function deleteDraft(db: Database, sessionId: string, kind: "chat" | "create"): void {
    db.prepare("DELETE FROM drafts WHERE session_id = ? AND kind = ?").run(
        sessionId,
        validateDraftKind(kind),
    );
}

// ── Tool input history ─────────────────────────────────────────────

export interface ToolInputHistoryRow {
    id: string;
    session_id: string;
    kind: string;
    origin: "create" | "chat" | "agent";
    tool_name: string;
    input_json: string;
    status: "submitted" | "succeeded" | "failed";
    asset_id: string | null;
    hidden_at: string | null;
    created_at: string;
    updated_at: string;
}

export function kindForTool(toolName: string): string {
    if (toolName === "generate_image") return "image";
    if (toolName === "generate_music" || toolName === "generate_lyrics") return "music";
    if (toolName === "text_to_speech") return "voice";
    if (toolName === "web_search") return "search";
    if (toolName === "analyze_image") return "image";
    return "other";
}

function validateHistoryStatus(status: string): ToolInputHistoryRow["status"] {
    if (status === "submitted" || status === "succeeded" || status === "failed") return status;
    throw new Error(`invalid history status: ${status}`);
}

export function recordToolInputHistory(
    db: Database,
    input: {
        session_id: string;
        kind?: string;
        origin: "create" | "chat" | "agent";
        tool_name: string;
        input: Record<string, unknown>;
        status: "submitted" | "succeeded" | "failed";
        asset_id?: string | null;
    },
): ToolInputHistoryRow {
    const id = randomUUID();
    const inputJson = JSON.stringify(input.input);
    assertNoRawAssetDataInMessage(inputJson);
    db.prepare(
        `INSERT INTO tool_input_history
         (id, session_id, kind, origin, tool_name, input_json, status, asset_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).run(
        id,
        input.session_id,
        input.kind ?? kindForTool(input.tool_name),
        input.origin,
        input.tool_name,
        inputJson,
        validateHistoryStatus(input.status),
        input.asset_id ?? null,
    );
    return getToolInputHistory(db, id)!;
}

export function getToolInputHistory(db: Database, id: string): ToolInputHistoryRow | null {
    return db
        .prepare("SELECT * FROM tool_input_history WHERE id = ?")
        .get(id) as ToolInputHistoryRow | null;
}

export function listToolInputHistory(
    db: Database,
    sessionId: string,
    options: { kind?: string; limit?: number; offset?: number } = {},
): ToolInputHistoryRow[] {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);
    if (options.kind) {
        return db
            .prepare(
                `SELECT * FROM tool_input_history
                 WHERE session_id = ? AND kind = ? AND hidden_at IS NULL
                 ORDER BY created_at DESC, id DESC
                 LIMIT ? OFFSET ?`,
            )
            .all(sessionId, options.kind, limit, offset) as ToolInputHistoryRow[];
    }
    return db
        .prepare(
            `SELECT * FROM tool_input_history
             WHERE session_id = ? AND hidden_at IS NULL
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
        )
        .all(sessionId, limit, offset) as ToolInputHistoryRow[];
}

export function hideToolInputHistory(db: Database, sessionId: string, id: string): void {
    const result = db
        .prepare(
            `UPDATE tool_input_history
             SET hidden_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ? AND session_id = ? AND hidden_at IS NULL`,
        )
        .run(id, sessionId);
    if (result.changes !== 1) throw new Error(`history item not found: ${id}`);
}

// ── Message CRUD ────────────────────────────────────────────────────

export interface MessageRow {
    id: number;
    session_id: string;
    role: string;
    content: string;
    tool_calls_json: string | null;
    tool_call_id: string | null;
    thinking: string | null;
    created_at: string;
}

export function assertNoRawAssetDataInMessage(content: string): void {
    if (/data:(?:image|audio|video)\//i.test(content)) {
        throw new Error("raw asset data must not be stored in messages");
    }
    if (/;base64,[A-Za-z0-9+/]{4096,}={0,2}/.test(content)) {
        throw new Error("raw base64 asset data must not be stored in messages");
    }
}

function assertMessageTextIsSafe(content: string, thinking?: string | null): void {
    assertNoRawAssetDataInMessage(content);
    if (thinking) assertNoRawAssetDataInMessage(thinking);
}

/**
 * Save a message to the database.
 */
export function saveMessage(
    db: Database,
    sessionId: string,
    role: string,
    content: string,
    toolCalls?: string | null,
    toolCallId?: string | null,
    thinking?: string | null,
): void {
    assertMessageTextIsSafe(content, thinking);
    db.prepare(
        `INSERT INTO messages (session_id, role, content, tool_calls_json, tool_call_id, thinking)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, role, content, toolCalls ?? null, toolCallId ?? null, thinking ?? null);
}

/**
 * Get all messages for a session, ordered by created_at.
 */
export function getMessages(db: Database, sessionId: string): MessageRow[] {
    return db
        .prepare(
            `SELECT id, session_id, role, content, tool_calls_json, tool_call_id, thinking, created_at
       FROM messages
       WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`,
        )
        .all(sessionId) as unknown as MessageRow[];
}

// ── Preference CRUD ─────────────────────────────────────────────────

/**
 * Save or update a preference (upsert).
 */
export function savePreference(db: Database, key: string, value: string): void {
    db.prepare(
        `INSERT INTO preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(key, value);
}

/**
 * Get all preferences as a { key: value } object.
 */
export function getPreferences(db: Database): Record<string, string> {
    const rows = db.prepare("SELECT key, value FROM preferences").all() as Array<{
        key: string;
        value: string;
    }>;
    const result: Record<string, string> = {};
    for (const row of rows) {
        result[row.key] = row.value;
    }
    return result;
}

// ── Usage Tracking ──────────────────────────────────────────────────

/**
 * Increment usage count for a feature today.
 * Inserts a new row if none exists for today + feature.
 */
export function trackUsage(db: Database, feature: string): void {
    db.prepare(
        `INSERT INTO daily_usage (date, feature, count)
     VALUES (date('now'), ?, 1)
     ON CONFLICT(date, feature) DO UPDATE SET count = count + 1`,
    ).run(feature);
}

/**
 * Get today's usage counts for all tracked features.
 * Returns { speech: N, image: N, music: N } — only includes features with usage.
 */
export function getUsageToday(db: Database): Record<string, number> {
    const rows = db
        .prepare("SELECT feature, count FROM daily_usage WHERE date = date('now')")
        .all() as Array<{ feature: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
        result[row.feature] = row.count;
    }
    return result;
}

// ── Quota Enforcement ───────────────────────────────────────────────

export interface QuotaStatus {
    used: number;
    limit: number;
    remaining: number;
    warning: boolean;
    blocked: boolean;
}

/**
 * Check quota status for a feature.
 * Returns usage info and whether the quota is warned (80%) or blocked (100%).
 */
export function checkQuota(db: Database, feature: string): QuotaStatus {
    const limit = QUOTAS[feature] ?? 0;
    if (limit === 0) {
        return { used: 0, limit: 0, remaining: 0, warning: false, blocked: false };
    }

    const row = db
        .prepare("SELECT count FROM daily_usage WHERE date = date('now') AND feature = ?")
        .get(feature) as { count: number } | undefined;

    const used = row?.count ?? 0;
    const remaining = Math.max(0, limit - used);
    const warning = used >= limit * QUOTA_WARNING_THRESHOLD;
    const blocked = used >= limit;

    return { used, limit, remaining, warning, blocked };
}

/**
 * Atomically check and consume quota for a feature.
 * Returns the new usage count, or null if quota was already exhausted.
 */
export function consumeQuota(db: Database, feature: string, amount = 1): number | null {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("quota amount invalid");
    const limit = QUOTAS[feature] ?? 0;
    if (limit === 0) return 0;
    if (amount > limit) return null;

    const result = db
        .prepare(
            `INSERT INTO daily_usage (date, feature, count)
             VALUES (date('now'), ?, ?)
             ON CONFLICT(date, feature) DO UPDATE SET count = count + ?
             WHERE daily_usage.count + ? <= ?`,
        )
        .run(feature, amount, amount, amount, limit);

    if (result.changes === 0) return null;

    const row = db
        .prepare("SELECT count FROM daily_usage WHERE date = date('now') AND feature = ?")
        .get(feature) as { count: number } | undefined;
    return row?.count ?? amount;
}

/**
 * Release previously consumed quota after a tool attempt fails.
 * This preserves atomic pre-execution reservation while charging only successful outputs.
 */
export function releaseQuota(db: Database, feature: string, amount = 1): void {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("quota amount invalid");
    if ((QUOTAS[feature] ?? 0) === 0) return;
    db.prepare(
        `UPDATE daily_usage
         SET count = max(0, count - ?)
         WHERE date = date('now') AND feature = ? AND count > 0`,
    ).run(amount, feature);
}

// ── Assets ─────────────────────────────────────────────────────────

export interface AssetRow {
    id: string;
    session_id: string;
    type: "image" | "audio" | "music";
    filename: string;
    mime_type: string;
    prompt: string | null;
    tool_name: string;
    size_bytes: number;
    created_at: number;
    params_json: string | null;
}

function assertAssetParamsAreSafe(paramsJson?: string | null): void {
    if (!paramsJson) return;
    JSON.parse(paramsJson);
    assertNoRawAssetDataInMessage(paramsJson);
}

export function saveAsset(
    db: Database,
    asset: Omit<AssetRow, "created_at" | "params_json"> & {
        created_at?: number;
        params_json?: string | null;
    },
): void {
    assertAssetParamsAreSafe(asset.params_json);
    db.prepare(
        "INSERT INTO assets (id, session_id, type, filename, mime_type, prompt, tool_name, size_bytes, created_at, params_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
        asset.id,
        asset.session_id,
        asset.type,
        asset.filename,
        asset.mime_type,
        asset.prompt,
        asset.tool_name,
        asset.size_bytes,
        asset.created_at ?? Date.now(),
        asset.params_json ?? null,
    );
}

export function getAssets(db: Database, sessionId: string): AssetRow[] {
    return db
        .prepare("SELECT * FROM assets WHERE session_id = ? ORDER BY created_at DESC")
        .all(sessionId) as unknown as AssetRow[];
}

export function getAsset(db: Database, assetId: string): AssetRow | null {
    return db
        .prepare("SELECT * FROM assets WHERE id = ?")
        .get(assetId) as unknown as AssetRow | null;
}
