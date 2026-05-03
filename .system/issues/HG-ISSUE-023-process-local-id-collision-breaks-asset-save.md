---
{ "status": "fixed", "specs": ["HG-SPEC-008"] }
---

# HG-ISSUE-023: Process-local ID collision breaks asset save

After restart, asset IDs generated from process-local counter collided with existing rows.
Cause: request counter reset on process restart, producing duplicate IDs.
Fix: generate asset IDs from DB sequence or UUID.
