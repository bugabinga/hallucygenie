# Task: HG-012 — Token-Based Context Window

**Created:** 2026-04-18
**Iteration:** 1
**Current Step:** Step 1: Implement token estimation and context builder
**Last Updated:** 2026-04-18
**Size:** S

## Step Progress

### Step 1: Implement token estimation and context builder
**Status:** 🟡 In Progress

- [x] Implement `estimateTokens(message: ChatMessage): number` in agent.ts — chars/4 for text, thinking, tool call names+args, tool result content; ~1200 per image
- [x] Implement `buildContext(messages: ChatMessage[], maxTokens = 200000): ChatMessage[]` in agent.ts — walk backward, keep tool_use+tool_result pairs together, always include first system message
- [x] Export both functions from agent.ts

### Step 2: Wire into server.ts
**Status:** ✅ Complete

- [x] In `handleChat()`, after loading messages from DB, call `buildContext(messages)` before sending to agent loop
- [x] Log when context is trimmed: `reqLog.info("context trimmed", { totalMessages, keptMessages, estimatedTokens })`

### Step 3: Test
**Status:** ⬜ Not Started

- [ ] Test `estimateTokens()` with various message types (text, thinking, tool_use, tool_result)
- [ ] Test `buildContext()` with: empty array, under-limit (no trimming), at-limit (exact fit), over-limit (trimming happens), tool pairs kept together
- [ ] `just test` passes all tests

## Discoveries

| # | What | Impact | Step |
|---|------|--------|------|
| 2026-04-18 23:23 | Task started | Runtime V2 lane-runner execution |
| 2026-04-18 23:26 | Review R001 | plan Step 1: APPROVE |
