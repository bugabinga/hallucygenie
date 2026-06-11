# HG-SPEC-021: Async long TTS

## Problem

MiniMax sync TTS handles short speech.
MiniMax async TTS supports long narration.

HallucyGenie has no long-form voice flow with task status, polling, retrieval, or durable audio asset save.

## Design decisions

- Add one kid-facing long narration flow.
- Keep existing short Voice flow unchanged.
- Long text input is free text.
- Voice/style controls reuse existing kid-safe Voice controls.
- HallucyGenie chooses async TTS payload internally.
- No file-id, sample-rate, format, stream, subtitle, or provider task controls in UI.
- Audio bytes are asset storage only.
- Chat/model context receives compact audio summary only.
- Task state survives reload.
- Provider retrieval may return a bundle file.
- HallucyGenie extracts the generated audio from provider bundles before saving the audio asset.
- Expired provider URLs become loud recoverable errors.

## Behavioral contracts

- Long narration creates async TTS task.
- UI shows pending status.
- Polling stops on success, failure, timeout, or user cancel.
- Success retrieves file metadata, downloads the provider URL immediately, extracts audio when the provider returns a bundle, and saves the audio asset.
- Provider file metadata may report `bytes: 0`; extracted audio bytes decide asset size.
- Asset row records prompt/text summary, voice, tool, model, params, mime, size.
- Chat renders audio result card using native controls.
- No raw audio bytes, base64, provider URLs, provider bundles, or full long text enter model context.
- Tests cover task create/query/retrieve, bundle extraction, reload persistence, timeout/failure, asset save, and compact history.
