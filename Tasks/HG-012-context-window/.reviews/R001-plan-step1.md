## Plan Review: Step 1 — Implement token estimation and context builder

### Verdict: APPROVE

### Summary
The plan for Step 1 is well-structured and covers the core outcomes needed: a token estimation function, a context builder that walks backward from recent messages, tool-pair integrity, and mandatory system message inclusion. The checkboxes are outcome-level and appropriate. The approach will work given the current `ChatMessage` type and existing code patterns.

### Issues Found

1. **[Severity: minor]** "Thinking content" in `estimateTokens` has no data to count — The plan's first checkbox says "chars/4 for text, thinking, tool call names+args..." but the `ChatMessage` type has no `thinking` field. Thinking blocks are emitted as ephemeral SSE events in `runAgentLoop` (agent.ts ~line 340: `onEvent({ type: "thinking", content: thinking })`) and are never stored in `ChatMessage` objects. The implementer should simply count what's available: `content` (string), `tool_calls[].name` + `tool_calls[].input` (JSON-serialized), and `tool_call_id`. No action needed in the plan — just noting this so the implementer doesn't go looking for a `thinking` field.

2. **[Severity: minor]** Image token estimation needs a detection heuristic — The plan says "~1200 per image" but `ChatMessage.content` is a plain string. Images come back as URLs in tool result content (e.g., `{"url": "https://..."}` or data URIs). The implementer will need to decide how to detect image-bearing content (e.g., checking for `image_urls`, `data:image`, or URL patterns). This is a small implementation detail, not a plan gap.

### Missing Items

None blocking. All required outcomes are covered by the three checkboxes.

### Suggestions

1. **Consider message-role alternation after trimming.** Anthropic's API requires messages to alternate between `user` and `assistant` roles, with the first non-system message being `user`. If `buildContext` trims such that the oldest kept message (after system) is an `assistant` or `tool` message, the downstream `toAnthropicPayload` → API call could fail. The natural "walk backward" approach may or may not produce a valid sequence. This is more of a Step 2 concern (wiring + testing), but the implementer should be aware. Consider having `buildContext` ensure the result starts with a user message after the system prompt, or at minimum note this as a test case for Step 3.

2. **Edge case: all messages exceed the budget.** If even the system prompt + the latest user message exceeds 200K tokens, `buildContext` should still return something usable rather than an empty array. A reasonable fallback: always return at least the system message + the last user message, regardless of token estimate. This is a minor robustness concern given the 200K budget, but worth handling.

3. **`estimateTokens` should serialize `tool_calls[].input` to count its chars.** The `input` field is `Record<string, unknown>`, so the implementer should `JSON.stringify()` it before counting characters. The plan implies this but doesn't state it explicitly — just a heads-up.
