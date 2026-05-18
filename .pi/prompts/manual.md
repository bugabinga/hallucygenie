---
description: Manual test in Chrome, then codify findings
argument-hint: "<flow or feature>"
---

Manual test: $ARGUMENTS

- Use visible Chrome via `just dev-chrome`.
- Use chrome-cdp to inspect/interact.
- Exercise happy path + likely edge cases. Capture steps, observed, expected.
- Add/fix durable tests: unit, integration, e2e, headless as useful.
- Fix bugs found. Run relevant checks.
- Report: Chrome/CDP, outcome, bugs, tests, checks.
