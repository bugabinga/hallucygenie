# HG-024: Test the Refactor — State Isolation Verification

**Status:** pending  
**Prerequisite:** HG-023 complete  
**Breaking:** none  
**Risk:** low — tests verify the refactor, no code changes

## Waves

| Wave | Tests |
|------|-------|
| 1 | Group 1: AppState cleanliness (5 tests) |
| 2 | Group 2: Closure factory binding (10 tests) |
| 3 | Group 3: Concurrent safety (5 tests) |
| 4 | Group 4: Old broken tests now fixed (5 tests) |

## Verification Criteria

| Criterion | Target |
|-----------|--------|
| New tests | ≥25 |
| State independence assertions | 5+ |
| Concurrent isolation tests | 5+ |
| Old broken tests replaced | ≥3 |
