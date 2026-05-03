---
{ "status": "fixed", "specs": ["HG-SPEC-012"] }
---

# HG-ISSUE-022: Music generation fails without lyrics

`generate_music` returned "empty audio data" when lyrics not provided.
Cause: API payload missing `is_instrumental: true` flag when lyrics absent.
Fix: set `is_instrumental: true` when lyrics field is empty.
