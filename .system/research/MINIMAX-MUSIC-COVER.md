# MiniMax music-cover research

**Ticket:** `HG-TICKET-051-music-cover-minimax-research.md`  
**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`  
**Status:** docs research; no live quota spent

## Known docs facts

`POST /v1/music_generation` accepts cover models:

- `music-cover`
- `music-cover-free`

Docs describe three input paths:

- `audio_url`
- `audio_base64`
- `cover_feature_id` from `POST /v1/music_cover_preprocess`

Feature ids are temporary and should be treated as short-lived provider state.

## Safe implementation boundary

Do not implement YouTube extraction in the first cover ticket. A safe path needs
one of:

- bundled legal sample audio,
- user-uploaded audio with explicit rights attestation,
- direct legal audio URL with explicit rights attestation.

Raw source audio must stay in temp files or asset storage only. It must never go
into prompts, chat history, agent context, logs, or issue excerpts.

## Open live-smoke questions

- Does current Token Plan allow `music-cover`?
- Does `audio_base64` work directly for small MP3/WAV input?
- Does `audio_url` need a publicly reachable URL?
- Is `music_cover_preprocess` required for quality or only optional?
- Is output returned as hex like `music-2.6`, URL, or async task?
- Does polling exist for cover generation?

## No live smoke

No live request was run in this ticket. Live cover testing needs explicit user
approval and a tiny known-legal sample committed or generated specifically for
the test. Do not use copyrighted or YouTube-derived audio.
