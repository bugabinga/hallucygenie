# AGENTS.md — HallucyGenie

Agent instructions only. Do not mirror project state here.

## Start

- Read `.system/CONSTITUTION.md` before non-trivial code.
- Use `/skill:tiger` for style.
- Use `/skill:minimax` when touching MiniMax APIs.
- Use `just --list`; `justfile` is command source of truth.

## Rules

- No duplicated state. Specs, tickets, issues, code, tests, README, and justfile
  are source of truth.
- In `src/`, use `import { createLogger } from "./log.ts"`. No `console.log`.
- Use `process.env.MINIMAX_API_KEY`. Never hardcode keys. Never log keys.
- Raw asset bytes only in asset storage. Never put raw media in prompts,
  context, or chat history.
- Add tests for code and docs contracts.

## Prompts

- New spec → `.pi/prompts/spec.md`.
- Implementation → `.pi/prompts/impl.md`.
- MiniMax research → `.pi/prompts/minimax-research.md`.
- Commit → `.pi/prompts/commit.md`.

## Source of truth

- Laws/style: `.system/CONSTITUTION.md`.
- Work/state: `.system/specs/`, `.system/tickets/`, `.system/issues/`.
- Commands: `justfile`.
- App intro: `README.md`.
- Tests: `test/`, `e2e/`.
