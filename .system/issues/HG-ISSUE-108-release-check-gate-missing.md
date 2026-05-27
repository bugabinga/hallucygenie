---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-017"] }
---

Repro: `justfile` has `ready`, `container`, and `publish-container`, but no single release gate.
Cause: first release needs one command that proves code, changelog, version, migration, and container artifact coherence.
Fix: add `just release-check` to run ready checks, changelog/version validation, container build, and container smoke test.
