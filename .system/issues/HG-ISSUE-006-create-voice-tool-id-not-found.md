# HG-ISSUE-006: Create voice fails with tool id not found

**Status:** fixed  
**Severity:** high  
**Area:** Create → voice / agent tool-result loop  
**Devil verdict:** confirmed same umbrella bug as image/music

## Repro

From app UI:

```text
Create -> voice
Read this out loud: hi mommy, hold me tight (speed: 1.0x)
```

## Actual

Assistant returns error:

```text
[Error: API returned 400: {"type":"error","error":{"type":"invalid_request_error","message":"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)"},"request_id":"064322973087fec5d19b3c31be8eb2e8"}]
```

## Expected

TTS tool runs and returns voice audio result, or returns local tool error without breaking next MiniMax chat request.

## Devil review

This is not a TTS endpoint/model issue yet. The observed error comes from the MiniMax chat endpoint complaining about tool result id pairing.

Same failure class:

- image: `HG-ISSUE-001`
- music: `HG-ISSUE-005`
- voice: this issue

Fix agent/tool-result payload first. Only then test TTS params/model behavior.

## Likely causes to investigate

1. `tool_result` references `call_function_*` id not present in messages sent to MiniMax.
2. History reload includes result but not originating assistant tool call.
3. Context trimming breaks pair.
4. TTS tool result type/content wrapped in unsupported format after execution.
5. Error from prior tool call poisons later conversation state.

## Required fix direction

- Add MiniMax SSE `error` event logging.
- Add exact outbound payload regression for voice tool call.
- Ensure tool results are paired and ordered correctly.
- After fix, verify real TTS wrapper still uses `speech-2.8-hd` and valid auth.

## Tests required

- Unit: voice tool call pair survives context build.
- Unit: TTS tool result converted into valid Anthropic `tool_result` content.
- Unit: orphan tool_result impossible after history build/trimming.
- Integration: mocked voice tool flow completes.
- E2E: Create → voice happy path and failed path.

## Logs

Checked `logs/dev.log` on 2026-05-01.

Recent chat request around report:

```json
{"level":"debug","msg":"request received","time":"2026-05-01T00:11:03.696Z","service":"hallucygenie","reqId":"000009","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T00:11:03.707Z","service":"hallucygenie","reqId":"000009","method":"POST","path":"/api/chat","status":200}
```

Search found no `invalid params`, `tool id`, `call_function`, `text_to_speech`, `TTS`, `t2a`, or `speech` log lines. Error likely streamed inside SSE body but not logged server-side.

## Fix

Implemented 2026-05-01 via shared agent/server mitigation:

- MiniMax `tool id not found (2013)` errors are detected and logged.
- Tool result cards remain visible; scary upstream error text is suppressed.
- Saved historical tool protocol rows are not replayed to MiniMax.
- Regression coverage added for exact `call_function_*` id shape.

## Related

- `HG-ISSUE-001`
- `HG-ISSUE-005`
