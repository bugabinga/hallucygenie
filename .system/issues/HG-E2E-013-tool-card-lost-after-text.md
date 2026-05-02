# HG-E2E-013: Tool result card disappears when text arrives after tool_result

**Status:** Fixed
**Severity:** High (feature correctness)
**Related:** `HG-ISSUE-012-tool-output-cards-missing.md`, `HG-ISSUE-014-reload-history-missing-thinking-and-tool-output.md`

## Reproduce

Mock `/api/chat` to stream:

```sse
event: tool_start
data: {"id":"t1","name":"generate_image"}

event: tool_result
data: {"id":"t1","name":"generate_image","result":{"success":true,"imageUrl":"https://example.com/img.png","prompt":"cat"}}

data: {"choices":[{"delta":{"content":"done"}}]}

data: [DONE]
```

Send any chat message.

## Observed

Final assistant message contains only:

```html
<p>done</p>
```

`.tool-card` count is `0`.

## Expected

Tool card should persist, followed by assistant text.

## Hypothesis

`tool_start`/`tool_result` append DOM nodes to `currentAssistantContent`, but later `appendText()` rebuilds `currentAssistantContent.innerHTML` from `rawTextBuffer`, wiping previously appended tool DOM.

## Investigation

`public/app.ts`:

- `handleSSEEvent('tool_start')` appends card DOM
- `handleSSEEvent('tool_result')` replaces loading card DOM
- `appendText()` sets `currentAssistantContent.innerHTML = html`

## Fix

Keep separate containers for thinking/text/tool content, or keep a `toolHtmlBuffer` and include rendered tool cards when rebuilding. Better: assistant bubble should contain stable child nodes:

```html
<div class="thinking-region"></div>
<div class="text-region"></div>
<div class="tools-region"></div>
```

Then update only the text region on `appendText()`.

## Prevent

Add frontend test: stream tool_start → tool_result → text → done and assert `.tool-card` still exists.

## 2026-05-02 status

Fixed by stable assistant regions in `public/app.ts`. Text streaming updates `.assistant-text-region` only; tool cards remain sibling nodes in the assistant message content.

Regression tests:

- `test/app.test.ts`: `tool result card persists when text arrives after tool result`
- `test/app.test.ts`: `orphan tool_result renders fallback card and later text still renders`

Manual Chrome check:

- mocked stream order: `tool_start` → `tool_result` → text → `[DONE]`
- final assistant message retained exactly one tool card
- loading spinner count was `0`
- text after tool was visible
