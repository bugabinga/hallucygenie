# Task: HG-004 — Agent Loop + Tools + Steering

**Created:** 2026-04-16
**Size:** M

## Review Level: 2 (Plan + Code)

**Assessment:** Core agent intelligence — tool calling loop, tool execution, steering.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Implement the agent loop (tool-calling while loop), tool execution functions (image gen,
TTS, music gen), and the steering queue. This is the "brain" — it decides when to call
tools, executes them, and feeds results back to the model.

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
- Chat: `POST /v1/chat/completions`, model `MiniMax-M2.7-highspeed`, OpenAI-compatible
- Image gen: `POST /v1/image_generation`, model `image-01`, returns `data.image_urls[]`
- TTS: `POST /v1/t2a_v2`, model `speech-2.8-hd`, `voice_setting.voice_id`, returns hex MP3 in `data.audio`
- Music: `POST /v1/music_generation`, model `music-2.6`, `prompt` + `lyrics`, returns hex MP3 in `data.audio`
- Audio format (verified): both TTS and music return hex-encoded MP3 with ID3 headers
  - Convert: `Buffer.from(hex, 'hex').toString('base64')` → prepend `data:audio/mp3;base64,`
- Thinking tokens: content between `<think_intended>` and `</think_intended>` tags — literal strings, strip entirely
- Tool calls: chunked `function.arguments` across SSE events, `finish_reason: "tool_calls"`
- Tool results: `{"role": "tool", "content": "...", "tool_call_id": "..."}`

## Testing Requirements

- **100% unit test coverage** on `agent.ts` and `tools.ts`
- **Mutation tests** via `just test-mutation` — >= 80%
- **Snapshot tests** for tool results and agent loop event sequences
- **Use the justfile** for ALL build/test commands

### Testing Strategy

Mock all MiniMax API calls. For the agent loop, provide a mock returning predetermined
SSE streams. For tools, mock the HTTP calls. No real API keys in tests.

## Dependencies

- **Task:** HG-003 (server + chat proxy must exist)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** Project root
- **Services required:** None (mock everything)

### API Key Handling

- Read from `Bun.env.MINIMAX_API_KEY`
- Never log or expose the key
- Tests mock all API calls

## File Scope

- `agent.ts`
- `tools.ts`
- `agent.test.ts`
- `tools.test.ts`
- `__snapshots__/` (agent and tool snapshots)

## Steps

### Step 0: Preflight

- [ ] Verify `agent.ts` and `tools.ts` exist with placeholders from HG-002
- [ ] Verify HG-003 chat proxy works (`just dev` + curl test)
- [ ] Run `just test` — existing tests pass

### Step 1: Tool Definitions and Execution

- [ ] Define tool schemas in `tools.ts` (plain objects, OpenAI function calling format):
  - `generate_image`: `{ prompt: string }` → calls `POST /v1/image_generation` → returns image URL
  - `text_to_speech`: `{ text: string, voice_id?: string }` → calls `POST /v1/t2a_v2` → returns `data:audio/mp3;base64,...`
  - `generate_music`: `{ prompt: string, lyrics?: string }` → calls `POST /v1/music_generation` → returns `data:audio/mp3;base64,...`
- [ ] Implement `executeTool(name, args)` — dispatches to the right tool function
- [ ] Default TTS voice: `English_expressive_narrator`
- [ ] **Tests:** Unit test each tool with mocked MiniMax — correct API calls, args, result parsing, audio MIME type
- [ ] **Tests:** Error cases — API error, network failure, malformed response, empty audio
- [ ] **Snapshot tests:** Snapshot tool results for each type

### Step 2: Agent Loop

- [ ] Implement `runAgentLoop(messages, tools, onEvent)` in `agent.ts`:
  - Calls MiniMax streaming chat with messages + tool definitions
  - Strips thinking tokens (`<think_intended>...</think_intended>`) from content deltas
  - Accumulates tool calls from chunked SSE events
  - When tool calls complete, executes each via `executeTool`
  - Emits events: `text`, `tool_start`, `tool_result`, `done`
  - Appends tool results to messages and loops
  - Loops until `finish_reason: "stop"` (no more tool calls)
- [ ] **Tests:** Text-only response, text + one tool call, multiple tool calls, multi-iteration loop, thinking token stripping edge cases, empty responses
- [ ] **Snapshot tests:** Snapshot event sequences for each scenario

### Step 3: Steering Queue

- [ ] Implement steering queue (plain array + flag, concurrent-safe):
  - `queueSteer(message)` — adds to queue
  - `drainSteer()` — returns queued messages and clears
- [ ] Agent loop checks queue after each turn boundary (after tool results appended or text turn complete)
  - If steer messages present, inject as user message and continue loop
- [ ] **Tests:** Steer mid-loop, steer when idle, multiple steers queued, steer after done (ignored), steer during tool execution

### Step 4: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on `agent.ts` and `tools.ts`
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill surviving mutants

## Completion Criteria

- [ ] `executeTool` handles all three tool types with correct API calls
- [ ] Audio returned as `data:audio/mp3;base64,...` data URLs
- [ ] Agent loop streams text, executes tools, feeds results back, loops until done
- [ ] Thinking tokens stripped from output
- [ ] Steering queue injects mid-stream corrections
- [ ] `just test` passes
- [ ] `just test-coverage` → 100% on agent.ts, tools.ts
- [ ] `just test-mutation` → >= 80%

## Git Commit Convention

- **Implementation:** `feat(HG-004): agent loop, tool execution, and steering`
- **Checkpoints:** `checkpoint: HG-004 description`

## Do NOT

- Implement persistence/migrations (HG-005)
- Wire into server.ts (HG-006)
- Implement the frontend (HG-007)
- Create classes
- Call real MiniMax API in tests
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
