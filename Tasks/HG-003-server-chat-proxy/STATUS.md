# STATUS — HG-003

**Task:** HG-003 — Server + Chat Proxy
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify server.ts skeleton exists
- [ ] Verify package.json exists
- [ ] Verify MINIMAX_API_KEY available

### Step 1: Static File Server + Route Skeleton
**Status:** ⬜ Not Started

- [ ] Static file serving from `public/`
- [ ] Route handling: GET /, POST /api/chat, POST /api/steer
- [ ] 404 for unknown routes

### Step 2: Chat Proxy with SSE Streaming
**Status:** ⬜ Not Started

- [ ] POST /api/chat handler forwards to MiniMax
- [ ] Stream SSE events to browser
- [ ] Strip thinking tokens from output
- [ ] Include tool definitions in MiniMax requests

### Step 3: Tool Call Accumulator
**Status:** ⬜ Not Started

- [ ] Parse streaming tool call chunks
- [ ] Emit tool_start/tool_end SSE events
- [ ] Emit accumulated tool calls on finish_reason=tool_calls

### Step 4: Error Handling
**Status:** ⬜ Not Started

- [ ] MiniMax API errors → proper HTTP errors
- [ ] Truncation handling
- [ ] Connection errors → 502
- [ ] No crashes on malformed requests

### Step 5: Verification
**Status:** ⬜ Not Started

- [ ] Static files served
- [ ] Chat proxy streams SSE
- [ ] Thinking tokens stripped
- [ ] Tool calls parsed and emitted

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
