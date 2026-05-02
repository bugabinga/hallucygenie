# HG-TICKET-026 — Recent error toast TTL

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`  
**Status:** Ready  
**Priority:** Low  
**Size:** S

## Goal

Persist recent user-visible error toast for short reload recovery.

## Scope

- Store last error text + timestamp with 10-minute TTL.
- Restore only if still fresh.
- Clear on close/success.
- May use localStorage because it is client-only visual state.

## Tests

- Frontend unit: fresh error restores.
- Frontend unit: expired error ignored.
- Frontend unit: invalid JSON ignored.

## Devil check

Do not store raw provider JSON or stack traces in the toast state.
