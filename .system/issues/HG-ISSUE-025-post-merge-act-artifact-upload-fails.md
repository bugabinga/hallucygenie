# HG-ISSUE-025 — Post-merge `ci-act` fails uploading mutation artifact

**Severity:** Medium  
**Area:** Local merge hook / CI act compatibility  
**Status:** Fixed

## Report

Post-merge hook runs `just hook-post-merge` on `trunk`, which runs full `just ci-act`.
After merging `hg-tickets-008-057`, local `act` completed check/unit/integration/e2e and mutation work, but failed in the mutation job's artifact upload step.

## Evidence

No `logs/dev.log` present.

```text
[CI/mutation] INFO MutationTestReportHelper Final mutation score of 70.61 is greater than or equal to break threshold 70
[CI/mutation] INFO HtmlReporter Your report can be found at: file:///home/me/Workspace/hallucygenie/trunk/reports/mutation/agent.html
[CI/mutation] INFO MutationTestExecutor Done in 1 minute and 6 seconds.
[CI/mutation] ✅  Success - Main Mutation tests [1m9.293494571s]
time="2026-05-03T01:28:55+02:00" level=error msg="Error decode request body: proto:\u00a0(line 1:104): unknown field \"mime_type\""
[CI/mutation] | Attempt 1 of 5 failed with error: Unexpected end of JSON input. Retrying request in 3000 ms...
...
[CI/mutation] ❗  ::error::Failed to CreateArtifact: Failed to make request after 5 attempts: Unexpected end of JSON input
[CI/mutation] ❌  Failure - Main Upload mutation reports [31.825354257s]
Error: Job 'mutation' failed
error: Recipe `ci-act` failed on line 172 with exit code 1
error: Recipe `hook-post-merge` failed on line 199 with exit code 1
```

Local runner:

```text
act version 0.2.87
```

## Diagnosis

`actions/upload-artifact@v7.0.1` sends an artifact-create request containing a `mime_type` field. The local `act` artifact server in `act 0.2.87` does not understand that field, so the artifact upload action fails even though the actual validation steps already passed.

This is a tooling compatibility failure between `act` and `actions/upload-artifact@v7`, not a failing app test or mutation threshold failure.

## Impact

The post-merge hook exits non-zero after a successful local validation run, which makes the merge hook noisy/untrustworthy.

## Fix options

1. Skip artifact upload under `act` in `.github/workflows/ci.yml`:
   `if: ${{ always() && !env.ACT }}`.
2. Pin `actions/upload-artifact` to a version compatible with local `act`.
3. Change post-merge hook to run local recipes directly instead of full `ci-act`.

Preferred: option 1. Keep GitHub artifact uploads; avoid incompatible local act upload.

## Fix

Implemented 2026-05-03:

- Changed mutation report upload to `if: ${{ always() && !env.ACT }}`.
- Added static regression coverage so local act keeps skipping artifact uploads.

## Validation

- Reproduced before fix with `just ci-act-mutation`: mutation passed, upload failed on `unknown field "mime_type"`.
- Verified after fix with `just ci-act-mutation`: mutation job succeeded under local `act`.
- Verified full merge hook with `just hook-post-merge`: check/e2e/mutation jobs succeeded under local `act`.
- `just check`
- `bun test test/static.test.ts`
