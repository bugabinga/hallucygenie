# HG-TICKET-043 — Constitution acceptance audit

**Spec:** `.system/specs/HG-SPEC-011-constitution-driven-simplification.md`
**Status:** Done
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

## Audit result

Passed. Notes recorded in `HG-SPEC-011`.

- Raw asset invariant covered by DB + agent/server tests.
- Compact media context covered by agent/server tests.
- Generic MiniMax API errors now stream safe user text; raw provider body stays in logs.
- `AGENTS.md` references constitution + Tiger style.

Remaining follow-ups stay in existing tickets:

- `HG-TICKET-044-remove-post-db-first-compat.md`
- `HG-TICKET-045-provider-error-safety-audit.md`

## Tests

- `bun test test/agent.test.ts test/server.test.ts test/db.test.ts test/static.test.ts --timeout 30000`
- `just check`
- `just test-unit`

## Devil check

Do not refactor during audit unless a failing invariant is found.
