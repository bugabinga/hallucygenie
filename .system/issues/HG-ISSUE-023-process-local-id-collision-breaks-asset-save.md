# HG-ISSUE-023 — Process-local IDs collide after restart and break asset saving

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/server.ts`, `src/log.ts`, `src/db.ts`
**Related:** `HG-ISSUE-011-generated-images-not-in-assets.md`, `HG-ISSUE-014-reload-history-missing-thinking-and-tool-output.md`

## Description

After Create→Image, the tool was invoked but the generated image was not saved/displayed as an asset. The UI received an error tool result:

```text
Error: Couldn't save generated image. Try again.
```

This is a new issue, not covered by existing image/tool-card issues. Existing `HG-ISSUE-011` covers MiniMax returning external image URLs and the need to download them into local assets. That fix path now reaches asset saving, but saving can fail because asset IDs are generated from a process-local request counter.

## Evidence

### Log excerpt

From `logs/dev.log`:

```json
{"level":"debug","msg":"request received","time":"2026-05-01T22:48:25.907Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T22:48:25.927Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat","status":200}
{"level":"warn","msg":"asset save failed","time":"2026-05-01T22:48:40.693Z","service":"hallucygenie","toolName":"generate_image","error":"SQLiteError: UNIQUE constraint failed: assets.id"}
```

### DB conversation excerpt

From `data/hallucygenie.db`:

```json
[
  {
    "id": 9,
    "role": "tool",
    "chars": 48,
    "head": "Error: Couldn't save generated image. Try again.",
    "tool_call_id": "direct_000007",
    "created_at": "2026-05-01 22:48:40"
  },
  {
    "id": 8,
    "role": "assistant",
    "chars": 0,
    "tool_calls_json": "[{\"id\":\"direct_000007\",\"name\":\"generate_image\",\"input\":{\"aspect_ratio\":\"16:9\",\"prompt\":\"fat mermaid dancing in the moonlight\"}}]",
    "created_at": "2026-05-01 22:48:40"
  },
  {
    "id": 7,
    "role": "user",
    "head": "Use generate_image with prompt: fat mermaid dancing in the moonlight\nTool params: aspect_ratio=16:9",
    "created_at": "2026-05-01 22:48:25"
  },
  {
    "id": 3,
    "role": "tool",
    "head": "/asset/000008?s=65d2206f-99f6-4681-9d80-235209acad71",
    "tool_call_id": "direct_000007",
    "created_at": "2026-05-01 21:49:44"
  }
]
```

Existing asset row:

```json
[
  {
    "id": "000008",
    "type": "image",
    "filename": "000008.jpg",
    "prompt": "mad grandma hitting grandsom in the face",
    "tool_name": "generate_image",
    "size_bytes": 239507,
    "created_at": 1777672184196
  }
]
```

## Root Cause Hypothesis

`nextReqId()` is documented as process-lifetime-only:

```ts
// 6-char hex, zero-padded. e.g. "00001a" — unique within a process lifetime
```

But `src/server.ts` uses it for durable IDs:

```ts
const toolCallId = `direct_${nextReqId()}`;
const assetId = nextReqId();
```

After server restart, the counter resets. The DB still contains old assets/messages, so new generated assets can reuse an existing `assets.id`. SQLite correctly rejects the insert:

```text
SQLiteError: UNIQUE constraint failed: assets.id
```

The same restart also reused `direct_000007` as a `tool_call_id` in the conversation history. That did not trigger a DB constraint, but it makes persisted tool history ambiguous and may interact badly with history/tool-card rehydration.

## Impact

- Create→Image can fail after restart even though MiniMax generation succeeded.
- User sees a broken/error tool output instead of image.
- New image is not saved to `assets` table or `data/assets`.
- Duplicate `tool_call_id` values can confuse persisted tool-call history.

## Not This

- Not `HG-ISSUE-012` "tool not used" — DB shows `generate_image` was invoked.
- Not the original `HG-ISSUE-011` root cause — external URL download path was reached; DB insert failed.
- Not MiniMax API failure — failure happened in local SQLite asset save.

## Possible Fixes

### A. Persistent asset IDs from DB sequence

Use an asset-specific durable generator that cannot reset across process restarts. Examples:

- SQLite autoincrement integer row → formatted asset ID
- insert first with generated durable ID from DB transaction
- retry on collision if using random IDs

### B. UUID/crypto random IDs for assets and direct tool calls

Use `crypto.randomUUID()` or short random IDs for persisted tool/asset IDs. Collision risk negligible. Simpler than coordinating with request IDs.

### C. Do not use `nextReqId()` outside request/log IDs

Keep `nextReqId()` only for logs/request correlation. Persistent DB IDs need their own generator.

## Recommendation

Fix with B or A, but keep it simple:

- asset IDs: random/UUID-derived, not request counter
- direct tool call IDs: random/UUID-derived or DB-backed
- add tests proving restart/counter reset cannot collide with existing DB rows

## Fix Applied

- `src/server.ts`
  - direct Create tool IDs now use `direct_${randomUUID()}` instead of `direct_${nextReqId()}`
  - asset IDs now use `asset_${randomUUID()}` instead of `nextReqId()`
  - `nextReqId()` remains request/log correlation only

## Tests Added

- `test/server.test.ts`
  - preloads DB with old asset id `000008`
  - runs Create→Image explicit directive
  - verifies new image saves successfully, old asset remains, new asset id is `asset_<uuid>`, direct tool id is `direct_<uuid>`
- `test/static.test.ts`
  - guards against reintroducing `const assetId = nextReqId()`
  - guards against reintroducing `` `direct_${nextReqId()}` ``

## Verification

- `bun test test/server.test.ts test/static.test.ts --timeout 30000` → 125 pass
- `just check` → pass
- `just test-unit` → pass (`316 pass` + `178 pass`)
