---
{ "status": "open", "specs": ["HG-SPEC-015"] }
---

# HG-SPEC-015: Onboarding/lightbox dialog focus and ARIA gaps

## Spec requirement

HG-SPEC-015 requires modals/dialogs to have:

- `role="dialog"`
- `aria-modal="true"`
- accessible label
- focus trap while open

Keyboard navigation must work for all interactive elements.
No keyboard traps outside modals.

## Current app behavior

Create/profile modals have dialog ARIA and focus traps.
Onboarding is marked as a dialog, but focus is not trapped while it is open.
The image lightbox behaves as a modal overlay, but has no `role="dialog"`, no `aria-modal`, no accessible dialog label, no initial focus management, and no focus trap.

## Impact

Keyboard and screen-reader users can tab outside active overlays or miss modal context.
Lightbox controls are less discoverable and do not announce as a dialog.
This violates the modal accessibility baseline.

## Acceptance

- Add focus trap and initial focus behavior for onboarding.
- Add dialog role/aria-modal/label to lightbox.
- Trap focus while lightbox is open and restore focus on close.
- Keep Escape/backdrop/close-button behavior.
- Add frontend tests covering Tab wrap and focus restoration for onboarding and lightbox.
