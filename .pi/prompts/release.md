---
description: Cut a HallucyGenie release
argument-hint: "vX.Y.Z"
---

Cut release $ARGUMENTS.

Pre-flight:

1. Refuse non-`vX.Y.Z` tags.
2. Read `.system/RULES.md`, `.system/issues/`, `CHANGELOG.md`, `README.md`, `justfile`.
3. Verify `package.json` version equals tag without `v`.
4. Verify `.env.example` names required runtime env.
5. Verify DB migration notes match migration changes.

Workflow:

1. Update `CHANGELOG.md` from commits, fixed `.system/issues`, and DB changes.
2. Update child-friendly “What’s new?” UI when user-visible behavior changed.
3. Update README run/release docs and image tag.
4. Update `.system/issues/` statuses for release work.
5. Run `RELEASE_TAG=$ARGUMENTS just release-check ghcr.io/bugabinga/hallucygenie:$ARGUMENTS`.
6. Cut release with `just release $ARGUMENTS`.
7. `just release` must open the exact release image in Chrome, wait for the tester to close Chrome or press Ctrl+C, ask `Manual test OK? [y/N]`, then tag only on `y`.
8. The `release` recipe must refuse dirty worktrees, wrong tags, existing tags, missing `MINIMAX_API_KEY`, and failed browser confirmation.

Commands:

```sh
RELEASE_TAG=$ARGUMENTS just release-check ghcr.io/bugabinga/hallucygenie:$ARGUMENTS
just release $ARGUMENTS
```

Rules:

- Never force-push `trunk` for a release.
- Never log or commit `MINIMAX_API_KEY`.
- Never tag from a dirty worktree.
- Never tag unless `just release` opened the exact image in Chrome and the tester answered `y`.
- Never publish without a local container smoke test.
- Never publish if image tag, `RELEASE_TAG`, `package.json`, or OCI image label disagree.
- Release notes must include parent-facing DB/backup notes when migrations changed.
