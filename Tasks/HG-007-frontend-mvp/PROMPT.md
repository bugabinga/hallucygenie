# Task: HG-007 — Frontend MVP with UI Tests

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
browsers). Chromium must be installed via Termux packages: `pkg install chromium`
(may require `x11-repo` enabled).

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

- `POST /api/chat` → `{ messages: [{role, content}] }` → SSE stream (requires `X-Session-Id` header)
- `POST /api/steer` → `{ message: "..." }` → 200 OK (requires `X-Session-Id` header)
- `GET /api/history` → `{ messages: [...] }` (requires `X-Session-Id` header)
- `GET /api/usage` → `{ usage: {...}, limits: {...} }` (requires `X-Session-Id` header)
- `GET /api/health` → `{ status: "ok", uptime: <seconds> }`

**Session management:**

- On first load, generate UUID v4, store in `localStorage` as `hallucygenie_session_id`
- Send `X-Session-Id` header with every API request
- If server returns 400 for missing session, show error prompting page reload

## Testing Requirements

- **100% unit test coverage** on `app.ts` logic (DOM helpers, SSE parsing, rendering)
- **Mutation tests** via `just test-mutation` — >= 80%
- **Snapshot tests** for rendered HTML output of message bubbles, tool cards
- **E2E tests with Playwright** for all important UI features
- **Use the justfile** — `just test-e2e` for Playwright, `just test` for unit tests

## Dependencies

- **Task:** HG-006 (server fully wired with agent loop, persistence, session validation)

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
- [ ] Verify server runs with full agent loop (`just dev`, test chat + image gen via curl)
- [ ] Install Playwright: add `playwright-core` to devDependencies
- [ ] Install Chromium: `pkg install chromium` (may need `x11-repo`)
- [ ] Verify Playwright launches Chromium with `PLAYWRIGHT_ALLOW_ANDROID=1`
- [ ] Create `e2e/` directory

### Step 1: HTML Structure

- [ ] Mobile-first full-screen chat layout
- [ ] Header with app name "HallucyGenie"
- [ ] Scrollable message list, fixed input area at bottom
- [ ] User message bubbles (right-aligned) and assistant bubbles (left-aligned)
- [ ] `<script type="module" src="app.ts">`

### Step 2: CSS — Design System + Mobile-First Styling

**Color palette (CSS custom properties):**

- `--color-primary`: red — headers, send button, active states, accents
- `--color-secondary`: green — success states, assistant message accents, online indicators
- `--color-tertiary`: gold — highlights, badges, achievements, important callouts
- `--color-bg`: very dark grey — main background, not pure black
- `--color-surface`: slightly lighter dark grey — cards, message bubbles, input area
- `--color-text`: off-white — readable text on dark backgrounds
- `--color-text-muted`: medium grey — timestamps, secondary info

**UX principles:**

- Beautiful: cohesive palette, generous spacing, smooth micro-animations (no jank), subtle shadows
- Simple: one thing per screen section, zero learning curve, obvious what to tap
- Kid-friendly: big targets (min 48px), emoji in UI labels, no jargon, friendly copy
- Fast: no layout shifts, instant input response, CSS animations only (no JS animation overhead)
- Responsive: works 320px–1440px+, touch and mouse
- Snappy: immediate feedback on every interaction (button press scale, ripple, color flash)
- Fun: playful but not childish, satisfying interactions, feels like a game not a form

- [ ] Define CSS custom properties for the full color palette
- [ ] `100dvh` full-height, no horizontal scroll
- [ ] Large touch targets (min 48px), readable font (min 16px)
- [ ] User message bubbles: primary (red) accent, right-aligned
- [ ] Assistant message bubbles: surface bg with secondary (green) accent, left-aligned
- [ ] Tool call cards: tertiary (gold) accent border, loading spinner → result
- [ ] Send button: primary (red), satisfying press animation
- [ ] Typing indicator: animated dots in assistant color
- [ ] Inline images: rounded corners, subtle shadow, tap to enlarge
- [ ] Audio players: styled with primary/secondary colors, clear play button
- [ ] Error states: soft red, friendly message, no scary technical text
- [ ] **Snapshot tests:** Snapshot rendered HTML of each UI state

### Step 3: Chat Logic in app.ts

- [ ] On load: generate/load session UUID from localStorage
- [ ] Load history from `GET /api/history` with `X-Session-Id` header
- [ ] Send messages via `POST /api/chat`, parse SSE response using `fetch` + `ReadableStream`
- [ ] Handle all SSE events (text, tool_start, tool_end, done)
- [ ] Auto-scroll message list as content arrives
- [ ] Disable input while streaming, re-enable on `done`
- [ ] **Tests:** Unit test SSE parsing, message rendering, input state, session UUID generation — all with mocked fetch
- [ ] **Snapshot tests:** Snapshot rendered message bubbles for text, tool calls, images, audio

### Step 4: Steering UI

- [ ] Allow typing during stream, send via `POST /api/steer`
- [ ] Visually distinguish steer messages (different color or indicator)
- [ ] **E2E test:** Steer during active stream

### Step 5: Tool Result Rendering

- [ ] Image → `<img>` in card, clickable for full-size view
- [ ] TTS → `<audio>` player with play button
- [ ] Music → `<audio>` player with play button
- [ ] Error → friendly error card with emoji
- [ ] **E2E tests:** Request image, request TTS, request music — verify correct rendering

### Step 6: Playwright E2E Tests

- [ ] Create `playwright.config.ts`:
  - `use`: baseURL `http://localhost:3000`, env `PLAYWRIGHT_ALLOW_ANDROID=1`
  - System Chromium (`executablePath` if needed)
  - `testDir: './e2e'`
- [ ] E2E test: send message → see streaming response
- [ ] E2E test: request image → image appears inline
- [ ] E2E test: request speech → audio player appears
- [ ] E2E test: request music → audio player appears
- [ ] E2E test: steer during stream
- [ ] E2E test: reload page → history loads from server
- [ ] E2E test: error state displays correctly
- [ ] E2E test: quota warning appears when approaching limit
- [ ] All E2E tests run via `just test-e2e`

### Step 7: Coverage and Mutation Testing

- [ ] `just test-coverage` → 100% on app.ts
- [ ] `just test-mutation` → >= 80%
- [ ] Fill gaps, kill mutants

## Completion Criteria

- [ ] Mobile-first chat UI works on phone browsers
- [ ] SSE streaming renders text as it arrives
- [ ] Image/audio results display inline
- [ ] Steering works during streaming
- [ ] History persists across page reloads
- [ ] Session UUID managed in localStorage
- [ ] `just test` passes all unit tests (100% coverage)
- [ ] `just test-mutation` >= 80%
- [ ] Snapshot tests for all UI states
- [ ] `just test-e2e` passes all Playwright tests
- [ ] Feels fun, simple, and snappy

## Git Commit Convention

- **Implementation:** `feat(HG-007): mobile-first chat frontend with E2E tests`
- **Checkpoints:** `checkpoint: HG-007 description`

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
