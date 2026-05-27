---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: `just release v1.0.0` logs `curl: (56) Recv failure: Connection reset by peer`, then prints `dirty worktree` on clean `trunk`.
Cause: release shell used `;` without `set -e`; dirty check used `git status --short`, which includes branch header when `status.branch=true`; smoke used `HEAD` against font route.
Fix: add `set -e`, use porcelain dirty check, use font `GET` smoke.
