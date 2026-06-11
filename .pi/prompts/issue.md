---
description: Triage a reported issue
---

Reported issue: $ARGUMENTS

1. Check logs:
   - dev path: `logs/dev.log` if present.
   - running container: inspect likely HallucyGenie container logs if present.
   - Quote relevant excerpts only.
2. Scan DB/session state:
   - dev DB: `data/hallucygenie.db` if present.
   - running container DB: inspect likely HallucyGenie container `/app/data` volume if present.
   - Report table counts, recent session metadata, relevant draft/tool/history metadata.
   - Check conversation rows only when relevant to repro. Quote minimal sanitized excerpts only.
   - Never paste raw asset bytes, base64/data URLs, keys, secrets, or full conversations.
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
