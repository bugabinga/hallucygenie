---
{ "status": "fixed", "specs": ["HG-SPEC-005", "HG-SPEC-012"] }
---

Lyrics helper success cleared Create draft and filled textarea was not persisted immediately.

Fix: `generate_lyrics` Create tool does not clear Create draft; frontend persists draft after writing generated lyrics.

Tests: unit + Chrome E2E reload after Write lyrics keeps generated lyrics.
