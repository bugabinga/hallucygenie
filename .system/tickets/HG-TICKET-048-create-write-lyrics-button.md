# HG-TICKET-048 — Create Music “Write lyrics for me”

**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-047-generate-lyrics-tool.md`

## Goal

Let kid generate editable lyrics before spending music quota.

## Scope

- Button in Create→Music.
- Uses music idea/prompt to call lyrics tool.
- Populates lyrics textarea with generated lyrics.
- Does not auto-generate music.
- Shows safe loading/error state.

## Tests

- Frontend unit: click calls lyrics path and fills textarea.
- Integration: lyrics endpoint/tool path returns text.
- E2E/manual: generated lyrics remain editable before music generation.

## Devil check

No one-shot quota spend from Create UI. User reviews lyrics first.
