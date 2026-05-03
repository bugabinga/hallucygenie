---
{ "status": "fixed", "specs": ["HG-SPEC-008"] }
---

# HG-ISSUE-007: Audio player empty, no playback

Tool output cards rendered `<audio>` but playback failed. Duration 0:00/0:00.
Cause: `saveAssetFile()` converted data URL to server path but audio URL was unreachable.
Fix: correct asset serving path and ensure audio URLs resolve.
