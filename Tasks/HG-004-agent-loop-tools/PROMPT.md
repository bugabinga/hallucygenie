# Task: HG-004 — Agent Loop + Tools + Memory

**Created:** 2026-04-16
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Core agent logic, tool execution, persistence. Complex, needs thorough testing.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Implement the agent loop that turns the chat proxy into a real tool-calling agent,
plus tool execution (image gen, TTS, music gen), steering, and SQLite persistence.
Include comprehensive unit tests with 100% coverage, mutation tests, and snapshot tests.

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
- Image gen: `POST /v1/image_generation`, model `image-01`, returns `data.image_urls[]`
- TTS: `POST /v1/t2a_v2`, model `speech-2.8-hd`, `voice_setting.voice_id`, returns hex audio in `data.audio`
- Music: `POST /v1/music_generation`, model `music-2.6`, `prompt` + `lyrics`, returns hex audio in `data.audio`

## Testing Requirements

- **100% unit test coverage** on `agent.ts`, `tools.ts`, `db.ts`
- **Mutation tests** via `just test-mutation` — >= 80% mutation score
- **Snapshot tests** for tool execution results and agent loop event sequences
- **Use the justfile** for ALL build/test commands

### Testing Strategy

**Mock all MiniMax API calls.** No real API calls in tests. For the agent loop,
provide a mock that returns predetermined SSE streams (tool calls, text, errors).
For tool execution, mock the HTTP calls to image/TTS/music endpoints.

For SQLite tests, use in-memory databases (`:memory:`) so tests are isolated and fast.

## Dependencies

- **Task:** HG-003 (server + chat proxy must exist)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** Project root
- **Services required:** None (mock everything in tests)

### API Key Handling

- Read exclusively from `Bun.env.MINIMAX_API_KEY`
- Fail fast if missing: `"MINIMAX_API_KEY environment variable is required"`
- Never log or expose the key
- Tests mock all API calls — never use real key

## File Scope

- `agent.ts`
- `tools.ts`
- `db.ts`
- `server.ts` (modify to wire agent loop)
- `agent.test.ts`
- `tools.test.ts`
- `db.test.ts`
- `__snapshots__/` (additional snapshots)

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

## Steps

### Step 0: Preflight

- [ ] Verify `agent.ts`, `tools.ts`, `db.ts` exist
- [ ] Verify HG-003 chat proxy works (`just dev` + curl test)
- [ ] Run `just test` — existing tests pass

### Step 1: Tool Definitions and Execution

- [ ] Define tool schemas (plain objects, OpenAI function calling format)
- [ ] Implement `executeTool(name, args)` function calling MiniMax APIs:
  - `generate_image` → `POST https://api.minimax.io/v1/image_generation` → returns image URL string
  - `text_to_speech` → `POST https://api.minimax.io/v1/t2a_v2` → returns hex-encoded MP3 → convert to `data:audio/mp3;base64,...`
  - `generate_music` → `POST https://api.minimax.io/v1/music_generation` → returns hex-encoded MP3 → convert to `data:audio/mp3;base64,...`
- [ ] Audio format (verified): both TTS and music return hex-encoded MP3 with ID3 headers. Convert via `Buffer.from(hex, 'hex').toString('base64')` → prepend `data:audio/mp3;base64,`
- [ ] **Tests:** Unit test each tool with mocked MiniMax responses — verify correct API calls, argument passing, result parsing, correct audio MIME type
- [ ] **Tests:** Test error cases — API returns error, network failure, malformed response, empty audio
- [ ] **Snapshot tests:** Snapshot tool results for each tool type

### Step 2: Agent Loop

- [ ] Implement `runAgentLoop(messages, tools, onEvent)` — the while loop
- [ ] Strip thinking tokens (content between `<think_intended>` and `</think_intended>` tags — literal strings in SSE delta, remove entirely before forwarding)
- [ ] **Tests:** Test loop with mock returning: text only, text + one tool call, text + multiple tool calls, tool call then text, multiple iterations of tool calls
- [ ] **Tests:** Test thinking token stripping edge cases
- [ ] **Snapshot tests:** Snapshot the sequence of events emitted by the loop for each scenario

### Step 3: Steering Queue

- [ ] Implement concurrent-safe steering queue
- [ ] Wire into server routes
- [ ] **Tests:** Test steer mid-loop, steer when idle, multiple steers queued, steer ignored after done

### Step 4: SQLite Persistence + Migration System

