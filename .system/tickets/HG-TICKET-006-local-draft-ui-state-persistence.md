# HG-TICKET-006: Local draft + UI state persistence

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`  
**Status:** Superseded  
**Priority:** High  
**Size:** L

## Superseded by smaller DB-first tickets

`.system/specs/HG-SPEC-007-db-first-single-user-state.md` conflicts with durable localStorage drafts. Durable drafts now split into DB-first tickets:

- `HG-TICKET-024-chat-draft-db-state.md`
- `HG-TICKET-025-create-draft-db-state.md`
- `HG-TICKET-026-recent-error-toast-ttl.md`
- `HG-TICKET-027-streaming-scratch-recovery.md`

## Goal

Never lose unsent user input. Persist chat drafts, Create drafts, selected tab, recent errors, and in-progress thinking safely by session.

## Scope

1. Add centralized local UI state module in `public/app.ts` or adjacent plain fns.
2. Session-scoped key: `hallucygenie_ui_state_v1:${sessionId}`.
3. Persist chat input draft.
4. Persist all Create form fields + selected tab.
5. Persist recent error toast with 10-minute TTL.
6. Persist in-progress thinking scratch only.
7. Flush on submit/modal close/tab change/pagehide/visibilitychange.
8. Debounce normal writes.
9. Restore without overwriting non-empty active DOM fields.
10. Clear chat draft only after successful done/no error.
11. Clear Create form only after matching tool history success (`HG-TICKET-007`).

## Devil review

Biggest risk: localStorage becomes fake DB. Do not duplicate canonical server history.

Rules:

- drafts local, accepted messages server
- completed thinking server
- generated assets server
- invalid state ignored, not fatal
- no global clear-drafts UI
- session key prevents cross-session leaks

## Open questions

None. Create-draft success clearing depends on `HG-TICKET-007`; until then do not clear Create drafts early.

## Tests

- Frontend unit: save/restore chat/create drafts, selected tab, errors, invalid JSON, non-overwrite.
- Backend/unit: completed thinking can be returned in history when implemented.
- E2E: reload preserves drafts; success clears only safe drafts.

## Acceptance criteria

- [ ] Chat draft survives reload.
- [ ] Create drafts survive reload.
- [ ] Recent errors survive reload with TTL.
- [ ] Invalid state does not crash.
- [ ] No non-empty input overwritten.
- [ ] Drafts clear only after safe successor exists.
- [ ] `just check` + `just test-unit` + `just test-e2e` pass.
