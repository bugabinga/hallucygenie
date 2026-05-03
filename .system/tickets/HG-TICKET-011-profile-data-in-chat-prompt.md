# HG-TICKET-011 — Profile data in chat prompt

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Done
**Priority:** Medium  
**Size:** M  
**Depends:** `HG-TICKET-009-profile-modal-local-storage.md` (done)

## Goal

Inject DB-owned profile fields into the system prompt as quoted user preferences.

## Scope

- Server loads active DB profile for `POST /api/chat`.
- Frontend does not send profile fields in chat body.
- Server validates caps/types at profile write boundary.
- `buildSystemPrompt()` appends profile as data, not instructions.
- Omit empty fields.
- Never include avatar URL/data in prompt.

## Tests

- Frontend unit: chat body does not include profile fields.
- Server unit: prompt includes quoted DB profile data.
- Server unit: malicious profile text cannot remove base rules.
- Static: no profile localStorage key.

## Implementation

- Server loads DB profile for chat requests.
- `buildSystemPrompt()` appends compact profile context as data, not instructions.
- Empty profile fields are omitted.
- Avatar data is excluded from prompt.
- Frontend chat body does not send profile fields.

## Validation

- `just check`
- `just test-unit`
- `just test-e2e`

## Devil check

Prompt injection risk. Treat every field as inert quoted data.
