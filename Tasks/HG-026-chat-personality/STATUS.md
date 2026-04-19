# HG-026: Chat Personality Selector

**Status:** completed
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
