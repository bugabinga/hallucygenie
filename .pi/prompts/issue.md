---
description: Triage a reported issue
---

Reported issue: $ARGUMENTS

1. Check `logs/dev.log` if present. Quote relevant excerpts only.
2. Check DB/conversation only if needed. Never paste raw asset bytes.
3. Search `.system/issues/` for an existing issue.
4. If existing, report path and update with new evidence.
5. If new, create `.system/issues/HG-ISSUE-NNN-slug.md` with this format:

```
---
{ "status": "open", "specs": ["HG-SPEC-NNN"] }
---

Repro, cause, fix.
Terse. No filler.
Cross-ref related issues inline.
```

6. Cross-reference related specs and issues.
7. State repro, unknowns, and smallest next check.
8. Do not fix unless user asks.
