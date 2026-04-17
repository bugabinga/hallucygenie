# Task: HG-004 — Agent Loop + Tools + Memory

**Created:** 2026-04-16
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Core agent logic, tool execution, persistence. Complex, needs thorough testing.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Implement the agent loop that turns the chat proxy into a real tool-calling agent,
plus tool execution (image gen, TTS, music gen), steering, and SQLite persistence.
Include comprehensive unit tests with 100% coverage, mutation tests, and snapshot tests.

**The agent loop:**
```
while true:
  stream = call minimax with messages + tools
  for chunk in stream:
    if text → forward to browser
    if tool_calls → accumulate
  if no tool_calls → break
  for each tool_call:
    result = execute tool
    send result to browser
    append to messages
  // loop — model sees tool results and responds
```

**MiniMax API details (verified):**
- Image gen: `POST /v1/image_generation`, model `image-01`, returns `data.image_urls[]`
- TTS: `POST /v1/t2a_v2`, model `speech-2.8-hd`, `voice_setting.voice_id`, returns hex audio in `data.audio`
- Music: `POST /v1/music_generation`, model `music-2.6`, `prompt` + `lyrics`, returns hex audio in `data.audio`

## Testing Requirements

- **100% unit test coverage** on `agent.ts`, `tools.ts`, `db.ts`
- **Mutation tests** via `just test-mutation` — >= 80% mutation score
- **Snapshot tests** for tool execution results and agent loop event sequences
- **Use the justfile** for ALL build/test commands

### Testing Strategy

**Mock all MiniMax API calls.** No real API calls in tests. For the agent loop,
provide a mock that returns predetermined SSE streams (tool calls, text, errors).
For tool execution, mock the HTTP calls to image/TTS/music endpoints.

For SQLite tests, use in-memory databases (`:memory:`) so tests are isolated and fast.

## Dependencies

- **Task:** HG-003 (server + chat proxy must exist)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** Project root
- **Services required:** None (mock everything in tests)

## File Scope

- `agent.ts`
- `tools.ts`
- `db.ts`
- `server.ts` (modify to wire agent loop)
- `agent.test.ts`
- `tools.test.ts`
- `db.test.ts`
- `__snapshots__/` (additional snapshots)

## Steps

### Step 0: Preflight

- [ ] Verify `agent.ts`, `tools.ts`, `db.ts` exist
- [ ] Verify HG-003 chat proxy works (`just dev` + curl test)
- [ ] Run `just test` — existing tests pass

### Step 1: Tool Definitions and Execution

- [ ] Define tool schemas (plain objects, OpenAI function calling format)
- [ ] Implement `executeTool(name, args)` function calling MiniMax APIs
- [ ] **Tests:** Unit test each tool with mocked MiniMax responses — verify correct API calls, correct argument passing, correct result parsing
- [ ] **Tests:** Test error cases — API returns error, network failure, malformed response
- [ ] **Snapshot tests:** Snapshot tool results for each tool type

### Step 2: Agent Loop

- [ ] Implement `runAgentLoop(messages, tools, onEvent)` — the while loop
- [ ] Strip thinking tokens, accumulate tool calls, emit events
- [ ] **Tests:** Test loop with mock returning: text only, text + one tool call, text + multiple tool calls, tool call then text, multiple iterations of tool calls
- [ ] **Tests:** Test thinking token stripping edge cases
- [ ] **Snapshot tests:** Snapshot the sequence of events emitted by the loop for each scenario

### Step 3: Steering Queue

- [ ] Implement concurrent-safe steering queue
- [ ] Wire into server routes
- [ ] **Tests:** Test steer mid-loop, steer when idle, multiple steers queued, steer ignored after done

### Step 4: SQLite Persistence

- [ ] Implement `db.ts` using `bun:sqlite`
- [ ] Message CRUD, preference CRUD
- [ ] **Tests:** All CRUD operations, test with `:memory:` databases
- [ ] **Tests:** Edge cases — empty DB, large messages, special characters in content
- [ ] **Snapshot tests:** Snapshot message history JSON output

### Step 5: Wire Into Server

- [ ] Modify `server.ts` to use agent loop, steering, and persistence
- [ ] Add `GET /api/history` endpoint
- [ ] **Tests:** Integration tests hitting the real server (with mocked MiniMax) — end-to-end request → response flow
- [ ] **Snapshot tests:** Snapshot full SSE streams for chat scenarios

### Step 6: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on agent.ts, tools.ts, db.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill surviving mutants

## Completion Criteria

- [ ] Agent loop executes tools and feeds results back
- [ ] Image, TTS, music tools work end-to-end
- [ ] Steering queue works
- [ ] Messages and preferences persist in SQLite
- [ ] `just test` passes all tests
- [ ] `just test-coverage` → 100% on agent.ts, tools.ts, db.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Snapshot tests for tool results and event sequences

## Git Commit Convention

- **Implementation:** `feat(HG-004): agent loop, tools, and persistence`
- **Checkpoints:** `checkpoint: HG-004 description`

## Do NOT

- Implement the frontend (HG-005)
- Use frameworks or libraries beyond Bun built-ins
- Create classes
- Call real MiniMax API in tests
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
