---
{ "status": "fixed", "specs": ["HG-SPEC-004"] }
---

# HG-E2E-012: Residual HTML whitespace in onboarding/create tabs

Formatter-wrapped inline HTML exposed raw text-node whitespace in tests.
Fix: tests compare rendered user-visible text, not source indentation.
