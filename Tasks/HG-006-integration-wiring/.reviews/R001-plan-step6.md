## Plan Review: Step 6 — Coverage and Mutation Testing

### Verdict: APPROVE

### Summary
The plan correctly identifies the core task: run coverage, fill gaps to 100% on changed/new code, and attempt mutation testing. The mutation testing infrastructure is non-functional (just echoes a skip message), which the plan acknowledges. The plan will achieve its stated outcomes.

### Issues Found
1. **[minor] `buildMiniMaxPayload` is dead code (server.ts lines 273–288)** — This function was the old pre-agent-loop chat handler helper. After Step 4 rewired `handleChat` to use `runAgentLoop`, `buildMiniMaxPayload` is never called (confirmed: zero references outside its own definition). The worker should **remove it** rather than write tests for it. This eliminates 16 uncovered lines instantly and keeps the codebase clean.

2. **[minor] Some uncovered lines are infrastructure/lifecycle code** — Lines 574–582 (`setupSignalHandlers`), 619–628 (signal handler registration), and 635–638 (direct-run init block) are lifecycle code that's hard to unit test and may not qualify as "changed/new code in server.ts (wiring logic, session validation, new endpoints)" per the PROMPT.md requirement. The worker should focus coverage effort on the HG-006 logic (session validation, agent loop wiring, new endpoints, DB integration) rather than trying to hit 100% on these infrastructure blocks.

### Missing Items
- None. The plan covers the stated outcomes.

### Suggestions
- When running coverage, categorize the uncovered lines into: (a) dead code to remove, (b) HG-006 logic to test, (c) infrastructure code that's out of scope. This will make it clear where effort is needed.
- The current server.ts coverage is 89.97% lines / 89.05% branches / 86.96% functions. After removing `buildMiniMaxPayload` and adding tests for the DB-not-initialized error paths in handleChat/steer/history/usage, coverage should reach ~95%+. The remaining gap will likely be lifecycle code.
- For mutation testing: since `just test-mutation` is non-functional, note in STATUS.md Discoveries that the >=80% mutation requirement cannot be verified in the current environment. This is an infrastructure limitation, not a plan gap.
- `resetStateForTesting` (lines 607–616) shows partial coverage — the try/catch branches inside it may have uncovered error paths. These are defensive coding in a test helper and don't need dedicated tests.
