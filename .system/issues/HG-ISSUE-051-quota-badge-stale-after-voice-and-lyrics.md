---
{ "status": "fixed", "specs": ["HG-SPEC-012", "HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-051: Quota badge stale after voice and lyrics tools

Repro:

- `just dev`, `just dev-chrome`.
- Create → Voice: generate `Level up!` with real MiniMax TTS.
- Observe header quota badge immediately after audio card appears.
- Create → Music → `Write lyrics for me` with real MiniMax lyrics.
- Compare header quota badge with `GET /api/quota`.

Observed:

- Voice audio card appeared and audio loaded.
- Header stayed `Voice: 8996 of 9000 remaining`.
- `GET /api/quota` showed speech used increased by chars; expected remaining was lower.
- Lyrics filled successfully.
- Header stayed `Lyrics: 100 of 100 remaining`.
- `GET /api/quota` showed lyrics used `1`.
- Badge refreshed later only after another tool completed.

Expected:

- Quota badge refreshes after every completed tool call.
- Dynamic `aria-label` matches visible counts after voice and lyrics success.

Cause:

- Tool completion refresh path is inconsistent across tools.
- Image/music completion refreshed quota; standalone voice/lyrics completion did not update badge promptly.

Fix:

- Centralize quota refresh after every `tool_result` success/failure completion.
- Cover voice char quota and lyrics quota in frontend/live regression.

Resolution:

- Frontend tracks every `tool_result` and refreshes quota after completion.
- Regression tests cover quota refresh behavior and voice/lyrics consumption paths.
