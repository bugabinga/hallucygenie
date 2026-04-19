# HG-026: Chat Personality Selector

**Status:** pending
**Breaking:** none
**Risk:** minimal

## Waves

| Wave | Tasks |
|------|-------|
| 1 | Add `PERSONALITY_PROMPTS` map + update `buildSystemPrompt` in `agent.ts` |
| 2 | Add `<select id="personality-select">` to `public/index.html` header |
| 3 | Wire change handler in `public/app.ts` — saves to localStorage + POST /api/preferences |
| 4 | Add tests, `just test-unit` |
