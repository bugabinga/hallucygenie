---
{ "status": "fixed", "specs": ["HG-SPEC-003"] }
---

# HG-E2E-015: Profile DB persistence E2E race

Runner exited non-zero after adding profile DB persistence coverage.
Cause: test wrote profile then immediately read it without waiting for DB flush.
Fix: added proper async await on DB write before read assertion.
