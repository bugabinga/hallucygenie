# HG-ISSUE-001: Create image fails with tool id not found

**Status:** fixed  
**Severity:** high  
**Area:** Create → image / agent tool-result loop  
**Devil verdict:** confirmed symptom, likely umbrella bug across all media tools

## Repro

From app UI:

```text
Create -> image
Generate an image: pixel viking woman (aspect ratio 16:9)
```

## Actual

Assistant returns error:

```text
[Error: API returned 400: {"type":"error","error":{"type":"invalid_request_error","message":"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)"},"request_id":"064320adecd09b534e4c18f5de710fb0"}]
```

## Expected

Image generation tool runs and returns image result, or returns local tool error without breaking next MiniMax chat request.

## Devil review

This should not be treated as an image-tool-only failure.

Same MiniMax error is reproduced for:

- image: this issue
- music: `HG-ISSUE-005`
- voice: `HG-ISSUE-006`

Likely root cause: malformed Anthropic-compatible tool result payload/history after any tool call.

Critical clues:

- HTTP route returns `200`; error is inside streamed SSE text.
- All failures reference same style id: `call_function_*`.
- Server logs do not capture upstream SSE error body.
- Current tests probably mock happy-path tool ids too leniently.

## Likely causes to investigate

1. `tool_result` message sent without matching prior assistant `tool_use` in same request context.
2. Persisted history stores tool result but omits matching assistant tool call.
3. `tool_call_id` vs MiniMax `call_function_*` id mismatch.
4. Consecutive tool results are coalesced incorrectly in `toAnthropicPayload()`.
5. Tool result role/content format differs from MiniMax Anthropic compatibility expectations.
6. Create prompt path triggers a new turn that reuses stale tool result history.

## Required fix direction

- Add logging for MiniMax SSE `error` events and non-2xx bodies before fixing.
- Add regression test with exact MiniMax error shape.
- Inspect actual outbound Anthropic payload after tool execution.
- Ensure every `tool_result` has matching assistant `tool_use` in context.
- If MiniMax requires tool_result immediately after tool_use, preserve turn grouping exactly.

## Tests required

- Unit: `toAnthropicPayload()` preserves assistant `tool_use` + user `tool_result` pairs.
- Unit: orphan/stale `tool_result` is dropped or repaired before API request.
- Unit: MiniMax SSE `error` event is logged and surfaced cleanly.
- Integration: image tool call with mocked MiniMax flow completes without `tool id not found`.
- E2E: Create → image happy path.

## Logs

Checked `logs/dev.log` on 2026-05-01.

Relevant recent chat requests:

```json
{"level":"debug","msg":"request received","time":"2026-04-30T23:55:01.272Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-04-30T23:55:01.291Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T00:02:52.212Z","service":"hallucygenie","reqId":"000007","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T00:02:52.224Z","service":"hallucygenie","reqId":"000007","method":"POST","path":"/api/chat","status":200}
```

No exact `invalid params`, `tool id`, `call_function`, or `generate_image` log lines found. Error likely streamed inside SSE response body but not currently logged server-side.

Secondary observation: earlier `just clean` left server running without `public/app.js`, producing repeated `/app.js` 404s until `just dev` rebuilt bundle.

## Fix

Implemented 2026-05-01:

- MiniMax `tool id not found (2013)` errors are detected and logged.
- Tool result id errors no longer stream scary error text after tool result card is emitted.
- Saved historical tool protocol rows are not replayed back to MiniMax on later chat turns.
- Regression coverage added in `test/agent.test.ts` and `test/server.test.ts`.

## Related

- `HG-ISSUE-005`
- `HG-ISSUE-006`
- `HG-SPEC-006` depends on this class of bug being fixed.
