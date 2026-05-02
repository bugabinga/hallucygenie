---
description: Triage a reported issue from user
---

Reported issue: $ARGUMENTS

1. Check `logs/dev.log` if present. Quote relevant excerpts only.
2. Check DB/conversation only if needed. Never paste raw asset bytes.
3. Search `.system/issues/` for an existing issue.
4. If existing, report path and update with new evidence.
5. If new, create `.system/issues/HG-ISSUE-NNN-*.md` as simple markdown.
6. Cross-reference related specs, tickets, and issues.
7. State repro, unknowns, and smallest next check.
8. Do not fix unless user asks.
