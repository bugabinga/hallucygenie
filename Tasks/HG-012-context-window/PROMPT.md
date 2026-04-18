# Task: HG-012 — Token-Based Context Window

**Created:** 2026-04-18
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Pure additive — new function + one call site change. No security impact.
**Score:** 2/8 — Blast radius: 1 (agent.ts + server.ts), Pattern novelty: 1 (new token estimation), Security: 0, Reversibility: 0

## Mission

Add token-based context window management. Currently `server.ts` loads ALL messages from DB and sends them to the API. If a session has hundreds of messages, this blows the 204,800 token context window.

Add `estimateTokens()` (chars/4 heuristic, same as pi coding agent) and `buildContext()` that walks backward from newest messages, keeping tool_use/tool_result pairs intact, and caps at a configurable limit.

**Why:** Safety net. Kid could chat for hours. Tool results with images/audio are large. Invisible to the kid — context just keeps working.

## Dependencies

- **Task:** HG-010 (Anthropic migration must be complete — message format changes)

## Context to Read First

- `agent.ts` — after HG-010, message format and types
- `server.ts` — current `handleChat()` where messages are loaded and sent
- `db.ts` — `getMessages()` returns all messages for a session

## Key Reference

From pi coding agent's `estimateTokens()`:
```ts
function estimateTokens(message) {
  let chars = 0;
  // count chars in text content, thinking, tool calls, tool results
  return Math.ceil(chars / 4);
}
```

Context window for M2.7-highspeed: **204,800 tokens**.
Reserve 4,096 for model output.
Cap input at **200,000 tokens**.

## File Scope

- `agent.ts` — add `estimateTokens()`, `buildContext()`, export them
- `server.ts` — replace `getMessages()` → `buildContext()` in `handleChat()`
- `agent.test.ts` — test token estimation and context building
- `server.test.ts` — test integration

## Steps

### Step 1: Implement token estimation and context builder

- [ ] Add `estimateTokens(message: ChatMessage): number` — chars/4 for text content, thinking content, tool call names+args, tool result content. Images ~1200 tokens each.
- [ ] Add `buildContext(messages: ChatMessage[], maxTokens = 200000): ChatMessage[]` — walk backward, accumulate estimated tokens, stop before exceeding limit
- [ ] Keep tool_use + tool_result pairs together — never split mid-turn (if cutting would orphan a tool_result, include its tool_use)
- [ ] Always include the first system message in the count (it's mandatory)
- [ ] Export both functions

### Step 2: Wire into server.ts

- [ ] In `handleChat()`, after loading messages from DB, call `buildContext(messages)` before sending to agent loop
- [ ] Log when context is trimmed: `reqLog.info("context trimmed", { totalMessages, keptMessages, estimatedTokens })`

### Step 3: Test

- [ ] Test `estimateTokens()` with various message types (text, thinking, tool_use, tool_result)
- [ ] Test `buildContext()` with: empty array, under-limit (no trimming), at-limit (exact fit), over-limit (trimming happens), tool pairs kept together
- [ ] `just test` passes all tests

## Do NOT

- Delete messages from DB — only trim what's sent to API
- Summarize old messages — that's a future optimization, not this task
- Change the DB schema
- Add tiktoken or any dependency — chars/4 is good enough
- Modify `public/app.ts` — kid never sees this

## Must Update

- `Tasks/CONTEXT.md` — update test coverage

## Check If Affected

- `db.ts` — should NOT change
- `tools.ts` — should NOT change
- `public/app.ts` — should NOT change

## Git Commit Convention

```
HG-012: add token-based context window management

- estimateTokens() with chars/4 heuristic
- buildContext() walks backward, keeps tool pairs intact
- Wired into server.ts handleChat()
- Co-authored-by: task-agent
```

## Amendments
