# HG-TICKET-013 — DB active session state

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Done  
**Priority:** Critical  
**Size:** M

## Goal

Add DB-owned singleton active session id.

## Scope

- Migration for `app_state` or singleton settings table.
- DB fns: get/create active session id, set active session id.
- On init, create active session if missing.
- Keep existing `session_id` columns.

## Tests

- DB unit: active session created once and reused.
- DB unit: set active session updates value.
- DB unit: invalid missing active session recreates/fails loud per spec.

## Devil check

No state manager. A few direct DB fns only.
