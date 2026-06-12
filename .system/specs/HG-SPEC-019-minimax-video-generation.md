# HG-SPEC-019: MiniMax video generation

## Problem

MiniMax supports video generation.
HallucyGenie has no video creation flow.

Video generation is async.
It needs task creation, polling, download, asset storage, preview, and quota handling.

## Design decisions

- Add one kid-facing Create tab: Video.
- Prompt is free text.
- Settings are presets only.
- HallucyGenie chooses provider model internally.
- No raw provider params in UI.
- No model picker.
- Video tasks persist enough state to survive reload.
- Generated video bytes are asset storage only.
- Chat/model context receives compact video summary only.
- Assets tab shows native video preview and download.
- Quota UI must not treat `/v1/token_plan/remains` video `total=0` as authoritative for video availability.
- Video `total=0` displays as exact count unknown.
- Video `total=0` is a suspected upstream quota-reporting bug; recheck later.
- Provider create/query errors are authoritative for unavailable video quota or spend.
- Failed/expired tasks show loud user-safe errors.

## Behavioral contracts

- Create Video starts a provider task.
- UI shows pending state while task runs.
- Polling stops on success, failure, timeout, or user cancel.
- Success retrieves file metadata, downloads the provider URL immediately, and stores video bytes in asset storage.
- File metadata may report `bytes: 0`; download success and stored bytes decide asset size.
- Asset row records prompt, tool, model, params, mime, size.
- Chat renders video result card from `/asset/{id}`.
- No raw video bytes, base64, or provider URLs enter chat history.
- Quota display shows unknown for video when plan-remains data is absent or zero but provider calls still succeed.
- Tests cover task create/query/download, reload persistence, asset preview, quota-unknown state, and failure states.
