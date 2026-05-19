---
{ "status": "fixed", "specs": ["HG-SPEC-006", "HG-SPEC-011", "HG-SPEC-012", "HG-SPEC-016"] }
---

Create forms used chat text as tool transport → kid saw internal directives.

Fix: `/api/create-tool` accepts structured JSON, records `origin=create`, streams tool cards, renders kid-safe labels.

Tests: static, unit, Chrome E2E assert no `Use generate_`, `Use analyze_`, or `Tool params:` from Create UI.
