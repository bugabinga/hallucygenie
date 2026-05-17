---
{ "status": "fixed", "specs": ["HG-SPEC-001", "HG-SPEC-009", "HG-SPEC-014"] }
---

# HG-ISSUE-067: Session picker theme mismatch

Repro:

- Open app in Chrome.
- Inspect header session picker.
- Session dropdown and new-session button render as mostly native/transparent controls instead of matching the dark neon app chrome.

Observed:

- `#session-select` and `#session-new` computed `backgroundColor` are transparent.
- CSS references `--color-bg-card` and `--color-border`, but root design tokens do not define them.
- Native select arrow remains visible via default `appearance: auto`.

Expected:

- Session picker uses HallucyGenie UI font, dark card surface, themed border, rounded shape, app accent hover/focus, and themed option colors.
- New-session button matches adjacent playful header controls.

Cause:

- Session switcher CSS used missing legacy card tokens and left select native appearance enabled.

Fix:

- Define card/border design tokens.
- Give session select a custom dark gradient, themed arrow, option colors, focus/hover state, and `appearance: none`.
- Restyle new-session button with the app accent gradient and focus/hover state.
- Add static regression coverage and verify computed styles in Chrome.
