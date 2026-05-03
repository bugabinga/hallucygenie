# HG-SPEC-006: Create input history

## Problem

Create tools forget previous prompts. Kid can't retry, tweak, or reuse old ideas without retyping.

## Design decisions

- History includes all media/search tool calls: Create modal, chat, agent-initiated.
- Each item: kind, origin (create/chat/agent), tool_name, structured input, status (submitted/succeeded/failed), asset_id.
- Server-owned in `tool_input_history` table, scoped by session_id.
- Per-tab "Recent ▾" list in Create modal. Click fills form. Remove soft-hides (does not delete chat/assets/usage).
- API: `GET /api/create-history?kind=&limit=&offset=`, `DELETE /api/create-history/:id`.
