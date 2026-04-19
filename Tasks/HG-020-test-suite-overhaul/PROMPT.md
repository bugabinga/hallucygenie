# HG-020: Test Suite Overhaul

Split tests into unit/integration/e2e, add fmt, clean up justfile, push coverage to 100%.

## Justfile

### `just fmt`

Run TypeScript formatter on entire project. Use `npx dprint fmt` if available, else echo "no formatter" (non-blocking).

### `just lint`

Type check: `npx tsc --noEmit`.

### `just test-unit`

All unit tests, max 30s wall clock. Uses single node --test process with all 4 backend files + isolated frontend test file. Target: ≥360 tests.

### `just test-integration`

New file `integration.test.ts`. Real HTTP server + in-memory SQLite + mock fetch. 5-10 tests. Tests: /api/health, /api/quota (mock fetch), /assets, /asset/:id.

### `just test-e2e`

Playwright E2E. Keep existing logic.

### `just test-all`

fmt check → type check → test-unit → test-integration (NOT e2e — that's manual).

### `just test-mutation`

Run all stryker configs in sequence: stryker.config.mjs (agent) + stryker-tools.mjs (tools) + stryker-db.mjs (db).

## Coverage Gaps

### agent.ts (90.69% → 100%)

Uncovered lines: 209-243 (error handling), 245-265, 327-328, 540.

Add tests for error paths in runAgentLoop (network failure, parse errors).

### db.ts (91.47% → 100%)

Uncovered: 233-246, 249-252, 255-258.

Add tests for migration rollback errors, getPreferences empty, checkQuota unknown feature.

### server.ts (83.78% → 100%)

Uncovered: error handling in all route handlers, saveAssetFile paths.

Add tests for: GET /assets, GET /asset/:id not found, saveAssetFile non-dataURL passthrough, Quota API error, invalid session ID.

### tools.ts (98.92% → 100%)

Uncovered: 343-344, 368-369.

Add tests for network failure in web_search and analyze_image.

## Split Tests

### Unit tests

- server.test.ts (mock DB, mock fetch)
- agent.test.ts (mock fetch)
- tools.test.ts (mock fetch)
- db.test.ts (in-memory SQLite)
- public/app.test.ts (mock DOM)

### Integration tests (integration.test.ts)

- Real HTTP server, in-memory SQLite, mock fetch
- Routes: GET /api/health, GET /api/quota (mock), GET /assets, GET /asset/:id

## AGENTS.md Update

Update Testing section:

- `just test-unit` replaces `just test`
- `just test-integration` new
- `just test-mutation` new
- `just fmt` new
- Remove old test counts
- 100% line coverage targets
