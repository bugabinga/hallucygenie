# HG-SPEC-009: Multi-session support

## Problem

App needs multiple conversations so kid can separate projects. UI treats app as one implicit session. Session identity is localStorage-driven.

## Design decisions

- `sessions` table: id, name, name_source (manual/llm/fallback), created_at, updated_at, archived_at.
- Active session stored in DB `app_state.active_session_id`. Not localStorage.
- API: `GET /api/sessions`, `POST /api/sessions`, `POST /api/sessions/:id/activate`, `PATCH /api/sessions/:id`, `DELETE /api/sessions/:id`.
- Header session switcher: name dropdown + new button. Mobile: truncated.
- Auto-name: after first prompt in "New Chat", LLM generates 2-5 word name. Does not overwrite manual names.
- Switching during stream: block or confirm. New session clears UI to blank state.
- Messages/assets/history partitioned by session_id (existing columns).
