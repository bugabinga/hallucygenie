---
{ "status": "fixed", "specs": ["HG-SPEC-009", "HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-069: Header title collapses on mobile

Repro:

- Open app in Chrome with a narrow mobile viewport, e.g. 360px wide.
- Inspect the header.
- `HallucyGenie` is not visible.

Observed:

- Header stays a two-column grid: title zone + auto-sized actions zone.
- The actions zone needs more width than the viewport because it contains session picker, status, quota, profile, and create controls.
- CSS grid gives `.header-left` and `.header-title` `0px` width, so the app title is clipped away.

Expected:

- App name remains visible on mobile.
- Header controls stay usable without forcing the title to zero width.
- Session picker truncates inside its own available space.

Cause:

- Header did not switch layouts when action controls exceeded the available inline width.

Fix:

- Add a narrow-header layout at `max-width: 560px`.
- Move header actions under the title in a responsive grid.
- Reserve a flexible `sessions` column for the session picker and place quota on its own row.
- Keep title on its own row so it cannot be squeezed out by action controls.
- Add static regression coverage and verify in Chrome at 360px.
