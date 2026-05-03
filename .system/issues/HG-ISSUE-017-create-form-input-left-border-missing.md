---
{ "status": "fixed", "specs": ["HG-SPEC-004"] }
---

# HG-ISSUE-017: Create form input left border missing

Textareas/selects showed top/right/bottom borders but left border invisible.
Cause: CSS border shorthand missing left or color too similar to background.
Fix: explicit border on all sides.
