---
description: Merge branch with main branch
argument-hint: "<branch>"
---

Merge branch/worktree $ARGUMENTS into target branch.

Current git context:

```sh
!{
    branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
    test -n "$branch" || branch=main
    printf 'target=%s\n' "$branch"
    git status --short --branch
    git worktree list
}
```

Rules:

- Fetch first. Abort on dirty unrelated state.
- No PTY/editors: no interactive rebase; no editor-waiting git commands.
- Rebase branch onto target. Resolve conflicts. Continue via GIT_EDITOR=true.
- Squash noise only; use non-interactive reset --soft/cherry-pick/commit -m.
- Verify with just check + relevant tests.
- Merge to target. Success → delete branch/worktree → checkout target.
