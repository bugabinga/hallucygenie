# HG-E2E-003: HTML indentation whitespace leaks into text content

**Status:** Fixed

**Severity:** Low (cosmetic)
**Files:** `public/index.html`
**Observed:** 9+ elements have leading/trailing whitespace in their text content from HTML indentation. Affects:

- `#quota-badge` — `"🎨 —\n                        🎵 —"`
- `#create-btn` — `"\n                        ✨ Create\n                    "`
- `#onboarding-try-create`, `#onboarding-done`, `#steer-close` — same pattern
- `#assets-empty` paragraph
- Onboarding slide descriptions

**Expected:** Element text should be trimmed with no leading/trailing whitespace from source indentation.
**Fix:** Either minify HTML, or ensure text content is on a single line / use `<p>` tags so inter-tag whitespace is collapsed. CSS `white-space: nowrap` on buttons already handles rendering, but `textContent` and `innerText` still carry the whitespace (breaks quota badge display, accessibility text, etc.).
