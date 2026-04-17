# Task: HG-003 — Server + Chat Proxy

**Created:** 2026-04-16
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Core HTTP server with SSE streaming and MiniMax proxy. New patterns, needs thorough testing.
**Score:** 3/8 — Blast radius: 1 (single service), Pattern novelty: 1 (new patterns), Security: 0, Reversibility: 1 (server rewrite)

## Canonical Task Folder

```
Tasks/HG-003-server-chat-proxy/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Implement the core server: HTTP routing, static file serving, MiniMax chat proxy
with SSE streaming, and tool call parsing. Include comprehensive unit tests with
100% coverage, mutation tests, and snapshot tests for all endpoints.

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

## Testing Requirements

- **100% unit test coverage** on `server.ts` and `agent.ts` — every function, every branch, every error path
- **Mutation tests** via `just test-mutation` — stryker must report >= 80% mutation score
- **Snapshot tests** for all endpoints: store SSE event streams as snapshots, assert they match on rerun
- **Use the justfile** for ALL build/test commands — never run `bun test` directly

### Testing Strategy

**Mock the MiniMax API.** Do not call the real API in tests. Create a mock server
(using `Bun.serve` on a random port) that returns canned SSE streams. This gives
deterministic, fast tests that don't need network access or API keys.

**Snapshot tests:** For each endpoint (`/api/chat`, `GET /`, static files), record
the full response (headers + body for HTTP, event stream for SSE) as a snapshot
file. Assert responses match snapshots. Update snapshots with `just test -- --update-snapshots`.

## Dependencies

- **Task:** HG-002 (project scaffold, justfile, test infra must exist)

## Context to Read First

- `Tasks/CONTEXT.md` — project overview
- `justfile` — available build/test recipes

## Environment

- **Workspace:** Project root
- **Services required:** None (mock MiniMax in tests)

### API Key Handling (non-negotiable)

- The MiniMax API key MUST be read exclusively from the `MINIMAX_API_KEY` environment variable
- Use `Bun.env.MINIMAX_API_KEY` — never hardcode, never put in a config file, never log it
- If the key is missing at startup, fail immediately with a clear error: `"MINIMAX_API_KEY environment variable is required"`
- For local development, use a `.env` file (already gitignored) — Bun loads `.env` automatically
- For container deployment, the quadlet's `EnvironmentFile=.env` passes it through
- Tests must NEVER use the real key — always mock MiniMax API calls

## File Scope

- `server.ts`
- `agent.ts`
- `server.test.ts`
- `agent.test.ts`
- `__snapshots__/` (snapshot files)

## Session Contract

Sessions are identified by a UUID stored in the browser's `localStorage`.
- Client generates a UUID v4 on first visit, stores as `hallucygenie_session_id`
- Every API request includes `X-Session-Id` header with this UUID
- Server uses this to partition messages in SQLite
- No cookies, no auth, no server-side session creation — the client owns the ID

## Steps

### Step 0: Preflight

- [ ] Verify `server.ts` exists with skeleton from HG-002
- [ ] Verify `justfile` exists with test recipes
- [ ] Run `just test` — existing placeholders pass

### Step 1: Static File Server + Route Skeleton

- [ ] Implement static file serving from `public/` directory
- [ ] Add route handling: `GET /` → `public/index.html`, `POST /api/chat` → chat handler, `POST /api/steer` → steer handler (placeholder), `GET /api/health` → health check
- [ ] `GET /api/health` returns `{ status: "ok", uptime: <seconds> }`
- [ ] Add CORS headers on all API routes: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type, X-Session-Id`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- [ ] Handle OPTIONS preflight requests
- [ ] All other routes return 404
- [ ] **Tests:** Unit test every route (GET /, GET /api/health, POST /api/chat with no body, OPTIONS preflight, unknown route → 404, static file serving, CORS headers present)
- [ ] **Snapshot tests:** snapshot the response for GET /, GET /api/health, 404 responses

