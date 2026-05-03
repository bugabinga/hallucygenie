# HG-TICKET-006: Local draft + UI state persistence

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`  
**Status:** Superseded  
**Priority:** High  
**Size:** L

## Superseded by smaller DB-first tickets

Durable drafts and UI state now follow `.system/specs/HG-SPEC-007-db-first-single-user-state.md`. Do not implement this ticket as localStorage state.

- `HG-TICKET-024-chat-draft-db-state.md`
- `HG-TICKET-025-create-draft-db-state.md`
- `HG-TICKET-026-recent-error-toast-ttl.md`
- `HG-TICKET-027-streaming-scratch-recovery.md`

## Goal

Never lose unsent user input. Persist chat drafts, Create drafts, selected tab, recent errors, and in-progress thinking safely.

## Current decision

- Durable drafts → DB.
- Selected Create tab → DB.
- Recent user-visible error toast → allowed localStorage exception with TTL.
- In-progress stream scratch → temporary local exception only until DB persistence exists.

## Devil review

LocalStorage must not become fake DB. No durable profile, draft, session, history, or asset identity in browser storage.

## Tests

Covered by successor tickets.
