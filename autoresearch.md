# Autoresearch: latest MiniMax API

## Objective
Keep HallucyGenie MiniMax integration aligned with current MiniMax docs cached on 2026-05-30. Optimize offline API contract compliance without live quota use.

## Metrics
- **Primary**: contract_failures (count, lower is better) — doc/code contract gaps from `./autoresearch.sh`.
- **Secondary**: unit_seconds, typecheck_seconds — correctness cost monitors.

## How to Run
`./autoresearch.sh` — outputs `METRIC contract_failures=number` plus secondary timing metrics.

## Files in Scope
- `src/tools.ts` — MiniMax media/search/VLM request payloads and response parsing.
- `src/agent.ts` — Anthropic-compatible chat request payload.
- `test/unit/tools.test.ts` — MiniMax tool payload contracts.
- `test/unit/agent.test.ts` — chat payload contracts.
- `.pi/skills/minimax/SKILL.md` — factual MiniMax docs cache only.
- `README.md`, `.env.example`, `CHANGELOG.md` only if user-facing behavior changes.
- `autoresearch.*` — benchmark loop state.

## Off Limits
- `.system/MISSION.md`, `.system/RULES.md`, `.system/specs/*`.
- Live quota-consuming `just minimax-test` unless user explicitly asks.
- Raw media bytes in prompts, context, logs, or tests.

## Constraints
- No benchmark cheating. Fix real doc/code gaps, not scanner-only artifacts.
- Do not expose provider complexity to kids unless spec requires.
- Prefer explicit payload fields when code assumes provider defaults.
- All kept changes must pass `autoresearch.checks.sh`.

## Docs Cache
Latest docs fetched to `~/.pi/research/pages/`:
- `platform.minimax.io.llms.2026-05-30.txt`
- `platform.minimax.io.docs.api-reference.*.2026-05-30`

## What's Been Tried
- Session start: fetched latest MiniMax llms/docs/OpenAPI pages. Current code already uses M2.7-highspeed, Bearer auth for non-chat endpoints, Anthropic cache_control, speech-2.8-hd, image-01, music-2.6, and is_instrumental.
- Initial benchmark targeted implicit provider defaults: image URL response, TTS/music hex audio, MP3 data URL format. Fixed by `eb20b15`.
- Expanded benchmark to include latest docs maxLength limits in Anthropic tool schemas, so the model sees provider bounds before calling tools. Fixed by `99d3672`.
- Expanded benchmark to require shared runtime limit constants and bounded text validation before MiniMax calls consume quota. Fixed by `e63b98a`.
- Expanded benchmark to require official Anthropic-compatible `X-Api-Key` header spelling from latest docs. Fixed by `4cadb2e`.
- Expanded benchmark to keep `.pi/skills/minimax/SKILL.md` factual with 2026-05-30 crawl date and prompt caching notes. Fixed by `3875018`.
- Expanded benchmark to avoid adding `cache_control` to every system block; docs support up to 4 active cache breakpoints, so system should use a single end breakpoint. Fixed by `92edafa`.
- Expanded benchmark to require a unit contract for final-system-block-only caching. Fixed by `97da34d`.
- Expanded benchmark to require unit tests to assert explicit MiniMax media formats now sent by `src/tools.ts`. Fixed by `fce50eb`.
- Expanded benchmark to require a unit test proving over-limit MiniMax text is rejected before `fetch`. Fixed by `d3a8e9e`.
- Expanded benchmark to execute Node unit tests for `agent` and `tools`; caught invalid agent SSE fixtures hidden by old permissive tool validation. Fixed by `112af22`.
- Expanded benchmark to enforce MiniMax music-cover documented prompt/lyrics ranges before provider calls. Fixed by `f7afcba`.
- Expanded benchmark to enforce MiniMax music-cover preprocess exactly-one audio source contract (`audio_url` xor `audio_base64`). Fixed by `abafb97`.
- Expanded benchmark to parse latest documented top-level music-cover preprocess response shape while preserving offline mocks. Fixed by `e9c390d`.
- Expanded benchmark to support GIF in `analyze_image`, matching latest Token Plan MCP `understand_image` docs (JPEG, PNG, GIF, WebP, max 20MB). Fixed by `dca6add`.
- Expanded benchmark to parse nested web search `data.results` with `url` fields, matching existing E2E MiniMax mock shape while preserving `organic[].link` support. Fixed by `51bfad1`.
- Expanded benchmark to update user/model-facing analyze_image copy after adding GIF support. Fixed by `7281210`.
- Expanded benchmark to make web search fall back to nested `data.results` when `organic` exists but is empty. Fixed by `96c8e67`.
- Expanded benchmark to update MiniMax skill async TTS limits from latest docs: direct text max 50,000; `text_file_id` max 1,000,000. Fixed by `bd35402`.
- Expanded benchmark to update MiniMax skill async TTS parameter names: `audio_setting.audio_sample_rate` and `voice_setting.english_normalization`. Fixed by `74aee39`.
- Expanded benchmark to record async TTS-only interjection tags from latest docs: `(whistles)`, `(crying)`, `(applause)`. Fixed by `5498c1a`.
- Expanded benchmark to update MiniMax skill with latest lyrics helper structure tags: `[Pre-Chorus]`, `[Drop]`, `[Build-up]`, `[Instrumental]`, `[Breakdown]`. Fixed by `730d77f`.
- Expanded benchmark to document `GET /v1/get_voice` request body requirement: `voice_type` (`all|system|voice_cloning|voice_generation`). Fixed by `c5e5c4e`.
- Expanded benchmark to record latest Video Agent template examples from API overview (`Diving`, `Run for Life`) in the MiniMax skill. Fixed by `45aa435`.
- Expanded benchmark to update file upload docs in MiniMax skill with latest upload purposes (`voice_clone|prompt_audio|t2a_async_input`) and async TTS file purpose.
