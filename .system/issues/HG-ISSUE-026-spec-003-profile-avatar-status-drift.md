# HG-ISSUE-026 — Spec 003 profile/avatar status drift

**Severity:** Medium  
**Area:** Specs / tickets / profile UI  
**Status:** Fixed

## Report

User reported `HG-SPEC-003-local-user-profile-and-avatar.md` is out of date and some referenced work appears marked done despite not being complete.

## Logs

`logs/dev.log` exists. Relevant manual-check excerpt only; no historical profile/avatar implementation logs found.

```text
{"level":"debug","msg":"request received","time":"2026-05-02T23:52:51.426Z","service":"hallucygenie","reqId":"000002","method":"GET","path":"/?spec003=1777765971419"}
{"level":"info","msg":"response sent","time":"2026-05-02T23:52:51.427Z","service":"hallucygenie","reqId":"000002","method":"GET","path":"/?spec003=1777765971419","status":200}
```

## Initial cross-reference findings

Spec 003 listed tickets:

- `HG-TICKET-004` — Superseded
- `HG-TICKET-008` — Done
- `HG-TICKET-009` — Blocked, depended on `HG-TICKET-008`
- `HG-TICKET-010` — Blocked, depended on `HG-TICKET-009`
- `HG-TICKET-011` — Blocked, depended on `HG-TICKET-009`
- `HG-TICKET-012` — Blocked, depended on `HG-TICKET-009` and `HG-TICKET-034`

Problems found:

1. `HG-TICKET-008` says default avatar changed in user/steer bubbles, but steer bubbles still use `💡` in `public/app.ts` and tests assert `💡`.
2. `HG-TICKET-009` was `Blocked` even though its only dependency, `HG-TICKET-008`, was `Done`; moved to `Ready` during cleanup.
3. `HG-TICKET-012` depends on `HG-TICKET-034`; `HG-TICKET-034` was also `Blocked` even though its only dependency `HG-TICKET-033` was `Done`; moved `HG-TICKET-034` to `Ready` during cleanup.
4. Spec 003 mentioned historical MiniMax tool-id blockers fixed via `HG-ISSUE-001`, `HG-ISSUE-005`, `HG-ISSUE-006`; no profile-specific issue cross-refs existed before this issue.
5. Spec 003 incorrectly required profile `localStorage`; project decision is DB-owned state, with localStorage only for exceptional client-only hints.

## Initial manual Chrome check

Chrome target `60E506F2`, app served on `http://localhost:3000/` with temporary DB.

Observed DOM/app state:

```json
{
  "profileTextPresent": false,
  "profileControls": [],
  "profileStorage": null,
  "userAvatarAfterSendingMessage": "🎮"
}
```

Interpretation:

- Default user bubble avatar works.
- Header profile button absent.
- Profile modal absent.
- `hallucygenie_user_profile_v1` not created.
- No profile personalization path visible.

## Actual completion

Implemented:

- default normal user bubble avatar `🎮`
- profile button
- DB-backed profile modal/API
- no profile `localStorage`
- profile avatar in user bubbles
- profile data in chat prompt as DB-owned data
- disabled generated-avatar button

Still future/blocked:

- generated profile avatar asset (`HG-TICKET-012`)
- steer bubbles keep distinct `💡` by narrowed `HG-TICKET-008` scope

## Cleanup applied

1. Updated Spec 003 to DB-owned profile state; no profile localStorage.
2. Added explicit Spec 003 issue link to this issue.
3. Narrowed `HG-TICKET-008` text to normal user bubbles; steering keeps distinct `💡` unless future ticket changes it.
4. Moved `HG-TICKET-009` to `Ready` and rewrote it as DB-backed profile modal/API work.
5. Updated `HG-TICKET-010`, `HG-TICKET-011`, `HG-TICKET-012`, and superseded `HG-TICKET-004` to use DB-owned profile state.
6. Moved `HG-TICKET-034` to `Ready` after `HG-TICKET-033` completion.
7. Updated `HG-SPEC-005` to remove profile from client-owned localStorage state.
8. After implementation, marked `HG-SPEC-003`, `HG-TICKET-009`, `HG-TICKET-010`, and `HG-TICKET-011` Done.

## Closure

Synced spec/ticket state after implementation:

- `HG-SPEC-003` marked Done.
- `HG-TICKET-009` marked Done.
- `HG-TICKET-010` marked Done.
- `HG-TICKET-011` marked Done.
- `HG-TICKET-012` remains Blocked/future for generated asset avatar.

Validation:

- `just check`
- `just test-unit`
- `just test-e2e`
