# Task: HG-006 — Integration, Wiring, System Prompt

**Created:** 2026-04-16
**Size:** M

## Review Level: 2 (Plan + Code)

**Assessment:** Integration task wiring agent loop + persistence into the server. Touches server.ts.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Wire everything together. Connect the agent loop (HG-004) and persistence layer (HG-005)
into the server (HG-003). Write the system prompt. Add session validation. Add new API
endpoints for history and usage. This is the task that makes all the pieces work as one app.

## Session Contract

Sessions are identified by a UUID sent from the browser in the `X-Session-Id` header.

- Server reads `X-Session-Id` from every API request
- If missing, return 400 with `{ error: "X-Session-Id header required" }`
- Use this UUID to partition messages in SQLite (`session_id` column)
- No server-side session creation — the client owns the ID

## System Prompt

The system prompt is sent with every chat request to MiniMax. It defines the AI's personality.

**How to write it:**

- Write it as a plain text string in `agent.ts` (or load from a `system-prompt.txt` file)
- Keep it short — every token costs quota
- Test it by sending sample prompts and verifying the response style matches

**Goals:**

- The AI is a friendly, helpful buddy for an 11-year-old who likes gaming and YouTube
- It gives creative ideas and suggestions (thumbnail ideas, video concepts, game tips)
- It should feel like talking to a smart friend, not a corporate assistant
- **CRITICAL: The AI must be extremely concise.** Use as few tokens as possible while remaining understandable. Short sentences. No filler. No "Sure!" or "I'd be happy to help!" prefixes. Answer directly. Think Twitter, not email.
- When calling image/music tools, the AI should craft detailed descriptive prompts itself — not ask the user to refine
- No condescending tone. The user is 11, not 5.
- No lectures, no safety warnings, no disclaimers
- Gaming and YouTube context: knows popular games, video editing, thumbnail design

**Refinement:** The user will review and edit the system prompt later. For MVP, write something good enough to ship.

## Testing Requirements

- **100% coverage** on any new code in `server.ts` (wiring logic, session validation, new endpoints)
- **Mutation tests** — >= 80% on changed/new code
- **Snapshot tests** for new endpoint responses
- **Integration tests** — hit the real server (mocked MiniMax) end-to-end: chat → tool call → response
- **Use the justfile** for ALL build/test commands

## Dependencies

- **Task:** HG-004 (agent loop + tools + steering)
- **Task:** HG-005 (persistence + migrations + quotas)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** Project root
- **Services required:** None (mock MiniMax)

### API Key Handling

- Read from `Bun.env.MINIMAX_API_KEY`
- Never log or expose
- Tests mock all API calls

## File Scope

- `server.ts` (modify to wire everything)
- `agent.ts` (add system prompt)
- `server.test.ts` (new integration tests)
- `__snapshots__/` (integration snapshots)

## Steps

### Step 0: Preflight

- [ ] Verify HG-004 agent loop works (`agent.ts` exports `runAgentLoop`)
- [ ] Verify HG-005 persistence works (`db.ts` exports `initDb`, CRUD functions, quota functions)
- [ ] Run `just test` — all existing tests pass

### Step 1: Database Initialization at Startup

- [ ] Modify `server.ts` to call `initDb("data/hallucygenie.db")` on startup
- [ ] Ensure `data/` directory is created if missing
- [ ] Graceful shutdown: close DB connection on SIGTERM/SIGINT
- [ ] **Tests:** DB initializes correctly, `data/` created, shutdown closes DB

### Step 2: Session Validation Middleware

- [ ] Add session validation on all `/api/*` routes (except `GET /api/health`)
- [ ] Read `X-Session-Id` header, validate it's a non-empty string
- [ ] Return 400 with `{ error: "X-Session-Id header required" }` if missing or empty
- [ ] Pass validated session ID to handlers
- [ ] **Tests:** Valid session ID passes, missing → 400, empty → 400, health endpoint skips validation

### Step 3: System Prompt

- [ ] Write the system prompt in `agent.ts` following the goals above
- [ ] Inject system prompt into every `runAgentLoop` call
- [ ] Load preferences from DB and append to system prompt as "What you know about the user: ..."
- [ ] **Tests:** System prompt is included in MiniMax request, preferences appended when present

### Step 4: Wire Chat Endpoint to Agent Loop

- [ ] `POST /api/chat` now:
  1. Validate session ID
  2. Load message history from DB
  3. Append new user message to history
  4. Save user message to DB
  5. Run agent loop with history + tools
  6. Stream SSE events to browser
  7. Save assistant response to DB
  8. On tool execution: check quota, execute, track usage, save tool result
- [ ] `POST /api/steer` now: queue steer message for the active agent loop session
- [ ] **Tests:** Full integration: send chat → mocked MiniMax returns text → verify SSE stream → verify messages saved to DB
- [ ] **Tests:** Integration with tool call: send "generate an image" → mocked MiniMax returns tool_call → mocked tool returns URL → verify image URL in SSE → verify usage tracked
- [ ] **Snapshot tests:** Snapshot full SSE streams for text-only and tool-call scenarios

### Step 5: New API Endpoints

- [ ] `GET /api/history` — return message history for the session ID from DB
- [ ] `GET /api/usage` — return `{ usage: getUsageToday(), limits: QUOTAS }` for the session
- [ ] **Tests:** History returns saved messages, usage returns tracked counts, both require session ID
- [ ] **Snapshot tests:** Snapshot history and usage responses

### Step 6: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on any changed/new code
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill surviving mutants

## Completion Criteria

- [ ] Server initializes DB on startup with migrations
- [ ] Graceful shutdown closes DB
- [ ] Session validation on all API routes (except health)
- [ ] System prompt is concise, kid-friendly, and injected into agent loop
- [ ] Chat endpoint uses agent loop with tool execution and persistence
- [ ] Steering queues messages for active sessions
- [ ] `GET /api/history` returns session messages
- [ ] `GET /api/usage` returns quota usage
- [ ] Quota enforcement blocks over-limit tool calls
- [ ] `just test` passes
- [ ] `just test-coverage` → 100% on new/changed code
- [ ] `just test-mutation` → >= 80%

## Git Commit Convention

- **Implementation:** `feat(HG-006): integrate agent loop, persistence, and system prompt`
- **Checkpoints:** `checkpoint: HG-006 description`

## Do NOT

- Implement the frontend (HG-007)
- Modify tool execution logic (that's HG-004)
- Modify migration files (that's HG-005)
- Create classes
- Call real MiniMax API in tests
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
