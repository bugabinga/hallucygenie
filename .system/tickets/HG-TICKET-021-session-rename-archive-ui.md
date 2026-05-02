# HG-TICKET-021 — Session rename/archive UI

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-020-session-header-switcher.md`

## Goal

Let user rename and archive sessions from header menu.

## Scope

- Rename action with inline input or small modal.
- Archive/delete action with confirmation.
- Rename updates header after server success.
- Empty rename rejected client/server.

## Tests

- Frontend unit: rename success updates label.
- Frontend unit: archive active reloads replacement session.
- E2E: rename persists after reload.

## Devil check

No bulk delete. No hard delete. No hidden destructive action.
