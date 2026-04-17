## Plan Review: Step 3 — Steering Queue

### Verdict: APPROVE

### Summary
The Step 3 plan covers all steering queue requirements from PROMPT.md: `queueSteer`/`drainSteer` functions, turn-boundary queue checks in the agent loop, and five test scenarios. The four checkboxes in STATUS.md capture the key outcomes without over-specifying implementation details. The existing `runAgentLoop` implementation in `agent.ts` provides clear integration points — the steering queue check naturally fits at the two turn-boundary locations (after tool result appending and before emitting `done`).

### Issues Found
1. **Minor** — The plan doesn't specify how the steering queue object is shared between the caller (e.g., future `/api/steer` endpoint) and the running agent loop. Since `runAgentLoop` is a standalone `async` function, `queueSteer` needs to be callable from outside while the loop is running. The cleanest approach is a plain queue object (e.g., `{ messages: string[], active: boolean }`) created externally and passed into `runAgentLoop`. This is an implementation detail the worker can decide — just flagging it since it's the core design decision for this step.

2. **Minor** — "Steer when idle" is ambiguous — it could mean (a) steering while the loop is awaiting an API response (between turns), or (b) steering when no loop is running at all. Interpretation (a) is naturally handled by the queue-drain-at-turn-boundary pattern. Interpretation (b) would require the steer to start a new loop, which is a server-wiring concern (HG-006) rather than an agent-loop concern. The test should clarify which scenario is intended — likely (a).

### Missing Items
- None. All PROMPT.md requirements for Step 3 are covered by the existing checkboxes.

### Suggestions
- Consider a max-steer guard or depth limit. If the model keeps generating tool calls and steers keep arriving, the loop could run indefinitely. A simple iteration counter (e.g., max 20 turns) would prevent runaway loops. This wasn't flagged in Step 2 either but becomes more relevant with external steering.
- The "flag" mentioned in PROMPT.md (`"plain array + flag, concurrent-safe"`) should track whether the loop is active. When `runAgentLoop` exits, it sets the flag to inactive so that `queueSteer` after `done` can be cleanly ignored. The "steer after done (ignored)" test validates this behavior.
- When steer messages are drained and injected as a user message, consider whether to emit a `steer` event type (extending `AgentEvent`). The current event types are `text | tool_start | tool_result | done`. A `steer` event would let the frontend know a user intervention occurred. This is optional — the PROMPT doesn't require it.
- The `AgentEvent` interface currently has optional `id`, `name`, and `result` fields tied to tool events. If a `steer` event type is added, it would need a `content` field (the steer message text). The existing `content` field already serves this purpose for `text` events, so no structural change is needed.
