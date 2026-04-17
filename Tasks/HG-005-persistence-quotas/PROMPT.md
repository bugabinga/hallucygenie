# Task: HG-005 — Persistence, Migrations, and Quota Tracking

**Created:** 2026-04-16
**Size:** M

## Review Level: 2 (Plan + Code)

**Assessment:** Data layer — SQLite, migrations, quota enforcement. Clean separation from agent logic.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Implement SQLite persistence with a migration system, message/preference CRUD, daily
usage tracking, and quota enforcement. This is the "memory" — it stores conversations,
user preferences, and protects daily MiniMax quotas from being exhausted.

**Migration system design:**
- Numbered SQL files in `migrations/`: `001-*.sql`, `002-*.sql`, etc.
- `schema_migrations` table tracks applied versions
- `runMigrations(db)` reads dir sorted, checks applied, runs pending in transaction
- Failed migration → rollback → app fails to start (fail fast)
- `initDb(path)` calls `runMigrations` on startup
- New schema change: add numbered `.sql` file, next startup applies it

**MiniMax daily quotas (Plus-Highspeed plan):**
- Speech 2.8: 9,000 characters/day
- Image gen: 100 images/day
- Music gen: 100 songs/day

## Testing Requirements

- **100% unit test coverage** on `db.ts`
- **Mutation tests** via `just test-mutation` — >= 80%
- **Snapshot tests** for message history output and schema state
- **Use the justfile** for ALL build/test commands

### Testing Strategy

Use in-memory databases (`:memory:`) for all tests — isolated, fast, no file cleanup.

## Dependencies

- **Task:** HG-003 (server must exist — db.ts placeholder created there)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** Project root
- **Services required:** None

## File Scope

- `db.ts`
- `migrations/001-create-schema-migrations.sql`
- `migrations/002-create-messages.sql`
- `migrations/003-create-preferences.sql`
- `migrations/004-create-usage-tracking.sql`
- `db.test.ts`
- `__snapshots__/` (DB snapshots)

## Steps

### Step 0: Preflight

- [ ] Verify `db.ts` exists with placeholder from HG-002
- [ ] Verify `migrations/` directory exists with `.gitkeep`
- [ ] Run `just test` — existing tests pass

### Step 1: Migration Files

- [ ] Create `migrations/001-create-schema-migrations.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  ```
- [ ] Create `migrations/002-create-messages.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_call_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  ```
- [ ] Create `migrations/003-create-preferences.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- [ ] Create `migrations/004-create-usage-tracking.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS daily_usage (
    date TEXT NOT NULL,
    feature TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, feature)
  );
  ```

### Step 2: Migration Runner

- [ ] Implement `runMigrations(db)` in `db.ts`:
  - Read `migrations/` dir, sort by filename
  - Query `schema_migrations` for already-applied versions
  - Run pending migrations in a single transaction
  - On success, insert version into `schema_migrations`
  - On failure, rollback transaction and throw
- [ ] Implement `initDb(dbPath)` — open SQLite, call `runMigrations`
- [ ] **Tests:** Fresh DB → all migrations applied, partially migrated → only pending run, failed migration → rollback + throw, empty migrations dir → no error

### Step 3: Data Access Functions

- [ ] `saveMessage(sessionId, role, content, toolCalls?, toolCallId?)`
- [ ] `getMessages(sessionId)` — returns message history ordered by created_at
- [ ] `savePreference(key, value)` — upsert
- [ ] `getPreferences()` — returns all preferences as `{ key: value }` object
- [ ] **Tests:** All CRUD operations with `:memory:` databases
- [ ] **Tests:** Edge cases — empty DB, large messages, special characters in content, JSON in tool_calls_json
- [ ] **Snapshot tests:** Snapshot message history JSON output

### Step 4: Usage Tracking and Quota Enforcement

- [ ] `trackUsage(feature)` — increment count for today's date + feature, insert if not exists
- [ ] `getUsageToday()` — returns `{ speech: N, image: N, music: N }` for today
- [ ] `checkQuota(feature)` — returns `{ used: N, limit: N, remaining: N, warning: boolean, blocked: boolean }`
- [ ] Define quota limits as a plain object in `db.ts`:
  ```ts
  const QUOTAS = { speech: 9000, image: 100, music: 100 };
  ```
- [ ] Warning threshold: 80% of limit
- [ ] **Tests:** Under limit, at 80% warning, at limit blocked, over limit blocked, daily reset (different date), multiple features tracked independently
- [ ] **Snapshot tests:** Snapshot quota status JSON at various usage levels

### Step 5: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on `db.ts`
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill surviving mutants

## Completion Criteria

- [ ] All 4 migration files exist and run cleanly
- [ ] Migration runner handles fresh, partial, and failed states
- [ ] Message CRUD works with session partitioning
- [ ] Preference CRUD works
- [ ] Usage tracking increments daily counts per feature
- [ ] Quota enforcement warns at 80%, blocks at 100%
- [ ] `just test` passes
- [ ] `just test-coverage` → 100% on db.ts
- [ ] `just test-mutation` → >= 80%

## Git Commit Convention

- **Implementation:** `feat(HG-005): SQLite persistence, migrations, and quota tracking`
- **Checkpoints:** `checkpoint: HG-005 description`

## Do NOT

- Modify `agent.ts` or `tools.ts` (that's HG-004)
- Modify `server.ts` (that's HG-006)
- Implement the frontend (HG-007)
- Create classes
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
