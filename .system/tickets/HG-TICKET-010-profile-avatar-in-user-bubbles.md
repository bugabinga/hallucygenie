# HG-TICKET-010 — Profile avatar in user bubbles

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Blocked
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-009-profile-modal-local-storage.md`

## Goal

Render saved profile avatar emoji in user and steer bubbles.

## Scope

- User message avatar uses profile emoji if valid.
- Steer bubble avatar uses same user avatar.
- Fallback remains `🎮`.
- Do not support data URL avatars.

## Tests

- Frontend unit: saved emoji appears in new user/steer bubbles.
- Frontend unit: empty/invalid avatar falls back to `🎮`.

## Devil check

Emoji only. No remote URLs, no raw image data, no generated avatar asset.
