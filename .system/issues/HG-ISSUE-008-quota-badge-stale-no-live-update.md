---
{ "status": "fixed", "specs": ["HG-SPEC-014"] }
---

# HG-ISSUE-008: Quota badge stale, no live update

Badge showed old counts until full page reload. After generating media, count unchanged.
Fix: badge refreshes after each tool call completes.
