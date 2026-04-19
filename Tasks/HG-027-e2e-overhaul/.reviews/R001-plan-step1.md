## Plan Review: Step 1 — Install nock

### Verdict: APPROVE

### Summary
Step 1 is a single action: `npm install --save-dev nock @types/nock`. This is straightforward and correct. nock v14.0.12 supports intercepting Node.js v25's native `fetch()` (undici-based), which is what the codebase uses for all MiniMax API calls.

### Issues Found
None blocking. Step 1 is a trivial dependency installation.

### Observations (for downstream steps, not blocking this one)

1. **`@types/nock` is a stub** — Version 11.1.0 is just a stub package (description: "Stub TypeScript definitions entry for nock, which provides its own types definitions"). Installing it is harmless but unnecessary since nock v14 ships its own types. Not blocking, just noting it.

2. **PROMPT.md mock endpoints are wrong** — The PROMPT.md example code uses incorrect API paths that the worker will need to fix in Step 2:
   - Chat mock uses `/v1/text/chatcompletion_v2` but `agent.ts:413` calls `/anthropic/v1/messages`
   - Web search mock uses `/v1/search` but `tools.ts:313` calls `/v1/coding_plan/search`
   - SSE format in PROMPT.md is OpenAI-style but agent expects Anthropic-style (`event: content_block_delta` + `data: {"delta":{"type":"text_delta","text":"..."}}`)
   - The `tools.ts` and `server.ts` both export `MINIMAX_BASE`, and the server also calls `/v1/token_plan/remains` for quota — this endpoint also needs mocking

   These are Step 2 concerns. The worker's STATUS.md Discovery D2 already notes the Anthropic format mismatch, so they're aware. Just flagging for completeness.

3. **Current E2E uses static file server** — The existing `test-e2e` justfile recipe serves `public/` via `e2e/static-server.ts` (a simple static file server with no API routes). Step 3 plans to switch to the real server. This is the right approach but means tests currently have no server-side API at all — something the worker already knows from the STATUS.md architecture diagram.

### Suggestions
- None for this step. It's just `npm install`.
