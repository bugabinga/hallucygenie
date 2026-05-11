---
{ "status": "open", "specs": ["HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-012"] }
---

# HG-SPEC-006: Create input history missing

## Spec requirement

HG-SPEC-006 requires server-owned Create/tool input history:

- Includes all media/search tool calls from Create modal, chat, and agent initiation.
- Fields: kind, origin, tool_name, structured input, status, asset_id.
- Stored in `tool_input_history`, scoped by `session_id`.
- Per-tab `Recent ▾` list in Create modal.
- Click history item fills the form.
- Remove soft-hides only the history item.
- API:
  - `GET /api/create-history?kind=&limit=&offset=`
  - `DELETE /api/create-history/:id`

## Current app behavior

No `tool_input_history` table/migration exists.
No create-history API routes exist in `src/server.ts`.
The Create modal has no `Recent ▾` UI.
Tool calls save messages/assets/usage, but not reusable structured inputs.

## Impact

Kid cannot retry, tweak, or reuse previous prompts without retyping.
Create modal, chat tool use, and agent tool use do not share a durable history.

## Acceptance

- Add `tool_input_history` table scoped by session.
- Record all Create/chat/agent tool inputs with status updates and asset links.
- Implement list/delete APIs.
- Add per-tab Recent UI with fill-form behavior.
- Soft-hide deleted history items without deleting assets/messages/usage.
- Add DB/API/frontend tests.
