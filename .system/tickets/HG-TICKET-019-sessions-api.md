# HG-TICKET-019 — Sessions API

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-018-sessions-db-model.md`

## Goal

Expose session create/list/activate/rename/archive APIs.

## Scope

- `GET /api/sessions`.
- `POST /api/sessions` creates and activates.
- `POST /api/sessions/:id/activate`.
- `PATCH /api/sessions/:id` rename.
- `DELETE /api/sessions/:id` archive.
- Reject empty manual rename.

## Tests

- Server integration for each endpoint.
- Integration: archiving active session chooses replacement or creates new.
- Integration: message/asset counts are session-scoped.

## Devil check

No hard delete in v1. Archive only.
