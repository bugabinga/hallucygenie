# HG-TICKET-029 — Create history API

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-028-create-history-db.md`, `HG-TICKET-014-server-active-session-fallback.md`

## Goal

Expose session-scoped create/tool input history endpoints.

## Scope

- `GET /api/create-history?kind=&limit=&offset=`.
- `DELETE /api/create-history/:id` soft-hides.
- Clamp limit.
- Use active session fallback.

## Tests

- Server integration: GET filters by kind/session.
- Server integration: DELETE hides only active session row.
- Server integration: pagination limit/offset.

## Devil check

DELETE means hide from history only. It must not delete assets/messages/usage.
