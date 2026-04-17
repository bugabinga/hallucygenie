## Plan Review: Step 2 — Session Validation Middleware

### Verdict: APPROVE

### Summary
The plan is well-structured and covers all outcomes specified in PROMPT.md Step 2. The approach — a `validateSessionId(req)` helper that returns `sessionId | null`, applied centrally in `handleRequest` — is clean, testable, and correctly scoped. Test scenarios listed align with the PROMPT.md requirements.

### Issues Found
None blocking.

### Missing Items
None. All required outcomes from PROMPT.md Step 2 are covered:
- Session validation on all `/api/*` routes except `GET /api/health` ✅
- Read `X-Session-Id` header, validate non-empty string ✅
- Return 400 with exact error message format ✅
- Pass validated session ID to handlers ✅
- Test scenarios match PROMPT.md requirements ✅

### Suggestions
1. **OPTIONS preflight is naturally exempt** — The current `handleRequest` already returns early for OPTIONS at the top (line ~252). The session validation should be placed after the OPTIONS check, which the plan's "apply in handleRequest" approach implies but doesn't state explicitly. Just keep this in mind during implementation.

2. **Whitespace-only session IDs** — Consider whether `"   "` (whitespace-only) should be treated as empty. The PROMPT.md says "validate it's a non-empty string" — a `trim()` check would be a sensible defensive measure but isn't strictly required.

3. **Existing test impact** — The plan mentions modifying `handleChat` and `handleRequest` signatures. Some existing tests (e.g., SSE streaming tests) call `handleChat(req, "test-key")` directly. These will need updated signatures. The plan's test checkbox implicitly covers this ("valid session passes"), but the worker should expect ~6–8 existing test calls to need a `sessionId` parameter added once the signature changes.

4. **Future-proofing the exemption pattern** — Steps 4 and 5 add more `/api/*` endpoints (`/api/steer`, `/api/history`, `/api/usage`). The validation placement in `handleRequest` should be designed so new routes automatically get session validation without additional code. A pattern like "if path starts with `/api/` and it's not the health endpoint, validate" achieves this.
