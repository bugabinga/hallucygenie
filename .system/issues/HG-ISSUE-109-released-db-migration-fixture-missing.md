---
{ "status": "open", "specs": ["HG-SPEC-017"] }
---

Repro: tests cover fresh migrations, but no old released DB fixture exists for v0.1.0 compatibility.
Cause: first release has not frozen a DB baseline.
Fix: add v0.1.0 DB fixture after release boundary and tests that old released DB migrates to latest, failed migrations do not mark applied, and unknown future schema fails loud.
