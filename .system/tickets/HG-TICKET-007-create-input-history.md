# HG-TICKET-007: Create input history

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Superseded  
**Priority:** High  
**Size:** L

## Superseded by smaller tickets

- `HG-TICKET-028-create-history-db.md`
- `HG-TICKET-029-create-history-api.md`
- `HG-TICKET-030-record-tool-input-history.md`
- `HG-TICKET-031-create-recent-ui.md`
- `HG-TICKET-032-create-history-e2e.md`

## Goal

Persist all media/search tool inputs server-side by session and expose Recent lists in Create modal with status, origin, load, and remove.

## Scope

1. Add SQLite migration for `tool_input_history`.
2. Add DB fns: insert/list/update/soft-hide.
3. Add APIs:
   - `GET /api/create-history?kind=&limit=&offset=`
   - `DELETE /api/create-history/:id`
4. Record all supported tool calls: image, music, voice, search.
5. Capture origin: `create`, `chat`, `agent`.
6. Track status: `submitted`, `succeeded`, `failed`.
7. Link asset id when saved.
8. Add Recent UI per Create tab.
9. Click item loads form only; no inline edit.
10. Remove soft-hides item; does not delete chat/assets/usage.
11. Add pagination limit default 10.

## Devil review

Do not use localStorage as canonical history. Submitted tool input is server/session truth.

Hard constraints:

- session isolation
- soft delete only
- failed attempts stay visible until hidden
- never log full prompt by default
- structured `input` must match validated tool args
- no bulk delete in v1

## Open questions

None. All previous spec questions resolved.

## Tests

- DB unit: migration, CRUD, status, hidden, pagination, session isolation.
- Server integration: GET/DELETE session-scoped behavior.
- Frontend unit: render history, status/origin chips, fill form, remove visible item.
- E2E: Create submission + chat tool call appear in Recent after reload.

## Acceptance criteria

- [ ] All supported tool calls recorded.
- [ ] Recent list per tab works.
- [ ] Click loads form.
- [ ] Status/origin visible.
- [ ] Remove hides only history row.
- [ ] Session isolation enforced.
- [ ] `just check` + `just test-unit` + `just test-integration` + `just test-e2e` pass.
