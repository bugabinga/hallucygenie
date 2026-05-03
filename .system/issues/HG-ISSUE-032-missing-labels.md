---
{ "status": "fixed", "specs": ["HG-SPEC-015"] }
---

# HG-E2E-006: Missing form labels

`#chat-input` and `#music-instrumental` had no `<label>` or `aria-label`.
Fix: add `<label>` with `.sr-only` class for visually hidden labels.
