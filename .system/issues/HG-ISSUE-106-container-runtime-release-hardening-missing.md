---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `deploy/Containerfile` ran default image user and release run path had no healthcheck or release labels.
Cause: container existed for CI build, not release-grade runtime proof.
Fix: add non-root runtime, OCI labels, Podman-native healthcheck/smoke route coverage, and tests for container contracts.
