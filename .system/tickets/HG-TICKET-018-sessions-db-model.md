# HG-TICKET-018 — Sessions DB model

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`
**Status:** Done
**Priority:** High
**Size:** M

## Goal

Add first-class sessions table and DB helpers.

## Scope

- Migration: `sessions` table with `name`, `name_source`, timestamps, `archived_at`.
- Indexes for messages/assets by session and created time if missing.
- DB fns: create/list/get/rename/archive.
- Ensure app start has one `New Chat` session.

## Tests

- DB unit: create/list ordered by updated time.
- DB unit: rename sets `name_source=manual`.
- DB unit: archive hides from list.

## Implementation

- Added `sessions` migration with active listing indexes for sessions/messages/assets.
- Added DB helpers: create/get/list/rename/archive plus active `New Chat` creation.

## Validation

- `bun test test/db.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

Do not remove `session_id` from existing rows. This formalizes it.
