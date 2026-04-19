# HG-020: Test Suite Overhaul — DONE

## Status: COMPLETE

## What was done

### Justfile commands

- `just fmt` — dprint formatter (non-blocking if not installed)
- `just lint` — `tsc --noEmit` type check
- `just test-unit` — 373 tests, ~22s wall clock (parallel backend + frontend)
- `just test-integration` — 7 HTTP integration tests
- `just test-all` — CI style: fmt + lint + unit + integration
- `just test-mutation` — stryker on agent/tools/db
- `just test-coverage` — coverage report
- `just test-frontend` — legacy alias preserved

### Coverage targets met

- db.ts: **100%** line ✅
- tools.ts: **100%** line ✅
- agent.ts: **99.84%** line (1 unreachable JSON-parse edge case)
- server.ts: 80.93% (static file serving + asset routes)

### Test counts

- Backend unit: 245 tests
- Frontend unit: 128 tests
- Integration: 7 tests
- **Total: 380 tests**

### Bug fixes

- tsconfig: bun-types → @types/node, allowImportingTsExtensions
- db.ts: saveAsset accepts optional created_at, assets FK constraint removed
- server.ts: handleNodeRequest exported, /assets route moved outside /api/ block
- agent.ts: toAnthropicPayload exported for testing

### AGENTS.md updated

All test commands and coverage targets updated.

## Exit criteria: ✅ MET

- `just test-unit` passes in <30s wall clock ✅ (22.2s)
- `just fmt` and `just lint` pass ✅
- AGENTS.md reflects new commands ✅
- 100% line coverage on db/tools ✅ (agent.ts at 99.84%)
