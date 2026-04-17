# STATUS — HG-004

**Task:** HG-004 — Agent Loop + Tools + Memory
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify agent.ts, tools.ts, db.ts exist
- [ ] Verify HG-003 chat proxy works

### Step 1: Tool Definitions and Execution
**Status:** ⬜ Not Started

- [ ] Define tool schemas (generate_image, text_to_speech, generate_music)
- [ ] Implement executeTool function
- [ ] Image gen tool calls MiniMax API
- [ ] TTS tool calls MiniMax API
- [ ] Music gen tool calls MiniMax API

### Step 2: Agent Loop
**Status:** ⬜ Not Started

- [ ] Implement runAgentLoop function
- [ ] Accumulate text deltas and tool calls from stream
- [ ] Execute tools and feed results back
- [ ] Loop until finish_reason=stop
- [ ] Strip thinking tokens

### Step 3: Steering Queue
**Status:** ⬜ Not Started

- [ ] Implement steering queue
- [ ] Wire POST /api/steer
- [ ] Agent loop checks queue at turn boundaries

### Step 4: SQLite Persistence
**Status:** ⬜ Not Started

- [ ] Implement db.ts with bun:sqlite
- [ ] Messages table and CRUD
- [ ] Preferences table and CRUD
- [ ] DB file in data/ directory

### Step 5: Wire Into Server
**Status:** ⬜ Not Started

- [ ] POST /api/chat uses agent loop
- [ ] POST /api/steer queues message
- [ ] GET /api/history returns messages
- [ ] Preferences injected into system prompt

### Step 6: Verification
**Status:** ⬜ Not Started

- [ ] Text-only chat works
- [ ] Image gen end-to-end
- [ ] TTS end-to-end
- [ ] Music gen end-to-end
- [ ] Steering works
- [ ] Persistence works

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
