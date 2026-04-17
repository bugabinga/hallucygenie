# STATUS — HG-004

**Task:** HG-004 — Agent Loop + Tools + Steering
**Iteration:** 1
**Current Step:** Step 0: Preflight
**Last Updated:** 2026-04-17
**Status:** 🟡 In Progress
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Verify agent.ts and tools.ts exist
- [x] Verify HG-003 works
- [x] `just test` passes

### Step 1: Tool Definitions and Execution
**Status:** ✅ Complete

- [x] Define tool schemas (getToolDefinitions) in tools.ts for generate_image, text_to_speech, generate_music
- [x] Implement executeTool(name, args) dispatcher in tools.ts
- [x] Implement generateImage: POST /v1/image_generation, model image-01, returns image URL
- [x] Implement textToSpeech: POST /v1/t2a_v2, model speech-2.8-hd, default voice English_expressive_narrator, hex→base64 data URL
- [x] Implement generateMusic: POST /v1/music_generation, model music-2.6, hex→base64 data URL
- [x] Add tools.test.ts with unit tests: correct API calls, args, result parsing, audio MIME type
- [x] Add error case tests: API error, network failure, malformed response, empty audio
- [x] Add snapshot tests for tool results
- [x] Update justfile to include tools.test.ts in test commands

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

| 2026-04-17 11:52 | Task started | Runtime V2 lane-runner execution |
| 2026-04-17 11:52 | Step 0 started | Preflight |
| 2026-04-17 11:55 | Review R001 | plan Step 1: APPROVE |
