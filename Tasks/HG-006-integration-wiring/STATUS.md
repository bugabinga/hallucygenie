# STATUS — HG-006

**Task:** HG-006 — Integration, Wiring, System Prompt
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify HG-004 agent loop works
- [ ] Verify HG-005 persistence works
- [ ] `just test` passes

### Step 1: Database Initialization at Startup
**Status:** ⬜ Not Started

- [ ] initDb on startup, data/ dir creation
- [ ] Graceful shutdown closes DB
- [ ] Tests

### Step 2: Session Validation Middleware
**Status:** ⬜ Not Started

- [ ] X-Session-Id validation on /api/* routes
- [ ] Health endpoint exempt
- [ ] Tests: valid, missing, empty

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
