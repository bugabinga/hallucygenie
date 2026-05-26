---
{ "status": "fixed", "specs": ["HG-SPEC-013"] }
---

Repro: fixed. Create→Music has a two-step MiniMax music-cover flow: preprocess source → edit lyrics/style → generate cover.
Evidence 2026-05-26: `GET /v1/token_plan/remains` returned `model_name: music-cover`, `current_interval_total_count: 100`, `current_interval_usage_count: 0`; plan supports music-cover quota.
Evidence 2026-05-26 live smoke: `POST /v1/music_generation` with `model: music-cover`, public `audio_url`, style prompt, `output_format: url` returned `base_resp.status_code: 0`, `data.status: 2`, output audio URL, duration `174315ms`, size `5585684` bytes. `music_cover_preprocess` also returned `cover_feature_id` for same URL.
Evidence 2026-05-26 spec update: HG-SPEC-013 selects private app mode, no rights attestation UI, V1 direct audio URL/local upload/YouTube URL, extractor sidecar with `ghcr.io/jauderho/yt-dlp` pinned by digest, and two-step preprocess→edit→generate cover flow.
Research: `.system/research/YT-DLP-COVER-DEPENDENCY.md` covers yt-dlp/ffmpeg/dependency options.
Cause: implementation was missing.
Fix: implemented `/api/music-cover/preprocess`, Create UI cover controls, `generate_music_cover`, local asset save, direct URL/upload support, YouTube sidecar hook via `COVER_EXTRACTOR_URL`, disabled YouTube option when extractor missing, and tests. Raw source/output bytes stay out of chat/model context.
