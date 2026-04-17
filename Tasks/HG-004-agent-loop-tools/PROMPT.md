# Task: HG-004 — Agent Loop + Tools + Memory

**Created:** 2026-04-16
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Core agent loop pattern. Single service, new pattern.
**Score:** 2/8 — Blast radius: 1 (single service), Pattern novelty: 1, Security: 0, Reversibility: 0

## Canonical Task Folder

```
Tasks/HG-004-agent-loop-tools/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Implement the agent loop that turns the chat proxy into a real tool-calling agent.
When MiniMax decides to call a tool (image gen, TTS, music gen), the agent loop
executes it, feeds the result back, and continues until the model produces a
final text response. Also implement the steering queue and SQLite persistence.

**The agent loop in pseudocode:**
```
while true:
  stream = call minimax with messages + tools
  for chunk in stream:
    if chunk has text → forward to browser
    if chunk has tool_calls → accumulate
  if no tool_calls accumulated → break (done)
  for each tool_call:
    result = execute tool (image gen, tts, etc)
    send tool result to browser via SSE
    append assistant message with tool_calls to messages
    append tool result message to messages
  // loop continues — model sees tool results and responds
```

**Steering:** When user sends POST /api/steer mid-stream, queue the message.
After the current turn completes (text or tool call), inject steer as a user
message and continue the loop.

**MiniMax API details (verified):**
- Image gen: `POST /v1/image_generation`, model `image-01`, returns `data.image_urls[]`
- TTS: `POST /v1/t2a_v2`, model `speech-2.8-hd`, `voice_setting.voice_id`, returns hex audio in `data.audio`
- Music: `POST /v1/music_generation`, model `music-2.6`, `prompt` + `lyrics`, returns hex audio in `data.audio`
- Available voice IDs: `English_expressive_narrator`, etc. (332 voices, list at platform.minimax.io/docs/faq/system-voice-id)
- Tool result format: `{"role": "tool", "content": "json string", "tool_call_id": "..."}`

## Dependencies

- **Task:** HG-003 (server + chat proxy must exist)

## Context to Read First

- `Tasks/CONTEXT.md` — project overview

## Environment

- **Workspace:** Project root
- **Services required:** MiniMax API accessible

## File Scope

- `agent.ts`
- `tools.ts`
- `db.ts`
- `server.ts` (modify to wire agent loop)

## Steps

### Step 0: Preflight

- [ ] Verify `agent.ts`, `tools.ts`, `db.ts` exist
- [ ] Verify HG-003 chat proxy works (can stream a basic response)

### Step 1: Tool Definitions and Execution

- [ ] Define tool schemas in `tools.ts` (plain objects, OpenAI function calling format):
  - `generate_image`: `{ prompt: string }`
  - `text_to_speech`: `{ text: string, voice_id?: string }`
  - `generate_music`: `{ prompt: string, lyrics?: string }`
- [ ] Implement `executeTool(name, args)` function:
  - `generate_image` → call MiniMax image API → return `{ url: "..." }`
  - `text_to_speech` → call MiniMax TTS API → return hex audio as base64 data URL
  - `generate_music` → call MiniMax music API → return hex audio as base64 data URL
- [ ] All tool functions are plain async functions, no classes

### Step 2: Agent Loop

- [ ] Implement `runAgentLoop(messages, tools, onEvent)` in `agent.ts`:
  - Calls MiniMax streaming chat with messages + tool definitions
  - Accumulates text deltas → emits `text` events via `onEvent`
  - Accumulates tool calls → when complete, executes each tool
  - Emits `tool_start`, `tool_result` events via `onEvent`
  - Appends tool results to messages array
  - Loops until model returns `finish_reason: "stop"` (no more tool calls)
  - Emits `done` event at end
- [ ] Strip thinking tokens (`<think_82>...</think_82>`) from text before emitting
- [ ] The loop is a simple while loop, no complex state machine

### Step 3: Steering Queue

- [ ] Implement a concurrent-safe steering queue (plain array + flag):
  - `POST /api/steer` adds message to queue
  - Agent loop checks queue after each turn boundary
  - If steer message present, inject as user message and continue loop
  - Steer message replaces any pending text generation
- [ ] Wire into server routes

### Step 4: SQLite Persistence

- [ ] Implement `db.ts` using Bun's native SQLite (`bun:sqlite`):
  - `initDb(path)` — create tables if not exist
  - `saveMessage(sessionId, role, content, toolCalls?, toolCallId?)` — append message
  - `getMessages(sessionId)` — get conversation history
  - `savePreference(key, value)` — store user preference
  - `getPreferences()` — get all preferences as object
- [ ] Schema: `messages` table (id, session_id, role, content, tool_calls_json, tool_call_id, created_at)
- [ ] Schema: `preferences` table (key, value, updated_at)
- [ ] DB file stored in `data/hallucygenie.db` (container volume mount)

### Step 5: Wire Into Server

- [ ] Modify `server.ts` to use agent loop instead of raw proxy:
  - `POST /api/chat` → load/create session, run agent loop, stream SSE
  - `POST /api/steer` → queue steer message for active session
  - Load preferences and inject into system prompt
- [ ] Add `GET /api/history` → return message history for current session

### Step 6: Verification

- [ ] Send "say hello" → get text response, no tool calls
- [ ] Send "generate an image of a cat" → agent calls generate_image, returns image URL
- [ ] Send "read this out loud: hello world" → agent calls TTS, returns audio
- [ ] Send "make me a song about gaming" → agent calls generate_music, returns audio
- [ ] Test steering: start a long request, send steer mid-stream, verify it affects next turn
- [ ] Verify messages are persisted in SQLite
- [ ] Verify preferences persist across server restarts

## Documentation Requirements

**Must Update:** None
**Check If Affected:** None

## Completion Criteria

- [ ] Agent loop executes tool calls and feeds results back to model
- [ ] Image gen, TTS, and music gen tools work end-to-end
- [ ] Steering queue injects mid-stream corrections
- [ ] Messages persist to SQLite
- [ ] Preferences persist to SQLite
- [ ] System prompt includes stored preferences

## Git Commit Convention

- **Implementation:** `feat(HG-004): agent loop, tools, and persistence`
- **Checkpoints:** `checkpoint: HG-004 description`

## Do NOT

- Implement the frontend (that's HG-005)
- Use any framework or library beyond Bun's built-ins
- Create classes — plain functions only
- Add authentication or user management
- Build a state machine for the agent loop — it's a while loop

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
