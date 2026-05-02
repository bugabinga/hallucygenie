# HG-ISSUE-021-agent-reused-wrong-media-context-debug-2026-05-01

**Status:** Folded into HG-ISSUE-014 / HG-ISSUE-018
**Severity:** High
**Related:** `HG-ISSUE-014-reload-history-missing-thinking-and-tool-output.md`, `HG-ISSUE-018-context-window-exceeds-after-large-tool-results.md`

## Recent logs

```json
{"level":"debug","msg":"request received","time":"2026-05-01T18:26:50.726Z","service":"hallucygenie","reqId":"000094","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:26:50.739Z","service":"hallucygenie","reqId":"000094","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:42:19.574Z","service":"hallucygenie","reqId":"00000b","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:42:19.593Z","service":"hallucygenie","reqId":"00000b","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:46:14.053Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:46:14.064Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T18:50:03.200Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:50:03.211Z","service":"hallucygenie","reqId":"000008","method":"POST","path":"/api/chat","status":200}
{"level":"warn","msg":"tool execution failed","time":"2026-05-01T18:58:00.668Z","service":"agent","toolName":"generate_image","error":"Error: boom"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T18:58:00.678Z","service":"agent","status":500,"error":"Internal Server Error"}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T18:58:00.678Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)\"}}"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T18:58:00.734Z","service":"agent","status":500,"error":"Internal Server Error"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T18:58:00.756Z","service":"agent","status":401,"error":"{\"error\":{\"message\":\"Invalid API key\"}}"}
{"level":"debug","msg":"request received","time":"2026-05-01T18:58:01.092Z","service":"hallucygenie","reqId":"000003","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T18:58:01.094Z","service":"hallucygenie","reqId":"000003","method":"POST","path":"/api/chat","status":503}
{"level":"warn","msg":"quota api error","time":"2026-05-01T18:58:01.109Z","service":"hallucygenie","status":500}
{"level":"debug","msg":"request received","time":"2026-05-01T19:13:12.023Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:13:12.038Z","service":"hallucygenie","reqId":"000006","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:13:56.203Z","service":"hallucygenie","reqId":"000009","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:13:56.216Z","service":"hallucygenie","reqId":"000009","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:14:44.381Z","service":"hallucygenie","reqId":"00000b","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:14:44.381Z","service":"hallucygenie","reqId":"00000b","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:15:09.950Z","service":"hallucygenie","reqId":"00000c","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:15:09.961Z","service":"hallucygenie","reqId":"00000c","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:15:34.285Z","service":"hallucygenie","reqId":"000010","method":"GET","path":"/asset/00000e?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:15:34.286Z","service":"hallucygenie","reqId":"000010","method":"GET","path":"/asset/00000e?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:16:01.611Z","service":"hallucygenie","reqId":"000011","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:16:01.624Z","service":"hallucygenie","reqId":"000011","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:16:02.930Z","service":"hallucygenie","reqId":"000015","method":"GET","path":"/asset/000013?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:16:02.930Z","service":"hallucygenie","reqId":"000015","method":"GET","path":"/asset/000013?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:16:25.707Z","service":"hallucygenie","reqId":"000016","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:16:25.718Z","service":"hallucygenie","reqId":"000016","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:16:50.647Z","service":"hallucygenie","reqId":"000019","method":"GET","path":"/asset/000017?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:16:50.647Z","service":"hallucygenie","reqId":"000019","method":"GET","path":"/asset/000017?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:16:51.767Z","service":"hallucygenie","reqId":"00001c","method":"GET","path":"/asset/00001a?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:16:51.767Z","service":"hallucygenie","reqId":"00001c","method":"GET","path":"/asset/00001a?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T19:17:09.684Z","service":"hallucygenie","reqId":"00001f","method":"GET","path":"/asset/00001d?s=e2ea42a7-3684-43c4-b28a-9349764e9d66"}
{"level":"info","msg":"response sent","time":"2026-05-01T19:17:09.685Z","service":"hallucygenie","reqId":"00001f","method":"GET","path":"/asset/00001d?s=e2ea42a7-3684-43c4-b28a-9349764e9d66","status":200}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T19:17:11.207Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, context window exceeds limit (2013)\"},\"request_id\":\"06442f361dab311f0a272950807e1087\"}"}
{"level":"warn","msg":"tool execution failed","time":"2026-05-01T20:00:04.173Z","service":"agent","toolName":"generate_image","error":"Error: boom"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T20:00:04.184Z","service":"agent","status":500,"error":"Internal Server Error"}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T20:00:04.184Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, tool result's tool id(call_function_ynt4kuk8nlse_1) not found (2013)\"}}"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T20:00:04.185Z","service":"agent","toolName":"generate_music","error":"{\"base_resp\":{\"status_code\":2061,\"status_msg\":\"plan not support\"}}"}
{"level":"warn","msg":"minimax context window exceeded","time":"2026-05-01T20:00:04.185Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"message\":\"invalid params, context window exceeds limit (2013)\"}}"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T20:00:04.199Z","service":"agent","toolName":"gen","error":"Unknown tool: gen"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T20:00:04.199Z","service":"agent","toolName":"tts","error":"Unknown tool: tts"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T20:00:04.250Z","service":"agent","status":500,"error":"Internal Server Error"}
{"level":"warn","msg":"minimax api error","time":"2026-05-01T20:00:04.273Z","service":"agent","status":401,"error":"{\"error\":{\"message\":\"Invalid API key\"}}"}
{"level":"warn","msg":"tool returned error","time":"2026-05-01T20:00:04.274Z","service":"agent","toolName":"test","error":"Unknown tool: test"}
{"level":"debug","msg":"request received","time":"2026-05-01T20:00:04.634Z","service":"hallucygenie","reqId":"000004","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:00:04.636Z","service":"hallucygenie","reqId":"000004","method":"POST","path":"/api/chat","status":503}
{"level":"warn","msg":"quota api error","time":"2026-05-01T20:00:04.649Z","service":"hallucygenie","status":500}
{"level":"debug","msg":"request received","time":"2026-05-01T20:04:21.811Z","service":"hallucygenie","reqId":"000011","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:04:21.827Z","service":"hallucygenie","reqId":"000011","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:04:53.957Z","service":"hallucygenie","reqId":"000014","method":"GET","path":"/asset/000012?s=65d2206f-99f6-4681-9d80-235209acad71"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:04:53.959Z","service":"hallucygenie","reqId":"000014","method":"GET","path":"/asset/000012?s=65d2206f-99f6-4681-9d80-235209acad71","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:04:54.967Z","service":"hallucygenie","reqId":"000016","method":"GET","path":"/asset/000015?s=65d2206f-99f6-4681-9d80-235209acad71"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:04:54.968Z","service":"hallucygenie","reqId":"000016","method":"GET","path":"/asset/000015?s=65d2206f-99f6-4681-9d80-235209acad71","status":200}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T20:04:55.084Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, tool result's tool id(call_function_3oqd90rssgzq_2) not found (2013)\"},\"request_id\":\"06443a679be05f3880fc460dc720376d\"}"}
{"level":"debug","msg":"request received","time":"2026-05-01T20:13:43.716Z","service":"hallucygenie","reqId":"000018","method":"GET","path":"/assets"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:13:43.717Z","service":"hallucygenie","reqId":"000018","method":"GET","path":"/assets","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:16:08.786Z","service":"hallucygenie","reqId":"000019","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:16:08.797Z","service":"hallucygenie","reqId":"000019","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:16:43.784Z","service":"hallucygenie","reqId":"00001c","method":"POST","path":"/api/chat"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:16:43.798Z","service":"hallucygenie","reqId":"00001c","method":"POST","path":"/api/chat","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:17:13.361Z","service":"hallucygenie","reqId":"00001f","method":"GET","path":"/asset/00001d?s=65d2206f-99f6-4681-9d80-235209acad71"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:17:13.362Z","service":"hallucygenie","reqId":"00001f","method":"GET","path":"/asset/00001d?s=65d2206f-99f6-4681-9d80-235209acad71","status":200}
{"level":"debug","msg":"request received","time":"2026-05-01T20:17:14.353Z","service":"hallucygenie","reqId":"000022","method":"GET","path":"/asset/000020?s=65d2206f-99f6-4681-9d80-235209acad71"}
{"level":"info","msg":"response sent","time":"2026-05-01T20:17:14.354Z","service":"hallucygenie","reqId":"000022","method":"GET","path":"/asset/000020?s=65d2206f-99f6-4681-9d80-235209acad71","status":200}
{"level":"warn","msg":"minimax rejected tool result id","time":"2026-05-01T20:17:31.479Z","service":"agent","status":400,"error":"{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"invalid params, tool result's tool id(call_function_peydv92llzko_3) not found (2013)\"},\"request_id\":\"06443d5b4529ca072f25d1dfa9b91f47\"}"}
```

