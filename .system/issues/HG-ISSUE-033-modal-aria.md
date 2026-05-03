---
{ "status": "fixed", "specs": ["HG-SPEC-004"] }
---

# HG-E2E-007: Create modal lacks ARIA attributes

No `role="dialog"`, `aria-modal`, `aria-label`. No focus trap.
Fix: add ARIA attributes + basic focus trap on open/close.
