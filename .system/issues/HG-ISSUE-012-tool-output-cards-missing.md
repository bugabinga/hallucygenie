# HG-ISSUE-012 — Tool output cards sometimes don't appear in UI

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `public/app.ts`, `src/agent.ts`
**Related:** `HG-E2E-013-tool-card-lost-after-text.md`, `HG-ISSUE-014-reload-history-missing-thinking-and-tool-output.md`

## Description

In multiple instances during conversation, tool output cards (images, audio, music) fail to render in the UI even though the agent (LLM) believes it generated them and says so in its response ("Here's your image!"). The tool card is either missing entirely, or the loading spinner stays forever.

## Steps to Reproduce

1. Have a conversation that triggers multiple tool calls
2. Observe that sometimes tool results don't render as cards
3. Agent text says it generated something, but no card visible

## Root Cause (multiple paths)

### Path 1: `tool_result` silently dropped if loading card not found

`app.ts:503` — `if (loadingCard && currentAssistantContent)` — the tool_result is only rendered if the loading card exists in `activeToolCards` AND `currentAssistantContent` is non-null. If either is missing, the result is silently discarded with no error, no fallback rendering.

The `activeToolCards` map is populated by `tool_start` events. If `tool_start` fails to parse, is never sent, or has a different `id` than `tool_result`, the card is orphaned.

### Path 2: `finishStreaming()` clears state while events still in buffer

`app.ts:452-454` — when `data: [DONE]` arrives, `finishStreaming()` is called immediately, which:

- Sets `currentAssistantContent = null`
- Calls `activeToolCards.clear()`

If `tool_result` events arrive in the **same SSE buffer chunk** as `[DONE]`, they're all split and processed in the same loop. But `[DONE]` is processed first only if it appears first in the split. However, the server always sends `tool_result` before `done`, so the split order should be correct.

**But**: if the reader gets a partial chunk that contains `[DONE]` but the remaining buffer still has tool_result data from a previous incomplete split, the sequence could be wrong.

### Path 3: Tool execution exception — `tool_result` never emitted

`agent.ts:597` — `executeTool(tc.name, args, apiKey)` has **no try/catch**. If the tool throws (not returns error, but actually throws), the exception propagates to the server's outer catch, which sends an `error` SSE event. The `tool_result` event is never emitted. The loading card stays forever because no `tool_result` arrives to replace it.

Each individual tool function (`generateImage`, `textToSpeech`, `generateMusic`) has its own try/catch returning `{ type: "error" }`. But `executeTool` itself doesn't wrap the dispatch. A bug in argument handling (e.g. `args.prompt as string` when prompt is undefined for music) could throw before reaching the tool function.

### Path 4: Loading card created but never appended to DOM

`app.ts:487-488` — `if (currentAssistantContent) { currentAssistantContent.appendChild(card) }` — if `currentAssistantContent` is null when `tool_start` arrives, the loading card is created and stored in `activeToolCards` but **never appended to the DOM**. When `tool_result` arrives, `replaceWith(resultCard)` is called on a detached node — DOM spec says this is a no-op. The result card is also not in the DOM.

This can happen if `finishStreaming()` was called between the `tool_start` and `tool_result` events (e.g. error event in between), or if there's a timing edge case.

## Possible Fixes

### A. Wrap tool execution in try/catch in agent loop

```ts
// agent.ts, around line 597
let result: ToolResult;
try {
  result = await executeTool(tc.name, args, apiKey);
} catch (err) {
  result = { type: "error", content: `Tool execution failed: ${String(err)}` };
}
```

Ensures `tool_result` event is always emitted, even on unexpected exceptions.

### B. Fallback rendering for orphan tool results

In `tool_result` handler: if loading card not found, render the result card directly (append to currentAssistantContent or message list) instead of silently dropping it.

### C. Append loading card to message list (not content region)

Store loading cards in the message list, not in `currentAssistantContent`. This decouples tool card lifecycle from the streaming state.

**Recommendation:** A + B together. A prevents the root cause (missing tool_result events). B is a safety net for any edge case that still produces an orphan.

## Affected Code

- `src/agent.ts:594-608` — tool execution loop (no try/catch around executeTool)
- `src/server.ts:322-338` — tool_result SSE handler (no error fallback)
- `public/app.ts:483-495` — tool_start handler (card not appended if no content region)
- `public/app.ts:498-516` — tool_result handler (silent drop if no loading card)
- `public/app.ts:583-591` — finishStreaming (clears all state)

## Tests Needed

- Unit: executeTool throws → tool_result error event emitted
- Unit: tool_result without matching tool_start → fallback render
- Integration: tool execution failure → loading card replaced with error card
- E2E: tool call → verify card renders, verify no stuck loading spinners

## Candidate Fix Notes

Implemented 2026-05-01, but user real-service verification found another failure class. See `.system/issues/HG-ISSUE-012-real-service-debug-2026-05-01.md`.

Candidate fix now covers orphan UI `tool_result` events **and** explicit Create directives that previously let the model hallucinate `<image>` in plain text.

Implemented:

- `src/agent.ts`: added `executeToolSafely()` wrapper so unexpected tool exceptions become `{ type: "error" }` tool results instead of aborting the stream.
- `src/agent.ts`: agent loop now always emits `tool_result` after `tool_start`, including error fallback results.
- `public/app.ts`: added `ensureAssistantContent()` fallback for late/orphan tool events.
- `public/app.ts`: `tool_start` always appends loading card to an assistant content region.
- `public/app.ts`: `tool_result` now renders fallback card if loading card is missing/detached instead of silently dropping output.
- `src/agent.ts`: strengthened system prompt with hard rules: media requests MUST call tools, never fake `<image>/<audio>/<response>` placeholders.
- `src/agent.ts`: added optional Anthropic-style `tool_choice` in payload.
- `src/server.ts`: explicit Create directives like `Use generate_image ...` force the matching tool on the first model turn.

Verification:

- `bun test test/agent.test.ts test/app.test.ts --timeout 30000` → 238 pass, 0 fail
- `just check` → pass
- `just test-unit` → 167 pass, 0 fail
- Real Chrome + real MiniMax test after DB reset: exact `Use generate_image... aspect_ratio=16:9` prompt produced `toolCards: 1`, `images: 1`, `loading: 0`; DB stored assistant `tool_calls_json` + tool row.

## 2026-05-02 status

Current frontend uses stable assistant child regions (`.assistant-thinking-region`, `.assistant-text-region`) and updates only text region during text streaming. Tool cards are no longer wiped by later text/thinking events.

Regression coverage exists in `test/app.test.ts`:

- `tool result card persists when text arrives after tool result`
- `tool card persists when thinking arrives after tool result`
- `orphan tool_result renders fallback card and later text still renders`

Manual Chrome check:

- mocked `/api/chat` stream: `tool_start` → `tool_result` → text → `[DONE]`
- observed final assistant message: `toolCardsInLast: 1`, `loading: 0`
- observed image src: `https://example.com/img.png`
- observed text region: `done text after tool`

`HG-ISSUE-014` fixed reload/history persistence separately.
