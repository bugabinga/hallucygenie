# HG-TICKET-004: Local user profile + avatar

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Superseded  
**Priority:** Medium  
**Size:** L

## Superseded by smaller tickets

- `HG-TICKET-008-default-gaming-avatar.md`
- `HG-TICKET-009-profile-modal-local-storage.md`
- `HG-TICKET-010-profile-avatar-in-user-bubbles.md`
- `HG-TICKET-011-profile-data-in-chat-prompt.md`
- `HG-TICKET-012-generated-profile-avatar-asset.md`

## Goal

Replace boring user icon, add small DB-backed profile modal, use profile data safely for personalization.

## Scope

1. Default user avatar `👤` → `🎮`.
2. Header profile button.
3. Compact profile modal.
4. Store versioned profile in DB.
5. Trim field lengths server-side.
6. User bubbles use emoji/avatar asset fallback.
7. Server loads DB profile for chat.
8. Server injects profile into system prompt as quoted preference data.
9. Avatar generation button can be enabled after profile + asset APIs are ready, but only stores server asset id/url.

## Devil review

Profile is prompt-injection bait. Treat all fields as data, never instructions.

Hard constraints:

- no data URL avatars
- cap field lengths
- omit empty fields
- no avatar URL in system prompt
- profile cannot override base prompt
- reset only DB profile

## Open questions

None. Use emoji avatar v1; asset avatar optional behind successful image generation.

## Tests

- Frontend unit: save/load/reset via API, trimming, avatar fallback, bubble avatar.
- Backend unit: profile CRUD + prompt contains quoted profile data and preserves base rules.
- Static: profile button/modal ARIA and no profile localStorage.
- E2E: save profile → reload → avatar persists → chat uses DB profile.

## Acceptance criteria

- [ ] Default user icon is `🎮`.
- [ ] Profile modal works on mobile.
- [ ] Profile persists in local DB only.
- [ ] User bubble avatar uses profile.
- [ ] System prompt personalization is injection-safe.
- [ ] `just check` + `just test-unit` + `just test-e2e` pass.
