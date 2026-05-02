# HG-E2E-014: E2E run logs quota API 502 errors under Bun/nock

**Status:** Fixed

**Severity:** Medium (test reliability/noise)

## Reproduce

Run:

```bash
just test-e2e
```

## Observed

Tests pass, but server logs repeated:

```text
ERROR quota api error TypeError: Attempted to assign to readonly property.
GET /api/quota status=502
```

## Expected

Mocked `/v1/token_plan/remains` should return 200 with quota data, no server error logs.

## Hypothesis

`nock` does not reliably intercept Bun's native `fetch`, or mutates readonly Bun response/request internals. E2E moved runtime to Bun but mocks were designed for Node HTTP interception.

## Investigation

Manual real `/api/quota` call with real API key returned 200. Failure only appears during mocked E2E. So endpoint works; mock layer is noisy/brittle.

## Fix

Replace `nock` in E2E with one of:

1. injectable `fetch` wrapper in server/agent/tools for tests
2. local MiniMax mock HTTP server and configurable `MINIMAX_BASE`
3. run E2E server under Node only (not preferred)

## Prevent

E2E should assert `/api/quota` returns 200 and fail on server error logs.
