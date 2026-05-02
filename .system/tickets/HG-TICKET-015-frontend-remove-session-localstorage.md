# HG-TICKET-015 — Remove frontend session localStorage identity

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-014-server-active-session-fallback.md`

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

## Devil check

Do not delete server `session_id` columns. Only remove browser ownership.
