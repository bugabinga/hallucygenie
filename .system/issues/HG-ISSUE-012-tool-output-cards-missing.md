---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-012: Tool output cards sometimes missing

Tool cards failed to render even though agent said it generated media.
Cause: multiple paths — DOM replacement during streaming, race between tool_result and text.
Fix: preserve tool card nodes across streaming updates.
