# Task: HG-011 — Prompt Caching

**Created:** 2026-04-18
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Small additive change on top of Anthropic endpoint. No security impact.
**Score:** 2/8 — Blast radius: 1 (agent.ts only), Pattern novelty: 1 (new caching pattern), Security: 0, Reversibility: 0

## Mission

Enable MiniMax prompt caching on the Anthropic endpoint. Add `cache_control: {type: "ephemeral"}` to system prompt and tool definitions. Track cache hit/miss via structured logger. Saves latency and token processing on every request.

**Why:** System prompt + tool definitions are identical across all requests. Without caching, MiniMax re-processes ~2K tokens every time. With caching, that prefix is read from cache (5-min TTL).

## Dependencies

- **Task:** HG-010 (Anthropic migration must be complete)

## Context to Read First

- `agent.ts` — after HG-010, the Anthropic request builder
- `log.ts` — structured logger

## Key Reference

Cache breakpoints go on content blocks:
```json
"system": [{"type": "text", "text": "...system prompt...", "cache_control": {"type": "ephemeral"}}],
"tools": [..., last_tool_with_cache_control]
```

Usage response:
```json
"usage": {
  "input_tokens": 21,
  "output_tokens": 100,
  "cache_creation_input_tokens": 2000,
  "cache_read_input_tokens": 0
}
```
Second request: `cache_read_input_tokens: 2000, cache_creation_input_tokens: 0`.

Rules:
- Max 4 `cache_control` breakpoints per request
- 5-minute TTL from last hit
- Cache hierarchy: tools → system → messages

## File Scope

- `agent.ts` — add `cache_control` to system block and tool definitions
- `agent.test.ts` — test cache markers in request

## Steps

### Step 1: Add cache markers to request

- [ ] Add `cache_control: {type: "ephemeral"}` to system prompt content block
- [ ] Add `cache_control: {type: "ephemeral"}` to last tool definition in the tools array
- [ ] (Optional) Add `cache_control` to last user message for conversation caching — only if conversation history is stable

### Step 2: Log cache performance

- [ ] After each streaming response completes, log `cache_creation_input_tokens` and `cache_read_input_tokens` from the final `message_delta` event
- [ ] Use structured logger: `reqLog.info("cache stats", { cacheRead, cacheCreation })`

### Step 3: Test

- [ ] Verify `cache_control` appears in built request body (unit test with mock)
- [ ] `just test` passes all tests

## Do NOT

- Change browser SSE protocol
- Add caching to OpenAI endpoint (it doesn't support it)
- Overcomplicate — this is ~20 lines of code
- Modify `server.ts`, `public/app.ts`, `tools.ts`, or `db.ts`

## Must Update

- `Tasks/CONTEXT.md` — update test coverage

## Check If Affected

- `server.ts` — should NOT change
- `tools.ts` — should NOT change (cache_control goes on tools array in agent.ts, not tool definitions)

## Git Commit Convention

```
HG-011: enable prompt caching on Anthropic endpoint

- Add cache_control to system prompt and tool definitions
- Log cache hit/miss stats via structured logger
- Co-authored-by: task-agent
```

## Amendments
