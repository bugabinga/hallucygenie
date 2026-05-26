---
{ "status": "fixed", "specs": ["HG-SPEC-009"] }
---

Repro: fixed. HG-SPEC-009 now says `sessions.name_source` is `default/manual/auto`; migration/code/tests use `default/manual/auto`.
Cause: implementation chose different enum names than old spec. Related fixed issue: HG-ISSUE-044. Human decision: keep code enum `default/manual/auto`; spec updated.
Fix: complete. No code migration.
