# HG-TICKET-014 — Server active-session fallback

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Blocked
**Priority:** Critical  
**Size:** M  
**Depends:** `HG-TICKET-013-db-active-session-state.md`

## Goal

Make normal APIs use DB active session when `X-Session-Id` is absent.

## Scope

- Resolve session: explicit header first, DB active session second.
- Affected: `/api/chat`, `/api/history`, `/api/steer`, `/assets`.
- Keep explicit session tests for debug/back-compat only.

## Tests

- Integration: `/api/history` works without header.
- Integration: `/api/chat` persists to active session without header.
- Integration: `/assets` works without header.

## Devil check

Avoid half-state. Every route that reads session must share one resolver.
