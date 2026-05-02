# HG-TICKET-012 — Generated profile avatar asset

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`, `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-009-profile-modal-local-storage.md`, `HG-TICKET-034-assets-api-details.md`

## Goal

Optional: generate a profile avatar image and store only a server asset ref.

## Scope

- Button in profile modal: generate avatar.
- Uses existing image tool/asset path.
- Profile stores asset id/ref only.
- Bubble can render small local asset image.
- No data URLs in localStorage or prompt.

## Tests

- Frontend unit: profile stores asset ref only.
- Integration: generated avatar asset is saved in assets.
- DB invariant: no raw image bytes in messages/profile state.

## Devil check

Low priority. Do not implement before asset metadata/UI is stable.
