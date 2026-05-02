# HG-TICKET-057 — Chat input useful scrollbar only

**Spec:** `.system/specs/HG-SPEC-014-viewport-shell-layout-and-scrollbars.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** M

## Goal

Hide main chat textarea scrollbar until content exceeds max height.

## Scope

- `#chat-input` defaults `overflow-y: hidden`.
- `autoResizeInput()` toggles overflow class/attr only when clamped.
- One-line and short multi-line inputs show no useless scrollbar.
- Long input scrolls internally after max height.

## Tests

- Frontend unit: one-line no overflow class.
- Frontend unit: short multi-line no overflow class.
- Frontend unit: long input gets overflow class and clamped height.
- Static: CSS supports hidden/default and overflow class.

## Devil check

Do not change send/submit behavior. Only scrollbar visibility.
