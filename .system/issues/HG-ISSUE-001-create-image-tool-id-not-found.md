---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-001: Create image fails — tool id not found

MiniMax returned 400: `tool result's tool id not found (2013)`.
Umbrella bug across all media tools.
Cause: agent loop reused tool call IDs incorrectly across turns.
Fix: ensure tool call IDs are unique per request and not reused.
