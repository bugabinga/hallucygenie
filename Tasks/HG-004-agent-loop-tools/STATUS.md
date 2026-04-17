# STATUS — HG-004

**Task:** HG-004 — Agent Loop + Tools + Steering
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify agent.ts and tools.ts exist
- [ ] Verify HG-003 works
- [ ] `just test` passes

### Step 1: Tool Definitions and Execution
**Status:** ⬜ Not Started

- [ ] Tool schemas and executeTool function
- [ ] Image gen, TTS, music gen implementations
- [ ] Audio hex → base64 data URL conversion
- [ ] Unit tests with mocked MiniMax
- [ ] Error case tests
- [ ] Snapshot tests for tool results

### Step 2: Agent Loop
**Status:** ⬜ Not Started

- [ ] runAgentLoop implementation
- [ ] Thinking token stripping (`<think_intended>...</think_intended>`)
- [ ] Tool call accumulation from chunks
- [ ] Event emission (text, tool_start, tool_result, done)
- [ ] Multi-iteration loop
- [ ] Unit tests for all scenarios
- [ ] Snapshot tests for event sequences

### Step 3: Steering Queue
**Status:** ⬜ Not Started

- [ ] queueSteer / drainSteer
- [ ] Integration into agent loop turn boundary
- [ ] Tests: mid-loop, idle, multiple, after-done

### Step 4: Coverage and Mutation Testing
**Status:** ⬜ Not Started

- [ ] `just test-coverage` → 100%
- [ ] `just test-mutation` → >= 80%

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
