---
description: Implement a spec
argument-hint: "<SPEC-ID>"
---

Implement $ARGUMENTS from `.system/specs/`.

Pre-flight:

1. Verify the spec file exists. If not, STOP — ask user to save approved draft first.
2. Read the spec. Read related specs and issues.
3. If spec is ambiguous, STOP and ask. Do not guess.

Workflow:

1. Create a worktree/branch named after the spec ID.
2. If test framework exists in project, write/update tests first.
   Tests are the behavioral contract from the spec.
3. Implement. Follow RULES and tiger style.
4. Run `mise run check --fix`, then `mise run test`.
5. Verify with `mise run dev --chrome` if UI changes.

Cross-reference completed work in the commit message.
Update `.system/issues/` if new bugs surface during implementation.
