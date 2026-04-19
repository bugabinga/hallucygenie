# Adversarial Review — Defenses

## HG-021: Markdown → marked

### Challenge: 32kB overhead on every render

**Challenge:** marked adds V8 compilation overhead per call; current regex pipeline is zero-dep.

**Defense — PARTIALLY CONCEDE.** 32kB parse + exec is real but marginal. First render compiles the function, subsequent renders are cached by V8. For a chat app doing ~10 messages per session, total overhead is < 1ms. The bigger issue is the mobile network cost — marked ships as npm package, bundled by the existing build pipeline, served once. Not per-message.

**What changes:** The spec step 2 uses `marked.parse(text)` — this is synchronous in v15 when `async: false` is set. No runtime perf change worth fighting over.

### Challenge: XSS attack surface — marked has no built-in sanitization

**Challenge:** marked v15 defaults to NO sanitization. Current renderer calls escapeHtml BEFORE transforms. This is a security regression.

**DEFEND.** This is addressable in the plan. marked supports a `sanitize` option:

```typescript
marked.use({ sanitize: true });
```

More robust: use `marked-sanitizer-dom` or ` DOMPurify` post-parse. The plan should add:

```
Step 2b: Configure marked sanitization
marked.use({ sanitize: true });
```

This matches the current escape-first behavior. NOT a KILL — fixable gap.

### Challenge: marked v15 async API — Promise vs string

**Challenge:** `marked.parse()` returns Promise in v15, not string. `^15` pins to v15+ which breaks silently.

**DEFEND — PARTIALLY CONCEDE.** This is the sharpest challenge. `marked.parse()` in v15 IS async by default. The spec uses:

```typescript
return marked.parse(text) as string;
```

This will return a Promise<string>, not string. The cast silences TypeScript but not runtime.

**Fix:** Use synchronous mode explicitly:
```typescript
marked.use({ async: false });
return marked.parse(text) as string;
```

Add this to step 2. The plan's `^15` pin is fine — this is a one-line config change.

### Challenge: Test coverage offloaded to upstream

**Challenge:** Tests verify output format; if marked changes output, tests fail without knowing if marked is broken or output is wrong.

**CONCEDE.** Pin to exact version: `"marked": "15.0.4"` in package.json. Also add a comment in the test file noting the pinned version. Not a KILL — standard dependency management.

---

## HG-022: Readable.fromWeb().pipe()

### Challenge: pipe() swallows pipeline errors — outer try/catch misses them

**Challenge:** Errors inside the pipeline don't reach the outer try/catch. Silent failures.

**DEFEND — PARTIALLY CONCEDE.** Node.js `Readable` emits errors on the readable side. `pipe()` propagates errors from the writable to the readable. Proper setup:

```typescript
const readable = Readable.fromWeb(webRes.body);
readable.on('error', (err) => {
    reqLog.error("stream error", { error: String(err) });
    if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Stream error" }));
    }
});
readable.pipe(res);
```

This covers errors from both the web response body AND the write side. NOT a KILL — add error handler to the spec.

### Challenge: res.end() not guaranteed on chunked streams — static body test is invalid

**Challenge:** Your verification used a static string, not a real Transfer-Encoding: chunked stream.

**CONCEDE.** The verification test was insufficient. The claim "res.end() fires" needs real chunked stream testing.

**Fix:** The `readable.on('end', ...)` event fires when the Readable is fully consumed — even with chunked encoding. The `pipe()` API calls `res.end()` when the readable closes. This IS correct behavior for chunked responses IF the readable closes. If the connection drops mid-stream, the readable closes with an error, not cleanly.

Add `readable.on('end', () => res.end())` explicitly — redundant but defensive. Add a `res.on('close', ...)` handler for client disconnect cleanup.

NOT a KILL — spec needs error + close handlers.

### Challenge: Performance claim is false — same res.write() per chunk

**Challenge:** pipe() isn't faster than manual loop. You're simplifying for aesthetics.

