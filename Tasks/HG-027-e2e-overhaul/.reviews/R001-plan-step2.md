## Plan Review: Step 2 — Create MiniMax Mock (`e2e/minimax-mock.ts`)

### Verdict: APPROVE

### Summary
The plan to create a nock-based mock file covering all MiniMax endpoints is sound. The STATUS.md checkbox correctly lists all 7 endpoints (chat, image, TTS, music, web search, vision, quota). The worker has access to the codebase and STATUS.md discoveries (D1–D5) that flag key format differences. The Step 1 review confirmed nock v14 supports Node.js v25 native fetch.

### Issues Found
None blocking.

### Critical Implementation Gotchas (for the worker, not blocking)

The PROMPT.md example code has **several incorrect endpoint paths and response shapes**. The worker must derive mocks from the actual codebase, NOT copy the PROMPT.md example verbatim. Specific mismatches:

1. **Chat endpoint** — PROMPT.md shows `POST /v1/text/chatcompletion_v2`, but `agent.ts:413` calls `POST /anthropic/v1/messages`
2. **Chat SSE format** — PROMPT.md uses OpenAI-style chunks. The agent expects Anthropic SSE events: `event: content_block_start`, `event: content_block_delta` with `delta.type` of `text_delta`/`thinking_delta`/`input_json_delta`, `event: message_delta` with `stop_reason`. Discovery D2 notes this.
3. **Image response** — PROMPT.md returns `{data:[{image_url:"..."}]}`. `tools.ts:168` expects `{data:{image_urls:["..."]}}` (nested `image_urls` array, not `image_url` string)
4. **TTS response** — PROMPT.md returns `{data:{audio_file:"",audio_url:"..."}}`. `tools.ts:228` expects `{data:{audio:"<hex_string>"}}` — must be hex-encoded audio, since `tools.ts:235` does `Buffer.from(hex,"hex").toString("base64")`
5. **Music response** — PROMPT.md returns `{data:[{audio_url:"..."}]}`. `tools.ts:289` expects `{data:{audio:"<hex_string>"}}` — same hex requirement as TTS
6. **Web search endpoint** — PROMPT.md shows `POST /v1/search`. `tools.ts:313` calls `POST /v1/coding_plan/search`
7. **Web search response** — PROMPT.md returns `{data:{results:[...]}}`. `tools.ts:323` expects `{organic:[{title,link,snippet}]}` at top level
8. **Missing vision mock** — `tools.ts:344` calls `POST /v1/coding_plan/vlm`, response: `{content:"...",base_resp:{status_code:0}}`
9. **Missing quota mock** — `server.ts:439` calls `GET /v1/token_plan/remains`, response: `{model_remains:[{model_name,current_interval_total_count,current_interval_usage_count,remains_time}]}` — must include entries for `"MiniMax-M"`, `"speech-hd"`, `"image-01"`, `"music-2.6"` (Discovery D5 notes `/api/quota` is fetched on init)
10. **Auth headers** — Chat uses `x-api-key` header. All other endpoints use `Authorization: Bearer`. nock interceptors should match the correct headers.

### Missing Items
None. The STATUS.md checkbox covers all 7 endpoints. The 7 endpoints match every `fetch()` call in the codebase.

### Suggestions
- Consider using `nock.persist()` for endpoints that every test needs (chat, quota), and per-test `.reply()` for tool endpoints only needed in specific tests
- The TTS/Music hex values can be short (e.g., `"FF00FF"`) — just enough for `Buffer.from(hex, "hex")` to produce valid base64
- Chat mock should produce a minimal valid Anthropic SSE stream: `message_start` → `content_block_start` (type: text) → `content_block_delta` (text_delta) → `content_block_stop` → `message_delta` (stop_reason: end_turn) → `message_stop`
