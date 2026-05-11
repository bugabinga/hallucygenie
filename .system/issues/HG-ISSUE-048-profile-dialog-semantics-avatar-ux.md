---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-015"] }
---

Repro:

- Open Profile dialog.
- `Interests` and `Favorites` both ask broad preference data. Roles overlap.
- The avatar emoji field used an icon placeholder and `maxlength="8"`, which looked like a broken/irrelevant short input.
- No avatar preview/upload image element existed in the dialog.
- `Generate avatar 🎨` was always disabled.
- Profile data must guide LLM personalization. `buildSystemPrompt()` injects username/interests/dislikes/favorites as quoted preference data. No avatar bytes enter prompt/context.

Cause:

- HG-SPEC-003 field names were too broad for user guidance: interests vs favorites overlapped.
- Avatar input was emoji-only UI over a DB model that already accepts emoji or asset refs.
- HG-SPEC-003 said generated avatar stayed disabled until asset foundations; HG-SPEC-008 asset storage now exists, so the disabled button was stale.
- HG-SPEC-015 requires clear labels and keyboard-accessible controls; icon placeholder alone was weak affordance.
- Related: HG-ISSUE-026 fixed old profile/avatar status drift; this was current dialog UX drift.

Fix:

- Renamed profile guidance labels: `Topics to bring up`, `Things to avoid`, `Style favorites`.
- Removed email implication. No email field exists or is collected.
- Added avatar preview image, emoji preview, hidden asset ref, and image upload input.
- Added `POST /api/profile/avatar` to save uploaded avatar image bytes into asset storage and set profile avatar to asset ref.
- Enabled `Generate avatar 🎨`; added `POST /api/profile/avatar/generate` using MiniMax `generate_image`, image quota, asset storage, and profile-safe prompt data.
- Kept profile data in system prompt as quoted preference data; avatar data remains excluded.
- Added static, frontend, and server regression tests.
