# HG-TICKET-032 — Create history E2E coverage

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-031-create-recent-ui.md`

## Goal

Prove Create history survives reload and captures Create/chat tool calls.

## Scope

- Create submission appears in Recent after reload.
- Chat/direct tool call appears with correct origin.
- Click Recent loads fields.
- Remove hides only history row.

## Tests

- E2E test(s) with mocked MiniMax.

## Devil check

Keep E2E minimal; unit/integration already cover details.
