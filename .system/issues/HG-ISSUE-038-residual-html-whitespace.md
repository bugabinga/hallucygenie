---
{ "status": "fixed", "specs": ["HG-SPEC-004"] }
---

# HG-E2E-012: Residual HTML whitespace in onboarding/create tabs

Prettier re-introduced text-node whitespace by wrapping long inline HTML.
Fix: `<!-- prettier-ignore -->` or split into child elements.
