## Plan Review: Step 4 — Wire Chat Endpoint to Agent Loop

### Verdict: APPROVE

### Summary

The plan is well-structured and covers the core integration work: replacing the current raw SSE proxy `handleChat` with one that delegates to `runAgentLoop`, wiring in DB persistence (load history, save messages, track usage), adding quota enforcement on tool calls, and implementing steer via session-keyed queues. The testing strategy (integration tests for text-only and tool-call flows, snapshot tests for SSE streams) matches PROMPT.md requirements.

### Issues Found

1. **[Severity: important]** — The plan's checkbox "On tool execution: check quota, execute, track usage, save tool result" implies quota checking happens inside the chat endpoint wiring. However, `runAgentLoop` in `agent.ts` calls `executeTool` directly (line ~272) and does not currently expose a hook for quota enforcement or usage tracking. The worker will need to either: (a) wrap `executeTool` with a quota-checking wrapper passed into `runAgentLoop`, or (b) add quota checking inside the `onEvent` callback when `type === "tool_result"` events fire, or (c) modify `runAgentLoop` to accept a tool execution interceptor. The plan should acknowledge this architectural decision point since the current `runAgentLoop` signature doesn't support it.

2. **[Severity: important]** — The current `handleChat` in `server.ts` builds its own SSE stream by manually processing MiniMax chunks. The plan says "Replace `handleChat` with agent loop integration" but the current `runAgentLoop` uses `onEvent` callbacks with typed events (`text`, `tool_start`, `tool_result`, `done`). The worker will need to convert these `AgentEvent` callbacks into SSE events on the `TransformStream` writer. This is the core mechanical work of the step — ensure the SSE event format emitted by the new handler matches what the existing tests expect (e.g., `data: {...}`, `event: tool_start`, `event: tool_end`, `data: [DONE]`).

3. **[Severity: important]** — `POST /api/steer` needs a per-session steer queue map. The plan says "queue steer message for the active agent loop session" but there's a subtlety: if there is no active agent loop for a session (e.g., no chat is in progress), the steer message should either be rejected or queued for the next chat. The plan should clarify the expected behavior for steer when no chat is active.

### Missing Items

- **Error handling for DB operations in the chat flow:** The plan doesn't mention what happens if `getMessages()` or `saveMessage()` fails during a chat request. Should the request fail with 500, or should it degrade gracefully (proceed without history)?
- **Concurrent request handling per session:** If two `POST /api/chat` requests arrive for the same session ID simultaneously, they could create race conditions on message history. The plan should note whether this needs guarding (e.g., one active chat per session).
- **System prompt injection in the new flow:** Step 3 added `buildSystemPrompt()` and preferences from DB. Step 4 needs to explicitly wire this: load preferences from DB, call `buildSystemPrompt(preferences)`, and prepend the system message to the history passed to `runAgentLoop`. The plan's item "Load message history from DB" should include loading preferences as well.

### Suggestions

- The existing `handleChat` has extensive SSE streaming logic that will become dead code once the agent loop takes over. Consider removing it in this step to keep the codebase clean, since the agent loop already handles all the same concerns (thinking token stripping, tool call accumulation, SSE streaming).
- The steer queue map should probably be a `Map<string, SteerQueue>` at module level in `server.ts`. Consider adding a cleanup mechanism to avoid memory leaks for abandoned sessions.
- When saving the assistant response to DB, note that tool call scenarios produce multiple assistant messages across iterations. Each should be saved individually to maintain accurate history.
- Snapshot tests for SSE streams: the existing test helpers in `agent.test.ts` (like `mockMiniMax`, `minimaxResponse`, `makeSseStream`) are well-designed. Consider extracting shared test helpers to a separate file since Step 4's integration tests will need the same mocking patterns.
