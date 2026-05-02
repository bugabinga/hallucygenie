# HG-TICKET-005: Stable Create modal layout + stronger surface

**Spec:** `.system/specs/HG-SPEC-004-stable-create-modal-layout.md`  
**Status:** Done  
**Priority:** Medium  
**Size:** M

## Goal

Stop Create modal from jumping between tabs. Make modal surface more readable while keeping blur/glass style.

## Scope

1. Audit actual selectors in `public/index.html` + `public/style.css`.
2. Make `.create-modal-content` stable height/width with responsive caps.
3. Keep header/tabs fixed inside modal shell.
4. Make `.create-panels` flex scroll region.
5. Ensure all submit buttons remain reachable.
6. Increase modal surface opacity/border/shadow.
7. Keep backdrop blur.

## Devil review

Do not fix with arbitrary min-height per panel. That just hides one case.

Correct fix:

- stable flex shell
- scrolling panel area
- no height animations
- mobile landscape included
- action buttons reachable by keyboard/touch

## Open questions

None. Submit buttons may remain inside panels for v1 if bottom padding keeps them reachable.

## Tests

- Static: actual selectors exist, `.create-panels` has `flex: 1`, `min-height: 0`, `overflow-y: auto`.
- Static: modal surface high-opacity/solid dark + `backdrop-filter` remains.
- E2E: modal shell/header/tab bounding boxes stable across tabs.

## Completion notes

Implemented 2026-05-01:

- `.create-modal-content` stable flex shell with viewport caps.
- `.create-panels` scrolls internally with `min-height: 0`.
- Modal surface opacity/shadow/border strengthened.
- Backdrop blur retained and strengthened.
- Mobile portrait/height caps added.

## Acceptance criteria

- [x] Tab switching does not move modal shell/header/tabs.
- [x] Content scrolls internally.
- [x] Popup background readable.
- [x] Blur retained.
- [x] Mobile portrait/landscape work.
- [x] `just check` + `just test-unit` + `just test-e2e` pass.
