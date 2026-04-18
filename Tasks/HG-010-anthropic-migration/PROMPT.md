# Task: HG-010 — Anthropic Endpoint Migration

**Created:** 2026-04-18
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Rewrites core API contract — chat, streaming, tool calling.
**Score:** 5/8 — Blast radius: 2 (all backend + frontend), Pattern novelty: 1 (Anthropic format new to project), Security: 1 (API key auth style changes), Reversibility: 1 (large refactor)

## Mission

Switch the chat API from MiniMax's OpenAI-compatible endpoint (`/v1/chat/completions`) to the Anthropic-compatible endpoint (`/anthropic/v1/messages`). This is the foundation for prompt caching (HG-011), context window management (HG-012), and all future tool additions (HG-018).

**Why:** Anthropic endpoint returns thinking and text as separate structured blocks — no more tag parsing. It's the only endpoint that supports prompt caching. MiniMax's own CLI uses this exclusively.

## Dependencies

- **None**

## Context to Read First

- `Tasks/CONTEXT.md`
- `AGENTS.md`
- `log.ts` — structured logger
- `server.ts` — current request handling and SSE formatting
- `agent.ts` — current agent loop, streaming, tool execution
- `tools.ts` — current tool definitions (OpenAI `parameters` format)
- `public/app.ts` — current SSE parsing and thinking block rendering

## Key Reference: Anthropic API Format

**Endpoint:** `POST https://api.minimax.io/anthropic/v1/messages`
**Auth:** `x-api-key: <key>` header (NOT `Authorization: Bearer`)

**Request:**
```json
{
  "model": "MiniMax-M2.7-highspeed",
  "max_tokens": 4096,
  "system": [{"type": "text", "text": "system prompt"}],
  "messages": [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "content": [{"type": "text", "text": "hi"}]},
    {"role": "user", "content": "do a thing"}
  ],
  "tools": [{"name": "tool_name", "description": "...", "input_schema": {...}}],
  "stream": true
}
```

**Streaming events:**
```
event: content_block_start   → {type: "thinking"} or {type: "text"} or {type: "tool_use"}
event: content_block_delta   → {type: "thinking_delta", thinking: "..."} or {type: "text_delta", text: "..."} or {type: "input_json_delta", partial_json: "..."}
event: content_block_stop
event: message_delta         → {stop_reason: "end_turn" | "tool_use" | "max_tokens"}
event: message_stop
```

**Tool calling (assistant → tool result):**
```json
{"role": "assistant", "content": [{"type": "tool_use", "id": "tu_123", "name": "generate_image", "input": {"prompt": "a cat"}}]}
{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tu_123", "content": "{\"url\": \"...\"}"}]}
```

## File Scope

- `agent.ts` — rewrite: API call, streaming parser, tool calling format, message building
- `tools.ts` — rewrite tool definitions: `parameters` → `input_schema`
- `server.ts` — rewrite: message building (system as separate param), strip old thinking token code, SSE event translation
- `public/app.ts` — simplify: remove `<think_intended>` tag parsing safety net, add `event: thinking` SSE handler
- `server.test.ts` — update all tests for new format
- `agent.test.ts` — update all tests for new format
- `tools.test.ts` — update tool definition tests

## Steps

### Step 1: Rewrite `agent.ts` — API client and streaming

The agent loop stays the same shape. Only the API interface changes.

