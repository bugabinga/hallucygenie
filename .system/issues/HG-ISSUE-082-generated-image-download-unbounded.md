---
{ "status": "open", "specs": ["HG-SPEC-008", "HG-SPEC-011"] }
---

# HG-ISSUE-082: Generated image download unbounded

Repro:

- Make image provider return `https://...` image URL with huge body or no `Content-Length`.
- Submit image generation.

Observed:

- `downloadImageAsset()` calls `await resp.arrayBuffer()` without byte cap.
- Any `image/*` content type is accepted.
- Large response can allocate unbounded memory before save failure.

Expected:

- Asset download has hard byte cap.
- Unsupported image MIME fails before save.
- Failure returns kid-safe error and releases quota.

Cause:

- Generated asset URL path lacks the size checks used by Analyze image adapter.

Fix:

- Stream response with max generated asset size.
- Check `Content-Length` when present and enforce cap while reading.
- Restrict MIME to supported persisted/rendered types.
- Add test for over-limit URL response.
