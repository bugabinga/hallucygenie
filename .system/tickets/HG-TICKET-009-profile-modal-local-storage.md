# HG-TICKET-009 — Local profile modal storage

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Blocked
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-008-default-gaming-avatar.md`

## Goal

Add small header profile button/modal and save short local profile fields.

## Scope

- Header profile button.
- Modal fields: username, interests, hates, favorite games/style, avatar emoji.
- `localStorage` key: `hallucygenie_user_profile_v1`.
- Trim/cap fields per spec.
- Reset local profile.
- Modal ARIA/focus behavior.

## Tests

- Frontend unit: save/load/reset, trim/caps, invalid JSON ignored.
- Static: profile button/modal ARIA.
- E2E/manual: save profile, reload, values persist.

## Devil check

Profile is untrusted prompt data. No server/prompt injection in this ticket.
