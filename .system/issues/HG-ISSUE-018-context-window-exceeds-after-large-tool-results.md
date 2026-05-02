# HG-ISSUE-018 — Context window can exceed limit after large tool results inside agent loop

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/agent.ts`, `src/server.ts`, `src/tools.ts`, `src/db.ts`
**Related:** `HG-ISSUE-020-context-window-after-tool-call-debug-2026-05-01.md`, `HG-ISSUE-021-agent-reused-wrong-media-context-debug-2026-05-01.md`, `HG-SPEC-011-constitution-driven-simplification.md`, `.system/CONSTITUTION.md`

## Description

MiniMax sometimes returns:

```text
invalid params, context window exceeds limit (2013)
```

This appears after tool usage, especially music/TTS tool results that contain large base64 MP3 data URLs.

The sliding context window is only applied once before `runAgentLoop()`. It is not reapplied inside the agent loop after tools append large results. So a tool result can blow up the next MiniMax chat request in the same loop.

## Evidence

Log excerpt from `logs/dev.log`:

```json
{
  "level": "warn",
  "msg": "minimax rejected tool result id",
  "time": "2026-05-01T18:00:23.721Z",
  "service": "agent",
  "status": 400,
  "error": "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, context window exceeds limit (2013)\"},\"request_id\":\"06441d35439f4aa4a04c36fc090c300c\"}"
}
```

Note: log message is misleading. This was **not** a tool id error. It was a context-window error misclassified by `isToolResultIdError()`.

DB evidence for same session:

```json
{
  "id": 57,
  "role": "tool",
  "tool_call_id": "call_function_5usmj4o2d8ts_1",
  "chars": 1329254,
  "head": "data:audio/mp3;base64,SUQzBAAAAAAQfFRTU0",
  "created_at": "2026-05-01 18:00:23"
}
```

That single tool result is ~1.3M chars. Heuristic token estimate: `1_329_254 / 4 ~= 332k tokens`, far beyond the 200k context target.

## Root Cause

### 1. Context trimming happens only before the loop

`src/server.ts`:

```ts
const contextMessages = buildContext(messages);
const finalMessages = await runAgentLoop(contextMessages, ...);
```

`buildContext()` is not called again inside `runAgentLoop()`.

### 2. Agent loop appends full tool results then immediately continues

`src/agent.ts` appends tool result content verbatim:

```ts
localMessages.push({
  role: "tool",
  content:
    result.type === "error" ? `Error: ${result.content}` : result.content,
  tool_call_id: tc.id,
});

continue;
```

Next iteration sends `toAnthropicPayload(localMessages, tools)`. For audio/music, `result.content` is a full `data:audio/mp3;base64,...` string. This can be hundreds of thousands or millions of chars.

### 3. Audio tool outputs are inappropriate chat context

The model does not need raw MP3 bytes. It needs a short summary/reference:

```text
Generated audio asset: /asset/000069, prompt: ..., duration/size if known
```

Raw base64 should go to browser/assets, not back into the LLM context.

### 4. Error classifier is too broad

`isToolResultIdError()` currently treats any `400` with `invalid params` and `2013` as a tool-id error:

```ts
errorText.includes("invalid params") && errorText.includes("2013");
```

But MiniMax uses 2013 for context-window errors too. This hides the real failure mode in logs.

## Impact

- Tool flows can break immediately after successful generation
- Agent may not get a follow-up response after tool output
- User sees missing/odd behavior and assistant hallucinations
- Logs point at wrong root cause (`tool result id`) instead of context overflow
- DB stores huge base64 tool messages, bloating storage and future history handling

## Current partial mitigation

`src/server.ts` skips historical tool rows when loading prior history:

```ts
if (row.role === "tool") continue;
if (row.role === "assistant" && !row.content.trim() && row.tool_calls_json)
  continue;
```

This prevents old base64 tool rows from being replayed on later requests, but does **not** prevent overflow inside the same `runAgentLoop()` after the tool executes.

## Possible Fixes

### A. Never put raw media bytes into LLM tool-result context

Convert tool result content for agent context before appending to `localMessages`:

- image URL/data URL → short text reference
- audio data URL → `Generated audio (${bytes} bytes). Asset is available to user.`
- music data URL → same
- error → error text
- web_search/analyze_image → keep text, maybe truncate

Need separation between:

- **SSE/browser result**: full result / asset URL
- **LLM context tool result**: compact textual summary

### B. Re-run `buildContext()` inside `runAgentLoop()` every iteration

At top of each while loop:

```ts
const payload = toAnthropicPayload(buildContext(localMessages), tools);
```

This helps, but if newest tool result alone exceeds budget, it may drop the entire tool turn and the model will not see the tool result. Better combined with A.

### C. Reduce `DEFAULT_MAX_CONTEXT_TOKENS`

`DEFAULT_MAX_CONTEXT_TOKENS = 200_000` leaves no headroom for output/tool schemas/API overhead. Use a lower budget, e.g. `160_000` or `120_000`. But this alone does not solve raw base64 tool results.

### D. Fix error classifier

Make `isToolResultIdError()` only match real tool ID errors:

```text
tool result's tool id(...) not found
```

Do not classify generic `(2013)` invalid params as tool-id errors.

## Recommendation

Implement in order:

1. **A** — compact tool results before adding to LLM context
2. **D** — fix misleading error classifier/logging
3. **B** — call `buildContext()` inside each agent loop iteration
4. **C** — lower max context budget for headroom

## Tests Needed

- Unit: audio tool result context is compact, not base64
- Unit: image/tool media context summary is compact
- Unit: `runAgentLoop()` does not send base64 audio in second MiniMax request
- Unit: `isToolResultIdError()` returns false for `context window exceeds limit (2013)`
- Unit: `isToolResultIdError()` returns true for `tool result's tool id(...) not found (2013)`
- Integration: generate music/TTS → next chat request stays below context budget

## 2026-05-02 verification/fix status

Current code contains the intended fixes:

- `src/agent.ts`
  - appends `compactToolResultForModel()` to model context instead of raw media bytes
  - calls `buildContext(localMessages)` on every loop iteration
  - distinguishes tool-result-id errors from context-window errors
- `src/db.ts`
  - rejects raw `data:image/audio/video` and long base64 in message content/thinking
- `src/server.ts`
  - persists saved local `/asset/...` refs to DB tool rows while model context stays compact

Regression tests now cover:

- `isToolResultIdError()` returns false for `context window exceeds limit (2013)`
- `isContextWindowError()` catches context-window errors
- audio tool result context is compact and contains no `data:audio`
- second MiniMax request after TTS contains compact tool text, not raw data URL
- DB message rows contain no raw `data:audio`

Verification:

- `bun test test/agent.test.ts test/server.test.ts test/db.test.ts --timeout 30000` passes as part of targeted/full runs.
- `just check` passes.

Manual Chrome check:

- seeded media history with `/asset/asset_manual_hg018?s=manual-hg-018-session`
- loaded app in Chrome with that session
- observed `toolCards: 1`, `audioCards: 1`
- observed audio src is local `/asset/...`
- `/api/history` contained no `data:audio`
- DOM contained no `data:audio`
- no long base64 asset data detected in serialized history
