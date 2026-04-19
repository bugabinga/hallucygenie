## Plan Review: Step 1 — Database Initialization at Startup

### Verdict: APPROVE

### Summary

The plan correctly covers all PROMPT.md requirements for Step 1: calling `initDb` at startup, ensuring the `data/` directory exists, closing the DB in `shutdown()`, and testing all of these scenarios. The approach fits cleanly into the existing server architecture — module-level variable for the DB handle, reuse of existing signal handlers, and standard Node.js `mkdirSync` for directory creation.

### Issues Found

None blocking. The plan is well-scoped and matches the requirements.

### Missing Items

None. All PROMPT.md Step 1 requirements are represented.

### Suggestions

1. **Error on init failure** — The plan doesn't explicitly call out what happens if `initDb("data/hallucygenie.db")` fails (e.g., permissions error, corrupted file). Consider logging the error and exiting rather than starting a server with no DB. The current `startServer()` function runs synchronously at module level, so an unhandled throw from `initDb` would naturally prevent startup — just make sure tests verify this behavior.

2. **`mkdirSync` with `{ recursive: true }`** — Since `initDb` uses `new DatabaseSync(dbPath)` which fails if the parent directory doesn't exist, the `mkdirSync("data", { recursive: true })` call needs to happen _before_ `initDb`. The plan mentions this implicitly ("ensure `data/` dir created") but the ordering matters. Similarly, the `recursive` option is important in case the path ever has multiple missing segments.

3. **Test isolation** — The existing `db.test.ts` uses in-memory databases (`:memory:`) for speed. The new server tests for DB init should use a temp directory (like `mkdtempSync`) rather than the real `data/` dir, to avoid polluting the workspace and to ensure clean test isolation. The plan's "re-init works" checkbox suggests awareness of this.

4. **Export `getDb()` or similar accessor** — Later steps (2–5) will need the DB instance in `handleRequest` and route handlers. The plan stores it in a module-level variable, which is fine for now, but consider whether to export a `getDb()` function or just rely on the module-level `db` variable being accessible within `server.ts`. Either way works — just something to keep consistent.
