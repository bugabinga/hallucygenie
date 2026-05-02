# HG-TICKET-050 — Music asset params for lyrics/instrumental

**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`, `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-033-asset-params-db.md`

## Goal

Persist music params that explain whether output was instrumental or lyric-based.

## Scope

- Store `model`, `prompt`, `is_instrumental`, lyrics presence/excerpt.
- No raw audio bytes.
- Assets UI can display params later.

## Tests

- Unit/integration: music asset params saved for empty and non-empty lyrics.

## Devil check

Do not store full giant lyrics if an excerpt is enough for card UI.
