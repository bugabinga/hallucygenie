---
{ "status": "open", "specs": ["HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-011"] }
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

Regression evidence 2026-05-12:

- Session `Manual QA Clean` (`6e2c3b69-3084-4a1d-b3c4-45cf810e6233`) contains the same failed tool path.
- User message id `61`: asked `Use analyze_image on this image URL...Fronalpstock_big.jpg`.
- Assistant message id `62`: `tool_calls_json` used `analyze_image` with that public JPG URL.
- Tool message id `63`: `Error: Tool failed. Try again.`
- `tool_input_history` id `829b6ee9-124f-4418-bf7f-9b63b919ae75`: `tool_name=analyze_image`, `kind=image`, `origin=agent`, `status=failed`, `asset_id=null`.
- Create UI has tabs for Image, Music, Voice, Search, Assets. No Analyze Image tab/form.
- `getToolDefinitions()` omits `analyze_image`, while `executeTool()` still dispatches it. Half-hidden tool.
- Logs show Create history requests for `kind=image` and `kind=music`, but no analyze-image path.

Expected:

- `analyze_image` works for a valid HTTPS JPG/PNG URL, or the tool is fully absent.
- If present, `analyze_image` has first-class Create UI, history, tests, and kid-safe output like other tools.
- Failed tool result must not create a second MiniMax protocol error.

Cause:

- VLM direct endpoint contract appears drifted or stricter than tool schema/docs.
- Failed tool-result replay path still can trigger Anthropic-compatible tool-result ID rejection.
- Prior resolution removed `analyze_image` from live model definitions, but not from execution/history paths.
- User clarified approved spec should explicitly add Analyze Image to Create.
- Spec file still needs human edit; agents cannot write specs.

Fix:

- Re-research current MiniMax VLM endpoint contract.
- Add live-smoke covered by `just minimax-test` or a gated recipe.
- After human spec edit, elevate `analyze_image` to first-class Create tool.
- Add Create tab/form, direct server action, `tool_input_history`, tests, and safe output rendering.
- Add regression: failed tool result must not send invalid `tool_result` to next LLM call.
- Cross-ref HG-ISSUE-047, HG-ISSUE-043.

Prior resolution:

- `analyze_image` was removed from live model tool definitions until the MiniMax VLM endpoint contract is reliable.
- Direct implementation tests remained, but stale execution/history paths still expose the broken tool.
