# Task: HG-005 — Frontend MVP

**Created:** 2026-04-16
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** New frontend, single page, no framework.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Canonical Task Folder

```
Tasks/HG-005-frontend-mvp/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Build a mobile-first chat UI that connects to the server's SSE endpoints. The UI
should feel fun and approachable for an 11-year-old — big buttons, clear feedback,
no complexity. Think messaging app, not enterprise dashboard.

The frontend is vanilla TypeScript, no framework, no build step beyond what Bun
serves directly. CSS is mobile-first, touch-friendly.

**SSE events from server:**
```
event: text       → data: {"delta": "..."}         // append to message bubble
event: tool_start → data: {"id":"...", "name":"generate_image", "arguments":{...}}
event: tool_end   → data: {"id":"...", "name":"...", "result": {...}}
event: done       → data: {}                        // stream complete
```

**API endpoints:**
- `POST /api/chat` → `{ messages: [{role, content}] }` → SSE stream
- `POST /api/steer` → `{ message: "..." }` → 200 OK
- `GET /api/history` → `{ messages: [...] }`

## Dependencies

- **Task:** HG-003 (server must serve static files and proxy chat)
- **Task:** HG-004 (agent loop with tool execution must work for full experience)

## Context to Read First

- `Tasks/CONTEXT.md` — project overview

## Environment

- **Workspace:** `public/` directory
- **Services required:** Server running on localhost:3000

## File Scope

- `public/index.html`
- `public/app.ts`
- `public/style.css`

## Steps

### Step 0: Preflight

- [ ] Verify `public/` directory exists with placeholders from HG-002
- [ ] Verify server is running and `POST /api/chat` streams SSE

### Step 1: HTML Structure

- [ ] Mobile-first layout: full-screen chat view
- [ ] Header with app name "HallucyGenie" and simple branding
- [ ] Message list area (scrollable, auto-scrolls to bottom)
- [ ] Input area: text input + send button, fixed to bottom
- [ ] Message bubbles: user messages right-aligned, assistant left-aligned
- [ ] Include `<script type="module" src="app.ts">` — Bun serves TS directly

### Step 2: CSS — Mobile-First Styling

- [ ] Viewport meta already set, ensure `100dvh` for full-height layout
- [ ] Dark theme (gaming aesthetic) with good contrast
- [ ] Large touch targets (min 44px), readable font size (min 16px)
- [ ] Smooth scrolling, no jank
- [ ] Message bubbles with subtle animation on appear
- [ ] Loading/typing indicator while streaming
- [ ] Tool call cards: when tool_start arrives, show a card like "🎨 Generating image..."
  that updates with result when tool_end arrives
- [ ] Image results: display inline in a card with the image
- [ ] Audio results: display inline audio player
- [ ] No framework CSS — just plain CSS, maybe CSS custom properties for colors

### Step 3: Chat Logic in app.ts

- [ ] Load message history from `GET /api/history` on page load
- [ ] Send message: `POST /api/chat` with messages array, read SSE response
- [ ] Parse SSE events using `EventSource` or manual `fetch` + `ReadableStream`:
  - `text` events → append delta to current assistant bubble
  - `tool_start` → show tool card in message
  - `tool_end` → update tool card with result
  - `done` → finalize message, re-enable input
- [ ] Auto-scroll message list as new content arrives
- [ ] Disable input while streaming, re-enable on `done`

### Step 4: Steering

- [ ] During streaming, show a "steer" button or allow typing in input
- [ ] When user sends during stream: `POST /api/steer` with the message
- [ ] Visually distinguish steer messages from regular messages

### Step 5: Tool Result Rendering

- [ ] Image gen results: `<img>` tag in a card, clickable to view full size
- [ ] TTS results: `<audio>` player with play button
- [ ] Music gen results: `<audio>` player with play button
- [ ] Error states: show friendly error in a card ("oops, couldn't make that image")

### Step 6: Verification

- [ ] Open on mobile browser (or Chrome DevTools mobile simulation)
- [ ] Send a text message → response streams in bubble
- [ ] Ask for an image → image appears in chat
- [ ] Ask for speech → audio player appears in chat
- [ ] Ask for music → audio player appears in chat
- [ ] Steering mid-stream works
- [ ] Page reload → history loads from server
- [ ] Touch targets are comfortable on mobile
- [ ] No horizontal scroll, no zoom issues

## Documentation Requirements

**Must Update:** None
**Check If Affected:** None

## Completion Criteria

- [ ] Mobile-first chat UI works on phone browsers
- [ ] SSE streaming renders text as it arrives
- [ ] Image results display inline
- [ ] Audio results display with player
- [ ] Steering works during streaming
- [ ] History persists across page reloads
- [ ] Feels fun and simple, not enterprise

## Git Commit Convention

- **Implementation:** `feat(HG-005): mobile-first chat frontend`
- **Checkpoints:** `checkpoint: HG-005 description`

## Do NOT

- Use any frontend framework (React, Vue, Svelte, etc.)
- Add a build step (webpack, vite, etc.)
- Use npm packages in the frontend
- Create classes or OOP patterns
- Over-design the CSS — keep it simple and fun
- Add dark/light mode toggle (just dark theme)
- Add authentication screens

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