**Migration system design:**
- Migrations are numbered SQL files in `migrations/`: `001-create-messages.sql`, `002-create-preferences.sql`, etc.
- A `schema_migrations` table tracks applied migration versions
- `runMigrations(db, migrationsDir)` reads pending migrations, executes them in order within a transaction
- If a migration fails, the transaction rolls back and the app fails to start (fail fast)
- `initDb(path)` calls `runMigrations` automatically on startup
- To create a new migration: add a numbered `.sql` file, it runs on next startup

- [ ] Create migration files:
  - `migrations/001-create-schema-migrations.sql` — schema_migrations table (version INTEGER PRIMARY KEY, applied_at TEXT)
  - `migrations/002-create-messages.sql` — messages table (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tool_calls_json TEXT, tool_call_id TEXT, created_at TEXT)
  - `migrations/003-create-preferences.sql` — preferences table (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)
  - `migrations/004-create-usage-tracking.sql` — daily_usage table (date TEXT, feature TEXT, count INTEGER, PRIMARY KEY(date, feature))
- [ ] Implement migration runner in `db.ts`:
  - `runMigrations(db)` — reads `migrations/` dir sorted, checks `schema_migrations`, runs pending in a transaction
  - Migration files are plain SQL, no templating, no DSL
- [ ] Implement data access functions:
  - `saveMessage(sessionId, role, content, toolCalls?, toolCallId?)`
  - `getMessages(sessionId)` — get conversation history
  - `savePreference(key, value)` — store user preference
  - `getPreferences()` — get all preferences as object
  - `trackUsage(feature)` — increment daily usage count
  - `getUsageToday()` — get today's usage counts for all features
- [ ] DB file stored in `data/hallucygenie.db` (container volume mount)
- [ ] **Tests:** Test migration runner with `:memory:` databases — fresh DB gets all migrations, partially migrated DB gets only pending, failed migration rolls back cleanly
- [ ] **Tests:** Test all CRUD operations with `:memory:` databases
- [ ] **Tests:** Edge cases — empty DB, large messages, special characters, concurrent access
- [ ] **Snapshot tests:** Snapshot message history JSON output, schema state after each migration

### Step 5: Quota Enforcement

**MiniMax daily quotas (Plus-Highspeed plan):**
- Speech 2.8: 9,000 characters/day
- Image gen: 100 images/day
- Music gen: 100 songs/day

- [ ] Before executing a tool, check `getUsageToday()` against limits
- [ ] If approaching limit (>80%), add a warning to the tool result: "⚠️ You've used X of Y today"
- [ ] If at limit, return a friendly error: "You've used all your images for today! They reset tomorrow 🌅"
- [ ] After successful tool execution, call `trackUsage(feature)` to increment
- [ ] **Tests:** Test quota check logic: under limit, at 80% warning, at limit blocked, daily reset

### Step 6: Wire Into Server

- [ ] Modify `server.ts` to use agent loop, steering, and persistence
- [ ] Add `GET /api/history` endpoint
- [ ] Add `GET /api/usage` endpoint returning today's quota usage
- [ ] Validate `X-Session-Id` header on all API routes
- [ ] Inject system prompt into agent loop
- [ ] **Tests:** Integration tests hitting the real server (with mocked MiniMax) — end-to-end request → response flow
- [ ] **Snapshot tests:** Snapshot full SSE streams for chat scenarios

### Step 7: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on agent.ts, tools.ts, db.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill surviving mutants

## Completion Criteria

- [ ] Agent loop executes tools and feeds results back
- [ ] Image, TTS, music tools work end-to-end
- [ ] Audio returned as `data:audio/mp3;base64,...` data URLs
- [ ] Thinking tokens (`<think_intended>...</think_intended>`) stripped from output
- [ ] Steering queue works
- [ ] Messages and preferences persist in SQLite
- [ ] Quota tracking warns at 80% and blocks at 100%
- [ ] `X-Session-Id` validated on all API routes
- [ ] System prompt is concise and kid-friendly
- [ ] `just test` passes all tests
- [ ] `just test-coverage` → 100% on agent.ts, tools.ts, db.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Snapshot tests for tool results and event sequences

## Git Commit Convention

- **Implementation:** `feat(HG-004): agent loop, tools, and persistence`
- **Checkpoints:** `checkpoint: HG-004 description`

## Do NOT

- Implement the frontend (HG-005)
- Use frameworks or libraries beyond Bun built-ins
- Create classes
- Call real MiniMax API in tests
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
