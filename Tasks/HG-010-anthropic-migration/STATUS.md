# Task: HG-010 — Anthropic Endpoint Migration

**Created:** 2026-04-18
**Iteration:** 1
**Current Step:** Step 1: Rewrite `agent.ts` — API client and streaming
**Last Updated:** 2026-04-18
**Size:** L

## Step Progress

### Step 1: Rewrite agent.ts
**Status:** 🟡 In Progress

- [ ] Change endpoint URL from `/v1/chat/completions` to `/anthropic/v1/messages` and auth header from `Authorization: Bearer` to `x-api-key`
- [ ] Remove imports of `stripThinkingTokens`, `accumulateToolCalls`, `ToolCallAccumulated`, `ToolCallChunk` from server.ts
- [ ] Add `"thinking"` to `AgentEvent.type` union
- [ ] Add helper to convert internal `ChatMessage[]` to Anthropic format (extract system, content blocks, tool_use/tool_result grouping)
- [ ] Rewrite `runAgentLoop()` request body: Anthropic format with `system`, `messages`, `tools`, `max_tokens`, `stream`
- [ ] Rewrite streaming parser: parse `event:` + `data:` SSE fields for `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`
- [ ] Handle `thinking_delta` → emit `AgentEvent { type: "thinking", content }`
- [ ] Handle `text_delta` → emit `AgentEvent { type: "text", content }`
- [ ] Handle `tool_use` block → accumulate id/name/input via `input_json_delta`
- [ ] On `message_delta` with `stop_reason: "tool_use"` → execute tools, emit `tool_start` and `tool_result` events
- [ ] Store tool_calls info on assistant messages (extend ChatMessage with optional `tool_calls` field) for Anthropic message reconstruction
- [ ] Send tool results as `{role: "user", content: [{type: "tool_result", tool_use_id, content}]}`
- [ ] Remove all `stripThinkingTokens()` calls and `THINK_*` related logic

### Step 2: Rewrite tools.ts
**Status:** ⬜ Not Started

- [ ] Change `ToolDefinition` to Anthropic format (flat: `name`, `description`, `input_schema` instead of nested `function.parameters`)
- [ ] Update `getToolDefinitions()` return type
- [ ] Verify `executeTool()` unchanged (direct MiniMax API calls stay the same)

### Step 3: Rewrite server.ts
**Status:** ⬜ Not Started

- [ ] Remove `THINK_OPEN`, `THINK_CLOSE`, `THINK_OPEN_ALT`, `THINK_CLOSE_ALT` constants
- [ ] Remove `stripThinkingTokens()` function
- [ ] Remove `accumulateToolCalls()` function
- [ ] Remove `ToolCallChunk` and `ToolCallAccumulated` types (no longer exported)
- [ ] Extend `ChatMessage` interface with optional `tool_calls` field
- [ ] Add `event: thinking` SSE output to browser in handleChat
- [ ] Keep browser SSE protocol unchanged (`text`, `tool_start`, `tool_result`, `done`)
- [ ] Update message saving to store `tool_calls_json` for assistant messages with tool calls

### Step 4: Simplify public/app.ts
**Status:** ⬜ Not Started

- [ ] Remove `inThinkBlock`, `thinkBuffer` state variables from chat state section
- [ ] Remove tag-parsing logic in `appendText()` function (~30 lines of `<think_intended>` handling)
- [ ] Add `thinking` event handler in `handleSSEEvent()` → accumulate in thinking buffer and render via `renderThinkingBlock()`
- [ ] Remove frontend THINK_* tag references

### Step 5: Update all tests
**Status:** ⬜ Not Started

- [ ] Rewrite `agent.test.ts` SSE mock helpers for Anthropic format (`content_block_start/delta/stop`, `message_delta/stop`)
- [ ] Update all agent.test.ts test cases (text-only, tool calls, steering, multi-iteration, error handling)
- [ ] Remove `strips thinking tokens` test (no longer relevant — thinking is a separate block)
- [ ] Add new test: thinking events emitted correctly
- [ ] Update `server.test.ts`: remove `stripThinkingTokens` tests, remove `accumulateToolCalls` tests, update import assertions
- [ ] Update `tools.test.ts`: verify `input_schema` field name, update schema assertions
- [ ] Update `public/app.test.ts`: add tests for `thinking` SSE event handling
- [ ] All tests pass with `just test`

### Step 6: Live verification
**Status:** ⬜ Not Started

- [ ] `just test` passes
- [ ] Manual verification notes in STATUS.md

## Discoveries

| # | What | Impact | Step |
|---|------|--------|------|
| 1 | DB already has `tool_calls_json` column (always null) | Can store tool call details for history reconstruction without schema change | Step 3 |
| 2 | ChatMessage needs `tool_calls` field for Anthropic tool_use reconstruction | Minor interface change in server.ts | Step 3 |
| 3 | Anthropic SSE uses `event:` field explicitly (unlike OpenAI data-only) | Parser needs to track event type | Step 1 |
| 4 | `ToolCallAccumulated` and `ToolCallChunk` types tested independently in server.test.ts | Remove tests in Step 5 | Step 5 |
| 5 | Frontend `appendText()` has ~30 lines of think tag parsing to remove | Simplification in Step 4 | Step 4 |
| 6 | `needsToolExecution()` uses `ToolCallAccumulated[]` parameter | Keep for API compat, but unused in main flow | Step 1 |

## Blockers

_None_

## Execution Log

| Time | Event |
|------|-------|
| 2026-04-18 21:05 | Task started |
| 2026-04-18 21:10 | Code reading complete: agent.ts (367L), tools.ts (294L), server.ts (705L), app.ts (903L), all tests read |
| 2026-04-18 21:12 | STATUS hydrated with detailed checkboxes, ready for plan review |
