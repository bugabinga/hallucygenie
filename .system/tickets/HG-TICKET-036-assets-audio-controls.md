# HG-TICKET-036 — Asset audio/music native controls

**Spec:** `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-034-assets-api-details.md`

## Goal

Use visible native audio controls for voice/music asset previews.

## Scope

- Render `<audio controls preload="metadata">` for voice/music.
- Remove hidden `new Audio(...).play()` from asset library.
- Visible download action.
- Show type/tool/model/prompt/lyrics-present/instrumental.

## Tests

- Frontend unit: audio cards render controls/preload/src.
- Static/unit: asset library does not use hidden `new Audio().play()`.
- E2E/manual: play/pause/download audio asset.

## Devil check

No autoplay. User controls playback.
