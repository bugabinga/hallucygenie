# HG-TICKET-024 — Chat draft DB state

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`, `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-017-api-state-bootstrap.md`

## Goal

Persist unsent chat draft by active session using DB app state, not durable localStorage.

## Scope

- Save chat input draft by active session.
- Restore on reload without overwriting non-empty DOM input.
- Clear only after successful send/done.
- Debounce writes; flush on pagehide/visibilitychange.

## Tests

- Frontend unit: draft restore/no-overwrite/clear after success.
- Server integration: draft state scoped to active session.
- E2E: reload preserves unsent chat draft.

## Devil check

`.system/specs/HG-SPEC-007-db-first-single-user-state.md` wins over localStorage. Durable drafts belong in DB.
