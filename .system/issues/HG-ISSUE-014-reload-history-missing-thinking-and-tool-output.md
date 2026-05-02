# HG-ISSUE-014 — Reloaded conversation missing thinking blocks and tool outputs

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `public/app.ts`, `src/server.ts`, `src/db.ts`

## Description

After reloading the page, conversation history loses rich UI elements. Thinking blocks and tool output cards that existed during the live stream are missing from the rehydrated conversation.

Live SSE view can show:

- thinking blocks
- tool loading cards
- image/audio/tool result cards
- assistant text

Reloaded history shows mostly plain user/assistant text. Tool output and thinking UI vanish.

## Logs

Checked `logs/dev.log` at report time. No relevant chat/tool errors found; log only contained Chrome DevTools probe requests:

```json
{
  "method": "GET",
  "path": "/.well-known/appspecific/com.chrome.devtools.json",
  "status": 404
}
```

## Root Cause

`loadHistory()` only renders `user` and `assistant` rows as plain messages. It ignores `tool` rows and does not reconstruct cards from `tool_calls_json`.

```ts
for (const msg of messages) {
  if (msg.role === "user") {
    messageList.appendChild(renderUserMessage(msg.content));
  } else if (msg.role === "assistant") {
    const { container } = renderAssistantMessage();
    contentEl.innerHTML = renderMarkdown(msg.content);
    messageList.appendChild(container);
  }
  // Tool messages in history are simplified for now
}
```

### Missing tool outputs

Server saves tool result rows to DB as `role = "tool"`, but frontend ignores them on reload. Assistant rows also store `tool_calls_json`, but frontend does not pair assistant tool calls with following `tool` rows to render `renderToolResult()`.

### Missing thinking blocks

Thinking events are streamed via SSE (`event: thinking`) but are not stored in DB at all. `finalMessages` does not include thinking content, and `saveMessage()` has no field for thinking blocks.

## Affected Code

- `public/app.ts:690-719` — `loadHistory()` ignores tool rows, renders assistant text only
- `src/server.ts:298-303` — streams thinking but does not persist it
- `src/server.ts:349-368` — saves final messages only; thinking not present
- `src/db.ts:96-102` — `messages` schema has no thinking field
- `src/db.ts:125-133` — returns tool rows but frontend ignores them

## Possible Fixes

### A. Reconstruct tool cards from DB rows

Group history rows by assistant turn:

1. Render assistant text
2. If assistant has `tool_calls_json`, pair each tool call id with following `role="tool"` row by `tool_call_id`
3. Render `renderToolResult(toolName, { type, content })`

Needs type reconstruction. Current `tool` row only stores content, not result type. Can infer from tool name:

- `generate_image` → `{ type: "image", content }`
- `text_to_speech` → `{ type: "audio", content }`
- `generate_music` → `{ type: "audio", content }`
- unknown/search/vision → `{ type: "text", content }`
- content starts with `Error:` → `{ type: "error", content }`

### B. Persist tool result type explicitly

Add DB column: `tool_result_type TEXT`. Save `result.type` when storing tool rows. Cleaner than inference.

### C. Persist thinking blocks

Add DB support for thinking blocks, either:

- extra `role="thinking"` messages linked to assistant turn, or
- `thinking_json` column on assistant messages

Then `loadHistory()` can render `renderThinkingBlock()` before assistant text.

## Recommendation

Fix in two stages:

1. **Now:** reconstruct tool cards from existing `tool` rows using `tool_calls_json` + inference. This fixes historical tool outputs with no migration.
2. **Next:** add DB schema for thinking persistence and explicit tool result type.

## Tests Needed

- Unit: `loadHistory()` renders tool card from assistant `tool_calls_json` + following `tool` row
- Unit: image/music/tts tool history reconstructs correct result type
- Unit: error tool row renders error card
- Integration: generate tool output → reload → tool card visible
- Future migration test: thinking persisted and rehydrated

## 2026-05-01 Chrome reload evidence

Chrome DOM after reload on session `65d2206f-99f6-4681-9d80-235209acad71`:

