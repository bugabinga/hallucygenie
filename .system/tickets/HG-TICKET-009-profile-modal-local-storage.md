# HG-TICKET-009 — DB-backed profile modal

**Spec:** `.system/specs/HG-SPEC-003-local-user-profile-and-avatar.md`  
**Status:** Done
**Priority:** Medium  
**Size:** M

## Goal

Add small header profile button/modal and save short profile fields in DB.

## Scope

- Header profile button.
- Modal fields: username, interests, hates, favorite games/style, avatar emoji.
- Profile API: `GET /api/profile`, `PUT /api/profile`, `DELETE /api/profile`.
- DB storage via `app_state` key or tiny singleton table.
- Trim/cap fields server-side; client trimming only for UX.
- Reset DB profile.
- Modal ARIA/focus behavior.
- No profile `localStorage`.

## Tests

- Frontend unit: save/load/reset via API, trim/caps, invalid API response ignored safely.
- Backend unit/integration: profile CRUD stores normalized DB profile and rejects raw asset/data URLs.
- Static: profile button/modal ARIA and no profile localStorage key.
- E2E/manual: save profile, reload, values persist after localStorage clear.

## Implementation

- Added header profile button and modal.
- Added `GET /api/profile`, `PUT /api/profile`, `DELETE /api/profile`.
- Stored normalized profile in DB `app_state`.
- Reset deletes DB profile.
- No profile `localStorage` writes.

## Validation

- `just check`
- `just test-unit`
- `just test-e2e`

## Devil check

Profile is untrusted prompt data. DB-owned state only; no prompt injection in this ticket.
