---
{ "status": "fixed", "specs": ["HG-SPEC-004"] }
---

# HG-E2E-008: Connection status dot missing aria-label

Had `title` but no `aria-label`. Screen readers couldn't announce state changes.
Fix: add dynamic `aria-label`.
