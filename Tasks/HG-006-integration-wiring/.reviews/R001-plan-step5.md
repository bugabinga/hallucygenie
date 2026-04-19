## Plan Review: Step 5 — New API Endpoints

### Verdict: APPROVE

### Summary

The plan is straightforward and well-scoped: add two GET endpoints (`/api/history` and `/api/usage`) that leverage existing db.ts functions. Session validation is already wired in from Step 2, so both endpoints will automatically enforce the `X-Session-Id` requirement. The plan covers all requirements from PROMPT.md Step 5.

### Issues Found

None. The plan's checkboxes directly mirror the PROMPT.md requirements.

### Missing Items

None. All stated requirements are covered:

- **`GET /api/history`** — returns messages for session from DB (uses existing `getMessages`)
- **`GET /api/usage`** — returns `{ usage: getUsageToday(db), limits: QUOTAS }` (needs importing `getUsageToday` + `QUOTAS` from db.ts)
- **Session validation** — already handled by middleware from Step 2; no extra work needed
- **Tests** — session requirement, functional correctness, snapshot coverage all called out

### Suggestions

- The worker will need to add `getUsageToday` and `QUOTAS` to the import from `./db.ts` (line 17). Trivial but worth noting.
- For the `/api/usage` response shape, consider also including per-feature `remaining` counts (like `checkQuota` returns) alongside raw counts and limits. This gives the frontend everything it needs in one call. Not required by PROMPT.md — purely optional.
- The history endpoint may want to serialize `tool_calls_json` and `tool_call_id` fields in a frontend-friendly way (or omit nulls). Minor — the existing `MessageRow` shape from `getMessages` is fine for MVP.
- Consider adding a test for an empty history (session with no messages) and for usage with zero tracked counts. These are natural edge cases that round out test coverage heading into Step 6.
