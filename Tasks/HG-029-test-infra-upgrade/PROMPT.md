# HG-029: Test Infrastructure Upgrade — In-Memory DB + MiniMax Mocking

**Created:** 2026-04-19
**Size:** M

## Review Level: 2 (Plan + Code)

## Mission

Upgrade test infrastructure to use in-memory SQLite everywhere and add MiniMax API mocking for deterministic E2E tests.

## Why

- **In-memory SQLite:** Faster tests, no temp file cleanup, no state pollution between test runs
- **MiniMax mocking:** Deterministic E2E tests without real API calls, no API key needed
- **VFS (memfs) for E2E assets:** Needed for future E2E tests that generate assets (image gen, music gen, TTS). Those tests will save files to `data/assets/`. Use memfs to isolate per test run without polluting the real directory.

## Context to Read First

- `db.test.ts` — Already uses `:memory:`, use as reference
- `server.test.ts` — Currently uses temp file DB, needs migration
- `integration.test.ts` — Currently uses temp file DB, needs migration
- `agent.ts` — Check MiniMax API endpoints used
- `tools.ts` — Check MiniMax API endpoints used

## MiniMax API Endpoints (verify in code)

```typescript
// From agent.ts and tools.ts
const MINIMAX_BASE = "https://api.minimax.io";

// Chat (Anthropic-compatible)
POST / anthropic / v1 / messages;

// Image generation
POST / v1 / image_generation;

// Text-to-speech
POST / v1 / t2a_v2;

// Music generation
POST / v1 / music_generation;

// Web search
POST / v1 / coding_plan / search;

// Vision analysis
POST / v1 / coding_plan / vlm;
```

## Changes

### Step 1: Install nock

```bash
npm install --save-dev nock @types/nock
```

### Step 2: Create MiniMax Mock (`e2e/minimax-mock.ts`)

```typescript
import nock from "nock";

const MINIMAX_BASE = "https://api.minimax.io";

export function setupMinimaxMocks(): void {
  // Mock chat — Anthropic-compatible streaming
  nock(MINIMAX_BASE)
    .post("/anthropic/v1/messages")
    .reply(
      200,
      () => {
        const chunks = [
          'event: message\ndata: {"choices":[{"delta":{"content":"Hello!"}}]}\n\n',
          'event: message\ndata: {"choices":[{"delta":{"content":" How can I help?"}}]}\n\n',
          "event: done\ndata: [DONE]\n\n",
        ];
        return chunks.join("");
      },
      {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    );

  // Mock image generation
  nock(MINIMAX_BASE)
    .post("/v1/image_generation")
    .reply(200, {
      data: [
        {
          image_url: "https://example.com/generated/test.png",
        },
      ],
    });

  // Mock TTS
  nock(MINIMAX_BASE)
    .post("/v1/t2a_v2")
    .reply(200, {
      data: {
        audio_file: "",
        audio_url: "https://example.com/test.mp3",
      },
    });

  // Mock music generation
  nock(MINIMAX_BASE)
    .post("/v1/music_generation")
    .reply(200, {
      data: [
        {
          audio_url: "https://example.com/test.music.mp3",
        },
      ],
    });

  // Mock web search
  nock(MINIMAX_BASE)
    .post("/v1/coding_plan/search")
    .reply(200, {
      data: {
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            snippet: "This is a test search result.",
          },
        ],
      },
    });

  // Mock vision analysis
  nock(MINIMAX_BASE)
    .post("/v1/coding_plan/vlm")
    .reply(200, {
      data: {
        description: "This is a test image description.",
      },
    });
}

export function cleanupMinimaxMocks(): void {
  nock.cleanAll();
}
```

**Note:** SSE format is simplified. Tests verify UI behavior, not API parsing.

### Step 3: Migrate server.test.ts to In-Memory SQLite

Current pattern (temp file):

```typescript
const testDbDir = join(import.meta.dirname ?? ".", "test-data");
const testDbPath = join(testDbDir, "test.db");
initDatabase(testDbPath);
// ... tests ...
after(() => {
  rmSync(testDbDir, { recursive: true, force: true });
});
```

New pattern (in-memory):

```typescript
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./db.ts";

// Shared in-memory DB for all tests in this file
const testDb = new DatabaseSync(":memory:");
runMigrations(testDb, join(import.meta.dirname ?? ".", "migrations"));

before(() => {
    // Initialize with our in-memory DB
    // The server.ts module will use this via getDb()
    initDatabase(testDbPath: string): void {
        // If path is ":memory:" or we detect test mode, use testDb
        // Otherwise create new DB as before
    }
});
```

**Alternative (simpler):** Use a temp file with `:memory:` prefix pattern:

```typescript
// Each test file gets its own in-memory DB
const db = new DatabaseSync(":memory:");
runMigrations(db, migrationsDir);
// Pass db to server via test helper
```

### Step 4: Migrate integration.test.ts to In-Memory SQLite

Same approach as Step 3.

### Step 5: Integrate Mocks in E2E Runner

If not already done in HG-027, add to `e2e/run-e2e.ts`:

```typescript
import { setupMinimaxMocks, cleanupMinimaxMocks } from "./minimax-mock.ts";

before(() => {
  setupMinimaxMocks();
});

after(() => {
  cleanupMinimaxMocks();
});
```

### Step 6: Add VFS for E2E Asset Isolation

Install memfs:

```bash
npm install --save-dev memfs @bundled-es-modules/memfs unionfs
```

Create `e2e/test-fs.ts`:

```typescript
import { createFsFromVolume, Volume } from "memfs";
import * as fs from "node:fs";
import { join } from "node:path";

// Create a virtual filesystem for E2E asset isolation
const vol = Volume.fromJSON({
  "/test-session/assets": {},
});

export function createTestFs(sessionId: string): {
  fs: typeof fs;
  rootDir: string;
  cleanup: () => void;
} {
  const testVol = Volume.fromJSON({
    [`/${sessionId}/assets`]: {},
  });

  const virtualFs = createFsFromVolume(testVol) as typeof fs;

  return {
    fs: virtualFs,
    rootDir: `/${sessionId}`,
    cleanup: () => testVol.reset(),
  };
}
```

This sets up isolated asset storage for each E2E test run. Future tests that generate images/music/TTS can use this to avoid polluting the real `data/assets/` directory.

### Step 7: Clean Up Test Helpers

Remove any `rmSync` cleanup calls for test DBs since they're in-memory.

## File Scope

- `e2e/minimax-mock.ts` — New file (if not created by HG-027)
- `server.test.ts` — Migrate to `:memory:`, remove temp file cleanup
- `integration.test.ts` — Migrate to `:memory:`, remove temp file cleanup
- `e2e/test-fs.ts` — New file, VFS for asset isolation
- `justfile` — Update test commands if needed
- `package.json` — Add nock and memfs dependencies

## Do NOT

- Mock your own API endpoints (`/api/*`)
- Change production code behavior
- Remove existing test coverage
- Use Bun (this project is Node.js only)

## Constraints

- In-memory DB must run all migrations
- MiniMax mocks must match real API response formats
- E2E tests must still exercise real server code paths

## Verification

```bash
just test        # Backend tests with in-memory DB
just test-e2e    # E2E with mocked MiniMax
```

All tests should pass without needing real API keys.
