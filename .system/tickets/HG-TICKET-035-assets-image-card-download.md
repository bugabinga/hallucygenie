# HG-TICKET-035 — Asset image card metadata + download

**Spec:** `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-034-assets-api-details.md`

## Goal

Make image asset cards useful and downloadable.

## Scope

- Image thumbnail preview.
- Lightbox opens full image.
- Visible download link/button.
- Show type badge, prompt, model/aspect, date, size.
- Mobile compact layout.

## Tests

- Frontend unit: image card has thumbnail + download.
- E2E/manual: image preview/lightbox/download works.

## Devil check

Card click must not hijack download link clicks.
