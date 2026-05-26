# HG-SPEC-013: MiniMax music cover from reference tracks

## Problem

MiniMax has `music-cover` quota (100).
Exciting use case:
paste YouTube URL → cover → new creator-safe music.
But risky:
YouTube ToS, copyright, artist imitation, deploy deps.

## Design decisions

- Prompt transformation encourages "spooky boss battle" not "copy exactly".
- Temp extraction files under `data/tmp/cover/`, cleaned on success/failure.
- Source metadata saved.
  Raw source audio never in chat history.
- Research complete.
  Private app mode.
- No rights attestation UI.
- V1 inputs:
  direct audio URL, local audio upload, YouTube URL.
- YouTube URL support requires extractor sidecar.
- Extractor sidecar uses `ghcr.io/jauderho/yt-dlp` pinned by digest.
- Core app never vendors or shells out to yt-dlp.
- Missing extractor disables YouTube URL input.
- Cover flow is two-step:
    1. `/v1/music_cover_preprocess` from `audio_url` or `audio_base64`.
    2. User edits lyrics/style.
    3. `/v1/music_generation` with `cover_feature_id`.
- Direct audio URL uses MiniMax `audio_url`.
- Local upload and YouTube extraction use `audio_base64`.
