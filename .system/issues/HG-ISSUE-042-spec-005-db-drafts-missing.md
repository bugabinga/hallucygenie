---
{ "status": "fixed", "specs": ["HG-SPEC-005", "HG-SPEC-007"] }
---

# HG-SPEC-005: DB-owned drafts and UI state persistence missing

## Spec requirement

HG-SPEC-005 says DB owns:

- chat draft
- Create form drafts
- selected Create tab
- profile, messages, assets, tool history, quotas

Required APIs:

- `GET/PUT/DELETE /api/draft/chat`
- `GET/PUT/DELETE /api/draft/create`

Required client behavior:

- Debounced writes, 150–300ms.
- Flush on submit, modal close, tab change, visibilitychange, pagehide.
- Clear chat draft only after stream `done` with no error.
- Clear Create draft only after matching tool-history success.

## Current app behavior

No draft API routes exist in `src/server.ts`.
No draft table/migration exists.
`public/app.ts` does not persist chat input, Create form values, or selected Create tab.
Reload loses unsent user input.

## Impact

User can lose prompt work on reload, crash, mobile tab eviction, or accidental navigation.
This violates the DB-first state model and the explicit draft persistence spec.

## Acceptance

- Add DB-backed draft storage scoped to active session.
- Implement all draft routes from HG-SPEC-005.
- Persist chat and Create drafts with bounded debounce and lifecycle flushes.
- Restore drafts on load/open.
- Clear drafts only under spec-defined success conditions.
- Add API, DB, and frontend tests.

## Fix implemented

### Migration

- Added `migrations/010-create-drafts.sql` with `drafts` table (session_id, draft_type, content, timestamps)

### DB functions (src/db.ts)

- Added `getDraft()`, `saveDraft()`, `deleteDraft()` CRUD functions
- Drafts scoped to session_id and draft_type (chat|create)
- Validates no raw asset data in draft content

### API routes (src/server.ts)

- `GET /api/draft/chat` - returns `{ draft: { content } | null }`
- `PUT /api/draft/chat` - saves draft, returns `{ ok: true }`
- `DELETE /api/draft/chat` - clears draft
- Same for `/api/draft/create`

### Frontend (public/app.ts)

- Debounced draft saves (200ms) via `saveDraftDebounced()`
- Immediate flush on submit via `deleteDraft()` (clears after success)
- Lifecycle flushes on visibilitychange and pagehide
- Draft restoration on init (`fetchDraft()`) and modal open
- Tab switching saves current tab's draft before switching

### Tests

- DB tests: 8 test cases for draft CRUD, validation, scoping
- API tests: 8 test cases for GET/PUT/DELETE, validation, independence
- Migration test: updated to expect version 10
