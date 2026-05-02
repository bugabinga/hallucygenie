# HG-TICKET-058 — Viewport manual/E2E matrix

**Spec:** `.system/specs/HG-SPEC-014-viewport-shell-layout-and-scrollbars.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-055-viewport-zoom-and-shell-width.md`, `HG-TICKET-056-shell-scroll-ownership.md`, `HG-TICKET-057-chat-input-overflow-scrollbar.md`

## Goal

Verify viewport/shell behavior across common sizes and zoom levels.

## Scope

- Chrome desktop 100%, 150%, 200%.
- Mobile portrait and landscape viewport.
- Assert no body horizontal scroll.
- Assert header/footer/input remain stable during streaming/steering.

## Tests

- E2E/manual Chrome checklist and minimal automated assertions.

## Devil check

Do not make brittle pixel-perfect screenshots. Use bounds/overflow assertions.
