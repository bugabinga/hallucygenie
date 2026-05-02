# HG-TICKET-030 — Record tool input history

**Spec:** `.system/specs/HG-SPEC-006-create-input-history.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-028-create-history-db.md`

## Goal

Record all media/search tool attempts with origin and status.

## Scope

- Supported kinds: image, music, voice, search.
- Origins: create, chat, agent.
- Insert `submitted` before execution.
- Update to `succeeded`/`failed` after result.
- Link saved asset id when available.
- Store validated structured args only.

## Tests

- Server/agent unit: create/direct submissions record `create`/`chat` origins.
- Agent unit: agent-selected tool records `agent` origin.
- Integration: failed attempt remains visible.

## Devil check

Never log full prompt by default. Store in DB because user asked/generated it.
