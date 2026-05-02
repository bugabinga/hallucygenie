# HG-TICKET-008 — Default gaming avatar

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Done
**Priority:** Medium  
**Size:** S

## Goal

Replace default user avatar `👤` with `🎮` everywhere user/steer bubbles render without a profile avatar.

## Scope

- Update frontend default avatar constant/rendering.
- Keep assistant avatar unchanged.
- No profile modal in this ticket.

## Tests

- Frontend unit: user message default avatar is `🎮`.
- Snapshot update if user message HTML changes.

## Implementation

- Added a frontend `USER_AVATAR` default.
- User bubble rendering now uses `🎮`; assistant/steer unchanged.

## Validation

- `bun test test/app.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

Do not add profile state here. One visual default only.
