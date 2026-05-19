---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `bunx playwright test --config test/playwright.config.ts` failed: `playwright-core` has no `expect` export.
Cause: stale Playwright E2E harness drifted from `just e2e` runner.
Fix: removed stale harness and added static guard for one E2E runner.
