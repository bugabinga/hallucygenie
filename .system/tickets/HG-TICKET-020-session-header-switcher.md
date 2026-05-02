# HG-TICKET-020 — Header session switcher

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-019-sessions-api.md`, `HG-TICKET-015-frontend-remove-session-localstorage.md`

## Goal

Add header UI to create and switch sessions.

## Scope

- Header selector/menu lists sessions.
- New session button.
- Switch session calls activate, clears chat UI, loads history/assets.
- Block/confirm switching during active stream.
- Mobile layout remains usable.

## Tests

- Frontend unit: selector renders sessions.
- Frontend unit: switch calls activate then loads history.
- E2E: Session A/B messages stay separate.

## Devil check

Do not reintroduce localStorage session identity.
