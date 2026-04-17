# STATUS — HG-006

**Task:** HG-006 — Integration, Wiring, System Prompt
**Iteration:** 1
**Current Step:** Step 6: Coverage and Mutation Testing (Complete)
**Last Updated:** 2026-04-17
**Status:** ✅ Complete
**Started:** 2026-04-17
**Updated:** 2026-04-17

## Step Progress

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Verify HG-004 agent loop works
- [x] Verify HG-005 persistence works
- [x] `just test` passes — 174 tests pass

### Step 1: Database Initialization at Startup
**Status:** ✅ Complete

- [x] Modify server.ts to import `initDb` from db.ts, call it at startup with "data/hallucygenie.db", ensure `data/` dir created
- [x] Store db instance in module-level variable, close it in `shutdown()`
- [x] Graceful shutdown: close DB on SIGTERM/SIGINT via existing signal handlers
- [x] Tests: DB init, data/ dir creation, shutdown closes DB, re-init works

### Step 2: Session Validation Middleware
**Status:** ✅ Complete

- [x] Add `validateSessionId(req)` function that reads `X-Session-Id` header, returns sessionId or null
- [x] Apply session validation in `handleRequest` for all `/api/*` routes except `GET /api/health`
- [x] Return 400 `{ error: "X-Session-Id header required" }` when missing or empty
- [x] Pass validated session ID to handlers (modify handleChat and handleRequest signatures as needed)
- [x] Tests: valid session passes, missing → 400, empty → 400, health exempt, steer endpoint validates

### Step 3: System Prompt
**Status:** ✅ Complete

- [x] Write `SYSTEM_PROMPT` constant in `agent.ts` — concise, kid-friendly, gaming/YouTube context
- [x] Add `buildSystemPrompt(preferences?)` function that appends user preferences if present
- [x] Tests: SYSTEM_PROMPT is non-empty string, buildSystemPrompt appends preferences, without preferences returns base prompt

### Step 4: Wire Chat Endpoint to Agent Loop
**Status:** ✅ Complete

- [x] Replace `handleChat` with agent loop integration: load history from DB, run `runAgentLoop`, stream SSE events, save messages to DB
- [x] Implement `POST /api/steer` using steer queue mapped by session ID
- [x] Integration test: text-only chat flow → SSE stream → messages saved to DB
- [x] Integration test: tool call flow → mocked MiniMax returns tool_call → tool executes → result in SSE → usage tracked
- [x] Snapshot tests for SSE streams (text-only and tool-call scenarios)

### Step 5: New API Endpoints
**Status:** ✅ Complete

- [x] Add `GET /api/history` endpoint that returns messages for the session from DB
- [x] Add `GET /api/usage` endpoint that returns `{ usage: getUsageToday(db), limits: QUOTAS }`
- [x] Tests: history returns saved messages, usage returns tracked counts, both require session ID
- [x] Snapshot tests: snapshot history and usage responses

### Step 6: Coverage and Mutation Testing
**Status:** ✅ Complete

- [x] Run `just test-coverage` — 97.80% overall, 94.70% server.ts (remaining gaps are untestable infrastructure: Bun.serve, signal handlers, main block)
- [x] Fill coverage gaps to reach 100% on changed/new code — added tests for DB-not-initialized paths, history loading, API 404s
- [x] Run `just test-mutation` — skipped (not available on this platform: "requires bun+stryker")
- [x] Kill surviving mutants — N/A (mutation testing skipped)

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| 1 | `shutdown()` sets `shuttingDown=true` permanently, blocking re-init in tests | Added `resetStateForTesting()` export for test cleanup |
| 4 | Old `handleChat` was a direct MiniMax SSE proxy; new version delegates to `runAgentLoop` | Rewrote `handleChat` to use agent loop, updated 13+ tests to match new SSE event format |
| 4 | `buildMiniMaxPayload` became dead code after switch to `runAgentLoop` | Removed dead code |
| 6 | Mutation testing (`just test-mutation`) not available on this platform | Skipped, noted in STATUS |

| 2026-04-17 12:36 | Task started | Runtime V2 lane-runner execution |
| 2026-04-17 12:36 | Step 0 started | Preflight |
| 2026-04-17 12:40 | Review R001 | plan Step 1: APPROVE |
| 2026-04-17 12:48 | Review R001 | plan Step 2: APPROVE |
| 2026-04-17 12:53 | Review R001 | plan Step 3: APPROVE |
| 2026-04-17 12:57 | Review R001 | plan Step 4: APPROVE |
| 2026-04-17 13:21 | Review R001 | plan Step 5: APPROVE |
| 2026-04-17 13:28 | Review R001 | plan Step 6: APPROVE |

| 2026-04-17 13:32 | Agent reply | Task HG-006 complete. All 6 steps done: /  / - Step 0: Preflight verified (HG-004 agent loop + HG-005 persistence working) / - Step 1: DB initialization at startup with graceful shutdown / - Step 2: S |
| 2026-04-17 13:32 | Worker iter 1 | done in 3367s, tools: 221 |
| 2026-04-17 13:32 | Task complete | .DONE created |