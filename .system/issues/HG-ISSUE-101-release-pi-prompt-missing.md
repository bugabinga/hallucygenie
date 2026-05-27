---
{ "status": "open", "specs": ["HG-SPEC-011"] }
---

Repro: `.pi/prompts/` has no release prompt.
Cause: release flow is not captured for Pi agent use.
Fix: add `.pi/prompts/release.md` with release checklist, version/tag/image steps, changelog generation, release checks, and push/publish commands.
