# HG-TICKET-027 — In-progress streaming scratch recovery

**Spec:** `.system/specs/HG-SPEC-005-local-draft-and-ui-state-persistence.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** S  
**Depends:** `HG-TICKET-024-chat-draft-db-state.md`

## Goal

Persist minimal in-progress thinking/text scratch so reload during stream is not blank/confusing.

## Scope

- Store scratch only while stream is active.
- Clear on done/error.
- Do not treat scratch as canonical history.
- Prefer sessionStorage or DB transient state per final design.

## Tests

- Frontend unit: scratch appears after reload during stream.
- Frontend unit: scratch cleared on done/error.

## Devil check

Scratch is not accepted assistant history. Do not duplicate server truth.
