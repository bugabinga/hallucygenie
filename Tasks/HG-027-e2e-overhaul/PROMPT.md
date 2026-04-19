# HG-027: E2E Test Overhaul

Fix broken E2E tests and add coverage for all implemented UI features. Tests run against a mock server that responds to `/api/*` endpoints.

## Current State

10 E2E tests, 4 failing:
- "send button disabled when input is empty" — app not initialized before checking
- "Enter key sends message" — requires server, but test doesn't mock it
- "session UUID stored in localStorage" — app initialization incomplete
- "lightbox opens and closes" — backdrop click handler may not work

## Root Causes

1. Tests don't wait for app initialization (welcome message appears after `init()` runs)
2. No mock server for API calls — tests depend on real server running
3. Lightbox uses `lightboxBackdrop` event but test clicks wrong element

## Fixes

### 1. Fix app initialization wait

Current `waitForApp()` only waits for `#chat-input`. Should wait for welcome message or full init:

```typescript
async function waitForApp(page: Page): Promise<void> {
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome", { timeout: 10000 });
    await page.waitForSelector("#chat-input");
    // Wait for init() to complete — send button should be disabled initially
    await page.waitForFunction(() => {
        const btn = document.querySelector("#send-button") as HTMLButtonElement;
        return btn !== null;
    });
}
```

### 2. Add mock SSE server for chat tests

Create `e2e/mock-server.ts` that responds to `/api/*` with realistic mock data:

```typescript
// Mock responses for E2E tests that need server
const MOCK_RESPONSES = {
    "/api/chat": (body) => {
        // Return SSE stream: "event: message\\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hello!\"}}]}\\n\\n"
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode('event: message\\ndata: {"choices":[{"delta":{"content":"Hello!"}}]}\\n\\n'));
                controller.enqueue(encoder.encode('event: message\\ndata: "[DONE]"\\n\\n'));
                controller.close();
            }
        });
        return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    },
    "/api/history": { messages: [] },
    "/api/quota": { chat: { used: 0, total: 100 }, image: { used: 0, total: 20 } },
    "/api/preferences": { ok: true },
    "/assets": { assets: [] },
};
```

### 3. Fix lightbox test

The lightbox uses a backdrop click handler. Test needs to click the backdrop correctly:

```typescript
await runTest("lightbox opens and closes", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome");
    
    // Trigger lightbox via app's openLightbox function
    await page.evaluate(() => {
        (window as any).app?.openLightbox("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    });
    
    const lightbox = page.locator("#lightbox");
    await lightbox.waitFor({ state: "visible" });
    
    // Click backdrop to close
    await page.locator(".lightbox-backdrop").click();
    await lightbox.waitFor({ state: "hidden" });
});
```

### 4. Fix send button test

```typescript
await runTest("send button disabled when input is empty", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    // Wait for full app init — welcome message = init() complete
    await page.waitForSelector(".message--welcome");
    
    const sendBtn = page.locator("#send-button");
    // Should be disabled initially (no input)
    await expectDisabled(sendBtn);
    
    // Fill input
    await page.fill("#chat-input", "Hello");
    await expectEnabled(sendBtn);
    
    // Clear
    await page.fill("#chat-input", "");
    await expectDisabled(sendBtn);
});
```

## New Tests for Implemented Features

### Onboarding Flow

```typescript
await runTest("onboarding shows on first visit", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    
    // Onboarding should be visible on first visit
    const onboarding = page.locator("#onboarding");
    await onboarding.waitFor({ state: "visible" });
    
    // Click "Let's go!"
    await page.locator(".onboarding-next").click();
    
    // Slide 2 should show
    await page.waitForSelector('[data-slide="1"].active');
});

await runTest("onboarding completes and hides", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#onboarding");
    
    // Click through all slides
    for (let i = 0; i < 4; i++) {
        await page.locator(".onboarding-next, #onboarding-try-chat, #onboarding-try-create, #onboarding-done").click();
        await page.waitForTimeout(100);
    }
    
    // Onboarding should be hidden
    const onboarding = page.locator("#onboarding");
    await onboarding.waitFor({ state: "hidden" });
});
```

### Personality Selector

```typescript
await runTest("personality selector shows in header", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome");
    
    const select = page.locator("#personality-select");
    await select.waitFor({ state: "visible" });
    
    // Default should be "gaming"
    const value = await select.inputValue();
    assertEqual(value, "gaming");
});

await runTest("personality selector changes value", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#personality-select");
    
    const select = page.locator("#personality-select");
    await select.selectOption("funny");
    
    const value = await select.inputValue();
    assertEqual(value, "funny");
    
    // Should persist in localStorage
    const stored = await page.evaluate(() => localStorage.getItem("personality"));
    assertEqual(stored, "funny");
});
```

### Assets Panel / Create Modal

```typescript
await runTest("create modal opens and shows tabs", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome");
    
    // Open create modal
    await page.click("#create-btn");
    const modal = page.locator("#create-modal");
    await modal.waitFor({ state: "visible" });
    
    // Tabs should be visible
    await expectVisible(page, ".create-tab[data-tab='image']");
    await expectVisible(page, ".create-tab[data-tab='music']");
    await expectVisible(page, ".create-tab[data-tab='voice']");
    await expectVisible(page, ".create-tab[data-tab='search']");
});

await runTest("create modal switches tabs", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#create-modal");
    await page.click("#create-btn");
    
    // Click music tab
    await page.click(".create-tab[data-tab='music']");
    await expectVisible(page, "#create-music-form");
    
    // Click image tab
    await page.click(".create-tab[data-tab='image']");
    await expectVisible(page, "#create-image-form");
});

await runTest("create modal closes", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector("#create-modal");
    await page.click("#create-btn");
    
    await page.click("#create-close");
    const modal = page.locator("#create-modal");
    await modal.waitFor({ state: "hidden" });
});
```

### Quota Badge

```typescript
await runTest("quota badge shows in header", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome");
    
    const badge = page.locator("#quota-badge");
    await badge.waitFor({ state: "visible" });
    
    // Should show image and music quotas
    await expectVisible(page, ".quota-item[data-type='image']");
    await expectVisible(page, ".quota-item[data-type='music']");
});
```

### Session Persistence

```typescript
await runTest("session persists across page reloads", async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector(".message--welcome");
    
    // Get session ID
    const sessionId = await page.evaluate(() => localStorage.getItem("hallucygenie_session_id"));
    
    // Reload
    await page.reload();
    await page.waitForSelector(".message--welcome");
    
    // Same session ID
    const sessionId2 = await page.evaluate(() => localStorage.getItem("hallucygenie_session_id"));
    assertEqual(sessionId, sessionId2);
});
```

## Mock Server Setup

Create `e2e/mock-server.ts` that intercepts requests:

```typescript
// Mock HTTP server for E2E tests
// Returns realistic responses for all /api/* endpoints
// No real AI calls needed
```

Update `e2e/run-e2e.ts` to use the mock server:

```typescript
// Start mock server on a port
// Set BASE_URL to mock server port
// Run tests against mock server
```

## Constraints

- Tests must run without real server (mock responses only)
- No real API keys needed
- Tests must be fast (<5s each)
- Use existing `e2e/chat.spec.ts` framework or improve `e2e/run-e2e.ts`
- All 10 existing tests must pass
- Add 10+ new tests for new features

## Verification

```
just test-e2e
# Target: 20+ tests, 0 failures
```
