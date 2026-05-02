# HG-TICKET-022 — Session auto-name after first prompt

**Spec:** `.system/specs/HG-SPEC-009-multi-session-support.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-018-sessions-db-model.md`

## Goal

Auto-name `New Chat` sessions after first user prompt.

## Scope

- Trigger only when `name_source` allows auto-name.
- Use LLM prompt from spec.
- Fallback to local short prompt summary on failure.
- Never overwrite manual names.
- Keep under ~32 chars, no quote spam.

## Tests

- Agent/server unit: first prompt renames fallback session.
- Unit: manual name is not overwritten.
- Unit: LLM failure uses fallback.

## Devil check

Do not block chat streaming on naming. Background/best-effort only.
