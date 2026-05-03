---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-019: Agent-rendered images too large, no sanitization

Assistant included image markdown in text response, rendering oversized duplicate images.
Cause: no markdown sanitization for image tags in assistant output.
Fix: sanitize/rewrite image markdown. Size controls on rendered images.
