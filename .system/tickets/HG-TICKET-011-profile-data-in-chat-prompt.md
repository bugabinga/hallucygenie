# HG-TICKET-011 — Profile data in chat prompt

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-009-profile-modal-local-storage.md`

## Goal

Send compact profile fields with chat requests and inject them into the system prompt as quoted user preferences.

## Scope

- Frontend includes sanitized profile object in `POST /api/chat` body.
- Server validates caps/types.
- `buildSystemPrompt()` appends profile as data, not instructions.
- Omit empty fields.
- Never include avatar URL/data in prompt.

## Tests

- Frontend unit: chat body includes capped profile fields.
- Server unit: prompt includes quoted profile data.
- Server unit: malicious profile text cannot remove base rules.

## Devil check

Prompt injection risk. Treat every field as inert quoted data.
