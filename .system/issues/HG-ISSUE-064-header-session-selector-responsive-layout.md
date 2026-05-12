---
{ "status": "open", "specs": ["HG-SPEC-009", "HG-SPEC-014", "HG-SPEC-015"] }
---

Repro:

- Open app at narrow/mobile width or with long session names.
- Header session selector overflows into `HallucyGenie` title.
- Profile button sits taller/misaligned versus adjacent header controls.
- `logs/dev.log` shows normal header dependencies: `GET /app.js` returned `200`, `GET /style.css` returned `200`, `GET /api/sessions` returned `200`, `GET /api/profile` returned `200`.

Cause:

- Header uses two flex groups with `justify-content: space-between` and no robust width budget.
- `.session-select` has fixed-ish `max-width: 150px`, not responsive `min()/clamp()` tied to viewport and sibling controls.
- `.header-left` can collide visually with `.header-right` when controls exceed width.
- Header buttons/select use different padding/min-height/line-height rules, causing vertical mismatch.
- HG-SPEC-009 requires mobile-truncated session name.
- HG-SPEC-014 requires full-width responsive shell.
- Related: HG-ISSUE-044 added header session switcher; this is current responsive polish/regression. HG-ISSUE-060 covers scrollbar styling, not header layout.

Fix:

- Give header a responsive grid/flex layout with explicit title/session/action zones.
- Make title and session selector truncate within their own zones; no overlap.
- Normalize header control height, padding, line-height, and alignment.
- Add E2E/static checks at small widths and long session names.
