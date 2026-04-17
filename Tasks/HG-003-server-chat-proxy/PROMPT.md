# Task: HG-003 — Server + Chat Proxy

**Created:** 2026-04-16
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** New HTTP routing and SSE streaming pattern. Single service, no auth yet.
**Score:** 2/8 — Blast radius: 1 (single service), Pattern novelty: 1 (new patterns), Security: 0, Reversibility: 0

## Canonical Task Folder

```
Tasks/HG-003-server-chat-proxy/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Implement the core server: HTTP routing, static file serving, and the MiniMax chat
proxy with SSE streaming. This is the backbone that all other features plug into.

The server proxies chat requests to MiniMax M2.7-highspeed, streaming tokens back
to the browser via SSE. It handles the OpenAI-compatible tool calling format where
MiniMax returns `tool_calls` in streaming chunks with chunked arguments.

**MiniMax API details (verified):**
- Base URL: `https://api.minimax.io`
- Chat endpoint: `POST /v1/chat/completions` (OpenAI-compatible)
- Model: `MiniMax-M2.7-highspeed` (on the user's highspeed plan)
- Auth: `Authorization: Bearer <key>` header
- SSE streaming: `stream: true` → `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`
- Thinking tokens: appear between `<think_82>\n` and `</think_82>\n` markers in content — strip from display
- Tool calls: appear as `delta.tool_calls[]` with chunked `function.arguments` across events
- Tool call IDs format: `call_function_xxxxx_N`
- `finish_reason: "tool_calls"` when model wants to execute tools
- Tool results sent back as `{"role": "tool", "content": "...", "tool_call_id": "..."}`

## Dependencies

- **Task:** HG-002 (project scaffold must exist)

## Context to Read First

- `Tasks/CONTEXT.md` — project overview

## Environment

- **Workspace:** Project root
- **Services required:** None (API key from env)

## File Scope

- `server.ts`
- `agent.ts`

## Steps

### Step 0: Preflight

- [ ] Verify `server.ts` exists with the skeleton from HG-002
- [ ] Verify `package.json` exists
- [ ] Verify `MINIMAX_API_KEY` is available (env or `.env` file)

### Step 1: Static File Server + Route Skeleton

- [ ] Implement static file serving from `public/` directory
- [ ] Add route handling: `GET /` → `public/index.html`, `POST /api/chat` → chat handler, `POST /api/steer` → steer handler (placeholder for now)
- [ ] All other routes return 404

### Step 2: Chat Proxy with SSE Streaming

- [ ] Implement `POST /api/chat` handler:
  - Accept JSON body: `{ messages: [{role, content}], system_prompt?: string }`
  - Forward to MiniMax `POST /v1/chat/completions` with `stream: true`
  - Stream SSE events back to browser
  - Strip thinking tokens from streamed content before forwarding
- [ ] Implement SSE event format for browser:
  ```
  event: text
  data: {"delta": "chunk"}

  event: done
  data: {}
  ```
- [ ] Include tool definitions in the MiniMax request (tools for image gen, TTS, music gen — even though execution is HG-004, the definitions must be present so the model knows it can call them)

### Step 3: Tool Call Accumulator

- [ ] Implement streaming tool call parser:
  - MiniMax streams tool calls as chunks: first chunk has `id`, `function.name`, and partial `function.arguments`
  - Subsequent chunks append more `function.arguments`
  - `finish_reason: "tool_calls"` signals all tool calls are complete
- [ ] When tool calls are complete, emit SSE events to browser:
  ```
  event: tool_start
  data: {"id": "...", "name": "generate_image", "arguments": {...}}

  event: tool_end
  data: {"id": "...", "name": "generate_image", "result": "pending"}
  ```
- [ ] For MVP, when tool calls are detected, just emit them to the browser and close the stream (agent loop execution comes in HG-004)

### Step 4: Error Handling

- [ ] Handle MiniMax API errors (non-200 responses) → return proper HTTP errors
- [ ] Handle `finish_reason: "length"` → emit a truncated event
- [ ] Handle connection errors → return 502
- [ ] No crashes on malformed requests

### Step 5: Verification

- [ ] Start server with `bun run server.ts`
- [ ] `curl localhost:3000` → serves `public/index.html`
- [ ] `curl -X POST localhost:3000/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"say hi"}]}'` → streams SSE events with text
- [ ] Verify thinking tokens are NOT present in SSE output
- [ ] Verify tool calls are parsed and emitted when model calls them (test with "generate an image of a cat")

## Documentation Requirements

**Must Update:** None
**Check If Affected:** None

## Completion Criteria

- [ ] Server serves static files from `public/`
- [ ] `POST /api/chat` proxies to MiniMax and streams SSE to browser
- [ ] Thinking tokens are stripped from output
- [ ] Tool calls are parsed from streaming chunks and emitted as SSE events
- [ ] Error handling doesn't crash the server

## Git Commit Convention

- **Implementation:** `feat(HG-003): server with chat proxy and SSE streaming`
- **Checkpoints:** `checkpoint: HG-003 description`

## Do NOT

- Implement tool execution (that's HG-004)
- Implement the agent loop (that's HG-004)
- Implement the frontend (that's HG-005)
- Use any framework or router library
- Create classes — use plain functions and objects
- Add authentication (not in scope)

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
