# HG-SPEC-007 — DB-first single-user state management

**Status:** Open
**Created:** 2026-05-01
**Scope:** `src/server.ts`, `src/db.ts`, `public/app.ts`, migrations, tests

## Problem

State management is too split-brained for a single-user local app.

Current app stores some state in SQLite and some in browser `localStorage`. That creates bugs after reloads, browser profile changes, stale sessions, missing history/tool outputs, orphaned steering state, and mismatched assets.

Assume this is a **single-user instance application**. There is no need for complex browser-owned session partitioning as primary state. SQLite should be the source of truth.

## Goal

Radically simplify state:

- DB owns app state
- Browser is mostly a view/controller
- One active local user/profile/session by default
- Reloads should restore the same conversation and UI state from DB
- Local storage only for harmless client-only hints/preferences

## Current localStorage usage

`public/app.ts` currently uses:

- `hallucygenie_session_id` — primary session identity (**move to DB/server-owned active session**)
- `hg_onboarding_done` — first-time welcome state (**allowed exception**)

Previous specs/tickets also mention draft/UI state persistence. Those should be reconsidered under this DB-first model.

## Desired Architecture

### Server-owned active session

Add a server/database concept of active singleton state:

```txt
Browser → no session header required for normal app use
Server → resolves active session from DB
DB → stores messages/assets/preferences/ui state for active session
```

The browser should not need to create UUIDs or carry `X-Session-Id` for normal use. The server can expose:

- `GET /api/state` → active session metadata + prefs + quotas + maybe recent history
- `POST /api/chat` → uses active session if no explicit header
- `GET /api/history` → active session
- `GET /assets` → active session
- `GET /asset/:id` → validates asset belongs to active session, no query session required

### DB tables

Add a tiny app-state table, e.g.

```sql
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Initial keys:

- `active_session_id`
- future: `draft_message`, `active_create_tab`, UI prefs, selected profile/avatar

Or use a typed singleton table:

```sql
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_session_id TEXT NOT NULL,
  draft_message TEXT NOT NULL DEFAULT '',
  active_create_tab TEXT NOT NULL DEFAULT 'image',
  updated_at INTEGER NOT NULL
);
```

Keep simple. No enterprise settings framework.

### Session simplification

Existing session-aware DB schema can remain. But default code path should use one DB-owned active session.

Rules:

- On DB init, create active session id if missing
- Use active session when `X-Session-Id` absent
- Keep `X-Session-Id` optional for tests/debug/backward compat
- Stop creating session UUID in frontend for default app flow

### Asset serving

After DB-first state, asset URLs should not need `?s=` query params. Since single-user app owns all assets:

```txt
GET /asset/:id → lookup asset by id → serve if exists
```

No client session token needed.

This also simplifies HG-ISSUE-007/HG-ISSUE-009 fixes.

### Frontend state

Frontend should stop using localStorage for session identity.

Allowed localStorage exceptions:

- first-time onboarding/welcome dismissed (`hg_onboarding_done`)
- purely visual, non-authoritative browser hints if needed

Not allowed in localStorage:

- session id
- conversation id
- active user/profile
- assets/history identity
- draft input if it should survive device/browser changes
- create form history if it should be part of app state

## Migration Plan

### Phase 1 — Compatibility

- Add DB active session helper: `getActiveSessionId(db)`
- Modify server routes to use active session when header missing
- Keep current header behavior for tests/backward compat
- Modify frontend to stop calling `getOrCreateSessionId()` for normal requests
- Remove `?s=` from new asset URLs once server supports active session asset serving

### Phase 2 — Cleanup

- Delete frontend session localStorage key creation
- Remove mandatory session validation from single-user routes
- Rewrite tests around active-session default
- Keep explicit session tests only where useful

### Phase 3 — State consolidation

Move UI state to DB where valuable:

- active create tab
- draft prompt/input
- user profile/avatar
- create input history

## Non-goals

- Multi-user auth
- login/accounts
- browser-to-browser sync
- complex state framework
- classes/OOP store abstraction

## Acceptance Criteria

- Fresh browser loads existing conversation from DB without localStorage session id
- Reload does not lose conversation, assets, tool outputs, or active state
- `/api/history`, `/assets`, `/api/chat` work without `X-Session-Id`
- Existing tests pass with updated assumptions
- New tests cover active-session fallback
- `localStorage` no longer stores `hallucygenie_session_id`
- Onboarding localStorage exception remains OK

## Devil's Notes

- Do not delete session columns from DB. They are useful partition keys and simplify migrations.
- Do not invent a global state manager. A few DB helper functions are enough.
- Avoid half-state: if active session is DB-owned, all asset/history routes must follow it.
- Be careful with existing `.system/issues` around assets and history; this spec likely supersedes parts of their session-token fixes.

## Tests Needed

- Unit: active session created once and reused
- Unit: active session can be changed/reset intentionally
- Integration: `/api/history` works without session header
- Integration: `/assets` works without session header
- Integration: `/asset/:id` works without session query/header in single-user mode
- Frontend unit/static: no `hallucygenie_session_id` localStorage usage
- E2E: reload with empty localStorage still shows existing DB conversation
