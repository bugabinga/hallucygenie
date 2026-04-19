# HG-024: Test the Refactor — State Isolation Verification

**PREREQUISITE:** HG-023 complete. Tests verify the closure factory + AppState refactor actually works and prevents the bugs it promised to prevent.

Build tests that prove the refactor delivers what it claimed: isolated state per test, concurrent safety, no shared global mutation.

## Why

HG-023 claimed:
1. Tests can get isolated `AppState` without touching production code
2. SSE callbacks bound to a specific state object don't mutate other states
3. Two concurrent handler sets are independent
4. `defaultState` works for production, factory works for tests

If those claims aren't tested, the refactor is unverified. Worse: the old tests had comments like "since module state isn't reset, currentAssistantContent might be null" — this task replaces those comments with assertions.

## Tests

All tests live in `public/app.test.ts`. Import from `public/app.ts` which re-exports from `public/state.ts`.

### Group 1: AppState Cleanliness (5 tests)

```typescript
describe("AppState — createAppState", () => {
    it("all fields initialized to correct defaults", () => {
        const state = createAppState();
        assert.equal(state.isStreaming, false);
        assert.equal(state.rawTextBuffer, "");
        assert.equal(state.thinkingBuffer, "");
        assert.equal(state.currentAssistantEl, null);
        assert.equal(state.currentAssistantContent, null);
        assert.ok(state.activeToolCards instanceof Map);
        assert.equal(state.activeToolCards.size, 0);
        assert.equal(state.toastTimeout, null);
    });

    it("two createAppState() calls produce independent objects", () => {
        const a = createAppState();
        const b = createAppState();
        a.isStreaming = true;
        a.rawTextBuffer = "hello";
        a.toastTimeout = 123 as any;
        assert.equal(b.isStreaming, false);
        assert.equal(b.rawTextBuffer, "");
        assert.equal(b.toastTimeout, null);
    });
});
```

### Group 2: Closure Factory Binding (10 tests)

Core claim: `createStreamHandlers(state)` binds to the passed state, not any other.

```typescript
describe("createStreamHandlers — state binding", () => {
    it("handleText mutates the passed state, not other states", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        handlersA.handleText("hello");
        handlersB.handleText("world");

        assert.equal(stateA.rawTextBuffer, "hello");
        assert.equal(stateB.rawTextBuffer, "world");
    });

    it("handleThinking mutates the passed state only", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        handlersA.handleThinking("thinking A");
        handlersB.handleThinking("thinking B");

        assert.equal(stateA.thinkingBuffer, "thinking A");
        assert.equal(stateB.thinkingBuffer, "thinking B");
    });

    it("handleToolCard stores card in the passed state's Map", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        const cardA = handlersA.handleToolCard("id-A", "generate_image");
        const cardB = handlersB.handleToolCard("id-B", "web_search");

        assert.ok(stateA.activeToolCards.has("id-A"));
        assert.ok(!stateA.activeToolCards.has("id-B"));
        assert.ok(stateB.activeToolCards.has("id-B"));
        assert.ok(!stateB.activeToolCards.has("id-A"));
        assert.notEqual(cardA, cardB);
    });

    it("appendToolResult removes from the correct state's Map", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        // Create tool cards
        handlersA.handleToolCard("tool-A", "x");
        handlersB.handleToolCard("tool-B", "y");

        const result: ToolResult = { id: "tool-A", name: "x", result: { type: "text", content: "r" }, ok: true };
        handlersA.appendToolResult("tool-A", result);

        assert.ok(!stateA.activeToolCards.has("tool-A"));
        assert.ok(stateB.activeToolCards.has("tool-B")); // B is untouched
    });

    it("finish() clears only the passed state", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        // Pre-populate A
        stateA.isStreaming = true;
        stateA.rawTextBuffer = "pre-existing";
        stateA.thinkingBuffer = "thinking";
        handlersA.handleToolCard("stay", "x");

        handlersA.finish();

        assert.equal(stateA.isStreaming, false);
        assert.equal(stateA.rawTextBuffer, "");
        assert.equal(stateA.thinkingBuffer, "");
        assert.ok(!stateA.activeToolCards.has("stay"));
        // B should be completely untouched
        assert.equal(stateB.isStreaming, false);
        assert.equal(stateB.rawTextBuffer, "");
        assert.equal(stateB.thinkingBuffer, "");
    });
});
```

### Group 3: Concurrent Safety (5 tests)

The real win: two tests running at the same time can't interfere.

