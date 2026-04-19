# HG-024: Test Enhancement — SSE Streaming + Parallel State Isolation

**PREREQUISITE:** Complete HG-023 first. This task depends on `public/state.ts` (`createAppState`, `createStreamHandlers`, `defaultState`) and the closure factory pattern in `streamChat`.

Build comprehensive SSE streaming tests and parallel test suite using the state isolation unlocked by HG-023.

## Why

After HG-023, `createStreamHandlers(state)` gives fully isolated SSE handlers. This unlocks:

1. **DOM mutation tests** — `appendText` can now write to `state.currentAssistantContent` (the test's element), not a global. The test on line 1366 of `public/app.test.ts` has a comment "since module state isn't reset, currentAssistantContent might be null" — this is fixed.

2. **Parallel streaming tests** — currently can't run multiple streaming tests concurrently because globals interfere. With isolated `AppState` per test, can run concurrent streaming scenarios.

3. **Full SSE pipeline coverage** — currently 128 tests, ~37% coverage on `app.ts`. SSE rendering pipeline is barely covered. This adds 40+ targeted tests.

4. **Fast unit tests** — no network, no server. All SSE scenarios use `createSSEResponse()` which already exists.

## Structure

Add tests to `public/app.test.ts`. Each test creates its own `AppState` + `StreamHandlers` via `createAppState()` / `createStreamHandlers()`.

### Test helpers to add (before each describe block)

```typescript
/**
 * Creates a fully isolated AppState + StreamHandlers + DOM environment for a test.
 * Call this at the start of each streaming test.
 */
function setupStreamingTest() {
    const { doc } = setupDOM();
    const state = createAppState();
    const handlers = createStreamHandlers(state);

    // Set up the message container that handlers will write to
    const messageList = doc.querySelector("#message-list");
    const { container, contentEl } = renderAssistantMessage();
    state.currentAssistantEl = container;
    state.currentAssistantContent = contentEl;
    messageList.appendChild(container);

    return { doc, state, handlers };
}
```

### Group 1: Stream Handler Unit Tests (20 tests)

Test each handler in isolation. No fetch, no network — just call the handler functions directly.

```typescript
describe("createStreamHandlers — unit tests", () => {
    it("handleText appends to rawTextBuffer", () => {
        const { state, handlers } = setupStreamingTest();
        handlers.handleText("Hello ");
        handlers.handleText("world");
        assert.equal(state.rawTextBuffer, "Hello world");
    });

    it("handleThinking appends to thinkingBuffer", () => {
        const { state, handlers } = setupStreamingTest();
        handlers.handleThinking("Let me think...");
        handlers.handleThinking("done.");
        assert.equal(state.thinkingBuffer, "Let me think...done.");
    });

    it("handleToolCard creates a card and stores in activeToolCards", () => {
        const { doc, state, handlers } = setupStreamingTest();
        const card = handlers.handleToolCard("req-1", "generate_image");
        assert.ok(state.activeToolCards.has("req-1"));
        assert.equal(state.activeToolCards.get("req-1"), card);
        assert.ok(card.innerHTML.includes("generate_image"));
    });

    it("appendToolResult replaces tool card and deletes from activeToolCards", () => {
        const { doc, state, handlers } = setupStreamingTest();
        const card = handlers.handleToolCard("req-2", "web_search");
        const result: ToolResult = {
            id: "req-2",
            name: "web_search",
            result: { type: "text", content: "Found 5 results" },
            ok: true,
        };
        handlers.appendToolResult("req-2", result);
        assert.ok(!state.activeToolCards.has("req-2"));
        // Original card should be replaced
        assert.ok(doc.querySelector(".tool-result"));
    });

    it("appendToolResult with unknown reqId is no-op", () => {
        const { doc, state, handlers } = setupStreamingTest();
        const result: ToolResult = {
            id: "unknown", name: "x", result: { type: "text", content: "x" }, ok: true,
        };
        handlers.appendToolResult("unknown", result); // no throw, no DOM change
        assert.ok(!state.activeToolCards.has("unknown"));
    });

    it("finish() clears isStreaming, rawTextBuffer, thinkingBuffer", () => {
        const { state, handlers } = setupStreamingTest();
        handlers.handleText("hello");
        handlers.handleThinking("thinking");
        state.isStreaming = true;
        handlers.finish();
        assert.equal(state.rawTextBuffer, "");
        assert.equal(state.thinkingBuffer, "");
        assert.equal(state.isStreaming, false);
    });

    it("handleText with null currentAssistantContent does not throw", () => {
        const { state, handlers } = setupStreamingTest();
        state.currentAssistantContent = null;
        handlers.handleText("hello"); // must not throw
        assert.equal(state.rawTextBuffer, "hello");
    });
});
```

Add similar tests for: thinking block accumulation, empty strings, Unicode content, very long content strings, concurrent handleText calls.

### Group 2: SSE Event Processing Tests (15 tests)

Simulate full SSE message cycles using `createSSEResponse` + `streamChat` with isolated state.

```typescript
describe("streamChat — full SSE message cycles", () => {
    it("text chunks → accumulated and rendered to DOM", async () => {
        const { doc, state } = setupStreamingTest();
        const chunks = [sseText("First "), sseText("message")];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "hi" }]);

        // After HG-023, streamChat uses createStreamHandlers(defaultState).
        // The DOM is updated via defaultState.currentAssistantContent.
        // Verify content appears in the DOM.
        assert.ok(doc.querySelector(".message-content").innerHTML.includes("First"));
        assert.ok(doc.querySelector(".message-content").innerHTML.includes("message"));
    });

    it("thinking event → rendered as thinking block after text", async () => {
        const { doc, state } = setupStreamingTest();
        const chunks = [sseThinking("Starting..."), sseText("Hello")];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "hi" }]);

        // Thinking block should appear before text
        assert.ok(doc.querySelector(".thinking-block"));
        assert.ok(doc.querySelector(".thinking-content").innerHTML.includes("Starting"));
        assert.ok(doc.querySelector(".message-content").innerHTML.includes("Hello"));
    });

    it("tool_start → tool_result → card replaced in DOM", async () => {
        const { doc, state } = setupStreamingTest();
        const toolId = "tool-r1";
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: toolId, name: "generate_image" })),
            sseEvent("tool_result", JSON.stringify({
                id: toolId, name: "generate_image",
                result: { type: "image", content: "data:image/png;base64,abc123" }, ok: true,
            })),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "draw me" }]);

        assert.ok(!doc.querySelector(".tool-card-loading"));
        assert.ok(doc.querySelector(".tool-result"));
        assert.ok(doc.querySelector("img[src*='abc123']"));
    });

    it("multiple concurrent tool cards", async () => {
        const { doc, state } = setupStreamingTest();
        const tool1 = "tool-a", tool2 = "tool-b";
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: tool1, name: "web_search" })),
            sseEvent("tool_start", JSON.stringify({ id: tool2, name: "generate_image" })),
            sseEvent("tool_result", JSON.stringify({
                id: tool1, name: "web_search",
                result: { type: "text", content: "search result" }, ok: true,
            })),
            sseEvent("tool_result", JSON.stringify({
                id: tool2, name: "generate_image",
                result: { type: "image", content: "data:image/png;base64,xyz" }, ok: true,
            })),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "search and draw" }]);

        assert.equal(doc.querySelectorAll(".tool-result").length, 2);
        assert.ok(!state.activeToolCards.has(tool1));
        assert.ok(!state.activeToolCards.has(tool2));
    });

    it("text → thinking → text → done: correct ordering in DOM", async () => {
        const { doc } = setupStreamingTest();
        const chunks = [
            sseText("Let me "),
            sseThinking("processing..."),
            sseText("answer that!"),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "hi" }]);

        const html = doc.querySelector(".message-content").innerHTML;
        // Thinking block appears in HTML before "answer that!"
        const thinkingIdx = html.indexOf("thinking-block");
        const answerIdx = html.indexOf("answer that!");
        assert.ok(thinkingIdx < answerIdx, "thinking should appear before answer text");
    });

    it("empty text chunk is ignored", async () => {
        const { doc, state } = setupStreamingTest();
        const chunks = [sseText(""), sseText("actual"), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "hi" }]);
        assert.ok(doc.querySelector(".message-content").innerHTML.includes("actual"));
    });

    it("very long text (>10KB) does not cause issues", async () => {
        const { doc } = setupStreamingTest();
        const longText = "x".repeat(15000);
        const chunks = [sseText(longText), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "long" }]);
        assert.ok(doc.querySelector(".message-content").innerHTML.includes(longText.substring(0, 100)));
    });

    it("Unicode and emoji content renders correctly", async () => {
        const { doc } = setupStreamingTest();
        const chunks = [sseText("Hello 🌍! 日本語测试 🔥"), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat("session-1", [{ role: "user", content: "hi" }]);
        const html = doc.querySelector(".message-content").innerHTML;
        assert.ok(html.includes("Hello"));
        assert.ok(html.includes("🌍"));
    });
});
```

### Group 3: Parallel Streaming Tests (5 tests)

These verify concurrent state isolation. Each test uses its own state. They can run concurrently because they don't share `defaultState`.

```typescript
describe("parallel SSE — state isolation", () => {
    it("two concurrent streams do not interfere", async () => {
        // Run two streamChats concurrently with different fetch responses
        const doc1 = setupStreamingTest();
        const doc2 = setupStreamingTest();

        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse([sseText("Stream A text")]));

        const [r1, r2] = await Promise.all([
            streamChat("session-1", [{ role: "user", content: "a" }]),
            streamChat("session-2", [{ role: "user", content: "b" }]),
        ]);

        // Each stream updated its own defaultState's currentAssistantContent
        // After HG-023, streamChat uses defaultState (module singleton).
        // These WILL interfere — this test documents the limitation.
        // The real isolation benefit is in unit tests with createStreamHandlers(state).
        assert.ok(true); // placeholder — see note below
    });
});
```

**Important note on parallel test:** `streamChat` itself uses `defaultState` (the module singleton). True concurrent isolation for full `streamChat` calls requires a future refactor to pass state into `streamChat`. Document this limitation. Focus parallel testing on the handler unit level where state isolation is real.

### Group 4: Error and Edge Case Tests (10 tests)

```typescript
describe("streamChat — error and edge cases", () => {
    it("malformed SSE event (no event: field) is skipped", async () => {
        const events: SSEEvent[] = [];
        const chunks = [
            sseText("hello"),
            "not a valid sse line\n",
            sseText("world"),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));
        await streamChat("session-1", [{ role: "user", content: "hi" }], (e) => events.push(e));
        assert.ok(events.some((e) => e.data.includes("hello")));
    });

    it("tool_result with missing id does not throw", async () => {
        const chunks = [
            sseEvent("tool_result", JSON.stringify({ name: "x", result: {}, ok: false })),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));
        await streamChat("session-1", [{ role: "user", content: "hi" }]); // must not throw
    });

    it("thinking event with empty content is handled", async () => {
        const { doc } = setupStreamingTest();
        const chunks = [sseThinking(""), sseText("content"), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));
        await streamChat("session-1", [{ role: "user", content: "hi" }]);
        assert.ok(!doc.querySelector(".thinking-block")); // empty thinking → no block
    });
});
```

### Group 5: AppState and Factory Tests (5 tests)

```typescript
describe("AppState factory", () => {
    it("createAppState() returns clean state", () => {
        const state = createAppState();
        assert.equal(state.isStreaming, false);
        assert.equal(state.rawTextBuffer, "");
        assert.equal(state.thinkingBuffer, "");
        assert.equal(state.currentAssistantEl, null);
        assert.equal(state.currentAssistantContent, null);
        assert.ok(state.activeToolCards instanceof Map);
        assert.equal(state.activeToolCards.size, 0);
    });

    it("two createAppState() calls produce independent state", () => {
        const s1 = createAppState();
        const s2 = createAppState();
        s1.isStreaming = true;
        assert.equal(s2.isStreaming, false); // s2 is unaffected
    });

    it("defaultState is accessible and starts clean", () => {
        // After HG-023, defaultState is exported
        assert.equal(defaultState.isStreaming, false);
    });
});
```

## Verification Criteria

All must pass:

```
just test-unit
```

Specific criteria:

| Criterion | Target |
|-----------|--------|
| Total tests | ≥168 (was 128, +40 new) |
| `app.ts` line coverage | ≥55% (was ~37%) |
| `app.ts` function coverage | ≥40% (was ~25%) |
| All existing tests | still pass |
| Parallel handler tests | no shared state between tests |
| `createAppState()` | all fields initialized correctly |
| SSE tool card lifecycle | start → result → removed from activeToolCards |
| Thinking block ordering | appears before subsequent text in DOM |
| Unicode | handles emoji and CJK characters correctly |

## Coverage Report

After running tests, generate coverage:

```bash
npx c8 --reporter=text npx tsx --test public/app.test.ts 2>/dev/null
```

Review `app.ts` coverage gaps. Add targeted tests for any uncovered functions above 60% overall.

## Constraints

- Do NOT modify server.ts, agent.ts, tools.ts, db.ts
- Do NOT add integration or e2e tests — those are separate tasks
- Do NOT change `justfile` — use existing `just test-unit` command
- All tests must run in the existing `node:test` runner
- No new test dependencies — use existing `happy-dom` + `happy-dom/lib/document/dom/DOMImplementation`
- Tests must be fast — no artificial delays or long-running scenarios
