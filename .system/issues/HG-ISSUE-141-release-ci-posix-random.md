---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-141: Release CI smoke uses Bash-only random variable

Repro:

- Push tag `v1.0.0`.
- Release workflow runs `just release-check` under POSIX `sh`.
- `container-smoke` exits with `sh: 1: RANDOM: parameter not set` before GHCR publish.

Cause:

- `justfile` used Bash-only `$RANDOM` in release smoke container names.
- Just recipes run under `/bin/sh` in GitHub Actions.

Fix:

- Replace `$RANDOM` with POSIX-safe `$(date +%s)-$$` names in smoke and manual release containers.
- Add static regression forbidding `$RANDOM` in `justfile`.
- Release `v1.0.1` supersedes failed `v1.0.0` publication.
