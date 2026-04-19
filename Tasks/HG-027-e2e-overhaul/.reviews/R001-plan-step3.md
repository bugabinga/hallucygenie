## Plan Review: Step 3 — Overhaul `e2e/run-e2e.ts`

### Verdict: REVISE

### Summary

The plan correctly identifies the major restructuring needed: replacing the static file server with the real server, integrating nock mocks, and fixing 4 broken tests. However, there are several infrastructure gaps that will cause the tests to fail at runtime if not addressed — most critically the missing `MINIMAX_API_KEY` env var, server startup synchronization, and mock persistence across tests.

### Issues Found

1. **[Severity: critical] `MINIMAX_API_KEY` environment variable must be set** — `server.ts:462-469` checks `process.env.MINIMAX_API_KEY` and returns HTTP 503 if missing. Even with nock intercepting outbound calls, the server never gets to the fetch — it bails early. The plan must set a dummy key (e.g., `process.env.MINIMAX_API_KEY = "test-key-for-e2e"`) before calling `initDatabase()` / `startServer()`. Without this, the "Enter key sends message" test (and any chat-related flow) will always fail.

2. **[Severity: critical] Server startup must be awaited before tests run** — `startServer()` calls `server.listen(port, callback)` and returns the `Server` immediately — the listen callback fires asynchronously. If tests start running before the server is bound to the port, all `page.goto(BASE_URL)` calls will get ECONNREFUSED. The plan needs a mechanism to await the server's listen callback, e.g.:

   ```ts
   await new Promise<void>((resolve) => {
     startServer(testPort);
     // or wrap startServer to return a Promise
   });
   ```

3. **[Severity: important] Database and assets must use a temp directory** — `initDatabase()` defaults to `data/hallucygenie.db` and the server creates `data/assets/` directories. Running E2E tests will pollute or corrupt the real database. The plan should call `initDatabase(join(tmpdir(), "e2e-test.db"))` and clean up the temp directory afterward.

4. **[Severity: important] Nock mocks must persist across all tests** — Each test creates a new page that calls `init()` → `updateQuotaBadge()` → `GET /api/quota`. If the quota nock interceptor in `minimax-mock.ts` is a one-shot `.reply()`, only the first test gets a response; all subsequent tests will either hit the real MiniMax API (fail) or get a nock error. Either:
   - Use `nock.persist()` for always-needed endpoints (quota, chat)
   - Or call `setupMinimaxMocks()` + `cleanupMinimaxMocks()` per test (not just once in `before`/`after`)

5. **[Severity: important] Server shutdown missing from teardown** — The plan mentions `cleanupMinimaxMocks()` in teardown but doesn't call `shutdown()` from server.ts to close the HTTP server and database. Without this, the test process may hang (server keeps listening) and the temp database file may be locked.

6. **[Severity: important] `.message--welcome` is static HTML, not an init indicator** — The plan says to fix tests by waiting for `.message--welcome`, but this element is hardcoded in `index.html:124` — it exists in the DOM immediately after `page.goto()`, before any JavaScript runs. Waiting for it does NOT guarantee `init()` has completed. A reliable init indicator would be checking that the session UUID exists in localStorage (`getOrCreateSessionId()` is called synchronously from `loadHistory()` within `init()`):
   ```ts
   await page.waitForFunction(
     () => localStorage.getItem("hallucygenie_session_id") !== null,
   );
   ```

### Missing Items

- Explicit port selection (e.g., 3001) to avoid conflicting with a running dev server on 3000. The worker should pass a non-default port to `startServer()`.
- Cleanup of temp directory and temp database after tests complete.
- The `before` / `after` hook pattern shown in PROMPT.md assumes a test framework API, but `run-e2e.ts` uses a custom test harness with `runTest()` — the worker needs to adapt the setup/teardown to the existing harness structure (try/finally wrapping `runE2ETests()`).

### Suggestions

- Consider a `waitForApp()` helper that combines `page.goto()` + waiting for session UUID in localStorage + waiting for `#send-button` to be in DOM — this is the reliable "app is ready" signal for all tests
- The onboarding overlay shows on every fresh page context (no localStorage). Tests that interact with elements behind the overlay (like the create button) may need to dismiss onboarding first, or set `localStorage.setItem("hg_onboarding_done", "1")` before `page.goto()`
- After all tests complete, call `process.exit()` with the correct exit code — the server's keep-alive connections may prevent natural process exit
