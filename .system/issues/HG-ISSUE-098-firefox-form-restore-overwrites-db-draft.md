---
{ "status": "fixed", "specs": ["HG-SPEC-005", "HG-SPEC-007"] }
---

Firefox manual server-swap test restored stale textarea value before DB draft load.
Cause: no explicit clear when `/api/draft/chat` returned null; textarea lacked per-control autocomplete off.
Fix: empty DB draft clears chat input; chat textarea sets `autocomplete="off"`; unit regression covers stale restored text.
