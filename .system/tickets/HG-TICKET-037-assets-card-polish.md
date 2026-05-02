# HG-TICKET-037 — Asset card prompt truncation and empty state

**Spec:** `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** S  
**Depends:** `HG-TICKET-035-assets-image-card-download.md`, `HG-TICKET-036-assets-audio-controls.md`

## Goal

Polish asset card readability on mobile.

## Scope

- Long prompt/lyrics truncation with tooltip or details.
- Clear empty state suggestion.
- Badges remain readable on mobile.

## Tests

- Frontend unit/static: long prompt truncates safely.
- E2E/manual: mobile cards remain usable.

## Devil check

No complex filtering/search in this ticket.
