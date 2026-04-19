# HG-026: Chat Personality Selector

**Status:** ✅ Complete
**Last Updated:** 2026-04-19
**Breaking:** none
**Risk:** minimal

## Waves

| Wave | Tasks |
|------|-------|
| 1 | Add `PERSONALITY_PROMPTS` map + update `buildSystemPrompt` in `agent.ts` |
| 2 | Add `<select id="personality-select">` to `public/index.html` header |
| 3 | Wire change handler in `public/app.ts` — saves to localStorage + POST /api/preferences |
| 4 | Add tests, `just test-unit` |

| 2026-04-19 19:22 | Task started | Runtime V2 lane-runner execution |
| 2026-04-19 19:22 | Task complete | .DONE created |