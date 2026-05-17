---
{ "status": "fixed", "specs": ["HG-SPEC-009", "HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-070: Header control order is illogical

Repro:

- Open the app and inspect the header order.
- Current order groups session, live status, and quota before the primary user controls.

Observed:

- Header order was: logo, app name, session picker, live indicator, quota, profile, create.
- The live indicator was separated from app identity.
- Passive quota status appeared before profile and create actions.

Expected:

- Keep app identity/status together: logo, app name, live indicator.
- Then show session context/navigation.
- Then order user controls by importance: profile, create, quota.

Fix:

- Move `#connection-status` into `.header-left` after the app name.
- Reorder `.header-right` to session picker, profile, create, quota.
- Update mobile header grid to keep session on its own row and controls below as profile, create, quota.
- Add static header order coverage and verify order in Chrome.
