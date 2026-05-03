---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-E2E-013: Tool result card lost after text

Tool card disappeared when assistant text arrived after `tool_result` in same stream.
Cause: DOM replacement wiped tool card nodes during streaming.
Fix: preserve tool card nodes during subsequent text rendering.