**DEFEND.** Agreed — I called it a performance win in the spec and it isn't. Rewrite to: "Removes 7 lines of imperative loop in favor of idiomatic Node stream pipeline. Identical behavior."

---

## HG-023: Module-Level Globals Refactor

### Challenge: No logic moved — renamed globals, not eliminated

**Challenge:** AppState interface + createAppState() but mutating functions stay in app.ts. Globals moved to state.ts, still globals.

**DEFEND.** The adversarial agent is correct on the narrow point — the globals still exist in `defaultState`. BUT the goal is test isolation, not global elimination. The real win is that tests get a clean `AppState` object with no shared references to the singleton. If a test mutates `state.toastTimeout`, it doesn't affect other tests that pass their own state.

**CONCEDE the framing is wrong.** Spec step 1 should say "Extract state into a separate module for test isolation" not "wrap in object." The semantics are slightly different but the isolation goal is real.

### Challenge: defaultState is a leaked global — jest config line could do the same

**Challenge:** Every call site still uses the singleton. This is globals with extra steps.

**CONCEDE — PARTIALLY.** The agent is right that `jest.isolateModules()` can create fresh module state per test. BUT: this doesn't work for SSE event callbacks because the callbacks are closures over module-level state. Re-importing the module doesn't re-run the SSE event listener registration — those already fired. The real problem is state mutation inside async event handlers.

**The SSE closure problem IS the real problem the refactor needs to solve.** The spec glosses over this. Fix: Instead of threading state through internal closures, use a closure factory:

```typescript
function createStreamHandlers(state: AppState) {
    return {
        handleText(data: string) { state.rawTextBuffer += data; },
        handleThinking(data: string) { state.thinkingBuffer += data; },
        handleDone() { state.isStreaming = false; },
    };
}
```

Then `streamChat` calls `createStreamHandlers(defaultState)` and passes the handler object through the SSE callbacks. Tests pass `createStreamHandlers(testState)`. This solves the closure capture problem cleanly.

NOT a KILL — the underlying need is real; the spec needs the closure factory pattern.

### Challenge: SSE closures capture wrong state in tests

**Challenge:** SSE event handlers run asynchronously after streamChat returns. They mutate defaultState, not the test's local state. Refactor doesn't actually solve test isolation.

**DEFEND.** This is the strongest challenge and the agent is right. The current spec glosses over it. The fix is the closure factory pattern above — create handlers with explicit state, pass them into SSE event handlers. Without this, tests that mock SSE responses will mutate the real global state even with a refactored `AppState`.

**This challenge identifies the actual missing piece.** The refactor IS needed for proper test isolation, but the spec needs the closure factory to thread state into async callbacks.

### Challenge: Every function pollutes forever — class would be cleaner

**Challenge:** 20 functions get optional state param. Every future change considers both paths. Class is cleaner.

**DEFEND — PARTIALLY.** Class has its own problems: `this` binding in callbacks, `bind()` calls, `this.state` everywhere. The optional parameter approach is idiomatic TypeScript and avoids OOP ceremony. The real cost is not the signatures — it's the internal closure threading which the closure factory pattern solves.

---

## Summary

| Challenge | Verdict |
|-----------|---------|
| marked XSS surface | Fixable — add `sanitize: true` to step 2 |
| marked async API | Fixable — add `async: false` to step 2 |
| pipe() error swallowing | Fixable — add `readable.on('error', ...)` handler |
| pipe() chunked res.end() | Fixable — add `readable.on('end', ...)` explicit end |
| HG-023 SSE closure threading | Fixable — add closure factory pattern to spec |
| HG-023 no logic moved | Concede framing, defend isolation goal |
| HG-023 jest config alternative | Concede for sync functions, defend for async SSE |

**Net: HG-021 and HG-022 are KEEP after fixes. HG-023 is REWRITE — the spec needs the closure factory pattern to actually solve the SSE isolation problem.**
