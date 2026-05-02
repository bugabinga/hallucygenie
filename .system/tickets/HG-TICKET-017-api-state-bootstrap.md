# HG-TICKET-017 — `/api/state` bootstrap

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`
**Status:** Done
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

## Implementation

- Added `GET /api/state` returning active session id/name/nameSource plus tiny UI metadata.
- Endpoint uses DB active session creation path; no history payload.

## Validation

- `bun test test/server.test.ts test/integration.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

Keep endpoint small. History/assets already have routes.
