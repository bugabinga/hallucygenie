# HG-027: E2E Test Overhaul

**Created:** 2026-04-19
**Size:** M
**Dependencies:** HG-028 (Bun Cleanup)

## Review Level: 2 (Plan + Code)

## Mission

Fix 4 broken E2E tests and add coverage for all implemented UI features. Tests run against the **real server** with **MiniMax API mocked via nock**. The goal is integration testing — real app code, mocked external dependencies.

## Current State

10 E2E tests, 4 failing:

- "send button disabled when input is empty" — app not initialized before checking
- "Enter key sends message" — requires server, but test doesn't mock MiniMax
- "session UUID stored in localStorage" — app initialization incomplete
- "lightbox opens and closes" — backdrop click handler may not work

## Root Causes

1. Tests don't wait for app initialization (welcome message appears after `init()` runs)
2. No MiniMax API mocking — tests fail when server tries to call real API
3. Lightbox uses backdrop click handler but test clicks wrong element

## Architecture

```
E2E Test → Real Server → Mocked MiniMax (via nock)
              ↓
         Real SQLite (temp)
         Real assets (temp dir)
```

**Only MiniMax outbound calls are mocked.** Your server code runs fully.

## Changes

### Step 1: Install nock

```bash
npm install --save-dev nock @types/nock
```

### Step 2: Create MiniMax Mock (`e2e/minimax-mock.ts`)

```typescript
import nock from "nock";

// MiniMax uses Anthropic-compatible endpoint
const MINIMAX_BASE = "https://api.minimax.io";

export function setupMinimaxMocks(): void {
  // Mock chat completion — Anthropic-compatible streaming format
  nock(MINIMAX_BASE)
    .post("/v1/text/chatcompletion_v2")
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
          prompt: "test prompt",
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
    .post("/v1/search")
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
}

export function cleanupMinimaxMocks(): void {
  nock.cleanAll();
}
```

**Note:** SSE format in mocks is simplified for test compatibility. It doesn't need to exactly match production format since we're testing UI behavior, not API parsing.

### Step 3: Update `e2e/run-e2e.ts`

Add mock setup/teardown around test runs:

```typescript
import { setupMinimaxMocks, cleanupMinimaxMocks } from "./minimax-mock.ts";

before(() => {
  setupMinimaxMocks();
});

after(() => {
  cleanupMinimaxMocks();
});
```

### Step 4: Fix Broken Tests

#### 4a. Fix app initialization wait

```typescript
async function waitForApp(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome", { timeout: 10000 });
  await page.waitForSelector("#chat-input");
  // Wait for init() to complete
  await page.waitForFunction(() => {
    const btn = document.querySelector("#send-button") as HTMLButtonElement;
    return btn !== null;
  });
}
```

#### 4b. Fix send button test

```typescript
await runTest("send button disabled when input is empty", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  const sendBtn = page.locator("#send-button");
  await expectDisabled(sendBtn);

  await page.fill("#chat-input", "Hello");
  await expectEnabled(sendBtn);

  await page.fill("#chat-input", "");
  await expectDisabled(sendBtn);
});
```

#### 4c. Fix lightbox test

```typescript
await runTest("lightbox opens and closes", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  await page.evaluate(() => {
    (window as any).app?.openLightbox(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    );
  });

  const lightbox = page.locator("#lightbox");
  await lightbox.waitFor({ state: "visible" });

  await page.locator(".lightbox-backdrop").click();
  await lightbox.waitFor({ state: "hidden" });
});
```

### Step 5: Add New Tests

#### Onboarding Flow

```typescript
await runTest("onboarding shows on first visit", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);

  const onboarding = page.locator("#onboarding");
  await onboarding.waitFor({ state: "visible" });
});

await runTest("onboarding completes and hides", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector("#onboarding");

  // Click through slides SEQUENTIALLY (not combined selector)
  await page.locator(".onboarding-next").click();
  await page.waitForTimeout(100);

  await page.locator("#onboarding-try-chat").click();
  await page.waitForTimeout(100);

  await page.locator("#onboarding-try-create").click();
  await page.waitForTimeout(100);

  await page.locator("#onboarding-done").click();
  await page.waitForTimeout(100);

  const onboarding = page.locator("#onboarding");
  await onboarding.waitFor({ state: "hidden" });
});
```

#### Create Modal

```typescript
await runTest("create modal opens and shows tabs", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  await page.click("#create-btn");
  const modal = page.locator("#create-modal");
  await modal.waitFor({ state: "visible" }); // Wait for VISIBILITY, not just existence

  await expectVisible(page, ".create-tab[data-tab='image']");
  await expectVisible(page, ".create-tab[data-tab='music']");
  await expectVisible(page, ".create-tab[data-tab='voice']");
  await expectVisible(page, ".create-tab[data-tab='search']");
});

await runTest("create modal switches tabs", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  await page.click("#create-btn");
  await page.waitForSelector("#create-modal", { state: "visible" });

  await page.click(".create-tab[data-tab='music']");
  await expectVisible(page, "#create-music-form");

  await page.click(".create-tab[data-tab='image']");
  await expectVisible(page, "#create-image-form");
});

await runTest("create modal closes", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  await page.click("#create-btn");
  await page.waitForSelector("#create-modal", { state: "visible" });

  await page.click("#create-close");
  const modal = page.locator("#create-modal");
  await modal.waitFor({ state: "hidden" });
});
```

#### Quota Badge

```typescript
await runTest("quota badge shows in header", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  const badge = page.locator("#quota-badge");
  await badge.waitFor({ state: "visible" });

  await expectVisible(page, ".quota-item[data-type='image']");
  await expectVisible(page, ".quota-item[data-type='music']");
});
```

#### Session Persistence

```typescript
await runTest("session persists across page reloads", async () => {
  const page = await browser.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector(".message--welcome");

  const sessionId = await page.evaluate(() =>
    localStorage.getItem("hallucygenie_session_id"),
  );

  await page.reload();
  await page.waitForSelector(".message--welcome");

  const sessionId2 = await page.evaluate(() =>
    localStorage.getItem("hallucygenie_session_id"),
  );
  assertEqual(sessionId, sessionId2);
});
```

### Step 6: Update justfile

Add nock dependency installation if needed:

```justfile
# E2E with mocked MiniMax
[group('test')]
test-e2e: install
    npm run build:frontend
    PLAYWRIGHT_ALLOW_ANDROID=1 BASE_URL=http://localhost:3001 node --experimental-strip-types e2e/run-e2e.ts
```

## File Scope

- `e2e/minimax-mock.ts` — New file
- `e2e/run-e2e.ts` — Add mock setup, fix broken tests, add new tests
- `justfile` — Update test-e2e command
- `package.json` — Add nock dependency

## Do NOT

- Mock your own API endpoints (`/api/*`)
- Use a separate mock HTTP server — nock intercepts at HTTP layer
- Include personality selector tests (HG-026 was removed)
- Change production code to make tests pass

## Verification

```bash
just test-e2e
# Target: 14+ tests (10 existing + 4 new), 0 failures
```
