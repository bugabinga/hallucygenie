---
{ "status": "fixed", "specs": ["HG-SPEC-014", "HG-SPEC-003", "HG-SPEC-008"] }
---

Repro:

- Open main chat with enough messages to scroll.
- Observe thin translucent custom scrollbar.
- Open Profile with enough content to scroll.
- Open Create → Assets with enough assets to scroll.
- Profile/Create scrollbars use browser default styling and look worse than chat.
- `logs/dev.log` shows normal UI/API loads only: `GET /style.css` returned `200`; `GET /api/profile` returned `200`; `GET /assets` returned `200`.

Cause:

- Scrollbar CSS targets only `#message-list`.
- `.modal-content` and `.create-panels` are scroll owners but lack matching `::-webkit-scrollbar` styling.
- HG-SPEC-014 requires clean scroll ownership; it does not yet require consistent scrollbar aesthetics across scroll owners.
- Related: HG-ISSUE-017 covered Create form visual polish; HG-ISSUE-048 covered Profile dialog UX; HG-ISSUE-058 covers Profile avatar loading UX.

Fix:

- Extract chat scrollbar style to shared scrollbar class or selector list.
- Apply to `#message-list`, `.modal-content`, `.create-panels`, and any intentional scroll owner.
- Add static CSS contract test: all intended scroll owners are covered by shared scrollbar styling.

Resolution 2026-05-17:

- Verified chat, modal, and create panel scroll owners share the thin custom scrollbar selector list.
- Added a static contract test for shared scrollbar rules on `#message-list`, `.modal-content`, and `.create-panels`.
