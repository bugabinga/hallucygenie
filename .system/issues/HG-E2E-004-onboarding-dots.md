# HG-E2E-004: Onboarding dots duplicated across slides

**Status:** Fixed

**Severity:** Low (cosmetic)
**Files:** `public/index.html:58-106`, `public/app.ts:800-810`
**Observed:** Each of the 4 onboarding slides has its own `.onboarding-dots` container with 4 `.dot` spans. The JS queries `onboarding.querySelectorAll('.onboarding-dots .dot')` which returns 16 dots (4×4) instead of 4. Additionally, the typing indicator's 3 `.dot` spans share the same class but are outside the onboarding container so they're safe.
**Expected:** One shared dot container outside the slides, updated by `showSlide()`.
**Fix:** Move `.onboarding-dots` outside the `.onboarding-slide` elements, with a single set of 4 dots. Remove per-slide dot containers.
