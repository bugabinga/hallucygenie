# HG-TICKET-026 — Recent error toast TTL

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`  
**Status:** Done
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

## Implementation

- Persist safe recent toast text + timestamp in localStorage with 10-minute TTL.
- Restore fresh errors on init; clear invalid/expired state and successful stream completion.
- Sanitize raw provider JSON/stack/auth-looking errors before display/storage.

## Validation

- `bun test test/app.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

Do not store raw provider JSON or stack traces in the toast state.
