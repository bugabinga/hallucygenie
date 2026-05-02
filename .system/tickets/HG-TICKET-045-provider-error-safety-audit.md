# HG-TICKET-045 — Provider error user-safety audit

**Spec:** `.system/specs/HG-SPEC-011-constitution-driven-simplification.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** S

## Goal

Ensure raw provider errors never appear in normal user-facing UI.

## Scope

- Audit tool errors, chat errors, quota errors.
- Logs keep raw detail with req/tool context.
- User gets concise safe message.
- Add regression for any missing path.

## Tests

- Unit: raw MiniMax JSON is converted to safe tool error.
- Frontend unit: error toast does not show provider JSON for known paths.

## Devil check

Do not hide logs. Hide internals from the kid-facing UI only.
