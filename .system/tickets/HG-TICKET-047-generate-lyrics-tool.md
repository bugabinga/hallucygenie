# HG-TICKET-047 — `generate_lyrics` tool

**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-046-minimax-lyrics-api-research.md`

## Goal

Add text-only lyrics generation tool.

## Scope

- Tool schema: prompt, optional style/mood/length.
- MiniMax wrapper for lyrics endpoint.
- Output `{ type: "text", content }`.
- PG/kid-safe guardrails in prompt/tool description.
- No asset created.

## Tests

- Unit: request/response handling.
- Unit: API errors produce safe tool error.
- Agent/tool schema test includes `generate_lyrics`.

## Devil check

Text-only. No raw audio/media path.
