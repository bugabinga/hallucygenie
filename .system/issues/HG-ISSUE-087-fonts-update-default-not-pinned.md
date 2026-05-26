---
{ "status": "fixed", "specs": ["HG-SPEC-001"] }
---

Repro: fixed. `justfile` defaults `fonts-update` to manifest source commit `8fee968603b86ac85d4fbf0f3ffbde3fed1d84e1`, not moving `main`.
Cause: update recipe defaulted to moving `main`, while HG-SPEC-001 requires pinned google/fonts repo commit for reproducible font updates.
Fix: added static test and pinned recipe default.
