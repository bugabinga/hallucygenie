---
{ "status": "fixed", "specs": ["HG-SPEC-001", "HG-SPEC-009", "HG-SPEC-014"] }
---

# HG-ISSUE-068: Session picker arrow and add button integration

Repro:

- Open app in Chrome.
- Look at the header session picker.
- The orange dropdown triangle appears rotated incorrectly.
- The new-session `＋` button appears as a separate gold/pink feature, not part of the session picker.

Observed:

- The select arrow is drawn with a single CSS triangle gradient, which reads as an incorrectly rotated orange triangle.
- `#session-select` and `#session-new` are two separately styled pills with a gap.
- `#session-new` uses the same high-emphasis gradient treatment as a primary feature button.

Expected:

- The session dropdown uses a normal downward chevron.
- The add button is visually integrated into the same picker control.
- The whole picker reads as one compact header widget.

Cause:

- The first theme pass styled the select and add button independently.
- The select arrow used a single triangular gradient instead of an explicit chevron icon.

Fix:

- Move the themed pill surface to `.session-switcher`.
- Remove the gap between select and add button.
- Replace the triangle gradient with an inline SVG down chevron.
- Restyle add as a transparent segmented control with a divider, not a standalone gradient button.
- Update static regression coverage and verify computed styles in Chrome.
