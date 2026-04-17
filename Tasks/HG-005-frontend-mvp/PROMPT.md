# Task: HG-005 — Frontend MVP with UI Tests

**Created:** 2026-04-16
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Frontend with Playwright E2E tests. New pattern (Playwright on Termux).
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1 (Playwright on Android), Security: 0, Reversibility: 1

## Mission

Build a mobile-first chat UI and comprehensive Playwright E2E tests. The UI should
feel fun for an 11-year-old — big buttons, clear feedback, no complexity. Think
messaging app, not dashboard.

Vanilla TypeScript, no framework, no build step beyond what Bun serves. CSS is
mobile-first, dark theme, touch-friendly.

**Playwright on Termux:** This environment is Android/Termux (aarch64). Playwright
can run here with `PLAYWRIGHT_ALLOW_ANDROID=1` env flag (merged in PR #36846).
Use `playwright-core` (not the full `playwright` package which tries to download
browsers). Chromium must be installed via Termux packages. If Chromium is not yet
available, install it: `pkg install chromium` (may require `x11-repo` enabled).

If Playwright cannot be made to work on this Termux setup, fall back to:
1. Using Bun's built-in `happy-dom` for DOM testing (less ideal but functional)
2. Documenting the Playwright setup for the user's actual deployment environment

**SSE events from server:**
```
event: text       → data: {"delta": "..."}
event: tool_start → data: {"id":"...", "name":"generate_image", "arguments":{...}}
event: tool_end   → data: {"id":"...", "name":"...", "result": {...}}
event: done       → data: {}
```

**API endpoints:**
- `POST /api/chat` → `{ messages: [{role, content}] }` → SSE stream
- `POST /api/steer` → `{ message: "..." }` → 200 OK
- `GET /api/history` → `{ messages: [...] }`

## Testing Requirements

- **100% unit test coverage** on `app.ts` logic (DOM interaction helpers, SSE parsing, message rendering)
- **Mutation tests** via `just test-mutation` — >= 80%
- **Snapshot tests** for rendered HTML output of message bubbles, tool cards
- **E2E tests with Playwright** for all important UI features:
  - Sending a message and seeing response stream in
  - Image gen result displaying inline
  - Audio player appearing for TTS/music
  - Steering during streaming
  - History loading on page reload
  - Mobile touch interactions (tap send, scroll)
  - Error states display
- **Use the justfile** — `just test-e2e` for Playwright, `just test` for unit tests

## Dependencies

- **Task:** HG-003 (server must serve static files and SSE)
- **Task:** HG-004 (agent loop with tool execution for full experience)

## Context to Read First

- `Tasks/CONTEXT.md`
- `justfile`

## Environment

- **Workspace:** `public/` directory
- **Services required:** Server running on localhost:3000
- **OS:** Android/Termux aarch64
- **Playwright:** Use `PLAYWRIGHT_ALLOW_ANDROID=1`, `playwright-core`, system Chromium

## File Scope

- `public/index.html`
- `public/app.ts`
- `public/style.css`
- `public/app.test.ts` (unit tests with happy-dom)
- `e2e/` (Playwright E2E test directory)
- `playwright.config.ts`
- `__snapshots__/` (HTML snapshots)

## Steps

### Step 0: Preflight

- [ ] Verify `public/` directory exists
- [ ] Verify server runs and SSE works (start with `just dev`, curl test)
- [ ] Install Playwright: add `playwright-core` to devDependencies
- [ ] Install Chromium if not present: `pkg install chromium` (may need `x11-repo`)
- [ ] Verify Playwright can launch Chromium with `PLAYWRIGHT_ALLOW_ANDROID=1`
- [ ] Add `e2e/` directory

### Step 1: HTML Structure

- [ ] Mobile-first full-screen chat layout
- [ ] Header, scrollable message list, fixed input area
- [ ] User/assistant message bubbles
- [ ] `<script type="module" src="app.ts">`

### Step 2: CSS — Mobile-First Dark Theme

- [ ] `100dvh` full-height, no horizontal scroll
- [ ] Dark theme with good contrast, gaming aesthetic
- [ ] Large touch targets (min 44px), readable font (min 16px)
- [ ] Message bubble animations
- [ ] Tool call cards: "🎨 Generating image..." → result
- [ ] Inline image display, audio players
- [ ] Typing/loading indicator
- [ **Snapshot tests:** Snapshot rendered HTML of each UI state (empty chat, messages, tool card, image result, audio player, error)

### Step 3: Chat Logic in app.ts

- [ ] Load history from `GET /api/history`
- [ ] Send messages via `POST /api/chat`, parse SSE response
- [ ] Handle all SSE events (text, tool_start, tool_end, done)
- [ ] Auto-scroll, input state management
- [ ] **Tests:** Unit test SSE parsing, message rendering, input state transitions — all with mocked fetch
- [ ] **Snapshot tests:** Snapshot rendered message bubbles for text, tool calls, images, audio

### Step 4: Steering UI

- [ ] Allow typing during stream, send via `POST /api/steer`
- [ ] Visually distinguish steer messages
- [ ] **E2E test:** Steer during active stream

### Step 5: Tool Result Rendering

- [ ] Image → `<img>` in card, clickable for full-size
- [ ] TTS → `<audio>` player
- [ ] Music → `<audio>` player
- [ ] Error → friendly error card
- [ ] **E2E tests:** Request image, request TTS, request music — verify correct rendering

### Step 6: Playwright E2E Tests

- [ ] Create `playwright.config.ts`:
  - `use`: baseURL `http://localhost:3000`, launchOptions with `PLAYWRIGHT_ALLOW_ANDROID=1`
  - Use system Chromium (`executablePath` if needed)
  - `testDir: './e2e'`
- [ ] E2E test: send message → see streaming response
- [ ] E2E test: request image → image appears inline
- [ ] E2E test: request speech → audio player appears
- [ ] E2E test: request music → audio player appears
- [ ] E2E test: steer during stream
- [ ] E2E test: reload page → history loads
- [ ] E2E test: error state displays correctly
- [ ] All E2E tests run via `just test-e2e`

### Step 7: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on app.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill mutants

## Documentation Requirements

**Must Update:** None
**Check If Affected:** None

## Completion Criteria

- [ ] Mobile-first chat UI works on phone browsers
- [ ] SSE streaming renders text as it arrives
- [ ] Image/audio results display inline
- [ ] Steering works during streaming
- [ ] History persists across page reloads
- [ ] `just test` passes all unit tests (100% coverage)
- [ ] `just test-mutation` >= 80%
- [ ] Snapshot tests for all UI states
- [ ] `just test-e2e` passes all Playwright tests
- [ ] Feels fun and simple

## Git Commit Convention

- **Implementation:** `feat(HG-005): mobile-first chat frontend with E2E tests`
- **Checkpoints:** `checkpoint: HG-005 description`

## Do NOT

- Use any frontend framework
- Add a build step
- Use npm packages in the frontend (only in tests)
- Create classes
- Over-design CSS
- Skip Playwright setup — E2E tests are required

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
