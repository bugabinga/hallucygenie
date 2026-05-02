# HG-ISSUE-007 — Audio player empty, no playback

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/server.ts`, `public/app.ts`

## Description

Tool output cards for music (`generate_music`) and voice (`text_to_speech`) render an `<audio>` element but playback fails: cannot click play, time shows `0:00/0:00`. Images from `generate_image` likely also affected.

## Steps to Reproduce

1. Send a prompt that triggers TTS or music generation
2. Observe tool result card renders audio player
3. Cannot play, duration 0:00/0:00

## Root Cause

`saveAssetFile()` in `server.ts` converts the data URL to a server path: `/asset/{assetId}`.
The `/asset/:id` route handler requires `X-Session-Id` header to serve the file.
Browser `<audio>` and `<img>` elements make plain GET requests — no `X-Session-Id` header included.
Server returns `400 X-Session-Id header required`. Audio element gets no data.

```
tools.ts → data:audio/mp3;base64,...
  → saveAssetFile() → /asset/{id}
    → <audio src="/asset/{id}">  ← browser GET, no session header
      → server: 400 Missing X-Session-Id → no audio data
```

## Possible Fixes

### A. Embed session ID in asset URL

Serve assets at `/asset/{id}?s={sessionId}`. Parse query param instead of header. Browser elements include query params in GET.

### B. Signed token in URL

`/asset/{id}?t={hmac}`. Stateless, no session lookup per request.

### C. Keep data URLs for audio (not images)

Audio files are smaller. Skip `saveAssetFile` for audio, keep data URL inline. Images still saved to disk. Not ideal — large payloads.

### D. Fetch via JS + blob URL

Intercept in JS: `fetch("/asset/" + id, { headers: { "X-Session-Id": sid } })` → blob → `URL.createObjectURL()`. Works but complex, two requests.

**Recommendation:** Option A — simplest, minimal change. Session ID is not secret (it's already in localStorage). Query param is visible but not sensitive.

## Affected Code

- `src/server.ts:578-597` — `/asset/:id` route, reads `X-Session-Id` header
- `src/server.ts:722-766` — `saveAssetFile()`, replaces data URL with path
- `public/app.ts:249-254` — `<audio src=result.content>` rendering
- `public/app.ts:240-248` — `<img src=result.content>` rendering (same issue)

## Tests Needed

- Unit: `saveAssetFile` returns `/asset/{id}?s={sessionId}` path
- Integration: GET `/asset/{id}?s={sid}` returns file, GET without returns 400
- E2E: audio player renders and can play
