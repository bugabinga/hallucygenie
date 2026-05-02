# HG-TICKET-055 — Viewport zoom + full-width shell

**Spec:** `.system/specs/HG-SPEC-014-viewport-shell-layout-and-scrollbars.md`  
**Status:** Done
**Priority:** High  
**Size:** M

## Goal

Allow browser zoom and make header/footer span the viewport while chat content remains readable.

## Scope

- Remove `maximum-scale` and `user-scalable=no` from viewport meta.
- Remove max-width constraint from `#app` shell.
- Add/maximize inner content constraints for header/message/input as needed.
- Ensure `min-width: 0` for shrinking flex children.

## Tests

- Static: viewport meta permits zoom.
- Static: no max-width on `#app`.
- Static: inner max-width exists for content/forms/messages.
- Manual Chrome: 200% zoom usable.

## Implementation

- Removed restrictive viewport scale flags.
- Made `#app` full-width and moved content constraints into header/message/input padding/form.
- Added shrink guards for flex children.

## Validation

- `bun test test/static.test.ts test/app.test.ts --timeout 30000`
- `just check`
- `just test-all`

## Devil check

No redesign. Move width responsibility, do not repaint whole app.
