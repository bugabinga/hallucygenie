# HG-TICKET-033 — Asset params DB metadata

**Spec:** `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Done
**Priority:** High  
**Size:** M

## Goal

Persist generation params JSON with each saved asset.

## Scope

- Migration: `assets.params_json`.
- Save image params: model, prompt, aspect_ratio.
- Save voice params: model, text, voice_id, speed, volume, pitch.
- Save music params: model, prompt, lyrics excerpt/presence, is_instrumental.
- No schema framework.

## Tests

- Migration test: column exists.
- Unit/integration: image/music/TTS asset params saved.
- DB invariant: no raw media bytes in params.

## Implementation

- Added `assets.params_json` migration.
- Saved compact image/TTS/music params for generated assets.
- Reject raw media-looking params at DB boundary.

## Validation

- `bun test test/db.test.ts test/server.test.ts test/integration.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

Params are metadata, not a dumping ground. No raw audio/image.
