# AGENTS.md — HallucyGenie

Agent instructions only. Do not mirror project state here.

## Start

- Read `.system/RULES.md` before non-trivial code.
- Use `/skill:tiger` for style.
- Use `/skill:minimax` when touching MiniMax APIs.
- Use `just --list`; `justfile` is command source of truth.
- Agent Patrol docs: `AGENT_PATROL.md`.
- Release work must use `.pi/prompts/release.md`; final tag push goes through `just release`.

## Rules

- No duplicated state. Specs, tickets, issues, code, tests, README, and justfile
  are source of truth.
- In `src/`, use `import { createLogger } from "./log.ts"`. No `console.log`.
- Use `process.env.MINIMAX_API_KEY`. Never hardcode keys. Never log keys.
- Raw asset bytes only in asset storage. Never put raw media in prompts,
  context, or chat history.
- Add tests for code and docs contracts.
- Release changes update `CHANGELOG.md`, README, `.env.example`, release issues, and the local container smoke path.

## Prompts

- New spec → `.pi/prompts/spec.md`.
- Implementation → `.pi/prompts/impl.md`.
- MiniMax research → `.pi/prompts/minimax-research.md`.
- Commit → `.pi/prompts/ci.md`.
- Release -> `.pi/prompts/release.md`.

## Source of truth

- Laws/style: `.system/RULES.md`.
- Mission: `.system/MISSION.md`.
- Specs: `.system/specs/`.
- Issues: `.system/issues/`.
- Commands: `justfile`.
- Agent Patrol: `AGENT_PATROL.md`.
- Tests: `test/`, `e2e/`.
