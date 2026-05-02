# HG-ISSUE-005: Create music fails with tool id not found

**Status:** fixed  
**Severity:** high  
**Area:** Create → music / agent tool-result loop  
**Devil verdict:** confirmed same umbrella bug as image/voice

## Repro

From app UI:

```text
Create -> music
Generate music: electro funk stargate lullaby. Lyrics: booo boo bo bo booobo bo
```

## Actual

Assistant returns error:

```text
[Error: API returned 400: {"type":"error","error":{"type":"invalid_request_error","message":"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)"},"request_id":"0643226da3d4247790a160c2fbe725d7"}]
```

## Expected

Music generation tool runs and returns audio result, or returns local tool error without breaking next MiniMax chat request.

## Devil review

Do not fix this in music wrapper first. Error is from MiniMax chat endpoint rejecting tool result ids, not from `/v1/music_generation` directly.

Same failure class:

- image: `HG-ISSUE-001`
- voice: `HG-ISSUE-006`

The immediate bug likely happens after tool execution when agent sends follow-up Anthropic-compatible messages.

## Likely causes to investigate

1. Missing matching assistant `tool_use` in context for `tool_result`.
2. Tool result sent in wrong role/order.
3. History trimming drops tool_use but keeps tool_result.
4. Message persistence stores tool result separately and reload/history rebuild breaks pair.
5. MiniMax expects different `tool_use_id` field/name than Anthropic.
6. Multiple Create attempts reuse stale `call_function_*` id.

## Required fix direction

- Add outbound MiniMax payload snapshot/log in test mode with tool ids redacted/safe.
- Create a regression fixture using exact `call_function_ynt4kuk8nlse_1` style id.
- Ensure context builder keeps tool_use/tool_result pair atomically.
- If pair cannot be kept, drop both, not just one.
- Surface upstream SSE errors cleanly and log them.

## Tests required

- Unit: buildContext never returns orphan tool_result.
- Unit: toAnthropicPayload emits valid tool_use/tool_result pairing/order.
- Unit: context trimming drops pair atomically.
- Integration: mocked music tool flow completes.
- E2E: Create → music happy path and failed path.

## Logs

Checked `logs/dev.log` on 2026-05-01.

Recent chat request around report:

```json
{"level":"debug","msg":"request received","time":"2026-05-01T00:10:20.581Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T00:10:20.586Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat","status":200}
```

Search found no `invalid params`, `tool id`, `call_function`, `music_generation`, or `generate_music` log lines. Error likely streamed inside SSE body but not logged server-side.

## Fix

Implemented 2026-05-01 via shared agent/server mitigation:

- MiniMax `tool id not found (2013)` errors are detected and logged.
- Tool result cards remain visible; scary upstream error text is suppressed.
- Saved historical tool protocol rows are not replayed to MiniMax.
- Regression coverage added for exact `call_function_*` id shape.

## Related

- `HG-ISSUE-001`
- `HG-ISSUE-006`