### Step 2: Chat Proxy with SSE Streaming

- [ ] Implement `POST /api/chat` handler:
  - Accept JSON body: `{ messages: [{role, content}], system_prompt?: string }`
  - Validate request schema: body must be valid JSON, must have `messages` array, each message must have `role` (string) and `content` (string). Return 400 with `{ error: "description" }` on invalid input. No fuzzy error messages — tell the caller exactly what's wrong.
  - Forward to MiniMax `POST /v1/chat/completions` with `stream: true`
  - Stream SSE events back to browser
  - Strip thinking tokens from streamed content before forwarding (thinking content appears between `<think_intended>` and `</think_intended>` tags — these are literal strings in the SSE content delta)
- [ ] Include tool definitions in the MiniMax request (image gen, TTS, music gen)
- [ ] **Tests:** Mock MiniMax SSE responses, verify correct forwarding, verify thinking tokens stripped, verify error handling (MiniMax returns 500, network error), verify schema validation rejects bad input (missing messages, wrong types, malformed JSON)
- [ ] **Snapshot tests:** Record SSE event streams for text-only response, response with thinking tokens, error response

### Step 3: Tool Call Accumulator

- [ ] Implement streaming tool call parser:
  - Accumulate chunked `function.arguments` across SSE events
  - Parse complete tool calls when `finish_reason: "tool_calls"` arrives
  - Emit SSE events: `tool_start` and `tool_end`
- [ ] For MVP, emit tool calls to browser and close stream (execution in HG-004)
- [ ] **Tests:** Test chunk accumulation (1 call, multiple calls, partial chunks, edge cases), test SSE event format, test malformed arguments handling
- [ ] **Snapshot tests:** Snapshot the tool_start/tool_end events for various tool call patterns

### Step 4: Error Handling + Graceful Shutdown

- [ ] MiniMax API errors (non-200) → proper HTTP errors
- [ ] `finish_reason: "length"` → emit truncated event
- [ ] Connection errors → 502
- [ ] No crashes on malformed requests (missing body, invalid JSON, etc.)
- [ ] Graceful shutdown: on SIGTERM/SIGINT, stop accepting new connections, finish in-flight SSE streams (with a timeout), close DB connection, then exit
- [ ] Export a `shutdown()` function from server for test cleanup
- [ ] **Tests:** Test every error path: 500 from MiniMax, connection refused, timeout, malformed JSON body, missing fields
- [ ] **Tests:** Test graceful shutdown: verify server stops cleanly, verify active connections get closed

### Step 5: Coverage and Mutation Testing

- [ ] Run `just test-coverage` — verify 100% line/function/branch coverage on `server.ts` and `agent.ts`
- [ ] Run `just test-mutation` — verify mutation score >= 80%
- [ ] If coverage gaps: write additional tests until 100%
- [ ] If mutation score low: strengthen assertions to kill surviving mutants

## Documentation Requirements

**Must Update:** None
**Check If Affected:** None

## Completion Criteria

- [ ] Server serves static files from `public/`
- [ ] `POST /api/chat` proxies to MiniMax and streams SSE
- [ ] Thinking tokens stripped from output
- [ ] Tool calls parsed from chunks and emitted as SSE events
- [ ] Error handling doesn't crash server
- [ ] `just test` passes all tests
- [ ] `just test-coverage` shows 100% on server.ts and agent.ts
- [ ] `just test-mutation` scores >= 80%
- [ ] Snapshot tests exist for all endpoints

## Git Commit Convention

- **Implementation:** `feat(HG-003): server with chat proxy and SSE streaming`
- **Checkpoints:** `checkpoint: HG-003 description`

## Do NOT

- Implement tool execution (HG-004)
- Implement the full agent loop (HG-004)
- Implement the frontend (HG-005)
- Use any framework or router library
- Create classes
- Call the real MiniMax API in tests — always mock
- Run `bun test` directly — always use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
