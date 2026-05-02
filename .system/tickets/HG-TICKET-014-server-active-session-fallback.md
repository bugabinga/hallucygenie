# HG-TICKET-014 — Server active-session fallback

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Done
**Priority:** Critical  
**Size:** M

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

## Implementation

- Added shared `resolveSessionId(req, database)` in `src/server.ts`.
- `/api/chat`, `/api/history`, `/api/steer`, `/api/usage`, `/assets` now accept missing `X-Session-Id` and fall back to DB active session.
- Kept explicit `X-Session-Id` precedence for debug/tests.
- Added unit + integration coverage for no-header active-session APIs.

## Validation

- `bun test test/server.test.ts test/integration.test.ts --timeout 30000`
- `just check`
- `just test-unit`

## Devil check

Avoid half-state. Every route that reads session must share one resolver.
