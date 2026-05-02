# HG-E2E-008: Connection status dot missing aria-label

**Status:** Fixed

**Severity:** Low (accessibility)
**Files:** `public/index.html`, `public/style.css`
**Observed:** `#connection-status` has `title="Connected"` but no `aria-label`. Screen readers won't announce connection state changes.
**Fix:** Add `aria-label="Connection status: Connected"` and update dynamically when status changes.
