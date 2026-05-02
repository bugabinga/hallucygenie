# HG-ISSUE-013 — Quota badge missing speech/voice counter

**Status:** Fixed
**Severity:** Low
**Reported:** 2026-05-01
**Components:** `public/index.html`

## Description

Header quota badge shows only 2 numbers: 🎨 (images) and 🎵 (music). Missing 🎙️ (voice/speech). The MiniMax plan has separate quotas for all three media types. Users can't see how many voice generations remain.

## Steps to Reproduce

1. Load the app
2. Look at header quota badge: shows "🎨 99 🎵 99"
3. No speech/voice counter visible

## Root Cause

`index.html:34` — the quota badge HTML only contains two `.quota-item` spans:

```html
<span class="quota-item" data-type="image" title="Images"
  >🎨 <span class="quota-used">—</span></span
>
<span class="quota-item" data-type="music" title="Music"
  >🎵 <span class="quota-used">—</span></span
>
```

Missing: `<span class="quota-item" data-type="speech" title="Voice">🎙️ <span class="quota-used">—</span></span>`

The server returns `speech` quota data in `/api/quota`. The frontend `QuotaData` interface includes `speech`. The `updateQuotaBadge()` function iterates `.quota-item[data-type]` and matches against `QuotaData` keys. It would work correctly if the HTML element existed — it's simply missing from the markup.

## Fix

Add a `.quota-item` span with `data-type="speech"` to the quota badge in `index.html`. Also update the `title` and `aria-label` on the badge from "Images and music" to "Images, voice, and music".

## Affected Code

- `public/index.html:34` — quota badge HTML (missing speech item)
- `public/app.ts:738-742` — `QuotaData` interface (already has speech)
- `public/app.ts:749-760` — `updateQuotaBadge()` iteration (already handles speech)
- `src/server.ts:462-469` — `/api/quota` response (already returns speech)

## Tests Needed

- Snapshot: quota badge HTML includes 3 items (image, speech, music)
- Static health: aria-label mentions voice/speech

## 2026-05-02 fix

Added speech quota item to `#quota-badge` and updated title/ARIA to "Images, voice, and music remaining today".

Verification:

- `bun test test/app.test.ts test/static.test.ts --timeout 60000` passes.
- Manual Chrome: quota items were `image`, `speech`, `music`; live badge text showed all three counters.
