---
{ "status": "fixed", "specs": ["HG-SPEC-019", "HG-SPEC-021"] }
---

Repro: Chrome real-provider smoke with `MINIMAX_API_KEY` set.

Findings:
- Header quota badge showed only dashes/unavailable because MiniMax Token Plan returned `general` and `video` rows with `total=0`, not per-feature rows.
- Video create failed against the real provider with `invalid params, param 'resolution' only support 512P, 768P and 1080P`.

Cause:
- `/api/quota` ignored MiniMax `general` quota rows and suppressed zero-total video rows.
- UI rendered zero-total provider rows as unavailable.
- Video UI used kid-facing lowercase `768p`/`1080p` directly in provider payload.

Fix:
- Map MiniMax `general` row to chat/speech/image/music/lyrics unknown quotas.
- Return zero-total video row as unknown instead of null.
- Render zero-total quotas as `?` with exact-count-unknown ARIA copy.
- Convert video provider resolution to `768P`/`1080P` while keeping kid-facing UI labels lowercase.

Proof:
- `bun test test/unit/app.test.ts --grep updateQuotaBadge`
- `bun test test/unit/server.test.ts --grep 'GET /api/quota'`
- `bun test test/unit/tools.test.ts --grep generateVideo`
- Chrome real provider: quota header shows `?` for exact-count-unknown rows.
- Chrome real provider: async narration saved local `audio/mpeg` asset.
- Chrome real provider: video generation saved local `video/mp4` asset after resolution fix.
