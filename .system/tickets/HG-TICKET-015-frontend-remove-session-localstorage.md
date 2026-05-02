# HG-TICKET-015 — Remove frontend session localStorage identity

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`
**Status:** Done
**Priority:** High
**Size:** M

## Goal

Stop browser from owning `hallucygenie_session_id` in normal app flow.

## Scope

- Remove session UUID generation for default requests.
- Stop sending `X-Session-Id` from normal frontend calls.
- Keep onboarding localStorage exception.
- Remove stale session key if present only when safe.

## Tests

- Frontend/static: no `hallucygenie_session_id` localStorage writes.
- Frontend unit: API requests work without session header.
- E2E: empty localStorage reload restores DB conversation.

## Implementation

- Removed frontend session UUID creation from normal app flow.
- Removed `X-Session-Id` from chat/history/steer/assets requests.
- Added startup cleanup for legacy `hallucygenie_session_id` localStorage key.
- Kept onboarding localStorage key.
- Updated unit/static/E2E assertions for DB active-session flow.

## Validation

- `bun test test/app.test.ts test/static.test.ts --timeout 30000`
- `just check`
- `just test-unit`

## Devil check

Do not delete server `session_id` columns. Only remove browser ownership.
