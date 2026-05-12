---
{ "status": "fixed", "specs": ["HG-SPEC-012"] }
---

# HG-ISSUE-054: MiniMax tool params still incomplete despite fixed issue

Repro:

- Inspect `src/tools.ts` tool schemas and Create modal in Chrome.
- Compare with HG-ISSUE-004 fix claim and current MiniMax docs.

Observed:

- `generate_image` schema/UI only supports `prompt`, `aspect_ratio`.
  Missing documented/usable params: `n`, `seed`, `width`, `height`, `prompt_optimizer`, more aspect ratios (`3:2`, `2:3`, `3:4`, `21:9`).
- Create Image UI only offers `1:1`, `16:9`, `9:16`, `4:3`.
- `generate_music` schema/UI only supports `prompt`, `lyrics`.
  Missing params: output/audio settings, lyrics helper title/edit mode in UI, explicit instrumental display.
- `text_to_speech` UI only supports `text`, `speed`.
  Schema has `voice_id`, `volume`, `pitch`, but UI exposes none. Missing emotion/audio_setting/language/subtitles.
- HG-ISSUE-004 says fixed by expanded tool schemas and Create UI, but current app remains minimal.

Expected:

- Either mark HG-ISSUE-004 not fixed, or implement documented relevant params.
- UI and tool schemas must agree on kid-useful controls.

Cause:

- Issue status drift.
- Tests assert minimal schemas, not MiniMax API coverage contract.

Fix:

- Decide minimum supported params per tool.
- Update Create UI and tool schemas together.
- Add docs-contract tests for chosen params.

Resolution:

- Image schema/UI now include current aspect ratios plus `n`, `seed`, `width`, `height`, and `prompt_optimizer` support.
- Voice UI now exposes `voice_id`, `volume`, and `pitch` alongside speed.
- Tests assert schema/UI and request payload contracts.
