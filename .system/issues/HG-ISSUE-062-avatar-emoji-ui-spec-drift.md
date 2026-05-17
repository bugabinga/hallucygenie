---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-015"] }
---

Repro:

- Open Profile.
- Avatar section shows `Avatar emoji` input plus image upload/generate controls.
- User can set emoji avatar in UI/API/tests.
- Avatar image, emoji field, hidden asset ref, upload input, and generate button make the section unnecessarily complex.
- Better target UX: one larger avatar image/fallback; click image to upload; hover/focus makes upload action obvious.
- HG-SPEC-003 now says profile avatar is `asset ref`.
- HG-SPEC-003 clarifies default `🎮` is fallback only `if no asset ref`.
- `logs/dev.log` shows normal profile loads/saves: `GET /api/profile` returned `200`; `PUT /api/profile` returned `200`; `POST /api/profile/avatar` returned `200`.

Cause:

- Spec changed after image avatar work.
- UI still has `#profile-avatar`, `#profile-avatar-emoji-preview`, and `Avatar emoji` label.
- Upload action is a separate file input instead of the avatar image itself.
- Client/server types still allow `{ type: "emoji" | "asset" }`.
- DB/server/app/tests still treat emoji as valid avatar state.
- Confusing with image avatar path.
- Related: HG-ISSUE-048 identified avatar emoji field as confusing but kept emoji support. HG-ISSUE-052 covered generated-avatar spec drift. HG-ISSUE-058 and HG-ISSUE-059 cover avatar image UX regressions.

Fix:

- Remove avatar emoji input/preview/state from Profile UI.
- Replace avatar editor with one larger clickable avatar image/fallback control.
- Trigger hidden file input from avatar click; add hover/focus overlay/copy showing upload action.
- Make persisted/API avatar schema asset-ref-only.
- Keep `🎮` only as no-asset fallback display, not editable profile state.
- Update API validation, DB normalization, prompt exclusion tests, app tests, E2E.
- Add static contract test: no `Avatar emoji`, `#profile-avatar`, or emoji avatar payload support remains if spec is asset-only.

Resolution 2026-05-17:

- Kept `🎮` as the non-editable fallback avatar when no asset ref exists.
- Removed stale E2E coverage that edited `#profile-avatar` as an emoji input.
- Replaced prompt-context tests with asset-ref-only profile avatars and verified avatar refs stay out of the system prompt.
- Added DB/server/static coverage rejecting `{ type: "emoji" }` avatar payloads.
