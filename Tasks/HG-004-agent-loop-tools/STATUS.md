# STATUS — HG-004

**Task:** HG-004 — Agent Loop + Tools + Memory
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify agent.ts, tools.ts, db.ts exist
- [ ] Verify HG-003 works
- [ ] `just test` passes

### Step 1: Tool Definitions and Execution
**Status:** ⬜ Not Started

- [ ] Tool schemas and executeTool function
- [ ] Unit tests with mocked MiniMax
- [ ] Error case tests
- [ ] Snapshot tests for tool results

### Step 2: Agent Loop
**Status:** ⬜ Not Started

- [ ] runAgentLoop implementation
- [ ] Tests for all loop scenarios
- [ ] Thinking token stripping tests
- [ ] Snapshot tests for event sequences

### Step 3: Steering Queue
**Status:** ⬜ Not Started

- [ ] Steering queue implementation
- [ ] Wire into server
- [ ] Tests: mid-loop, idle, multiple, after-done

### Step 4: SQLite Persistence + Migration System
**Status:** ⬜ Not Started

- [ ] Create migration SQL files in `migrations/`
- [ ] Implement migration runner (runMigrations)
- [ ] Implement data access functions (CRUD)
- [ ] Tests: migration runner (fresh, partial, rollback)
- [ ] Tests: CRUD operations with :memory:
- [ ] Tests: edge cases
- [ ] Snapshot tests for history and schema

### Step 5: Wire Into Server
**Status:** ⬜ Not Started

- [ ] server.ts uses agent loop + steering + persistence
- [ ] GET /api/history endpoint
- [ ] Integration tests
- [ ] Snapshot tests for full SSE streams

### Step 6: Coverage and Mutation Testing
**Status:** ⬜ Not Started

- [ ] `just test-coverage` → 100%
- [ ] `just test-mutation` → >= 80%

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
