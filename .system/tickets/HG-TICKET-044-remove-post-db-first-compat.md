# HG-TICKET-044 — Remove post-DB-first compatibility branches

**Spec:** `.system/specs/HG-SPEC-011-constitution-driven-simplification.md`, `.system/specs/HG-SPEC-007-db-first-single-user-state.md`
**Status:** Ready
**Priority:** Medium
**Size:** M

## Goal

Delete compatibility code no longer required after DB-first state lands.

## Scope

- Browser-owned session fallback cleanup if no accepted spec still needs it.
- Old asset `?s=` URL generation cleanup if replaced.
- Single-use helper cleanup discovered by audit.
- Keep explicit test/debug paths only when documented.

## Tests

- Static: no normal-flow session localStorage/header usage.
- Unit/integration: DB active session path remains green.

## Devil check

No speculative cleanup before replacement tickets land.
