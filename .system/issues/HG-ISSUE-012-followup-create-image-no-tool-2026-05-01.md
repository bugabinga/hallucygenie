# HG-ISSUE-012 follow-up real-service failure — 2026-05-01

**Status:** Fixed
**Severity:** High
**Related:** `HG-ISSUE-012-tool-output-cards-missing.md`, `HG-ISSUE-019-agent-rendered-images-too-large-need-markdown-sanitization.md`

Latest Create→Image produced assistant markdown image with no tool rows.

## Recent log excerpt

```json
{"level":"debug","msg":"request received","time":"2026-05-01T17:53:45.697Z","service":"hallucygenie","reqId":"00005b","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:53:45.707Z","service":"hallucygenie","reqId":"00005b","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:54:11.445Z","service":"hallucygenie","reqId":"00005c","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:54:11.456Z","service":"hallucygenie","reqId":"00005c","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:54:26.350Z","service":"hallucygenie","reqId":"00005d","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:54:26.361Z","service":"hallucygenie","reqId":"00005d","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:54:30.537Z","service":"hallucygenie","reqId":"00005f","method":"GET","path":"/api/quota"}
{"level":"debug","msg":"request received","time":"2026-05-01T17:54:30.537Z","service":"hallucygenie","reqId":"000060","method":"GET","path":"/asset/00005e?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:54:30.538Z","service":"hallucygenie","reqId":"000060","method":"GET","path":"/asset/00005e?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"info","msg":"response sent","time":"2026-05-01T17:54:30.814Z","service":"hallucygenie","reqId":"00005f","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:55:01.904Z","service":"hallucygenie","reqId":"000061","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:55:01.904Z","service":"hallucygenie","reqId":"000061","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:56:20.332Z","service":"hallucygenie","reqId":"000062","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:56:20.343Z","service":"hallucygenie","reqId":"000062","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:56:30.275Z","service":"hallucygenie","reqId":"000063","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:56:30.286Z","service":"hallucygenie","reqId":"000063","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:56:35.527Z","service":"hallucygenie","reqId":"000064","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:56:35.540Z","service":"hallucygenie","reqId":"000064","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:56:41.848Z","service":"hallucygenie","reqId":"000065","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:56:41.860Z","service":"hallucygenie","reqId":"000065","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:56:48.940Z","service":"hallucygenie","reqId":"000066","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:56:48.950Z","service":"hallucygenie","reqId":"000066","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:57:08.025Z","service":"hallucygenie","reqId":"000067","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:57:08.025Z","service":"hallucygenie","reqId":"000067","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T17:59:16.102Z","service":"hallucygenie","reqId":"000068","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T17:59:16.115Z","service":"hallucygenie","reqId":"000068","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:00:20.476Z","service":"hallucygenie","reqId":"00006a","method":"GET","path":"/api/quota"}
{"level":"debug","msg":"request received","time":"2026-05-01T18:00:20.476Z","service":"hallucygenie","reqId":"00006b","method":"GET","path":"/asset/000069?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:00:20.477Z","service":"hallucygenie","reqId":"00006b","method":"GET","path":"/asset/000069?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"info","msg":"response sent","time":"2026-05-01T18:00:21.129Z","service":"hallucygenie","reqId":"00006a","method":"GET","path":"/api/quota","status":200}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T18:00:23.721Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, context window exceeds limit (2013)\"},\"request_id\":\"06441d35439f4aa4a04c36fc090c300c\"}"}
{"level":"debug","msg":"request received","time":"2026-05-01T18:01:09.395Z","service":"hallucygenie","reqId":"00006c","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:01:09.395Z","service":"hallucygenie","reqId":"00006c","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:04:38.754Z","service":"hallucygenie","reqId":"000071","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:04:39.988Z","service":"hallucygenie","reqId":"000071","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:09:44.321Z","service":"hallucygenie","reqId":"000072","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:09:44.321Z","service":"hallucygenie","reqId":"000072","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:11:57.393Z","service":"hallucygenie","reqId":"000074","method":"GET","path":"/.well-known/appspecific/com.chrome.devtools.json"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:11:57.393Z","service":"hallucygenie","reqId":"000074","method":"GET","path":"/.well-known/appspecific/com.chrome.devtools.json","status":404}
{"level":"debug","msg":"request received","time":"2026-05-01T18:14:58.262Z","service":"hallucygenie","reqId":"000075","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:14:58.274Z","service":"hallucygenie","reqId":"000075","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:15:01.702Z","service":"hallucygenie","reqId":"000076","method":"GET","path":"/api/quota"}
{"level":"debug","msg":"request received","time":"2026-05-01T18:15:01.702Z","service":"hallucygenie","reqId":"000077","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:15:01.703Z","service":"hallucygenie","reqId":"000077","method":"GET","path":"/assets","status":200}
{"level":"info","msg":"response sent","time":"2026-05-01T18:15:02.434Z","service":"hallucygenie","reqId":"000076","method":"GET","path":"/api/quota","status":200}
{"level":"warn","msg":"tool execution failed","time":"2026-05-01T18:22:43.616Z","service":"agent","toolName":"generate_image","error":"Error: boom"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T18:22:43.626Z","service":"agent","status":500,"error":"Internal Server Error"}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T18:22:43.626Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)\"}}"}
{"level":"debug","msg":"request received","time":"2026-05-01T18:23:59.136Z","service":"hallucygenie","reqId":"00007c","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:24:00.028Z","service":"hallucygenie","reqId":"00007c","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:24:24.953Z","service":"hallucygenie","reqId":"000081","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:24:25.192Z","service":"hallucygenie","reqId":"000081","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:24:44.333Z","service":"hallucygenie","reqId":"000086","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:24:44.669Z","service":"hallucygenie","reqId":"000086","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:24:45.510Z","service":"hallucygenie","reqId":"000087","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:24:45.658Z","service":"hallucygenie","reqId":"000087","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:25:06.381Z","service":"hallucygenie","reqId":"00008c","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:25:06.625Z","service":"hallucygenie","reqId":"00008c","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:25:07.563Z","service":"hallucygenie","reqId":"00008d","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:25:07.713Z","service":"hallucygenie","reqId":"00008d","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:26:24.979Z","service":"hallucygenie","reqId":"00008e","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:26:25.249Z","service":"hallucygenie","reqId":"00008e","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:26:33.822Z","service":"hallucygenie","reqId":"000093","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:26:34.136Z","service":"hallucygenie","reqId":"000093","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:26:50.726Z","service":"hallucygenie","reqId":"000094","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:26:50.739Z","service":"hallucygenie","reqId":"000094","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:42:00.280Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:42:01.134Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:42:18.396Z","service":"hallucygenie","reqId":"00000a","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:42:18.680Z","service":"hallucygenie","reqId":"00000a","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:42:19.574Z","service":"hallucygenie","reqId":"00000b","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:42:19.593Z","service":"hallucygenie","reqId":"00000b","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:46:12.876Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:46:13.895Z","service":"hallucygenie","reqId":"000005","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:46:14.053Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:46:14.064Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:46:29.368Z","service":"hallucygenie","reqId":"000007","method":"GET","path":"/api/quota"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:46:29.975Z","service":"hallucygenie","reqId":"000007","method":"GET","path":"/api/quota","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:50:03.200Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:50:03.211Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat","status":200}
```

