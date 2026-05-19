---
{ "status": "fixed", "specs": ["HG-SPEC-001", "HG-SPEC-011"] }
---

Static containment used raw prefix check, so sibling paths sharing the `public` prefix were not explicitly excluded.

Fix: static path must equal `public` or start with `public` + path separator.

Tests: static path traversal/prefix tests cover sibling-prefix boundary.
