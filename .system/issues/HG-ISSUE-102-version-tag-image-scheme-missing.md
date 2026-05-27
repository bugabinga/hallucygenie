---
{ "status": "open", "specs": ["HG-SPEC-011"] }
---

Repro: `package.json` has `0.1.0`, but no documented tag/image scheme.
Cause: first release boundary is implicit.
Fix: document SemVer pre-1.0 scheme, `vX.Y.Z` tags, GHCR tags, and checks that package version, changelog, git tag, and image tag match.
