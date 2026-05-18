---
description: Manual test in Chrome, then codify findings
argument-hint: "<flow or feature>"
---

Manual test: $ARGUMENTS

- Start app/browser as needed (`just dev`, `just dev-chrome`).
- Use Chrome + chrome-cdp skill if page inspection/interaction helps; get explicit approval first.
- Exercise happy path + likely edge cases. Capture exact steps, observed, expected.
- Turn what you learn into unit/integration/e2e tests. Prefer smallest durable coverage.
- Fix bugs found. Run relevant checks.
- Report: manual outcome, issues found/fixed, tests added, checks run.
