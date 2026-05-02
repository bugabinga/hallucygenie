# HG-TICKET-043 — Constitution acceptance audit

**Spec:** `.system/specs/HG-SPEC-011-constitution-driven-simplification.md`  
**Status:** Ready  
**Priority:** High  
**Size:** S

## Goal

Audit current code against constitution acceptance criteria and close or list exact remaining gaps.

## Scope

- Check raw asset invariant tests.
- Check compact tool result/context tests.
- Check provider errors shown to user are safe.
- Check `AGENTS.md` references constitution/Tiger.
- Produce concise notes in spec or issue.

## Tests

- Run existing targeted tests.
- Add missing static/runtime guards only if audit finds a gap.

## Devil check

Do not refactor during audit unless a failing invariant is found.
