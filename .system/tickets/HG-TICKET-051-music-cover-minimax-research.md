# HG-TICKET-051 — MiniMax music-cover research

**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** M

## Goal

Research MiniMax `music-cover` safely before product implementation.

## Scope

- Use tiny known-legal audio sample.
- Test `audio_base64`, `audio_url`, and preprocess if available.
- Record request/response shape, timing, output format, errors.
- Document whether polling/temp files are needed.

## Tests

- If scripts are added: unit test no raw audio/secret dumping.

## Devil check

No YouTube extraction, no copyrighted samples, no UI in this ticket.
