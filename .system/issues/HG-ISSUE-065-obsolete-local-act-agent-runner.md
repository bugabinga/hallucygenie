---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-065: Obsolete local act agent runner

Repro:

- `just --list` exposes `agent-spec`, `agent-bugs`, `agent-deslop`, `agent-all`.
- These recipes depend on `ci-act-image` and run `.github/workflows/agents.yml` through `act`.
- `hook-post-merge` still calls `just ci-act`.
- `test/static.test.ts` asserted local act recipes and `deploy/act/` image build files existed.
- `.github/workflows/agents.yml` still carries `No git repo (act local run)` branches.

Cause:

- Local act-based agent execution stayed after the agent workflow moved to GitHub Actions.
- Obsolete runner path now leaks into hooks, docs-by-test, ignore rules, and workflow conditionals.
- Violates HG-SPEC-011 delete-dead-compat rule.

Fix:

- Removed all local act recipes and `deploy/act/`.
- Replaced `hook-post-merge -> just ci-act` with `just ci-test-all && just test-e2e`.
- Removed act cache/artifact ignores and act-only workflow branches.
- Added static contracts proving the local act runner is absent.
- Related: HG-ISSUE-024, HG-ISSUE-057.
