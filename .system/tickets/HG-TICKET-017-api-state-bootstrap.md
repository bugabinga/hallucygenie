# HG-TICKET-017 — `/api/state` bootstrap

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** M

## Goal

Expose a tiny app bootstrap endpoint for active session metadata and lightweight state.

## Scope

- `GET /api/state` returns active session id/name placeholder and allowed UI state.
- No full history payload unless needed.
- No localStorage replacement framework.

## Tests

- Integration: `/api/state` returns active session metadata.
- Unit: endpoint creates active session if missing.

## Devil check

Keep endpoint small. History/assets already have routes.
