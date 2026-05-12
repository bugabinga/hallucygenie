---
{ "status": "open", "specs": ["HG-SPEC-003", "HG-SPEC-015"] }
---

Repro:

- Open Profile.
- Fill profile enough for avatar prompt.
- Click `Generate avatar 🎨`.
- Wait for `POST /api/profile/avatar/generate`.
- Button text changes to `Generating... ✨`; avatar preview stays old/blank.
- `logs/dev.log` shows slow happy path: `POST /api/profile/avatar/generate` from `2026-05-12T21:54:51.825Z` to `2026-05-12T21:55:10.119Z`, ≈18.3s.

Cause:

- `public/app.ts` only disables `#profile-generate` and changes button text.
- `#profile-avatar-img` / `.profile-avatar-preview` has no pending state, spinner, or dynamic status.
- HG-SPEC-015 requires status indicators to be dynamic and `prefers-reduced-motion` to disable animations.
- Related: HG-ISSUE-048 added avatar preview/generation UI. HG-ISSUE-052 resolved generated-avatar spec drift.

Fix:

- Add pending state on `.profile-avatar-preview` during generation.
- Render spinner in avatar preview/image area; keep old avatar visible or intentionally dimmed.
- Add accessible status text/`aria-label`; respect `prefers-reduced-motion`.
- Add E2E/static tests that spinner appears while request is pending and clears on success/error.
