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
- Failed/expired tasks show loud user-safe errors.

## Behavioral contracts

- Create Video starts a provider task.
- UI shows pending state while task runs.
- Polling stops on success, failure, timeout, or user cancel.
- Success downloads video into asset storage.
- Asset row records prompt, tool, model, params, mime, size.
- Chat renders video result card from `/asset/{id}`.
- No raw video bytes, base64, or provider URLs enter chat history.
- Tests cover task create/query/download, reload persistence, asset preview, and failure states.
