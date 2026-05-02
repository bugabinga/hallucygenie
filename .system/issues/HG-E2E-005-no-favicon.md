# HG-E2E-005: No favicon

**Status:** Fixed

**Severity:** Low (cosmetic)
**Files:** `public/index.html`
**Observed:** No `<link rel="icon">` tag. Browser requests `/favicon.ico` and gets 404. Tab shows default browser icon.
**Fix:** Add `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧞</text></svg>">` to `<head>`.
