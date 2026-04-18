# Task: HG-010 — Anthropic Endpoint Migration

**Created:** 2026-04-18
**Size:** L

## Step Progress

### Step 1: Rewrite agent.ts
**Status:** ⬜ Not Started
> ⚠️ Hydrate: Expand after reading current agent.ts streaming parser

- [ ] Change endpoint URL and auth header
- [ ] Rewrite request body to Anthropic format
- [ ] Rewrite streaming parser for Anthropic SSE events
- [ ] Handle thinking_delta, text_delta, input_json_delta
- [ ] Remove stripThinkingTokens() and THINK_* constants
- [ ] Wire tool results as tool_result content blocks

### Step 2: Rewrite tools.ts
**Status:** ⬜ Not Started

- [ ] Rename `parameters` → `input_schema` in tool definitions

### Step 3: Rewrite server.ts
**Status:** ⬜ Not Started

- [ ] System prompt as separate Anthropic param
- [ ] Messages in content block format
- [ ] Remove old thinking token code
- [ ] Add `event: thinking` SSE event to browser
- [ ] Keep browser SSE protocol unchanged

### Step 4: Simplify public/app.ts
**Status:** ⬜ Not Started

- [ ] Remove tag-parsing safety net (~30 lines)
- [ ] Add `event: thinking` handler
- [ ] Keep renderThinkingBlock()

### Step 5: Update all tests
**Status:** ⬜ Not Started
> ⚠️ Hydrate: Expand after Step 1-4 changes are known

- [ ] Update agent.test.ts for Anthropic format
- [ ] Update server.test.ts for new message building
- [ ] Update tools.test.ts for input_schema
- [ ] All tests pass

### Step 6: Live verification
**Status:** ⬜ Not Started

- [ ] `just test` passes
- [ ] `just dev` + live chat works
- [ ] Thinking blocks render
- [ ] Tool calling works
- [ ] Error handling works

## Discoveries

| # | What | Impact | Step |
|---|------|--------|------|
