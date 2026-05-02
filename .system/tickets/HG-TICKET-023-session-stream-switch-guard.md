# HG-TICKET-023 — Guard session switching during stream

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-020-session-header-switcher.md`

## Goal

Prevent session state corruption when switching while assistant streams.

## Scope

- Disable or confirm session switch/new while streaming.
- Same guard for rename/archive if active stream would be confusing.
- Keep simple; no stream cancellation system in this ticket.

## Tests

- Frontend unit: switch/new disabled or confirm shown while streaming.
- E2E/manual: cannot switch into mixed transcript mid-stream.

## Devil check

No complex cancellation protocol. Just block/confirm.
