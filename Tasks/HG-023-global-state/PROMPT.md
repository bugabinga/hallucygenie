# HG-023: Refactor Module-Level Globals

Wrap mutable module state in an explicit `AppState` object. Use closure factory pattern for SSE callbacks. Tests get isolated state without touching production code paths.

## Why

Current `public/app.ts` has 6 module-level mutable variables:

| Variable | Type | Mutated by |
|----------|------|------------|
| `toastTimeout` | `Timeout \| null` | `showError` |
| `isStreaming` | `boolean` | `streamChat` |
| `currentAssistantEl` | `HTMLElement \| null` | `streamChat`, `renderAssistantMessage` |
| `currentAssistantContent` | `HTMLElement \| null` | `streamChat`, `renderAssistantMessage` |
| `activeToolCards` | `Map<string, HTMLElement>` | `appendToolResult`, `showToolCard` |
| `rawTextBuffer` | `string` | SSE `text` event callbacks |
| `thinkingBuffer` | `string` | SSE `thinking` event callbacks |

**Problems:**
1. SSE event callbacks (registered inside `streamChat`) run **after** `streamChat` returns. They mutate module-level state. Tests that mock SSE responses mutate real global state — no isolation.
2. Async state mutations are invisible — no reset mechanism between tests.
3. Hard to trace state flow — grep for `let ` declarations across 1245-line file.

**Why not just jest config?** `jest.isolateModules()` can reset module state between tests, but it doesn't help with SSE callbacks already registered against the global state. The closure factory pattern solves the real problem: async event handlers need explicit state.

## Approach

**Closure factory** — create SSE handler objects with explicit state. Tests pass their own state. Production code uses the default singleton. No function signatures change for existing call sites.

```typescript
// ── State + Factory (public/state.ts) ──────────────────────────────

export interface AppState {
  toastTimeout: ReturnType<typeof setTimeout> | null;
  isStreaming: boolean;
  currentAssistantEl: HTMLElement | null;
  currentAssistantContent: HTMLElement | null;
  activeToolCards: Map<string, HTMLElement>;
  rawTextBuffer: string;
  thinkingBuffer: string;
}

export function createAppState(): AppState {
  return {
    toastTimeout: null,
    isStreaming: false,
    currentAssistantEl: null,
    currentAssistantContent: null,
    activeToolCards: new Map(),
    rawTextBuffer: "",
    thinkingBuffer: "",
  };
}

// Module-level singleton — production code uses this
const _defaultState = createAppState();
export { _defaultState as defaultState };

// ── Closure factory for SSE handlers ────────────────────────────────

export interface StreamHandlers {
  handleText: (data: string) => void;
  handleThinking: (data: string) => void;
  handleToolCard: (reqId: string, name: string) => HTMLElement;
  appendToolResult: (reqId: string, result: ToolResult) => void;
  finish: () => void;
}

export function createStreamHandlers(state: AppState): StreamHandlers {
  return {
    handleText(data: string) {
      state.rawTextBuffer += data;
      if (state.currentAssistantContent) {
        state.currentAssistantContent.textContent += data;
      }
    },
    handleThinking(data: string) {
      state.thinkingBuffer += data;
    },
    handleToolCard(reqId: string, name: string): HTMLElement {
      const card = createToolCardLoading(name);
      state.activeToolCards.set(reqId, card);
      return card;
    },
    appendToolResult(reqId: string, result: ToolResult) {
      const card = state.activeToolCards.get(reqId);
      if (card) {
        card.replaceWith(renderToolResult(reqId, result));
        state.activeToolCards.delete(reqId);
      }
    },
    finish() {
      state.isStreaming = false;
      state.rawTextBuffer = "";
      state.thinkingBuffer = "";
    },
  };
}
```

## Changes

### 1. Create `public/state.ts`

Extract: `AppState` interface, `createAppState()`, `defaultState`, `createStreamHandlers()`.

### 2. Update `public/app.ts`

**a) Replace module-level globals** with import from `state.ts`:
```typescript
// REMOVE:
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let isStreaming = false;
// ... etc

// ADD:
import { defaultState, createStreamHandlers } from "./state";
const state = defaultState;
```

**b) Update `showError`** — use `state`:
```typescript
export function showError(message: string, duration = 4000): void {
    if (state.toastTimeout) clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
        state.toastTimeout = null;
        toast.hidden = true;
    }, duration);
}
```

**c) Update `streamChat`** — create handlers with state:
```typescript
export async function streamChat(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    state.isStreaming = true;
    const handlers = createStreamHandlers(state);

    // SSE callbacks use explicit handlers with state
    const handleSSEEvent = (event: SSEEvent) => {
        if (event.event === "text") {
            handlers.handleText(event.data);
        } else if (event.event === "thinking") {
            handlers.handleThinking(event.data);
        } else if (event.event === "tool_card") {
            const card = handlers.handleToolCard(reqId, name);
            // ...
        } else if (event.event === "tool_result") {
            handlers.appendToolResult(reqId, result);
        } else if (event.event === "done") {
            handlers.finish();
        }
        onEvent?.(event);
    };
    // ...
}
```

**d) Export for tests:**
```typescript
export { AppState } from "./state";
export { createAppState, createStreamHandlers, defaultState } from "./state";
```

### 3. Update `public/app.test.ts`

Tests use their own state via `createAppState()` + `createStreamHandlers()`:

```typescript
import { createAppState, createStreamHandlers } from "../app";

test("showError clears previous timeout", () => {
    document.body.innerHTML = '...';
    const state = createAppState();
    showError("first", 10000);   // uses defaultState
    showError("second", 100);     // uses defaultState — old timeout cleared
    // state is NOT used here — showError uses defaultState (no API change)
});

// SSE handler isolation test:
test("streamChat SSE callbacks use correct state", async () => {
    const state = createAppState();
    const handlers = createStreamHandlers(state);

    // Simulate SSE events against the handlers directly
    handlers.handleText("hello ");
    handlers.handleText("world");
    expect(state.rawTextBuffer).toBe("hello world");

    handlers.finish();
    expect(state.rawTextBuffer).toBe("");
    expect(state.isStreaming).toBe(false);
});
```

### 4. CSS: no changes
### 5. Server/frontend wiring: no changes

## Tests

Add to `public/app.test.ts`:
- `showError` clears previous timeout on `defaultState`
- `createAppState` produces clean state
- `createStreamHandlers` produces handlers bound to passed state
- SSE handler mutations affect the state passed to factory (not global)

Run: `just test-unit`

## Constraints

- No class wrappers — plain object + functions
- **No function signatures change** — production call sites use `defaultState` implicitly
- Closure factory isolates SSE callbacks to the state they were created with
- `createAppState()` and `createStreamHandlers()` must be exported
- Do NOT change any HTML templates or CSS
- Do NOT change server.ts or the `/api/*` endpoints
