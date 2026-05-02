# HG-TICKET-008 — Default gaming avatar

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Ready  
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

## Devil check

Do not add profile state here. One visual default only.
