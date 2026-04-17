# STATUS — HG-005

**Task:** HG-005 — Persistence, Migrations, and Quota Tracking
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify db.ts exists
- [ ] Verify migrations/ directory exists
- [ ] `just test` passes

### Step 1: Migration Files
**Status:** ⬜ Not Started

- [ ] 001-create-schema-migrations.sql
- [ ] 002-create-messages.sql
- [ ] 003-create-preferences.sql
- [ ] 004-create-usage-tracking.sql

### Step 2: Migration Runner
**Status:** ⬜ Not Started

- [ ] runMigrations(db) implementation
- [ ] initDb(dbPath) implementation
- [ ] Tests: fresh, partial, failed rollback

### Step 3: Data Access Functions
**Status:** ⬜ Not Started

- [ ] Message CRUD
- [ ] Preference CRUD
- [ ] Tests with :memory: databases
- [ ] Edge case tests
- [ ] Snapshot tests for history

### Step 4: Usage Tracking and Quota Enforcement
**Status:** ⬜ Not Started

- [ ] trackUsage(feature)
- [ ] getUsageToday()
- [ ] checkQuota(feature)
- [ ] Tests: under, warning, blocked, daily reset
- [ ] Snapshot tests for quota status

### Step 5: Coverage and Mutation Testing
**Status:** ⬜ Not Started

- [ ] `just test-coverage` → 100%
- [ ] `just test-mutation` → >= 80%

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