## DB messages

```json
{"id":1,"role":"user","chars":251,"head":"Create two tiny media tools in one turn: generate music with prompt \"8 bit spooky boss sting, very short, crunchy bass\" and lyrics \"boo\"; also use text to speech to say \"boo boo boss time\" at speed 1.5. After tools, reply with one short sentence only.","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 20:04:21"}
{"id":2,"role":"assistant","chars":0,"head":"","tool_calls_json":"[{\"id\":\"call_function_3oqd90rssgzq_1\",\"name\":\"generate_music\",\"input\":{\"prompt\":\"8 bit spooky boss sting, very short, crunchy bass\",\"lyrics\":\"boo\",\"instrumental\":false}},{\"id\":\"call_function_3oqd90rssgzq_2\",\"name\":\"text_to_speech\",\"input\":{\"text\":\"boo boo boss time\",\"speed\":1.5}}]","tool_call_id":null,"created_at":"2026-05-01 20:04:55"}
{"id":3,"role":"tool","chars":141,"head":"Generated audio with generate_music. The UI displays it in a tool card. Do not embed audio data, audio URLs, or markdown media in your reply.","tool_calls_json":null,"tool_call_id":"call_function_3oqd90rssgzq_1","created_at":"2026-05-01 20:04:55"}
{"id":4,"role":"tool","chars":141,"head":"Generated audio with text_to_speech. The UI displays it in a tool card. Do not embed audio data, audio URLs, or markdown media in your reply.","tool_calls_json":null,"tool_call_id":"call_function_3oqd90rssgzq_2","created_at":"2026-05-01 20:04:55"}
{"id":5,"role":"user","chars":105,"head":"Use generate_image with prompt: gamer brot logo green hacker rabbot monkey\nTool params: aspect_ratio=16:9","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 20:16:08"}
{"id":6,"role":"assistant","chars":0,"head":"","tool_calls_json":"[{\"id\":\"direct_00001a\",\"name\":\"generate_image\",\"input\":{\"aspect_ratio\":\"16:9\",\"prompt\":\"gamer brot logo green hacker rabbot monkey\"}}]","tool_call_id":null,"created_at":"2026-05-01 20:16:23"}
{"id":7,"role":"tool","chars":270,"head":"http://hailuo-image-algeng-data-us.oss-us-east-1.aliyuncs.com/image_inference_output%2Ftalkie%2Fprod%2Fimg%2F2026-05-02%2F8ea3aa07-1c51-4e90-9605-d997d36a7813_aigc.jpeg?Expires=1777752983&OSSAccessKeyId=LTAI5tRDTcyEYLLuBEpJRwCi&Signature=muQZDsWDF7bJEpKHQQhjzU%2Bwsuc%3D","tool_calls_json":null,"tool_call_id":"direct_00001a","created_at":"2026-05-01 20:16:24"}
{"id":8,"role":"user","chars":60,"head":"can you make the image fit stylistically more with the music","tool_calls_json":null,"tool_call_id":null,"created_at":"2026-05-01 20:16:43"}
{"id":9,"role":"assistant","chars":0,"head":"","tool_calls_json":"[{\"id\":\"call_function_peydv92llzko_1\",\"name\":\"generate_music\",\"input\":{\"prompt\":\"8 bit spooky boss sting, very short, crunchy bass\",\"lyrics\":\"boo\"}},{\"id\":\"call_function_peydv92llzko_2\",\"name\":\"text_to_speech\",\"input\":{\"text\":\"boo boo boss time\",\"speed\":1.5}},{\"id\":\"call_function_peydv92llzko_3\",\"name\":\"generate_image\",\"input\":{\"prompt\":\"gamer brot logo green hacker rabbot monkey\",\"aspect_ratio\":\"16:9\"}}]","tool_call_id":null,"created_at":"2026-05-01 20:17:31"}
{"id":10,"role":"tool","chars":141,"head":"Generated audio with generate_music. The UI displays it in a tool card. Do not embed audio data, audio URLs, or markdown media in your reply.","tool_calls_json":null,"tool_call_id":"call_function_peydv92llzko_1","created_at":"2026-05-01 20:17:31"}
{"id":11,"role":"tool","chars":141,"head":"Generated audio with text_to_speech. The UI displays it in a tool card. Do not embed audio data, audio URLs, or markdown media in your reply.","tool_calls_json":null,"tool_call_id":"call_function_peydv92llzko_2","created_at":"2026-05-01 20:17:31"}
{"id":12,"role":"tool","chars":129,"head":"Generated image with generate_image. The UI displays it in a tool card. Do not embed image URLs or markdown images in your reply.","tool_calls_json":null,"tool_call_id":"call_function_peydv92llzko_3","created_at":"2026-05-01 20:17:31"}
assets [{"id":"000012","type":"audio","filename":"000012.mp3","mime_type":"audio/mp3","prompt":"8 bit spooky boss sting, very short, crunchy bass","tool_name":"generate_music","size_bytes":945045,"created_at":1777665893946},{"id":"000015","type":"audio","filename":"000015.mp3","mime_type":"audio/mp3","prompt":"boo boo boss time","tool_name":"text_to_speech","size_bytes":22521,"created_at":1777665894962},{"id":"00001d","type":"audio","filename":"00001d.mp3","mime_type":"audio/mp3","prompt":"8 bit spooky boss sting, very short, crunchy bass","tool_name":"generate_music","size_bytes":638793,"created_at":1777666633355},{"id":"000020","type":"audio","filename":"000020.mp3","mime_type":"audio/mp3","prompt":"boo boo boss time","tool_name":"text_to_speech","size_bytes":20791,"created_at":1777666634349}]
```
