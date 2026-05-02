# HG-E2E-001: Welcome message has excessive whitespace from HTML indentation

**Status:** Fixed

**Severity:** Low (cosmetic)
**File:** `public/index.html:123-124`
**Observed:** Welcome message text renders with leading whitespace (22 spaces of HTML indentation preserved as text content).

```
                            Hey! 👋 I'm HallucyGenie. Ask me anything — I can chat, make images 🔥,
                            do voices 🎙️, and create music 🎵
```

**Expected:** Text should be left-aligned with no leading whitespace, same as chat messages.
**Cause:** Multi-line text in `.message-content` div inherits HTML indentation as whitespace nodes. Browser collapses some but `innerText` and visual rendering still show the padding.
**Fix:** Either put the text on a single line, or use `<p>` tags so the browser ignores inter-tag whitespace.
