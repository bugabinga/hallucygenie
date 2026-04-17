# STATUS — HG-003

**Task:** HG-003 — Server + Chat Proxy
**Status:** ⬜ Not Started
**Started:** —
**Updated:** —

## Step Progress

### Step 0: Preflight
**Status:** ⬜ Not Started

- [ ] Verify server.ts skeleton exists
- [ ] Verify justfile with test recipes
- [ ] Run `just test` — placeholders pass

### Step 1: Static File Server + Route Skeleton
**Status:** ⬜ Not Started

- [ ] Static file serving from `public/`
- [ ] Route handling: GET /, POST /api/chat, POST /api/steer, GET /api/health
- [ ] CORS headers on API routes
- [ ] OPTIONS preflight handling
- [ ] 404 for unknown routes
- [ ] Unit tests for every route
- [ ] Snapshot tests for GET /, GET /api/health, 404

### Step 2: Chat Proxy with SSE Streaming
**Status:** ⬜ Not Started

- [ ] POST /api/chat handler with SSE forwarding
- [ ] Thinking token stripping (`<think_intended>...</think_intended>`)
- [ ] Tool definitions included in requests
- [ ] Unit tests with mocked MiniMax
- [ ] Snapshot tests for SSE streams

### Step 3: Tool Call Accumulator
**Status:** ⬜ Not Started

- [ ] Chunked argument accumulation
- [ ] tool_start/tool_end SSE events
- [ ] Unit tests for accumulation edge cases
- [ ] Snapshot tests for tool call patterns

### Step 4: Error Handling + Graceful Shutdown
**Status:** ⬜ Not Started

- [ ] MiniMax error handling
- [ ] Connection error → 502
- [ ] Malformed request handling
- [ ] Graceful shutdown (SIGTERM)
- [ ] Tests for every error path
- [ ] Tests for graceful shutdown

### Step 5: Coverage and Mutation Testing
**Status:** ⬜ Not Started

- [ ] `just test-coverage` → 100%
- [ ] `just test-mutation` → >= 80%
- [ ] Fill coverage gaps
- [ ] Kill surviving mutants

## Discoveries

| Step | Finding | Action Taken |
|------|---------|-------------|
| — | — | — |
