---
{ "status": "fixed", "specs": ["HG-SPEC-003"] }
---

# HG-ISSUE-052: Generated avatar button contradicts spec

Repro:

- `just dev`, `just dev-chrome`.
- Open Profile.
- Inspect `Generate avatar 🎨`.

Observed:

- Button is enabled.
- App exposes `POST /api/profile/avatar/generate` and real MiniMax image generation path.

Expected per HG-SPEC-003:

- Generated avatar follows current spec text.
- Button state must match the human-owned spec.

Cause:

- Later issue work enabled generated avatars after asset foundations.
- Spec was not human-updated.
- Source of truth now conflicts with implementation and HG-ISSUE-048 fix text.

Fix:

- Human decision required:
  - update HG-SPEC-003 to allow generated avatars, or
  - disable button/API until spec changes.
- Add static contract test matching the decided spec.

Resolution:

- Human updated HG-SPEC-003 and removed the generated-avatar block.
- Profile modal enables `Generate avatar 🎨`.
- Static and E2E tests assert generation through asset storage.
