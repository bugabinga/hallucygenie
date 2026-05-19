---
{ "status": "fixed", "specs": ["HG-SPEC-014", "HG-SPEC-015"] }
---

Repro: `just e2e` sometimes failed layout test: `forFunction: Timeout 5000ms exceeded`.
Cause: mocked stream closed before slow browser could observe final text while thinking indicator stayed visible.
Fix: kept mocked stream open longer so E2E asserts intended intermediate state.
