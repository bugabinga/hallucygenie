---
{ "status": "fixed", "specs": ["HG-SPEC-003"] }
---

Repro: fixed. HG-SPEC-003 fields now include `favorites`; code/API/UI persist and prompt-inject `favorites` as `Style ingredients`.
Cause: fixed HG-ISSUE-048 added `favorites`, but old spec stayed leaf without that field. Human decision: keep it and differentiate from `interests` as media style ingredients. Spec updated.
Fix: complete. Code labels it `Style ingredients` and prompt-injects as preference data only.
