---
{ "status": "open", "specs": ["HG-SPEC-011", "HG-SPEC-017"] }
---

Repro: no command/prompt generates changelog from git history and `.system/issues`.
Cause: release notes are manual and can miss fixed issues or DB migration notes.
Fix: add Pi-agent changelog flow that reads last tag, commits, fixed issues, and migration changes; writes `CHANGELOG.md` plus UI changelog data.
