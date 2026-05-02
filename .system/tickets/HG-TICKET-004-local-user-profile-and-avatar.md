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

Replace boring user icon, add small local-only profile modal, use profile data safely for personalization.

## Scope

1. Default user avatar `👤` → `🎮`.
2. Header profile button.
3. Compact profile modal.
4. Store versioned profile in `localStorage`.
5. Trim field lengths.
6. User bubbles use emoji/avatar asset fallback.
7. Send compact profile data with chat req.
8. Server injects profile into system prompt as quoted preference data.
9. Avatar generation button can be enabled now that tool id bug is fixed, but only stores server asset id/url.

## Devil review

Profile is prompt-injection bait. Treat all fields as data, never instructions.

Hard constraints:

- no data URL avatars
- cap field lengths
- omit empty fields
- no avatar URL in system prompt
- profile cannot override base prompt
- reset only local profile

## Open questions

None. Use emoji avatar v1; asset avatar optional behind successful image generation.

## Tests

- Frontend unit: save/load/reset, trimming, avatar fallback, bubble avatar.
- Backend unit: prompt contains quoted profile data and preserves base rules.
- Static: profile button/modal ARIA.
- E2E: save profile → reload → avatar persists → chat sends profile.

## Acceptance criteria

- [ ] Default user icon is `🎮`.
- [ ] Profile modal works on mobile.
- [ ] Profile persists locally only.
- [ ] User bubble avatar uses profile.
- [ ] System prompt personalization is injection-safe.
- [ ] `just check` + `just test-unit` + `just test-e2e` pass.
