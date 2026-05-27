---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-015"] }
---

Repro: open Profile, inspect avatar preview and `Generate avatar` action. Screenshot `/tmp/pi-clipboard-74617645-85f6-45fc-a7e0-4fa4adb4488f.png` shows avatar widget near the middle, while the related generate action is at the bottom below profile help text, Save, and Reset.
Cause: profile dialog action layout groups `Generate avatar` with whole-profile actions instead of with the avatar editor. Related avatar preview/upload/generate controls are split apart by unrelated fields/actions.
Fix: moved `Generate avatar` into the avatar control group beside the avatar widget; Save/Reset remain in the profile-level action group. Added static, integration, and Chrome E2E proximity regressions. Cross-ref HG-ISSUE-048, HG-ISSUE-058, HG-ISSUE-062, HG-ISSUE-117, HG-ISSUE-125.
