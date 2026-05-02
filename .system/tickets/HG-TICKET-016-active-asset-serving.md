# HG-TICKET-016 — Active-session asset serving without `?s=`

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`
**Status:** Done
**Priority:** High
**Size:** M

## Goal

Serve `/asset/:id` through DB active session for normal single-user use.

## Scope

- `/asset/:id` works without session query/header.
- Explicit session query/header may remain for tests/debug.
- New frontend asset URLs omit `?s=`.
- Asset lookup still validates ownership when explicit session used.

## Tests

- Integration: `/asset/:id` works without `?s=` for active session asset.
- Frontend unit: rendered asset URLs omit session query in default flow.
- Regression: wrong explicit session cannot read another session asset.

## Implementation

- `/asset/:id` falls back to DB active session when no explicit session is provided.
- Explicit `X-Session-Id`/`?s=` still scopes ownership and wrong sessions get 404.
- New saved tool asset refs and frontend asset library URLs omit `?s=`.

## Validation

- `bun test test/server.test.ts test/integration.test.ts --timeout 30000`
- `bun test test/app.test.ts test/static.test.ts --timeout 30000`
- `just check`
- `just test-unit`
- `just test-integration`

## Devil check

Single-user does not mean public arbitrary files. Still use DB asset ids only.