## DB excerpt

```json
{"id":6,"role":"assistant","content":"Here's your image:\n\n![Coder with big muscles coding a girly app](http://hailuo-image-algeng-data-us.oss-us-east-1.aliyuncs.com/image_inference_output%2Ftalkie%2Fprod%2Fimg%2F2026-05-02%2Ffc3afc75-7d7e-41c8-9edc-2a8fbf6cfd1a_aigc.jpeg?Expires=1777747631&OSSAccessKeyId=LTAI5tRDTcyEYLLuBEpJRwCi&Signature=RV2qV0b5pX6Jf7eT3hB0yL3mWzM%3D)","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 18:50:06"}
{"id":5,"role":"user","content":"Use generate_image with prompt: coder with big muscles coding a girly app\nTool params: aspect_ratio=16:9","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 18:50:03"}
{"id":4,"role":"assistant","content":"Here's your image:\n\n![Agent harness with evil laugh](http://hailuo-image-algeng-data-us.oss-us-east-1.aliyuncs.com/image_inference_output%2Ftalkie%2Fprod%2Fimg%2F2026-05-02%2F8ad29950-87e5-46ca-b615-03a89363acfa_aigc.jpeg?Expires=1777747588&OSSAccessKeyId=LTAI5tRDTcyEYLLuBEpJRwCi&Signature=qfvIt49EDzXqn1qV8TmFueS4iSY%3D)","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 18:46:31"}
{"id":3,"role":"tool","content":"http://hailuo-image-algeng-data-us.oss-us-east-1.aliyuncs.com/image_inference_output%2Ftalkie%2Fprod%2Fimg%2F2026-05-02%2F8ad29950-87e5-46ca-b615-03a89363acfa_aigc.jpeg?Expires=1777747588&OSSAccessKeyId=LTAI5tRDTcyEYLLuBEpJRwCi&Signature=qfvIt49EDzXqn1qV8TmFueS4iSY%3D","tool_calls_json":null,"tool_call_id":"call_function_ml5vruhaoaqg_1","created_at":"2026-05-01 18:46:31"}
{"id":2,"role":"assistant","content":"","tool_calls_json":"[{\"id\":\"call_function_ml5vruhaoaqg_1\",\"name\":\"generate_image\",\"input\":{\"prompt\":\"agent harness with optimal evil laugh\",\"aspect_ratio\":\"16:9\"}}]","tool_call_id":null,"created_at":"2026-05-01 18:46:31"}
{"id":1,"role":"user","content":"Use generate_image with prompt: agent harness with optimal evil laugh\nTool params: aspect_ratio=16:9","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 18:46:14"}
assets []
```

## Fix applied

- Explicit `Use generate_image|generate_music|text_to_speech ...` Create directives now bypass chat model and execute the tool directly.
- Direct path emits `tool_start` → `tool_result` → `[DONE]`, saves assistant tool-call row + tool row, tracks usage.
- Assistant media markdown is stripped before history replay/save so previous `![...](hailuo-image...)` replies cannot poison future turns.
- Markdown renderer escapes raw HTML and renders images with bounded `.markdown-image`.
- CSS caps markdown images in chat bubbles.
- `isToolResultIdError()` no longer misclassifies context-window errors as tool-id errors.

## Verification

- `just check` passed.
- `just test-unit` passed.
- Targeted: `bun test test/agent.test.ts test/server.test.ts test/app.test.ts --timeout 30000` → 332 pass.
- Frontend/static after rebuild: `bun test test/static.test.ts test/app.test.ts --timeout 30000` → 166 pass.

## 2026-05-02 status

Explicit `Use generate_image/generate_music/text_to_speech with ...` prompts are now handled deterministically by `parseExplicitToolDirective()` before the normal LLM loop, so the app does not rely on the model choosing a tool call for these Create/directive prompts.

Manual Chrome verification used seeded tool history + asset to confirm image tool cards/assets render. Server regression tests cover direct tool IDs and explicit directive handling.
