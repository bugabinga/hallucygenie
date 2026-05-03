---
{ "status": "fixed", "specs": ["HG-SPEC-008"] }
---

# HG-ISSUE-011: Generated images not in assets

Images never appeared in Create→Assets. Music/voice worked.
Cause: image tool downloaded from external URL but asset save failed silently.
Fix: download external images to local storage, save asset row correctly.
