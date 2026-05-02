# HG-ISSUE-017 — Create menu input fields have missing/invisible left border

**Status:** Fixed
**Severity:** Low
**Reported:** 2026-05-01
**Components:** `public/style.css`, `public/index.html`

## Description

In the Create menu, textareas/select inputs show visible top/right/bottom borders, but the left border is missing or too subtle to see. This makes fields look visually broken/lopsided.

## Steps to Reproduce

1. Open Create menu
2. Look at form fields in Image / Voice / Music tabs
3. Observe textarea/select field border
4. Left border is not visible while other borders are visible

## Root Cause Hypothesis

Create form controls use:

```css
.form-group textarea,
.form-group select {
  width: 100%;
  box-sizing: border-box;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
}
```

Possible causes:

1. **Control flush against clipped container edge** — `.create-panels` has `overflow-y: auto` and `padding-right: 2px`, but no left padding. A 100% width child may sit too close to the modal/panel edge, visually hiding left border against dark background.
2. **Border color too low contrast** on the left side due to adjacent panel/modal background.
3. **Native select/textarea rendering quirk** in Chrome/Linux with dark controls.
4. **Box shadow/backdrop/scrollbar clipping** from modal layout.

## Affected Code

- `public/style.css:1038-1042` — `.create-panels` overflow/padding
- `public/style.css:1045-1047` — `.create-panel`
- `public/style.css:1061-1073` — `.form-group textarea, .form-group select`

## Possible Fixes

### A. Add horizontal padding to create panels

```css
.create-panels {
  padding: 0 2px;
}
```

or:

```css
.create-panel {
  padding-left: 1px;
  padding-right: 1px;
}
```

### B. Strengthen form control border + focus ring

```css
.form-group textarea,
.form-group select {
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}
```

### C. Use explicit left border color

```css
.form-group textarea,
.form-group select {
  border-left-color: rgba(255, 255, 255, 0.22);
}
```

## Recommendation

Fix visually with A + small B:

- Give panels 1–2px horizontal breathing room
- Slightly increase form control border contrast
- Verify mobile layout still fits

## Tests Needed

- Static CSS test: Create form controls have visible border rule
- E2E/screenshot/manual Chrome: left border visible in Image/Voice/Music tabs

## Related

- `HG-SPEC-014-viewport-shell-layout-and-scrollbars.md` covers the main app shell and main chat input scrollbar behavior. This issue remains scoped to Create modal form-control borders/clipping.

## 2026-05-02 fix

Create panels now have horizontal breathing room and form controls use a stronger explicit left border.

Verification:

- Static CSS test checks panel padding and `border-left-color`.
- Manual Chrome: image textarea/select left border was `rgba(255, 255, 255, 0.28)` at `1px`; panel left padding was `2px`.