```typescript
describe("concurrent state isolation", () => {
    it("mutating stateA does not affect stateB in same tick", () => {
        const stateA = createAppState();
        const stateB = createAppState();
        const handlersA = createStreamHandlers(stateA);
        const handlersB = createStreamHandlers(stateB);

        // Simulate rapid interleaved mutations
        handlersA.handleText("A1");
        handlersB.handleText("B1");
        handlersA.handleText("A2");
        handlersB.handleText("B2");
        handlersA.handleThinking("TA");
        handlersB.handleThinking("TB");
        handlersA.handleText("A3");
        handlersB.handleText("B3");

        assert.equal(stateA.rawTextBuffer, "A1A2A3");
        assert.equal(stateB.rawTextBuffer, "B1B2B3");
        assert.equal(stateA.thinkingBuffer, "TA");
        assert.equal(stateB.thinkingBuffer, "TB");
    });

    it("tool card IDs are independent across states", () => {
        const states = Array.from({ length: 5 }, () => createAppState());
        const handlers = states.map(createStreamHandlers);

        // Each state gets a card with the same ID
        handlers.forEach((h, i) => h.handleToolCard("same-id", `tool-${i}`));

        // Each state should have exactly one card
        states.forEach((s, i) => {
            assert.equal(s.activeToolCards.size, 1, `state ${i} should have 1 card`);
            assert.ok(s.activeToolCards.has("same-id"));
        });

        // Each card should be unique
        const cards = states.map((s) => s.activeToolCards.get("same-id"));
        const unique = new Set(cards);
        assert.equal(unique.size, 5, "each card should be a unique DOM element");
    });

    it("finish on one state does not reset other states", () => {
        const states = Array.from({ length: 3 }, () => createAppState());
        const handlers = states.map(createStreamHandlers);

        states[0].isStreaming = true;
        states[1].isStreaming = true;
        states[2].isStreaming = true;

        handlers[0].handleText("text0");
        handlers[1].handleText("text1");
        handlers[2].handleText("text2");

        handlers[1].finish(); // Only finish state 1

        assert.equal(states[0].isStreaming, true);
        assert.equal(states[0].rawTextBuffer, "text0");
        assert.equal(states[1].isStreaming, false);
        assert.equal(states[1].rawTextBuffer, "");
        assert.equal(states[2].isStreaming, true);
        assert.equal(states[2].rawTextBuffer, "text2");
    });
});
```

### Group 4: Integration — Old Broken Test Now Fixed (5 tests)

Replace the broken tests that had comments like "module state isn't reset".

```typescript
describe("streamChat integration — state isolation", () => {
    it("SSE text event updates currentAssistantContent in the correct state", () => {
        // This is the test that was broken before HG-023
        // (comment on line 1366: "currentAssistantContent might be null")
        const { doc, state, handlers } = setupStreamingTest();

        // Simulate what streamChat does internally with the factory
        handlers.handleText("Hello ");
        handlers.handleText("world");

        // The element should be populated
        assert.equal(state.currentAssistantContent?.textContent, "Hello world");
    });

    it("finish() resets all streaming state on the correct state", () => {
        const { state, handlers } = setupStreamingTest();

        state.isStreaming = true;
        handlers.handleText("partial");
        handlers.handleThinking("still thinking");
        handlers.handleToolCard("req-1", "x");

        handlers.finish();

        assert.equal(state.isStreaming, false);
        assert.equal(state.rawTextBuffer, "");
        assert.equal(state.thinkingBuffer, "");
        assert.ok(!state.activeToolCards.has("req-1"));
    });

    it("concurrent streamChat calls update different assistant elements", () => {
        const { doc: doc1, state: state1 } = setupStreamingTest();
        const { doc: doc2, state: state2 } = setupStreamingTest();
        const handlers1 = createStreamHandlers(state1);
        const handlers2 = createStreamHandlers(state2);

        handlers1.handleText("Stream A");
        handlers2.handleText("Stream B");

        assert.equal(state1.currentAssistantContent?.textContent, "Stream A");
        assert.equal(state2.currentAssistantContent?.textContent, "Stream B");
        assert.notEqual(state1.currentAssistantContent, state2.currentAssistantContent);
    });
});
```

## Verification Criteria

```
just test-unit
```

All pass. Specifically:

| Criterion | Target |
|-----------|--------|
| New tests | ≥25 |
| State independence tests | 5+ (stateA !== stateB) |
| Concurrent isolation tests | 5+ |
| Old broken tests replaced | ≥3 (comments removed, assertions added) |
| All existing tests | still pass |

## Constraints

- No new dependencies
- No mock-heavy SSE streaming tests (those are E2E)
- Tests are fast — no artificial delays
- Uses existing `setupDOM()` helper from `app.test.ts`
- All tests use `createAppState()` + `createStreamHandlers()` — the factory is exercised, not the production code path
