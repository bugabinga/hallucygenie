---
{ "status": "fixed", "specs": ["HG-SPEC-012"] }
---

# HG-ISSUE-004: MiniMax tool params incomplete

Create UI and LLM tools exposed only a small subset of API params.
Image: only prompt + aspect ratio. Music: prompt + lyrics + instrumental flag. Voice: text + speed.
Fix: expanded tool schemas and Create UI to cover relevant params.
