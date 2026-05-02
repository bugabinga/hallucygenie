# HG-TICKET-056 — Shell scroll ownership

**Spec:** `.system/specs/HG-SPEC-014-viewport-shell-layout-and-scrollbars.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-055-viewport-zoom-and-shell-width.md`

## Goal

Ensure normal chat layout has one scroll owner: `#message-list`.

## Scope

- No body/page vertical scrollbar during normal chat.
- No horizontal scrollbar on shell/header/footer/message list.
- Long code blocks scroll inside code block only.
- Preserve Create modal internal scroll behavior.

## Tests

- Static/CSS tests for scroll owner selectors.
- E2E/manual: long chat scrolls message list, not body.
- E2E/manual: Create modal still scrolls internally.

## Devil check

Avoid custom scrollbar/fake layout system.
