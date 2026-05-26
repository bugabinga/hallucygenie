---
{ "status": "fixed", "specs": ["HG-SPEC-007", "HG-SPEC-011"] }
---

Repro: fixed. `public/app.ts` no longer keeps `LEGACY_SESSION_KEY`, `hallucygenie_session_id`, or localStorage cleanup.
Cause: residual compatibility cleanup conflicted with DB-owned state and delete-compat rule. HG-SPEC-007 allows localStorage only for `hg_onboarding_done`; HG-SPEC-011 says delete compat branches.
Fix: removed legacy key cleanup and tests; static test now asserts no legacy key/cleanup.
