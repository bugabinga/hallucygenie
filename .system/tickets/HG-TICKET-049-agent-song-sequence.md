# HG-TICKET-049 — Agent lyrics→music song sequence

**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-047-generate-lyrics-tool.md`

## Goal

Allow chat agent to make a song by generating lyrics then music when useful.

## Scope

- Prompt/tool guidance: song without lyrics → `generate_lyrics`, then `generate_music`.
- Instrumental request → only `generate_music`.
- Final text does not claim success unless tool succeeded.
- No raw audio URLs/media in text.

## Tests

- Agent unit: song request can call `generate_lyrics` then `generate_music`.
- Agent unit: instrumental request skips lyrics.
- Regression: no raw audio in context/history.

## Devil check

Avoid hidden quota surprise where user only asked for lyrics. Infer carefully.
