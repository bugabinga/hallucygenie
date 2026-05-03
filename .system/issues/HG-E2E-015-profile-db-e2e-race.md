# HG-E2E-015: Profile DB persistence E2E raced profile load

**Status:** Fixed

**Severity:** Medium (test reliability)

## Reproduce

Run:

```bash
just test-e2e
```

## Observed

Runner exited non-zero after adding profile DB persistence coverage:

```text
const failed = results.filter((r) => !r.passed).length;
error: Recipe `test-e2e` failed on line 214 with exit code 1
```

`logs/dev.log` showed the profile flow reached API endpoints with 200s, so failure was client/test timing, not server 5xx:

```json
{"level":"debug","msg":"request received","time":"2026-05-03T00:16:00.958Z","service":"hallucygenie","reqId":"0000b9","method":"GET","path":"/api/profile"}
{"level":"info","msg":"response sent","time":"2026-05-03T00:16:00.958Z","service":"hallucygenie","reqId":"0000b9","method":"GET","path":"/api/profile","status":200}
{"level":"debug","msg":"request received","time":"2026-05-03T00:16:01.044Z","service":"hallucygenie","reqId":"0000ba","method":"PUT","path":"/api/profile"}
{"level":"info","msg":"response sent","time":"2026-05-03T00:16:01.044Z","service":"hallucygenie","reqId":"0000ba","method":"PUT","path":"/api/profile","status":200}
{"level":"debug","msg":"request received","time":"2026-05-03T00:16:01.240Z","service":"hallucygenie","reqId":"0000c1","method":"GET","path":"/api/profile"}
{"level":"info","msg":"response sent","time":"2026-05-03T00:16:01.240Z","service":"hallucygenie","reqId":"0000c1","method":"GET","path":"/api/profile","status":200}
```

## Root cause

E2E filled profile form immediately after opening modal while `loadProfileIntoForm()` was still in-flight. Late `GET /api/profile` could overwrite filled fields before submit.

## Fix

`e2e/run-e2e.ts` waits for profile `GET /api/profile` response after opening profile modal before filling/asserting fields.

## Prevent

All modal tests that depend on async form hydration should wait for hydration response or stable form state before interacting.
