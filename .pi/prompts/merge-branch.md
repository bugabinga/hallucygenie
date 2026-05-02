---
description: Merge branch with main branch
argument-hint: "<branch>"
---

Merge this branch/worktree $ARGUMENTS with main branch. First rebase onto main
branch and fix conflicts if needed. Squash useless commits, such that only big
ticket commits remain. Rebase onto main branch. If success, delete the
branch/worktree and switch to main branch.
