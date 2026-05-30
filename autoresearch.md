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
- Expanded benchmark to include latest docs maxLength limits in Anthropic tool schemas, so the model sees provider bounds before calling tools.
