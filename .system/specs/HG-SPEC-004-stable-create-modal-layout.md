# HG-SPEC-004: Stable Create modal layout + stronger backdrop

**Status:** Done

## Tickets

- `HG-TICKET-005-stable-create-modal-layout.md`

## Goal

Improve Create modal polish by preventing layout jumps between tabs and making popup background more readable while keeping the cool blur effect.

## Verdict status

**Revised after devil review.** Implementation must audit real selectors and keep actions visible while only panel content scrolls.

## Problems

1. Create modal layout jumps depending on selected tab.
2. Popup background is too transparent.
3. Blur/backdrop vibe is good and should stay.

## UX requirements

### Stable tab layout

Switching between Image/Music/Voice/Search tabs must not move modal shell, title, tab bar, or primary action area around.

Desired behavior:

- modal stays centered/stable
- tab bar stays fixed in place
- footer/submit action stays predictable
- content area handles different form heights internally
- no height animation/layout jump on tab switch

### Stronger popup surface

Current modal surface should become more opaque/readable.

Keep:

- backdrop blur
- dark glass vibe
- neon theme

Change:

- increase modal panel opacity
- strengthen border/shadow
- improve text contrast

## Selector audit requirement

Before editing CSS, audit current `public/index.html` + `public/style.css` and use real selectors. Example selectors below are illustrative unless they match current DOM.

Expected current-ish targets:

- `#create-modal`
- `.modal-backdrop` / actual backdrop selector
- `.modal-content` / actual dialog selector
- `.create-tabs`
- `.create-panels`
- `.create-panel`

Tests must assert actual selectors exist.

## Proposed layout design

### Modal shell

Use a stable dialog height with responsive caps:

```css
/* actual dialog selector required */
.create-dialog {
  width: min(92vw, 560px);
  height: min(86dvh, 720px);
  max-height: 720px;
  display: flex;
  flex-direction: column;
}
```

Small mobile:

```css
@media (max-width: 480px) {
  .create-dialog {
    width: min(94vw, 560px);
    height: min(88dvh, 640px);
  }
}
```

Mobile landscape:

```css
@media (max-height: 520px) {
  .create-dialog {
    height: 92dvh;
  }
}
```

### Stable content region

Only form body scrolls:

```css
.create-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

Header/tabs/footer should be outside the scroll region when feasible.

If submit buttons currently live inside each panel, either:

1. keep enough bottom padding so button remains reachable, or
2. move action row outside panel in implementation ticket.

### Panel behavior

Only active panel visible. Container keeps stable height.

Avoid animating:

- height
- margin
- padding that changes layout

Allowed animations:

- opacity
- transform
- box-shadow

### Stronger glass surface

Example values:

```css
.create-dialog {
  background: rgba(20, 20, 26, 0.94);
  backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.65);
}

.create-backdrop {
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(10px);
}
```

Use actual selectors.

## Accessibility

- Modal keeps `role="dialog"` and `aria-modal="true"`.
- Focus behavior unchanged.
- Scrollable panel is keyboard-scrollable.
- Submit buttons remain keyboard reachable.
- Text contrast improves compared to current.

## Tests

### Static/unit

Update `test/static.test.ts`:

- Create modal still has dialog ARIA.
- CSS uses actual selector names from DOM.
- CSS has stable scroll region (`flex: 1`, `min-height: 0`, `overflow-y: auto`) for panel container.
- CSS keeps `backdrop-filter`.
- CSS modal surface uses high-opacity rgba (`>= 0.9`) or equivalent solid dark color.

### E2E

Update `e2e/run-e2e.ts`:

- open Create modal
- capture bounding boxes for:
  - dialog shell
  - title/header
  - tab bar
  - footer/action area if present
- switch through all tabs
- assert shell top/left/width/height stay within small tolerance
- assert title/tab bar top positions stay within small tolerance
- assert submit action reachable for each tab
- run same check at mobile viewport and mobile landscape viewport

## Acceptance criteria

- [ ] Switching Create tabs does not visibly jump modal position.
- [ ] Header/tabs stay stable across tab switches.
- [ ] Create tab content scrolls inside stable area if needed.
- [ ] Submit action remains reachable.
- [ ] Popup surface is less transparent/readable.
- [ ] Blur effect remains.
- [ ] Mobile portrait and landscape work.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] `just test-e2e` passes.

## Related

- `HG-SPEC-014-viewport-shell-layout-and-scrollbars.md` owns the main app shell viewport, header/footer width, and main chat input scrollbar contract. This spec remains scoped to Create modal internals.
