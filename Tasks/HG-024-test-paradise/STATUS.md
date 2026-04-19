# HG-024: Test Enhancement — SSE Streaming + Parallel State Isolation

**Status:** pending  
**Prerequisite:** HG-023 (globals refactor)  
**Breaking:** none  
**Risk:** low — additive tests only

## Waves

| Wave | Tasks |
|------|-------|
| 1 | Group 1: Stream handler unit tests (20 tests) |
| 2 | Group 2: Full SSE message cycles (15 tests) |
| 3 | Group 3: Parallel + isolation tests (5 tests) |
| 4 | Group 4: Error and edge cases (10 tests) |
| 5 | Group 5: AppState factory tests (5 tests) |
| 6 | Coverage check — target ≥55% line, ≥40% func on `app.ts` |

## Verification Criteria

| Criterion | Target |
|-----------|--------|
| Total tests | ≥168 |
| `app.ts` line coverage | ≥55% |
| `app.ts` func coverage | ≥40% |
| Existing tests pass | 100% |
