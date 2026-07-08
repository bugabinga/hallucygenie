# Agent Patrol

Autonomous CI agents. One PR per agent. Janitor keeps them honest.

## Entry points

- Workflow: `.github/workflows/agents.yml`
- Agents: `.github/agents/*.ts`
- Shared loop: `.github/agents/lib.ts`
- Trigger: schedule or manual `workflow_dispatch`

## Agents

- `speck-ferkel` — checks one random `.system/specs/*.md` against `src/` + `test/`; fixes drift.
- `trouble-maker` — hunts real bugs in `src/`; fixes them with tests.
- `slop-chopper` — removes listed slop from `src/`; no broad cleanup.
- `robotnik` — fixes next open `.system/issues/*.md`; marks issue fixed only when done.
- `janitor` — reviews bot PRs; writes one sticky checklist; syncs `janitor:*` labels.

## Schedule

- `17 */6 * * *` — speck-ferkel, trouble-maker, slop-chopper, robotnik.
- `17 3,9,15,21 * * *` — robotnik extra.
- `47 */2 * * *` — janitor.

## Loop

1. Worker checks for its own open `agent/<name>-*` PR.
2. If janitor status is `needs-fix`, worker repairs that PR only.
3. If another open PR exists, worker skips new work.
4. If no PR exists, worker may create one.
5. Worker runs `mise run check --fix` + `mise run test` before commit.
6. Janitor rechecks PR, CI, comments, reviews, failed logs.

## Janitor status

- `waiting-for-ci` — required checks pending/missing.
- `needs-fix` — owning agent can repair: CI, tests, code, metadata, branch state.
- `ready` — CI green, mergeable/current, no unchecked blockers.
- `needs-human` — auth/security/deploy/workflow risk, duplicate, unclear scope, or repeated same-blocker repair failures.

## Models/secrets

- Patrol LLM provider: MiniMax only.
- CI secret: `MINIMAX_API_KEY`.
- GitHub writes use the Agent Bot GitHub App token.

## Human ops

- Manual run: Actions → Agent Patrol → Run workflow → choose agent.
- Blocked PR: read sticky janitor comment first.
- Quota/provider failure: inspect latest Agent Patrol run logs.
- Do not hand-edit bot branches unless taking ownership.
