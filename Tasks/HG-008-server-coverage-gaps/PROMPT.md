# Task: HG-008 — Server-Side Coverage Gap Fill

**Created:** 2026-04-18
**Size:** S

## Review Level: 2 (Plan + Code)

**Assessment:** Test coverage gaps in server.ts — thinking token alt branches, Node adapter error catch.
**Score:** 2/8 — Blast radius: 0, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Fill the remaining coverage gaps in `server.ts`. Currently at 96.23% line / 91.91% branch.
Get it to 100% line (or as close as possible — signal handlers can't be unit tested).

**Uncovered lines:**
- Lines 95-97: `THINK_CLOSE_ALT` branch (the `</think_intended>` close tag path)
- Lines 115-117: `THINK_OPEN_ALT` branch (the `<think_intended>` open tag path)
- Lines 598-603: Node adapter error catch (the `catch` block in `handleNodeRequest`)
- Lines 671-690: `setupSignalHandlers` + main entry guard — **structural, skip these**

**Do NOT try to test signal handlers or the main entry guard.** Those only run when `node server.ts`
is executed directly and can't be meaningfully unit tested.

## Testing Requirements

- **Use the justfile** for ALL build/test commands
- Tests go in `server.test.ts`
- Mock as needed — no real API calls

## Dependencies

- None

## File Scope

- `server.test.ts` (add tests only)

## Steps

### Step 0: Preflight

- [ ] Run `just test` — 295 tests pass

### Step 1: Test THINK_CLOSE_ALT Branch

- [ ] Write a test that feeds content with the `<think_intended>...</think_intended>` close tag
    (not the `</think_intended>` form but `</think_intended>`)
- [ ] Verify thinking content is stripped when the close tag is `</think_intended>`
- [ ] This covers lines 95-97

### Step 2: Test THINK_OPEN_ALT Branch

- [ ] Write a test where `<think_intended>` appears BEFORE `<think_intended>` in the text
    (so the `open2` branch wins the race)
- [ ] Verify the short form `<think_intended>` is detected as an open tag
- [ ] This covers lines 115-117

### Step 3: Test Node Adapter Error Catch

- [ ] Write a test that causes `handleNodeRequest` to throw after headers are NOT sent
- [ ] Verify it returns 500 with `{ error: "Internal server error" }`
- [ ] Write a test where headers ARE already sent (the `if (!res.headersSent)` branch)
- [ ] This covers lines 598-603

### Step 4: Verify

- [ ] `just test` — all pass
- [ ] Coverage on server.ts >= 98% line (signal handlers remain uncovered)

## Completion Criteria

- [ ] THINK_CLOSE_ALT and THINK_OPEN_ALT branches tested
- [ ] Node adapter error catch tested
- [ ] `just test` passes
- [ ] server.ts line coverage >= 98%

## Git Commit Convention

- **Implementation:** `test(HG-008): fill server.ts coverage gaps`

## Do NOT

- Try to test signal handlers or main guard
- Modify server.ts (only add tests)
- Create classes
- Run `bun test` directly — use `just test`

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