- [ ] Change `MINIMAX_CHAT_URL` from `/v1/chat/completions` to `/anthropic/v1/messages`
- [ ] Change auth header from `Authorization: Bearer` to `x-api-key`
- [ ] Rewrite `runAgentLoop()` request body: `system` as separate array param, `messages` with content blocks, `tools` with `input_schema`
- [ ] Rewrite streaming parser: parse Anthropic SSE events (`content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`)
- [ ] Handle `thinking_delta` → emit `AgentEvent { type: "thinking", content }` 
- [ ] Handle `text_delta` → emit `AgentEvent { type: "text", content }`
- [ ] Handle `tool_use` block → accumulate tool call (id, name, input via `input_json_delta`)
- [ ] On `message_delta` with `stop_reason: "tool_use"` → emit `AgentEvent { type: "tool_start" }` for each tool call
- [ ] Keep existing `AgentEvent` types — they're our internal protocol, unchanged
- [ ] Remove `stripThinkingTokens()` function and all `THINK_OPEN`/`THINK_CLOSE` constants
- [ ] Remove `THINK_OPEN_ALT`/`THINK_CLOSE_ALT` constants
- [ ] Tool results sent as `{role: "user", content: [{type: "tool_result", tool_use_id, content}]}`

### Step 2: Rewrite `tools.ts` — Anthropic tool format

- [ ] Change `parameters` to `input_schema` in all tool definitions
- [ ] Keep `getToolDefinitions()` return type compatible — just rename the field
- [ ] Verify `executeTool()` still works unchanged (it calls MiniMax APIs directly, not chat)

### Step 3: Rewrite `server.ts` — request building and SSE translation

- [ ] Rewrite message history building: `system` as separate Anthropic array param, not a message
- [ ] Messages use content block format: `string` for user messages, `[{type: "text"}]` for assistant
- [ ] Remove `stripThinkingTokens()` from server (moved to agent.ts responsibility, but now unnecessary)
- [ ] Remove `accumulateToolCalls()` — Anthropic format gives complete tool calls in `tool_use` blocks
- [ ] SSE output to browser stays the same format (`event: text`, `event: tool_start`, `event: tool_result`, `event: done`)
- [ ] Add new SSE event: `event: thinking` → `data: {"content": "..."}` for thinking blocks
- [ ] Keep `ChatMessage` interface compatible with what frontend expects

### Step 4: Simplify `public/app.ts` — remove tag parsing

- [ ] Remove `<think_intended>` tag-parsing safety net (the `inThinkBlock`/`thinkBuffer` code, ~30 lines)
- [ ] Add handler for new `event: thinking` SSE events → render in thinking block
- [ ] Keep `renderThinkingBlock()` — it still works, just gets cleaner input
- [ ] Remove `THINK_OPEN`/`THINK_CLOSE`/`THINK_OPEN_ALT`/`THINK_CLOSE_ALT` references from frontend

### Step 5: Update all tests

- [ ] `agent.test.ts` — mock Anthropic endpoint, test new streaming event parsing, test tool_use/tool_result flow
- [ ] `server.test.ts` — update message building assertions for Anthropic format
- [ ] `tools.test.ts` — verify `input_schema` field name
- [ ] All 357+ tests must pass with `just test`

### Step 6: Test and verify

- [ ] `just test` passes all tests
- [ ] Run `just dev` and verify live chat works end-to-end
- [ ] Verify thinking blocks render in UI
- [ ] Verify tool calling (image gen, TTS, music) works
- [ ] Verify error handling (API errors, missing key, timeouts)

## Do NOT

- Change the browser SSE protocol (`event: text`, `event: tool_start`, `event: tool_result`, `event: done`)
- Change the database schema or message storage format
- Add new tools or features — just migrate existing ones
- Use classes, frameworks, or OOP
- Run `bun test` — use `just test`
- Skip tests. 100% coverage on changed files.
- Log API keys
- Modify `.gitignore`

## Must Update

- `AGENTS.md` — update API endpoint info (OpenAI → Anthropic, new auth style, context window 204,800)
- `Tasks/CONTEXT.md` — update test coverage after changes

## Check If Affected

- `db.ts` — should NOT change (messages stored as before)
- `public/style.css` — should NOT change
- `justfile` — should NOT change

## Git Commit Convention

```
HG-010: <summary of change>

- Specific detail about what changed
- Co-authored-by: task-agent
```

## Amendments

