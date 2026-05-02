# HG-ISSUE-008 — Quota badge stale, only updates on page reload

**Status:** Fixed
**Severity:** Medium
**Reported:** 2026-05-01
**Components:** `public/app.ts`

## Description

Header quota badges (🎨 99, 🎵 99, 🎙️ remaining) show stale values. Only refresh on full page reload. After generating an image/music/voice, badge still shows old count until manual reload.

## Steps to Reproduce

1. Note quota badges in header (e.g. 🎨 99)
2. Trigger `generate_image` via chat
3. Observe tool result renders successfully
4. Quota badge still shows 99 — should decrement to 98

## Root Cause

`updateQuotaBadge()` called once on init (`app.ts:875`) with comment "no polling interval".
No call after `tool_result` SSE events. Server-side quota incremented by `checkQuota()` in `src/db.ts`, but frontend never re-fetches.

```
init → updateQuotaBadge() ← called once
  → user sends prompt → tool executes → quota++ on server
  → SSE tool_result event received → card rendered
  → updateQuotaBadge() ← NEVER CALLED
```

## Fix

Call `updateQuotaBadge()` after processing `tool_result` SSE events. In `app.ts` around line 498, after `renderToolResult()` + `replaceWith()`:

```ts
if (eventType === "tool_result") {
    try {
        const parsed = JSON.parse(data);
        // ... existing card rendering ...
        updateQuotaBadge(); // ← refresh badge after tool use
    } catch { ... }
}
```

One line. No polling needed — updates happen at exactly the right time (after server confirms tool execution and increments quota).

## Affected Code

- `public/app.ts:741-765` — `updateQuotaBadge()` fn
- `public/app.ts:874-875` — single call site (init only)
- `public/app.ts:498-515` — `tool_result` SSE handler (missing call)

## Tests Needed

- Unit: verify `updateQuotaBadge()` would be called after tool_result event processing
- E2E: trigger image gen → verify badge updates without reload
