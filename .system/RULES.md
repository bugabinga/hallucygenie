# HallucyGenie Rules

Strong prompt.
Read before code.
Obey unless user overrides.

## Law

- Simple feature.
  Simple code.
  No "backwards compat" unless spec says.
  No future-proof.
- Fail fast and loud.
  Bad state → throw, crash, or hard error.
  Graceful only when spec says.
- Low complexity.
  Avoid deep OOP hierarchies.
  No clever abstraction.
  No one-use indirection.
- Plain data.
  Plain functions.
  Guard clauses.
  Direct flow.
- Tiger style: /skill:tiger.
  Direct path.
  Explicit return.
  Immediate error.
- Raw asset bytes stay in asset storage.
- Never put raw asset data in agent context or chat history.
- Add tests for code and docs contracts.
  Tests prove invariants.
- HallucyGenie is production software.
  DB schema/data changes require explicit migration steps.
- In `src/`, use `import { createLogger } from "./log.ts"`.
  No `console.log`.
- Use `process.env.MINIMAX_API_KEY`.
  Never hardcode keys.
  Never log keys.

## Sources of truth

- Laws/style: `.system/RULES.md`.
- Mission: `.system/MISSION.md`.
- Specs: `.system/specs/`.
- Issues: `.system/issues/`.
- Commands: `mise.toml`.
- Tests: `test/`, `e2e/`.

## Review

Reject violations unless spec names the reason.
