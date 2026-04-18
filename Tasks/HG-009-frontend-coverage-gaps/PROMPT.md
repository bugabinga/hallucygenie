# Task: HG-009 — Frontend Coverage Gap Fill

**Created:** 2026-04-18
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Frontend app.ts is at 37% line coverage. 63% of the runtime code is untested.
This is the biggest testing gap in the project.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 2 (DOM mocking), Security: 0, Reversibility: 1

## Mission

Get `public/app.ts` from 37% to ≥90% line coverage. The current tests only cover pure
functions (renderMarkdown, parsing, rendering). The entire interactive runtime is untested:

**Uncovered functions (must test):**
- `renderThinkingBlock` — collapsible thinking block HTML
- `streamChat` — fetch + SSE stream processing, error handling, all response codes
- `handleSSEEvent` — SSE event routing: text, tool_start, tool_result, done, error
- `appendText` — text accumulation with thinking block parsing
- `sendMessage` — main send flow (user msg → assistant msg → stream)
- `sendSteerMessage` — steer during active stream
- `loadHistory` — load and render messages from API
- `setStreamingUI` — UI state toggling
- `finishStreaming` — cleanup state
- `init` — event binding (form submit, input, keydown, lightbox, steer)

**What's already covered (DO NOT rewrite):**
- `renderMarkdown` (32 tests)
- `parseSSELine` / `parseSSEChunk` (11 tests)
- `getOrCreateSessionId` (4 tests — local copy)
- `createApiHeaders` (2 tests)
- `getToolEmoji` (5 tests)
- DOM rendering functions (10 tests)
- Snapshot tests (8 tests)

## Testing Strategy

**Import from `app.ts` directly** — do NOT copy/reimplement functions.

For DOM-dependent functions, use `happy-dom` (already in devDependencies):
```ts
const { Window } = await import("happy-dom");
const win = new Window();
const doc = win.document;
// Set globalThis.document = doc before testing DOM functions
```

For `fetch`-dependent functions (`streamChat`, `loadHistory`, `sendSteer`), mock `globalThis.fetch`:
```ts
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(...);
// ... test ...
globalThis.fetch = originalFetch;
```

For functions that call DOM helpers like `$()`, set up a minimal DOM environment
with the expected elements (message-list, chat-input, send-button, etc.).

## Testing Requirements

- **Use the justfile** for ALL build/test commands
- Tests go in `public/app.test.ts` (add to existing file)
- Import real functions from `./app.ts`
- Mock fetch and DOM — no real API calls or browser needed

## Dependencies

- None

## File Scope

- `public/app.test.ts` (add tests only)

## Steps

### Step 0: Preflight

- [ ] Run `just test` — 295 tests pass
- [ ] Verify `public/app.ts` current coverage is ~37%

### Step 1: Test `renderThinkingBlock`

- [ ] Import `renderThinkingBlock` from `./app.ts`
- [ ] Test: single line thinking → "💭 Thinking…"
- [ ] Test: multi-line thinking → "💭 Thinking (N lines)…"
- [ ] Test: content is rendered through `renderMarkdown`
- [ ] Test: output contains `<details>` and `<summary>` tags

### Step 2: Test `streamChat` Error Paths

- [ ] Import `streamChat` from `./app.ts`
- [ ] Mock `globalThis.fetch`
- [ ] Test: 400 response → calls `showError` with parsed error
- [ ] Test: 503 response → calls `showError` with parsed error
- [ ] Test: 200 with null body → calls `showError` with "No response"
- [ ] Test: network error (fetch throws) → calls `showError` with connection message

### Step 3: Test `streamChat` SSE Processing

- [ ] Test: text events → content accumulated
- [ ] Test: tool_start event → tool card created
- [ ] Test: tool_result event → tool card replaced with result
- [ ] Test: [DONE] → stream finishes
- [ ] Test: error event → showError called

### Step 4: Test `appendText` with Thinking Blocks

- [ ] Mock the DOM state (`currentAssistantContent`)
- [ ] Test: plain text → renders via markdown
- [ ] Test: text with `<think_intended>...</think_intended>` → thinking block created
- [ ] Test: thinking block closed, then regular text follows
- [ ] Test: partial thinking tag across calls

### Step 5: Test `sendMessage`

- [ ] Mock DOM elements (message-list, chat-input)
- [ ] Mock `streamChat` to return immediately
- [ ] Test: creates user message element in message list
- [ ] Test: creates assistant message element
- [ ] Test: clears input after send
- [ ] Test: empty message → returns immediately
- [ ] Test: while streaming → delegates to `sendSteerMessage`

### Step 6: Test `loadHistory`

- [ ] Mock `globalThis.fetch` to return message history
- [ ] Mock DOM (message-list)
- [ ] Test: empty history → welcome message stays
- [ ] Test: history with user + assistant messages → rendered correctly
- [ ] Test: fetch fails → no crash

### Step 7: Test `init` Event Binding

- [ ] Set up full DOM with all expected elements
- [ ] Test: form submit → calls `sendMessage`
- [ ] Test: Enter key → calls `sendMessage`
- [ ] Test: Shift+Enter → does NOT send
- [ ] Test: input change → enables/disables send button
- [ ] Test: Escape → closes lightbox

### Step 8: Verify

- [ ] `just test` passes
- [ ] `app.ts` line coverage >= 90%
- [ ] No surviving mutants on new tests (if time permits)

## Completion Criteria

- [ ] `renderThinkingBlock` tested
- [ ] `streamChat` error paths and SSE processing tested
- [ ] `appendText` with thinking blocks tested
- [ ] `sendMessage` flow tested
- [ ] `loadHistory` tested
- [ ] `init` event binding tested
- [ ] `just test` passes
- [ ] `app.ts` line coverage >= 90%

## Git Commit Convention

- **Implementation:** `test(HG-009): fill frontend coverage gaps to 90%+`

## Do NOT

- Rewrite or copy functions from app.ts — import them
- Modify app.ts (only add tests)
- Create classes
- Run `bun test` directly — use `just test`
- Re-test functions that already have coverage (renderMarkdown, parseSSELine, etc.)

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
