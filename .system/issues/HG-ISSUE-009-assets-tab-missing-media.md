# HG-ISSUE-009 — Create→Assets tab missing generated media

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `public/app.ts`, `src/server.ts`

## Description

The Assets tab in the Create modal does not show all generated images, music, and voice. Some or all assets are missing from the grid.

## Steps to Reproduce

1. Generate several images, music tracks, and voice clips via chat
2. Open Create modal → Assets tab
3. Not all generated media appears

## Root Cause (multiple)

### 1. Asset thumbnails broken → appear missing (blocked by HG-ISSUE-007)

Image thumbnails use `<img src="/asset/${asset.id}">` (line 323). Audio cards play via `new Audio("/asset/${asset.id}")` (line 341). Both hit `/asset/:id` without `X-Session-Id` → 400. Images render as broken/empty. Audio cards appear but can't play. User perceives assets as "missing".

### 2. Hard cap at 20 items

`assets.slice(0, 20)` on line 312. After 20 assets, older ones silently dropped. No pagination, no "load more", no indication that items were truncated.

### 3. No refresh after generation

`loadAssets()` only called when Assets tab is clicked (line 939). If user generates media while Assets tab is already open, new assets don't appear until tab is re-clicked. If user never closes and re-opens the tab, assets appear stale.

## Fix

1. **Fix `/asset/:id` auth** (HG-ISSUE-007 fix resolves this too — session in query param)
2. **Remove or paginate the 20-item cap** — show all assets, or add infinite scroll
3. **Call `loadAssets()` after `tool_result` events** if Assets tab is currently visible

## Affected Code

- `public/app.ts:298-355` — `loadAssets()` fn (`.slice(0, 20)` cap, `/asset/{id}` URLs)
- `public/app.ts:939` — only call site (tab click)
- `src/server.ts:578-597` — `/asset/:id` route (session header required)

## Tests Needed

- Integration: generate asset → verify in `/assets` response
- E2E: generate image → open assets tab → verify thumbnail visible
- E2E: generate 25+ assets → verify all visible (not capped at 20)
