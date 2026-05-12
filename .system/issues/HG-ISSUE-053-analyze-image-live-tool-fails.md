---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-053: Live analyze_image tool fails and triggers MiniMax tool-id error

Repro:

- `just dev`, `just dev-chrome`.
- New clean session.
- Ask: `Use analyze_image on this image URL and tell me one thing you see: https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/320px-Fronalpstock_big.jpg`.
- Also direct-smoke `/v1/coding_plan/vlm` with public JPG URLs:
  - `https://picsum.photos/200/200.jpg`
  - `https://upload.wikimedia.org/wikipedia/commons/7/77/Delete_key1.jpg`
  - `https://www.gstatic.com/webp/gallery/1.jpg`

Observed:

- UI tool card: `analyze image` → `Tool failed. Try again.`
- `tool_input_history`: `tool_name=analyze_image`, `status=failed`.
- Direct MiniMax VLM response: `base_resp.status_code=2013`, `invalid image URL`.
- Dev log also shows MiniMax chat 400 after failed tool result:
  `invalid params, tool result's tool id(call_function_h1p4h7s4qh88_1) not found (2013)`.

Expected:

- `analyze_image` works for a valid HTTPS JPG/PNG URL, or the tool is hidden/disabled.
- Failed tool result must not create a second MiniMax protocol error.

Cause:

- VLM direct endpoint contract appears drifted or stricter than tool schema/docs.
- Failed tool-result replay path still can trigger Anthropic-compatible tool-result ID rejection.

Fix:

- Re-research current MiniMax VLM endpoint contract.
- Add live-smoke covered by `just minimax-test` or a gated recipe.
- Disable/remove `analyze_image` until live endpoint works.
- Add regression: failed tool result must not send invalid `tool_result` to next LLM call.

Resolution:

- `analyze_image` is removed from live model tool definitions until the MiniMax VLM endpoint contract is reliable.
- Direct implementation tests remain, but the agent can no longer select the failing tool.
