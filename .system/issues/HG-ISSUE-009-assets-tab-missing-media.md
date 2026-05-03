---
{ "status": "fixed", "specs": ["HG-SPEC-008"] }
---

# HG-ISSUE-009: Assets tab missing generated media

Not all generated images/music/voice appeared in Create→Assets.
Multiple causes: broken thumbnails, missing asset rows, incorrect session scoping.
Fix: asset save path corrected, thumbnails working, session scoping fixed.
