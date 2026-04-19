## Plan Review: Step 2 — Agent Loop

### Verdict: APPROVE

### Summary

The Step 2 plan in STATUS.md aligns well with PROMPT.md requirements for implementing `runAgentLoop`. The existing codebase already provides all the building blocks — `stripThinkingTokens`, `accumulateToolCalls`, `executeTool`, and the `ChatMessage`/`ToolCallAccumulated` types — so the agent loop implementation is primarily about wiring them together with a streaming fetch call and an event emitter pattern. The checklist items cover all required outcomes.

### Issues Found

1. **Minor** — The plan says `runAgentLoop(messages, tools, onEvent, apiKey)` but `tools` as a parameter is redundant since `getToolDefinitions()` is already imported and used in `server.ts`. Not blocking — the worker may choose to accept tool definitions or generate them internally.

2. **Minor** — No explicit mention of how to construct the assistant message with `tool_calls` for the messages array. When tool calls occur, the OpenAI-compatible format requires an assistant message with `tool_calls` field appended before tool results. This is a well-known pattern and the worker should know it, but worth flagging since the current `ChatMessage` type in `server.ts` doesn't have a `tool_calls` field — it will need extending.

### Missing Items

- **`ChatMessage` type may need extending**: The current type only has `role`, `content`, and `tool_call_id`. The agent loop needs to append an assistant message with `tool_calls: [...]` when the model requests tools. The plan should acknowledge this type extension (or the worker can use a broader type inline).
- **Error handling in the loop**: No checkbox mentions what happens if the MiniMax streaming call itself fails (network error mid-stream, non-200 response). The `server.ts` `handleChat` handles this at the HTTP level, but `runAgentLoop` as a standalone function needs its own strategy — emit an error event? Return the error? This should be covered by the "empty responses" test case at minimum, but a deliberate decision on error propagation is good to have.

### Suggestions

- Consider adding a max-iteration guard (e.g., 10 loops) to prevent infinite tool-calling loops. This isn't in PROMPT.md as a requirement, but is a sensible safety measure.
- The existing `agent.test.ts` only tests the state helper functions. The new tests for `runAgentLoop` will need to mock `globalThis.fetch` to return a fake SSE stream. The pattern in `tools.test.ts` (replacing `globalThis.fetch`) can be reused, but the mock will need to return a `ReadableStream` that yields SSE-formatted chunks. This is the trickiest part of the testing — worth planning the mock structure.
- Snapshot tests for event sequences could use `JSON.stringify(events)` compared against inline snapshots rather than file-based snapshots, since Node's built-in test runner snapshot support is limited.
- The `AgentState` type and helpers (`createAgentState`, `addUserMessage`, etc.) already exist in `agent.ts`. The plan doesn't mention whether `runAgentLoop` will use `AgentState` or operate on a raw `messages` array. Either approach works — just noting it for consistency.
