# HG-026: Chat Personality Selector

**Status:** ✅ Complete
**Last Updated:** 2026-04-19
**Breaking:** none
**Risk:** minimal

## Implementation

- `PERSONALITY_PROMPTS` map in `agent.ts`
- `buildSystemPrompt` applies personality prefix
- `<select id="personality-select">` in `public/index.html`
- Change handler in `public/app.ts` saves to localStorage + POST /api/preferences
- Tests updated for new behavior

## Verification

```
just test-unit  # 373 tests pass
```

| 2026-04-19 22:40 | Task started | Runtime V2 lane-runner execution |
| 2026-04-19 22:40 | Task complete | .DONE created |