---
{ "status": "fixed", "specs": ["HG-SPEC-008", "HG-SPEC-011"] }
---

Generated image URL download buffered response without byte cap.

Fix: enforce supported image MIME, `Content-Length` cap, and streaming read cap before asset save.

Tests: unit rejects oversized generated image download and records failed Create history.
