# HG-027: E2E Test Overhaul

**Status:** 🟡 In Progress
**Iteration:** 1
**Current Step:** Step 6: Verification
**Last Updated:** 2026-04-20
**Review Level:** 2 (Plan + Code)
**Breaking:** none
**Risk:** low

## Steps

### Step 1: Install nock
- [x] Install nock and @types/nock as devDependencies

### Step 2: Create MiniMax Mock (`e2e/minimax-mock.ts`)
- [x] Create e2e/minimax-mock.ts with nock intercepts for all MiniMax endpoints (chat, image, TTS, music, web search, vision, quota)

### Step 3: Overhaul `e2e/run-e2e.ts`
- [x] Integrate real server (import startServer/initDatabase from server.ts) instead of static file server
- [x] Set MINIMAX_API_KEY env var before starting server (required by server.ts handleChat)
- [x] Await server listen callback before running tests (startServer is async)
- [x] Use temp directory for database and assets, clean up after tests
- [x] Add nock mock setup/teardown around test runs — use .persist() for quota/chat mocks
- [x] Add proper server shutdown + cleanup in teardown (shutdown(), nock.cleanAll(), temp dir cleanup)
- [x] Create reliable waitForApp helper: page.goto + wait for session UUID in localStorage + wait for #send-button
- [x] Fix broken test: "send button disabled when input is empty" — use waitForApp helper
- [x] Fix broken test: "Enter key sends message" — use waitForApp helper, MiniMax mock provides SSE
- [x] Fix broken test: "session UUID stored in localStorage" — use waitForApp helper
- [x] Fix broken test: "lightbox opens and closes" — fix backdrop click handler
- [x] For tests interacting with elements behind onboarding, dismiss onboarding first or pre-set localStorage

### Step 4: Add New Tests
- [x] Add test: "onboarding shows on first visit"
- [x] Add test: "onboarding completes and hides"
- [x] Add test: "create modal opens and shows tabs"
- [x] Add test: "create modal switches tabs"
- [x] Add test: "create modal closes"
- [x] Add test: "quota badge shows in header"
- [x] Add test: "session persists across page reloads"

### Step 5: Update justfile
- [x] Update test-e2e recipe (remove static server, use real server via run-e2e.ts)

### Step 6: Verification
- [ ] Run `just test-e2e` — target 17+ tests, 0 failures

## Execution Log

| Time | Event | Notes |
|------|-------|-------|
| 2026-04-19 22:40 | Task started | Runtime V2 lane-runner execution |
| 2026-04-20 00:00 | Hydrated STATUS.md | Expanded steps with granular checkboxes |
| 2026-04-20 01:18 | Steps 1-5 complete | All 17 E2E tests passing, 0 failures |

## Discoveries

| ID | Discovery | Notes |
|----|-----------|-------|
| D1 | Server sends SSE text events as `data: {"choices":[...]}` (no event type prefix) | Frontend expects OpenAI-style format for text |
| D2 | Agent expects Anthropic SSE format: `event: content_block_delta` + `data: {"delta":{"type":"text_delta","text":"..."}}` | Mock needs to produce this format |
| D3 | server.ts only auto-starts when run directly (`process.argv[1]` check) | Safe to import startServer/initDatabase without side effects |
| D4 | Onboarding checks `localStorage.getItem("hg_onboarding_done")` | First visit (fresh context) shows onboarding |
| D5 | Quota badge fetches `/api/quota` on init | Needs quota mock for test |
| D6 | esbuild needs `--bundle` flag to inline `markdown.ts` into `app.js` | Without it, browser tries to import `.ts` file and fails |
| D7 | playwright-core needs Android platform patch (treat android like linux) | Patched 3 files in node_modules/playwright-core |

## Blockers

None.
