# HG-027: E2E Test Overhaul

**Status:** pending
**Breaking:** none
**Risk:** low

## Waves

| Wave | Tasks |
|------|-------|
| 1 | Fix app initialization wait, fix lightbox test, fix send button test |
| 2 | Add mock server for `/api/*` responses |
| 3 | Add tests: onboarding (2), personality selector (2), create modal (3), quota badge (1), session persistence (1) |
| 4 | Run `just test-e2e` — target 20+ tests, 0 failures |

## Verification Criteria

| Criterion | Target |
|-----------|--------|
| E2E tests passing | 20+ |
| New features covered | onboarding, personality, create modal, quota badge, session |
| No real server needed | mock responses only |
