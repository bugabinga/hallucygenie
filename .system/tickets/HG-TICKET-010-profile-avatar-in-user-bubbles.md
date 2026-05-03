# HG-TICKET-010 — Profile avatar in user bubbles

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Done
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-009-profile-modal-local-storage.md` (done)

## Goal

Render saved DB profile avatar in user bubbles.

## Scope

- Frontend loads active profile from API/bootstrap state.
- User message avatar uses DB profile emoji if valid.
- Fallback remains `🎮`.
- Steer bubble behavior may remain distinct unless UX says otherwise.
- Do not support data URL avatars.

## Tests

- Frontend unit: saved emoji appears in new user bubbles.
- Frontend unit: empty/invalid avatar falls back to `🎮`.
- Frontend/static: no avatar/profile localStorage reads or writes.

## Implementation

- Frontend fetches profile before history render.
- User bubbles render valid profile emoji/avatar.
- Invalid or empty avatar falls back to `🎮`.
- Steer bubbles keep distinct `💡`.

## Validation

- `just check`
- `just test-unit`
- `just test-e2e`

## Devil check

Emoji only. No remote URLs, no raw image data, no generated avatar asset.
