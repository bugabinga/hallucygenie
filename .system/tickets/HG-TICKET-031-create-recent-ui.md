# HG-TICKET-031 — Create Recent UI

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-029-create-history-api.md`

## Goal

Show Recent list per Create tab and allow loading/removing entries.

## Scope

- Recent section in Image/Music/Voice/Search tabs.
- Status/origin chips.
- Click loads form fields only.
- Remove soft-hides via API.
- No inline editing.

## Tests

- Frontend unit: renders status/origin chips.
- Frontend unit: click loads form.
- Frontend unit: remove hides row without clearing form.

## Devil check

No bulk delete and no destructive asset/message deletion.
