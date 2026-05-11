---
{ "status": "fixed", "specs": ["HG-SPEC-009", "HG-SPEC-007"] }
---

# HG-SPEC-009: Multi-session API and header switcher missing

## Spec requirement

HG-SPEC-009 requires:

- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/:id/activate`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`
- Header session switcher: name dropdown + new button.
- Mobile truncated session name.
- Auto-name after first prompt in `New Chat`, 2–5 words, no overwrite of manual names.
- Switching during stream blocked or confirmed.
- New session clears UI to blank state.
- Messages/assets/history partitioned by `session_id`.

## Current app behavior

DB session primitives exist (`sessions`, active session in app state, session CRUD helpers), and `/api/state` exposes active session metadata.
But no session REST routes exist in `src/server.ts`.
`public/index.html` has no header session switcher or New Chat control.
`public/app.ts` has no session list, activate, rename/archive, switch-during-stream, or auto-name flow.

## Impact

The app remains effectively single-session from the UI.
Project separation is unavailable despite session DB tables.
Users cannot create/switch/archive/rename conversations.

## Acceptance

- Add all session API routes from HG-SPEC-009.
- Add header dropdown/new-session UI, including mobile truncation.
- Implement activate/create/rename/archive flows.
- Block or confirm switching while streaming.
- Clear/reload messages/assets/history when active session changes.
- Auto-name new chats after first prompt without overwriting manual names.
- Add DB/API/frontend tests.
