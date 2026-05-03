# HG-SPEC-015: Accessibility baseline

## Design decisions

- All form controls have associated `<label>` elements.
  Visual hiding via `.sr-only`.
- Modals:
  `role="dialog"`, `aria-modal="true"`, `aria-label`.
  Focus trap while open.
- Status indicators have dynamic `aria-label`.
  Not just `title`.
- Viewport meta allows pinch zoom.
  No `maximum-scale`.
  No `user-scalable=no`.
- `prefers-reduced-motion` disables animations.
- Keyboard navigation works for all interactive elements.
  No keyboard traps outside modals.
- No important information conveyed by color alone.
