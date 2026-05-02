# HG-ISSUE-011 — Generated images do not appear in Create→Assets

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/tools.ts`, `src/server.ts`
**Follow-up:** `HG-ISSUE-023-process-local-id-collision-breaks-asset-save.md` captures a regression in the asset-save path after this fix: image download succeeds far enough to save, but persistent asset ID generation can collide after restart.

## Description

Generated images (via `generate_image` tool) never appear in the Create→Assets tab. Music and voice assets appear correctly. Only images are missing.

## Steps to Reproduce

1. Generate an image via chat ("draw me a cat")
2. Image renders in chat tool card
3. Open Create→Assets tab
4. Image is not listed — only music/voice assets if any

## Root Cause

`saveAssetFile()` in `server.ts` only saves assets whose content starts with `data:`. Audio tools (TTS, music) return `data:audio/mp3;base64,...` data URLs — these get saved. But `generateImage()` in `tools.ts` returns an **external URL** (`https://...`) from MiniMax's `image_urls` response field. External URLs don't start with `data:` → `saveAssetFile` returns early → no file saved → no DB record → never appears in assets.

```
generateImage() → { type: "image", content: "https://..." }
  → saveAssetFile() → content.startsWith("data:")? NO → return result unchanged
    → no file on disk, no DB row
      → /assets returns nothing for images
```

## Possible Fixes

### A. Download image to disk, save as asset

In `saveAssetFile`, add a branch for external URLs: `fetch(url)` → buffer → write to disk → save DB row. Converts external URL to local asset.

### B. Download in tools.ts, return as data URL

In `generateImage()`, after getting the URL, `fetch(url)` → buffer → convert to `data:image/png;base64,...`. Return data URL. Then `saveAssetFile` handles it like audio.

### C. Save external URL as-is in DB

Don't download. Save the external URL in the DB with a marker. Assets tab renders it directly. Risk: external URL expires → broken image later.

**Recommendation:** Option A — download in `saveAssetFile`. Keeps tools.ts simple (returns what API gives), asset pipeline handles persistence. Also caches the image locally so it works offline / after URL expiry.

## Affected Code

- `src/tools.ts:291` — `return { type: "image", content: urls[0] }` (external URL)
- `src/server.ts:729` — `if (!result.content.startsWith("data:")) return result;` (skips images)
- `src/server.ts:723-766` — `saveAssetFile()` function

## Tests Needed

- Unit: `saveAssetFile` with external URL → downloads, saves file, records in DB
- Unit: `saveAssetFile` with external URL → returns `/asset/{id}?s={sessionId}`
- Integration: chat with image generation → asset appears in `/assets`

## Fix applied

- `saveAssetFile()` now handles external image URLs at the server asset boundary:
  - validates `http(s)` URL
  - downloads generated image
  - requires `Content-Type: image/*`
  - writes bytes to `data/assets/{session}/{id}.{ext}`
  - saves image asset row in SQLite
  - emits local `/asset/{id}?s={sessionId}` URL to UI
- `generateImage()` stays simple and returns MiniMax URL.
- Raw bytes do not enter agent context or message history.
- Asset save failure returns safe tool-card error and logs raw failure.

## Verification

- `bun test test/agent.test.ts test/server.test.ts --timeout 30000` → 197 pass.
- `just check` passed.
- `just test-unit` passed.

## 2026-05-02 manual Chrome verification

Seeded an image asset and matching tool history, then loaded Chrome session:

- Create→Assets showed `assetCards: 1`
- asset image src was `/asset/asset_manual_open_image?s=manual-open-assets-session`
- chat history rehydrated one image tool card
- `/api/history` contained no raw `data:image`
