---
{ "status": "fixed", "specs": ["HG-SPEC-021"] }
---

Repro: `bun scripts/verify-new-specs.ts` absent; HG-SPEC-021 checks were manual/test-backed.

Cause: Voice used sync `text_to_speech` only. No async task state, polling, retrieval, bundle extraction, or long-text context compaction existed.

Fix:

- Added Create Narration tab beside Voice.
- Added `generate_long_speech` async MiniMax TTS tool.
- Wired `/v1/t2a_async_v2`, `/v1/query/t2a_async_query_v2`, `/v1/files/retrieve`, provider download.
- Added durable `async_tts_tasks` state.
- Added tar bundle audio extraction before asset save.
- Saved audio assets with compact text summary/voice/model params.
- Kept full long text, raw audio bytes/base64, provider URLs, and provider bundles out of messages/history/model context.

Proof:

- `bun test test/unit/tools.test.ts test/unit/server.test.ts test/unit/db.test.ts test/unit/app.test.ts test/unit/static.test.ts`
- `just typecheck`
- `just build-check`
