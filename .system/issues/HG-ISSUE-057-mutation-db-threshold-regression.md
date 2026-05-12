---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-057: `just test-mutation` fails DB mutation threshold

Repro:

```bash
just test-mutation
```

Observed:

- `test-mutation-db` fails.
- Stryker report:
  - `src/db.ts` mutation score `65.25`
  - break threshold `70`
  - `139` survived mutants
- `agent.ts` later reports `71.99`, but aggregate recipe exits `1` because DB tier failed.
- Output includes many survived mutants in session auto-name, draft kind validation, tool history kind/status mapping, quota amount validation, create-history limits/offsets, raw-data guard edges.

Expected:

- `just test-mutation` passes all configured mutation thresholds.
- HG-ISSUE-024 says CI mutation threshold failure was fixed; it has regressed.

Cause:

- Recent DB/session/draft/history/profile changes lack mutation-strength tests.
- `db.ts` mutation suite threshold no longer met.

Fix:

- Add focused DB mutation tests for survived branches.
- Prioritize invariants:
  - invalid draft kind throws
  - invalid history status throws
  - tool name → history kind mapping
  - create-history limit/offset clamp
  - active session auto-name failure
  - quota invalid amounts and exact limit behavior
  - raw asset guard regex edges

Resolution:

- Added mutation-strength DB tests for draft kinds, history status/kind mapping, create-history pagination, quota amounts, auto-naming, and raw data guards.
- `just test-mutation` now passes all configured thresholds.
