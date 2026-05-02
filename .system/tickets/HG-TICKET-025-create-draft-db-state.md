# HG-TICKET-025 — Create draft + selected tab DB state

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`, `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-017-api-state-bootstrap.md`, `HG-TICKET-030-record-tool-input-history.md`

## Goal

Persist Create form drafts and selected tab by active session.

## Scope

- Save Image/Music/Voice/Search form drafts.
- Save selected Create tab.
- Restore on reload/modal open without overwriting non-empty fields.
- Clear form only after matching successful tool history exists.

## Tests

- Frontend unit: restore all create fields/tab.
- Frontend unit: no overwrite of non-empty active fields.
- E2E: reload preserves create draft; success clears matching draft.

## Devil check

Do not fake canonical history in browser. Submitted tool inputs are server history.
