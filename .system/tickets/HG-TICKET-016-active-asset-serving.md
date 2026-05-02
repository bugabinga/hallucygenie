# HG-TICKET-016 — Active-session asset serving without `?s=`

**Spec:** `.system/specs/HG-SPEC-007-db-first-single-user-state.md`  
**Status:** Ready  
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

## Devil check

Single-user does not mean public arbitrary files. Still use DB asset ids only.
