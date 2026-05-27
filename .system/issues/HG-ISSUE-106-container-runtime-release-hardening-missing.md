---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `deploy/Dockerfile` runs default image user and has no runtime healthcheck or release labels.
Cause: container exists for CI build, not release-grade runtime proof.
Fix: add non-root runtime, OCI labels, healthcheck/smoke route coverage, and tests for Dockerfile/container contracts.
