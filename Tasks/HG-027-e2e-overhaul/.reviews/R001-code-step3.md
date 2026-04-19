## Code Review: Step 3 — Overhaul `e2e/run-e2e.ts`

### Verdict: APPROVE

### Summary

Solid rewrite of the E2E runner. Replaces the static-file-server approach with the real server + nock-mocked MiniMax, which is the correct architecture per the PROMPT. The `waitForApp` helper with `dismissOnboarding` option is well-designed. All 4 broken tests are properly fixed with correct wait semantics, and the 7 new tests cover the requested features. Justfile update correctly removes the static server plumbing.

### Issues Found

1. **[e2e/run-e2e.ts:10]** minor — Unused imports: `resolve` from `node:path` and `randomUUID` from `node:crypto` are imported but never used. The `resolve` identifier is also shadowed by the Promise callback parameter on line 123, which is confusing. These should be removed.

2. **[e2e/run-e2e.ts:109]** minor — `process.env.DATA_DIR = _tmpDir` is set but never read by server.ts. The server hardcodes `data/assets/` for asset storage (server.ts:579, 719). This means any E2E test that triggers tool calls (image gen, TTS, music) would write assets to `data/assets/` in the project root, not the temp directory. Currently no test triggers this path, so it's not a blocking issue — but the env var gives a false sense of isolation.

3. **[e2e/static-server.ts, e2e/chat.spec.ts]** minor — Both files are now dead code (no references anywhere in codebase or justfile). They should be deleted in cleanup, but this is cosmetic and can be done in the verification step.

4. **[e2e/run-e2e.ts — Test 12]** minor — The "onboarding completes and hides" test clicks through 4 button selectors sequentially, but after clicking `#onboarding-try-chat` (which calls `dismissOnboarding()`), the onboarding is hidden and subsequent buttons (`#onboarding-try-create`, `#onboarding-done`) are skipped via the `isVisible()` guard. The test passes and correctly verifies onboarding hides, but it doesn't actually traverse slides 2–3. This is fine for the stated goal.

### Pattern Violations

- None significant. Code follows the project's plain-functions, no-OOP style correctly.

### Test Gaps

- No E2E test exercises a full chat round-trip through the mocked MiniMax API (send message → receive streamed response). Test 3 ("Enter key sends message") only verifies the user bubble appears, not the assistant response. This is a gap but acceptable for this step's scope since the PROMPT focused on fixing broken tests + UI feature coverage.

### Suggestions

- Remove unused imports (`resolve`, `randomUUID`) in `e2e/run-e2e.ts` — cleaner code and avoids the shadowing confusion.
- Consider deleting `e2e/static-server.ts` and `e2e/chat.spec.ts` since they're dead code now.
- The `DATA_DIR` env var could be removed or a comment added noting it's for future use / not yet consumed by server.ts.
