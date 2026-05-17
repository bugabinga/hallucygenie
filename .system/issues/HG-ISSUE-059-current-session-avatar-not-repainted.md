---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-009"] }
---

Repro:

- Open a session with existing user messages.
- Open Profile.
- Upload or generate a new avatar image.
- Save/close profile.
- Existing user bubbles in current session keep old avatar.
- Switch session or reload page.
- Same messages show new avatar.
- `logs/dev.log` shows server success: `POST /api/profile/avatar` at `2026-05-12T21:59:27.115Z` returned `200`, new `/asset/asset_05672ac6-98ad-4d20-94e1-09960d6dc517` returned `200`, then `PUT /api/profile` at `2026-05-12T21:59:29.204Z` returned `200`.

Cause:

- Profile/avatar persistence succeeds.
- Current DOM is stale.
- `setCurrentProfile()` updates `#profile-btn` only.
- Existing `.message--user .message-avatar` nodes are rendered once and not repainted after profile avatar changes.
- Session switch/reload rerenders history, so updated avatar appears then.
- Related: HG-ISSUE-048 added avatar image UI/storage. HG-ISSUE-052 enabled generated avatars. HG-ISSUE-058 covers missing in-flight avatar loading state.

Fix:

- After profile avatar update/save/generate/upload, repaint existing current-session user avatars or rerender current history from state.
- Add E2E: change avatar while messages are visible; visible current-session bubbles update without reload/session switch.
- Preserve raw asset bytes in asset storage only.

Resolution 2026-05-17:

- `setCurrentProfile()` now repaints current-session user avatar nodes whenever the profile changes.
- Upload, generate, save, reset, and initial profile load share that single repaint path.
- Added app/static/E2E coverage so existing visible user bubbles update without reload/session switch.
