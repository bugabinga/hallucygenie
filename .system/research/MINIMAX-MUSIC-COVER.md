# MiniMax music-cover research

**Ticket:** `HG-TICKET-051-music-cover-minimax-research.md`\
**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`\
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

## Live smoke 2026-05-26

Plan check:

- `GET /v1/token_plan/remains` lists `music-cover`.
- Daily quota: 100.
- Current usage before smoke: 0.

One-step `audio_url` smoke:

- `POST /v1/music_generation`.
- Payload: `model: music-cover`, public direct MP3 `audio_url`, style prompt, `output_format: url`.
- Result: `base_resp.status_code: 0`, `data.status: 2`, output audio URL returned.
- Extra info: duration `174315ms`, sample rate `44100`, channels `2`, size `5585684` bytes.
- Raw output bytes were not printed or stored in research.

Preprocess smoke:

- `POST /v1/music_cover_preprocess` with same public direct MP3 URL.
- Result: `base_resp.status_code: 0`, `cover_feature_id` returned, `audio_duration: 182`.

Observed failures:

- Very short audio failed: `audio duration must be between 6s and 360s`.
- Public URLs must be provider-fetchable; one Wikimedia URL failed with `download audio_url failed`.
- Instrumental/no-lyric samples can fail one-step cover with `lyrics is too short` or provider `unknown error`.

## Remaining questions

- Does `audio_base64` work directly for small MP3/WAV input?
- Is two-step `cover_feature_id` required for no-lyric/instrumental references?
- Final product policy for kid-friendly YouTube/audio URLs.
