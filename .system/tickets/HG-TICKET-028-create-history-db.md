# HG-TICKET-028 — Create/tool input history DB

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-018-sessions-db-model.md`

## Goal

Add server-owned tool input history table and DB helpers.

## Scope

- Migration `tool_input_history`.
- Fields: session_id, kind, origin, input_json, status, asset_id, hidden_at, timestamps.
- DB fns: insert/list/update status/link asset/soft-hide.
- Pagination default 10.

## Tests

- DB unit: CRUD/status/hidden/pagination.
- DB unit: session isolation.
- DB unit: invalid kind/status fails hard.

## Devil check

History is canonical server state. No localStorage substitute.
