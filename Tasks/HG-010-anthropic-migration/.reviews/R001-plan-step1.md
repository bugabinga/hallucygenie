## Plan Review: Step 1 — Rewrite `agent.ts` — API client and streaming

### Verdict: APPROVE

### Summary
The plan is well-structured and covers all the critical changes needed to migrate agent.ts from the OpenAI-compatible format to the Anthropic format. The core approach — keeping the internal `ChatMessage[]` representation unchanged and converting to/from Anthropic format at the API boundary inside `runAgentLoop()` — is sound and minimizes cross-file blast radius between steps. The 13 checkboxes cover the key behavioral outcomes.

### Issues Found
1. **[Severity: important]** — **Message format conversion complexity for tool history.** Checkbox #4 says "Add helper to convert internal `ChatMessage[]` to Anthropic format (extract system, content blocks, tool_use/tool_result grouping)." The "tool_use/tool_result grouping" part is the hardest piece of this step. In the current internal format, a tool call flow looks like:
   ```
   {role: "assistant", content: "I'll draw that"},
   {role: "tool", content: "https://...", tool_call_id: "call_1"}
   ```
   In Anthropic format, this must become:
   ```
   {role: "assistant", content: [{type: "text", text: "I'll draw that"}, {type: "tool_use", id: "call_1", name: "generate_image", input: {prompt: "cat"}}]},
   {role: "user", content: [{type: "tool_result", tool_use_id: "call_1", content: "https://..."}]}
   ```
   The conversion helper must: (a) group consecutive assistant + tool messages, (b) reconstruct tool_use blocks in the assistant message (requiring tool name and input from the original tool call, not stored in current `ChatMessage`), and (c) convert tool-result messages into user-role messages. **Point (b) is the gap** — the current `ChatMessage` stores `{role: "tool", content, tool_call_id}` but does NOT store the tool name or input arguments. Discovery #2 notes extending `ChatMessage` with `tool_calls`, but the plan doesn't address how historical tool names/inputs will be recovered for Anthropic format reconstruction. The `db.ts` stores `tool_calls_json` (Discovery #1: "always null") — this could store the original tool call info, but for existing history it will be empty. The helper may need to handle missing tool_use info gracefully.

   **Suggested fix:** Add an explicit note in the plan that the conversion helper should handle the case where tool name/input are unavailable (e.g., for messages loaded from DB history that predate this change). A reasonable fallback is to skip tool_use reconstruction for incomplete history and just send the text portion.

2. **[Severity: minor]** — **`AgentState.pendingToolCalls` type source unclear.** The plan says to remove imports of `ToolCallAccumulated` from server.ts (checkbox #2), but `AgentState.pendingToolCalls` is typed as `ToolCallAccumulated[]` (agent.ts:62). If the import is removed, agent.ts needs its own local type definition or `AgentState` needs reworking. Discovery #6 notes "`needsToolExecution()` uses `ToolCallAccumulated[]` parameter — Keep for API compat, but unused in main flow" — this is fine, but the type source should be local in agent.ts after the import removal.

### Missing Items
- **How `tool_start` events are emitted with the new format.** The current OpenAI format emits `tool_start` when a tool call chunk arrives with a new `id`. In Anthropic format, tool calls appear as `content_block_start` with `type: "tool_use"`. The plan's checkbox #10 says "On `message_delta` with `stop_reason: "tool_use"` → execute tools, emit `tool_start` and `tool_result` events" — but this delays `tool_start` until after ALL content blocks are received. In the current implementation, `tool_start` is emitted as soon as the tool call ID is seen, allowing the frontend to show a loading indicator early. With the proposed approach, the frontend won't see `tool_start` until the entire response (including thinking + text + all tool blocks) is complete. This is a behavioral change the frontend may depend on. Consider emitting `tool_start` at `content_block_start` time (when you first see `type: "tool_use"`) rather than waiting for `message_delta`.

### Suggestions
- **Consider emitting `tool_start` eagerly at `content_block_start`** (when `type: "tool_use"` is seen) rather than at `message_delta` with `stop_reason: "tool_use"`. This preserves the current UX where the frontend shows a loading indicator as soon as the model decides to call a tool. The tool execution itself still happens at `message_stop`/`message_delta` time — only the event emission timing changes.
- **The `max_tokens` field is required by the Anthropic API** (per PROMPT.md: `"max_tokens": 4096`). The plan's checkbox #5 mentions it but doesn't specify the value. Hardcoding 4096 as in the PROMPT reference is reasonable.
- **The `content_block_start` event for tool_use provides `id` and `name` immediately.** Plan checkbox #9 says "accumulate id/name/input via `input_json_delta`" — but `id` and `name` come from `content_block_start`, not from deltas. Only the input (as `partial_json`) comes via `input_json_delta`. The accumulation logic is simpler than the plan implies, which is good.
