# HG-ISSUE-024 — CI mutation threshold fell below 70

**Status:** Fixed
**Severity:** Medium
**Reported:** 2026-05-02
**Components:** `test/agent.test.ts`, `src/agent.ts`, `test/stryker.config.mjs`
**Related:** `HG-SPEC-011-constitution-driven-simplification.md`, `HG-TICKET-043-constitution-acceptance-audit.md`

## Description

GitHub Actions failed after pushing `master` because agent mutation score dropped below the configured hard threshold.

## Evidence

GitHub Actions run:

```text
https://github.com/bugabinga/hallucygenie/actions/runs/25260938011
```

Job summary:

```text
check + unit + integration + e2e  success
container build                   success
mutation                          failure
```

Mutation excerpt:

```text
All files | 68.43 | 68.43 | 429 killed | 11 timeout | 203 survived
Final mutation score 68.43 under breaking threshold 70
```

Local repro:

```text
just test-mutation-agent
All files | 68.43 | 68.43 | 429 killed | 11 timeout | 203 survived
Final mutation score 68.43 under breaking threshold 70
```

`logs/dev.log` was checked. It only contained mocked unit-test warnings from agent/server tests, not a runtime app failure.

## Root Cause

Recent user-safe MiniMax API error mapping added branch logic in `apiErrorMessageForUser()`. Existing tests only exercised generic `500`, so 401/403/429 branch mutants survived.

## Fix

Add direct unit coverage for 401, 403, 429, and generic error text.

## Validation

```text
bun test test/agent.test.ts --timeout 30000
just test-mutation-agent
```

Mutation score after fix:

```text
All files | 70.61 | 70.61 | 443 killed | 11 timeout | 189 survived
Final mutation score of 70.61 is greater than or equal to break threshold 70
```
