# HG-E2E-002: Stale app.js bundle crashes init()

**Status:** Fixed

**Severity:** Critical
**File:** `public/app.js`
**Observed:** Onboarding never shows on first visit. Console has no errors but init() silently fails before reaching onboarding code.
**Root cause:** The bundled `app.js` references `$("#personality-select")` which doesn't exist in `index.html` or `app.ts`. This throws a null reference at `personalitySelect.value` (line ~2723), crashing `init()` before the onboarding check runs.
**Fix:** Rebuild bundle: `bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext`. The `justfile` should have a `just build` recipe, and `app.js` should either be gitignored or rebuilt as part of `just dev`.
**Note:** Any time `app.ts` changes, `app.js` must be rebuilt. The current `just dev` only runs `bun server.ts` which serves the stale bundle.