```json
{
  "messageCount": 12,
  "emptyBubbles": 5,
  "assistantEmpty": 5,
  "messages": [
    {
      "i": 3,
      "cls": "message message--assistant",
      "chars": 0,
      "toolCards": 0,
      "emptyBubble": true
    },
    {
      "i": 5,
      "cls": "message message--assistant",
      "chars": 0,
      "toolCards": 0,
      "emptyBubble": true
    },
    {
      "i": 7,
      "cls": "message message--assistant",
      "chars": 0,
      "toolCards": 0,
      "emptyBubble": true
    },
    {
      "i": 9,
      "cls": "message message--assistant",
      "chars": 0,
      "toolCards": 0,
      "emptyBubble": true
    },
    {
      "i": 11,
      "cls": "message message--assistant",
      "chars": 0,
      "toolCards": 0,
      "emptyBubble": true
    }
  ]
}
```

`/api/history` returned the missing tool rows, but `loadHistory()` ignored them:

```json
{ "i": 3, "role": "assistant", "chars": 0, "tool_calls_json": true }
{ "i": 4, "role": "tool", "chars": 52, "head": "/asset/00000e?s=65d2206f-99f6-4681-9d80-235209acad71", "tool_call_id": "direct_00000d" }
{ "i": 12, "role": "assistant", "chars": 0, "tool_calls_json": true }
{ "i": 13, "role": "tool", "chars": 52, "head": "/asset/000019?s=65d2206f-99f6-4681-9d80-235209acad71", "tool_call_id": "direct_000018" }
```

Recent `logs/dev.log` for reload had only successful history/quota/static requests:

```json
{ "method": "GET", "path": "/api/history", "status": 200 }
{ "method": "GET", "path": "/api/quota", "status": 200 }
```

Conclusion: empty assistant bubbles are expected from current implementation, but not desired product behavior.

## 2026-05-02 fix

### Reproduce

Existing `loadHistory()` rendered only user/assistant text. It ignored `role="tool"` rows and the DB had no persisted thinking field. Reload after a tool call could produce an empty assistant bubble with no tool card.

### Hypothesis

Two separate persistence gaps caused the reload loss:

1. Tool results existed in DB as `tool` rows but the frontend did not pair them with assistant `tool_calls_json`.
2. Thinking was only streamed over SSE and never saved.

A third related problem affected future rehydration: normal agent tool rows were saved from compact model-context messages, not from the local `/asset/...` result emitted to the UI.

### Investigation

Relevant code paths:

- `public/app.ts` `loadHistory()` ignored `role="tool"` rows.
- `src/server.ts` streamed `event: thinking` but did not keep it for DB save.
- `src/server.ts` saved final agent `tool` messages from compact model context unless direct Create path supplied `/asset/...`.
- `src/db.ts` `messages` table had no `thinking` column.

### Fix applied

- Added migration `migrations/006-add-message-thinking.sql` with nullable `messages.thinking`.
- Extended `MessageRow` and `saveMessage()` to persist optional thinking text, with the same raw-asset-data guard as message content.
- `src/server.ts` now accumulates streamed thinking and saves it on the first new assistant row for the turn.
- `src/server.ts` now remembers saved tool results from SSE handling and persists local `/asset/...` refs/errors to DB tool rows, while still sending compact tool summaries back to the model context.
- `public/app.ts` now rehydrates assistant history by:
  - rendering `thinking` into `.assistant-thinking-region`
  - rendering assistant text into `.assistant-text-region`
  - parsing `tool_calls_json`
  - pairing tool calls with `tool` rows by `tool_call_id`
  - inferring tool result type and rendering `renderToolResult()` cards

### Verification

- `bun test test/db.test.ts test/server.test.ts test/app.test.ts --timeout 30000` → 279 pass
- `just check` → pass
- `just test-unit` → pass (`318 pass` + `180 pass`)

### Prevention

Added regression coverage:

- DB test: `saveMessage()` stores `thinking`.
- Server integration: thinking SSE is persisted with assistant history.
- Server integration: media tool call sends compact model context but persists local asset ref in DB.
- Frontend unit: `loadHistory()` rehydrates thinking blocks and image tool cards.
- Frontend unit: `loadHistory()` rehydrates error tool cards.
