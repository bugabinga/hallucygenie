---
{ "status": "fixed", "specs": ["HG-SPEC-004", "HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-011", "HG-SPEC-012"] }
---

# HG-ISSUE-066: MiniMax tool parameter coverage gaps

Repro:

- Compare `src/tools.ts`, `src/server.ts` explicit tool directive allowlist, and `public/index.html` Create forms against MiniMax docs crawl 2026-05-15.

Observed:

- `generate_image` tool schema covers text-to-image params except `response_format`.
- Create→Image exposes only `prompt`, `aspect_ratio`; misses tool-supported `n`, `seed`, `width`, `height`, `prompt_optimizer`.
- `generate_image` sends partial custom size if only `width` or only `height` is provided, while API requires both together.
- `generate_image` supports `n`, but result handling returns/saves only first image URL.
- Image-to-image API supports `subject_reference` and `image-01-live`; no HallucyGenie tool/UI path exists.
- `text_to_speech` exposes only `text`, `voice_id`, `speed`, `volume`, `pitch`.
- TTS API also supports `emotion`, `text_normalization`, `latex_read`, `audio_setting`, `pronunciation_dict`, `timbre_weights`, `language_boost`, `voice_modify`, `subtitle_enable`, `subtitle_type`, `stream`, `stream_options`, `output_format`.
- `generate_music` exposes only `prompt`, `lyrics`; derives `is_instrumental` implicitly.
- Music API also supports explicit `is_instrumental`, `lyrics_optimizer`, `audio_setting`, `stream`, `output_format`, and cover workflow params `audio_url`, `audio_base64`, `cover_feature_id` on cover models.
- `generate_lyrics` covers documented request params (`mode`, `prompt`, `lyrics`, `title`) but requires prompt; API allows empty prompt for random song.
- `web_search` matches documented MCP schema (`query`). No documented extra params.
- `analyze_image` implementation has hardcoded prompt and no live schema; MCP `understand_image` supports `prompt` + `image_url`. Covered by HG-ISSUE-053.

Expected:

- Each tool has an explicit supported-parameter contract: exposed, intentionally fixed, or intentionally forbidden.
- Create UI, explicit directive allowlist, tool schema, request payload, and docs-contract tests agree.
- Raw media output/input params (`response_format=base64`, user `data:` URLs, `audio_base64`) stay forbidden unless asset-boundary tests prove safety.

Cause:

- MiniMax docs expose broad API surfaces; HallucyGenie tools expose kid-safe subset without a current coverage matrix.
- UI/directive/tool schemas drift independently.

Fix:

- Add parameter coverage matrix test or doc contract for each MiniMax-backed tool.
- Expose kid-useful low-risk params first: Image `n/seed/size/prompt_optimizer` in UI; TTS `emotion/language_boost/audio format/sample rate/subtitles`; Music `lyrics_optimizer/explicit instrumental/audio format`.
- Keep hazardous/raw params fixed or rejected with tests: image `response_format=base64`, TTS/music streaming unless implemented, music `audio_base64`, user-supplied data URLs.
- Decide separate scope for image-to-image and music-cover tools.

Resolution 2026-05-17:

- Added MiniMax parameter contract tests covering each live tool schema.
- Added request-payload regression tests that keep raw/base64/stream/cover/image-to-image params omitted.
- Added explicit directive allowlist regression tests for Image, TTS, and Music params.
- Added Create UI static regression coverage for exposed kid-safe params and forbidden raw/advanced controls.
- Current intentional contract: image supports `n`, `seed`, paired custom `width`/`height`, and `prompt_optimizer`; TTS supports voice/speed/volume/pitch only; music derives `is_instrumental` from lyrics and forbids cover/raw params; lyrics still requires a prompt in HallucyGenie UI/tool schema.
