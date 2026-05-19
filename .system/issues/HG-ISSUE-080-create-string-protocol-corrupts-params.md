---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-012", "HG-SPEC-016"] }
---

Create serialized structured params into chat text → comma/newline lyrics could be split.

Fix: Create submits JSON `{ tool_name, input }` to `/api/create-tool`; manual chat parser remains only for explicit chat directives.

Tests: unit + Chrome E2E preserve multiline comma lyrics through `generate_music` payload.
