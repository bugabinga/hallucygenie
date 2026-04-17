// HallucyGenie — SQLite persistence, migrations, and quota tracking
// Uses Node.js built-in node:sqlite (v25+)

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

// ── Quota Limits (MiniMax Plus-Highspeed plan) ──────────────────────

export const QUOTAS: Record<string, number> = {
  speech: 9000,
  image: 100,
  music: 100,
};

const QUOTA_WARNING_THRESHOLD = 0.8;

// ── Database Initialization ─────────────────────────────────────────

/**
 * Run all pending migrations from the migrations directory.
 * Migrations are numbered SQL files (001-*.sql, 002-*.sql, etc.).
 * Applied versions are tracked in the schema_migrations table.
 */
export function runMigrations(db: DatabaseSync, migrationsDir: string): void {
  // Ensure the schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Get already-applied versions
  const applied = new Set<number>();
  const rows = db.prepare("SELECT version FROM schema_migrations").all();
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
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(version);
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
export function initDb(dbPath: string, migrationsDir?: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const mDir = migrationsDir ?? join(import.meta.dirname ?? ".", "migrations");
  runMigrations(db, mDir);

  return db;
}

// ── Message CRUD ────────────────────────────────────────────────────

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  created_at: string;
}

/**
 * Save a message to the database.
 */
export function saveMessage(
  db: DatabaseSync,
  sessionId: string,
  role: string,
  content: string,
  toolCalls?: string | null,
  toolCallId?: string | null,
): void {
  db.prepare(
    `INSERT INTO messages (session_id, role, content, tool_calls_json, tool_call_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, role, content, toolCalls ?? null, toolCallId ?? null);
}

/**
 * Get all messages for a session, ordered by created_at.
 */
export function getMessages(db: DatabaseSync, sessionId: string): MessageRow[] {
  return db
    .prepare(
      `SELECT id, session_id, role, content, tool_calls_json, tool_call_id, created_at
       FROM messages
       WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(sessionId) as MessageRow[];
}

// ── Preference CRUD ─────────────────────────────────────────────────

/**
 * Save or update a preference (upsert).
 */
export function savePreference(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

/**
 * Get all preferences as a { key: value } object.
 */
export function getPreferences(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM preferences").all() as Array<{ key: string; value: string }>;
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
export function trackUsage(db: DatabaseSync, feature: string): void {
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
export function getUsageToday(db: DatabaseSync): Record<string, number> {
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
export function checkQuota(db: DatabaseSync, feature: string): QuotaStatus {
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
