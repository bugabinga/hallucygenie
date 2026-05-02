# HG-E2E-007: Create modal lacks ARIA attributes

**Status:** Fixed

**Severity:** Medium (accessibility)
**Files:** `public/index.html:191`, `public/app.ts`
**Observed:** `#create-modal` has no `role="dialog"`, `aria-modal="true"`, or `aria-label`. No focus trap when open. Screen readers won't announce it as a dialog. Keyboard users can tab behind the modal.
**Fix:** Add `role="dialog" aria-modal="true" aria-label="Create"` to `#create-modal`. Implement basic focus trap in the open/close handlers.
