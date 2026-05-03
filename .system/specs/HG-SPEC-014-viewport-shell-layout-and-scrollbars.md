# HG-SPEC-014: Viewport zoom, full-width shell, clean input scrolling

## Problem

Viewport meta blocks pinch zoom. `max-width` on `#app` constrains header/footer to 720px instead of full width. Multiple accidental scrollbars. Chat input shows useless scrollbar gutter.

## Design decisions

- Viewport meta: `width=device-width, initial-scale=1.0` only. No `maximum-scale`. No `user-scalable=no`.
- `max-width` moved from `#app` to inner content areas. Header/footer span full viewport width.
- One scroll owner: `#message-list`. No body/page scrollbar during normal use.
- Chat input: `overflow-y: hidden`. Add `.is-overflowing` class with `overflow-y: auto` only when `scrollHeight > maxHeight`.
