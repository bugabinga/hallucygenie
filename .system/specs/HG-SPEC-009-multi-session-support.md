# HG-SPEC-009 — Multi-session support with header switcher

**Status:** Open
**Created:** 2026-05-01
**Scope:** `src/db.ts`, `src/server.ts`, `src/agent.ts`, `public/app.ts`, `public/style.css`, migrations, tests

## Tickets

- `HG-TICKET-018-sessions-db-model.md`
- `HG-TICKET-019-sessions-api.md`
- `HG-TICKET-020-session-header-switcher.md`
- `HG-TICKET-021-session-rename-archive-ui.md`
- `HG-TICKET-022-session-auto-name.md`
- `HG-TICKET-023-session-stream-switch-guard.md`

## Problem

The app needs multiple saved conversations/sessions so the kid can separate ideas, projects, chats, images, music, and voice generations.

Current architecture already stores many records with `session_id`, but the UI treats the app like one implicit session. Session identity is browser/localStorage-driven today, which conflicts with DB-first state simplification.

## Goal

Add first-class multi-session support:

- Header UI can switch sessions
- Header UI can create a new session
- Sessions persist in DB
- Messages/assets/preferences are saved per session
- Session can be renamed manually
- Session auto-name is generated after first prompt using LLM
- Reload restores active session from DB

## Relationship to HG-SPEC-007

This spec should build on DB-first state management, not fight it.

HG-SPEC-007 says: single-user instance, DB owns active session. That still allows **multiple sessions/conversations** inside the single-user app.

Design rule:

```txt
single user app → many DB sessions → one active_session_id in DB
```

Do **not** reintroduce browser-owned `localStorage` session identity as primary state.

## Data Model

Add explicit sessions table:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_source TEXT NOT NULL DEFAULT 'manual', -- manual | llm | fallback
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
```

Existing tables already include `session_id`:

- `messages.session_id`
- `assets.session_id`

Keep those. Add indexes if missing:

```sql
CREATE INDEX idx_messages_session_created ON messages (session_id, created_at, id);

CREATE INDEX idx_assets_session_created ON assets (session_id, created_at DESC);
```

Active session lives in DB app state from HG-SPEC-007:

```txt
app_state.active_session_id = sessions.id
```

If app starts with no sessions:

1. create a session
2. name it `New Chat`
3. set as active

## Server API

### `GET /api/sessions`

Returns non-archived sessions ordered by updated time desc:

```json
{
  "active_session_id": "...",
  "sessions": [
    {
      "id": "...",
      "name": "Minecraft Cat Titles",
      "name_source": "llm",
      "created_at": 1777650000000,
      "updated_at": 1777651000000,
      "message_count": 12,
      "asset_count": 3
    }
  ]
}
```

### `POST /api/sessions`

Creates new session and makes it active by default.

Request:

```json
{ "name": "New Chat" }
```

Response:

```json
{ "session": { "id": "...", "name": "New Chat" } }
```

### `POST /api/sessions/:id/activate`

Sets active session.

Response:

```json
{ "ok": true, "active_session_id": "..." }
```

### `PATCH /api/sessions/:id`

Manual rename.

Request:

```json
{ "name": "Minecraft Video Ideas" }
```

Sets `name_source = "manual"`.

### `DELETE /api/sessions/:id`

Archive session, do not hard-delete by default.

If deleting active session, choose newest remaining session or create a new one.

### Existing APIs

Existing routes should resolve session like this:

1. explicit `X-Session-Id` if provided (tests/backward compat)
2. DB active session otherwise

Affected:

- `POST /api/chat`
- `GET /api/history`
- `POST /api/steer`
- `GET /assets`
- `GET /asset/:id`
- preferences/profile APIs if session-scoped later

## Auto-naming

After the first user prompt in a new session, generate a short session name via LLM.

Rules:

- Trigger only once when `name_source = "fallback"` or session name is `New Chat`
- Do not overwrite manual names
- Keep under 32 chars if possible
- No quotes
- No punctuation spam
- Prefer kid-friendly project names
- Fallback if LLM unavailable: first prompt trimmed/summarized locally

Prompt:

```txt
Name this chat in 2-5 words for a kid creator. No quotes. No emojis unless essential.

First prompt:
{prompt}
```

Example:

- First prompt: `give me YouTube titles for dark mage cat minecraft`
- Name: `Dark Mage Cat Titles`

Implementation choice:

- Async background rename after accepting first prompt
- UI updates when next sessions fetch runs
- Do not block chat response on naming

## Header UI

Add session selector in header.

Desktop-ish layout:

```txt
🧞 HallucyGenie   [Minecraft Cat Titles ▾]   [+ New]   quotas   ✨ Create
```

Mobile layout:

```txt
🧞 [Chat ▾] [+] [quota] [Create]
```

Session menu should show:

- session name
- last updated time or short relative age
- maybe asset/message count
- Rename action
- Archive/Delete action

Actions:

- Switch session → load that session history/assets
- New session → create, activate, clear chat UI to welcome/new blank state
- Rename → inline input or small modal
- Archive/Delete → confirm before removing

## UI Behavior

Switch session:

1. POST activate
2. Clear conversation UI
3. Load history for active session
4. Refresh assets list if modal open
5. Keep onboarding independent

New session:

1. Create DB session
2. Activate it
3. Clear chat UI
4. Show welcome prompt/state
5. First user prompt triggers auto-name

Rename:

- Manual rename should update header immediately after server success
- Manual rename protects against future auto-name overwrite

## Persistence Rules

All session-specific records must be saved with correct `session_id`:

- messages
- tool results
- assets
- steering messages if persisted later
- create input history if session-scoped

Global user/app state:

- active session id
- onboarding status (allowed localStorage exception, or DB if desired)
- profile/avatar depending on future profile spec

## Edge Cases

- Active session missing/archived → set newest non-archived as active or create new
- Manual rename empty → reject 400
- Duplicate names → allowed, but UI should still use IDs internally
- LLM naming fails → fallback name from first prompt
- Session switched while stream active → either block switch or ask confirmation
- New session while stream active → either block or confirm stop current stream

## Acceptance Criteria

- User can create a new session from header
- User can switch sessions from header
- Each session loads its own message history
- Each session loads its own assets
- First prompt auto-renames `New Chat` using LLM or fallback
- User can manually rename session
- Manual name is not overwritten by auto-name
- Reload restores DB active session
- Normal app flow does not depend on browser localStorage session id
- Existing per-session DB partitioning remains intact

## Tests Needed

### DB/unit

- create session
- list sessions ordered by updated_at
- set/get active session
- rename session marks `name_source = manual`
- archive active session chooses replacement

### Server integration

- `GET /api/sessions` returns active session + list
- `POST /api/sessions` creates and activates
- `POST /api/sessions/:id/activate` changes active history context
- `PATCH /api/sessions/:id` renames
- `/api/history` without header uses active session
- messages/assets stay partitioned by session

### Agent/naming

- first prompt triggers auto-name for new session
- manual rename prevents auto-name overwrite
- LLM name failure uses fallback

### Frontend/unit

- header renders session selector
- new session clears UI and loads blank state
- switch session reloads history/assets
- rename updates label

### E2E

- create Session A, send message
- create Session B, send different message
- switch back to A → A history appears, B hidden
- rename session → reload → name persists
