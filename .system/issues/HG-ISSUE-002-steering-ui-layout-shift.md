---
{ "status": "fixed", "specs": ["HG-SPEC-002"] }
---

# HG-ISSUE-002: Steering UI layout shift

Steering hint appeared briefly during streaming, pushed input box height.
Cause: transient DOM element affecting layout.
Fix: steering element no longer changes input area dimensions.
