# STATUS — HG-006

**Task:** HG-006 — Integration, Wiring, System Prompt
**Iteration:** 1
**Current Step:** Step 3: System Prompt
**Last Updated:** 2026-04-17
**Status:** 🟡 In Progress
**Started:** —
**Updated:** —

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
**Status:** ⬜ Not Started

- [ ] Write system prompt per goals
- [ ] Inject into runAgentLoop
- [ ] Append preferences from DB
- [ ] Tests

### Step 4: Wire Chat Endpoint to Agent Loop
**Status:** ⬜ Not Started

- [ ] POST /api/chat → agent loop + persistence + quotas
- [ ] POST /api/steer → queue for active session
- [ ] Integration tests: text-only and tool-call flows
- [ ] Snapshot tests for SSE streams

### Step 5: New API Endpoints
**Status:** ⬜ Not Started

- [ ] GET /api/history
- [ ] GET /api/usage
- [ ] Tests and snapshot tests

### Step 6: Coverage and Mutation Testing
**Status:** ⬜ Not Started

- [ ] `just test-coverage` → 100%
- [ ] `just test-mutation` → >= 80%

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |

| 2026-04-17 12:36 | Task started | Runtime V2 lane-runner execution |
| 2026-04-17 12:36 | Step 0 started | Preflight |
| 2026-04-17 12:40 | Review R001 | plan Step 1: APPROVE |
| 2026-04-17 12:48 | Review R001 | plan Step 2: APPROVE |
