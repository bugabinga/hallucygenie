---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: CI builds a container but tag releases do not publish the primary artifact.
Cause: no `v*` release workflow pushes GHCR images.
Fix: add GitHub release workflow that builds, labels, smoke-tests, and pushes `ghcr.io/bugabinga/hallucygenie` version tags without force-pushing trunk.
