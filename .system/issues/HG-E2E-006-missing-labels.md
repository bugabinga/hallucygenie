# HG-E2E-006: Missing form labels for chat-input and music-instrumental

**Status:** Fixed

**Severity:** Medium (accessibility)
**Files:** `public/index.html`
**Observed:** `#chat-input` (textarea) and `#music-instrumental` (checkbox) have no associated `<label>` elements. `chat-input` has `placeholder` text but no `aria-label`. Screen readers cannot identify these fields.
**Fix:** Add `<label for="chat-input" class="sr-only">Type a message</label>` and `<label for="music-instrumental">Instrumental</label>`. Use `.sr-only` CSS class for visually hidden labels.
