---
{ "status": "open", "specs": ["HG-SPEC-015"] }
---

# HG-SPEC-015: Quota status aria-label is static

## Spec requirement

HG-SPEC-015 says status indicators have dynamic `aria-label`, not just `title`.
Important information must not be conveyed by color alone.

## Current app behavior

`#quota-badge` has `role="status"` and a static `aria-label`:

```html
aria-label="Images, voice, music, and lyrics remaining today"
```

`updateQuotaBadge()` changes visible remaining counts and warning/critical classes, but does not update the badge's accessible label.
Because `aria-label` overrides descendant text, screen readers may hear only the generic static label instead of the actual remaining counts.
Warning/critical quota states are conveyed mainly by CSS classes.

## Impact

Screen-reader users do not get current quota counts or warning/critical state from the status indicator.
This violates the accessibility baseline.

## Acceptance

- Update `aria-label` whenever quota data changes.
- Include per-feature remaining/total values in the label.
- Include warning/critical state in text, not only color.
- Ensure empty/unavailable quota data has clear accessible text.
- Add frontend/static tests that fail if the label stays static after `updateQuotaBadge()`.
