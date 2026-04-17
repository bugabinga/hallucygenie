// HallucyGenie — Agent tests
// Uses Node.js test runner

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createAgentState,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  needsToolExecution,
  parseToolArguments,
  runAgentLoop,
} from "./agent.ts";
import type { AgentEvent } from "./agent.ts";

// ── Test helpers ─────────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function encoder(): TextEncoder {
  return new TextEncoder();
}

function sseLine(data: string): string {
  return `data: ${data}\n\n`;
}

function sseDone(): string {
  return "data: [DONE]\n\n";
}

function contentDelta(text: string, finishReason: string | null = null): string {
  return sseLine(
    JSON.stringify({
      choices: [
        {
          delta: { content: text },
          finish_reason: finishReason,
        },
      ],
    })
  );
}

function toolCallDelta(
  index: number,
  id: string | undefined,
  name: string | undefined,
  args: string | undefined,
  finishReason: string | null = null
): string {
  const delta: Record<string, unknown> = {};
  const tc: Record<string, unknown> = { index };
  if (id) tc.id = id;
  if (name || args) {
    tc.function = {} as Record<string, string>;
    if (name) (tc.function as Record<string, string>).name = name;
    if (args) (tc.function as Record<string, string>).arguments = args;
  }
  delta.tool_calls = [tc];
  return sseLine(
    JSON.stringify({
      choices: [{ delta, finish_reason: finishReason }],
    })
  );
}

function finishDelta(reason: string): string {
  return sseLine(
    JSON.stringify({
      choices: [{ delta: {}, finish_reason: reason }],
    })
  );
}

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = encoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
}

function mockMiniMax(responses: Response[]): void {
  let callIndex = 0;
  globalThis.fetch = async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return resp;
  };
}

function minimaxResponse(chunks: string[]): Response {
  return new Response(makeSseStream(chunks), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function collectEvents(): { events: AgentEvent[]; onEvent: (e: AgentEvent) => void } {
  const events: AgentEvent[] = [];
  return {
    events,
    onEvent: (e: AgentEvent) => events.push(e),
  };
}

// ── State management tests ───────────────────────────────────────────

describe("createAgentState", () => {
  it("creates empty state without system prompt", () => {
    const state = createAgentState();
    assert.equal(state.messages.length, 0);
    assert.deepEqual(state.pendingToolCalls, []);
  });

  it("creates state with system prompt", () => {
    const state = createAgentState("You are helpful");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "system");
    assert.equal(state.messages[0].content, "You are helpful");
  });
});

describe("addUserMessage", () => {
  it("adds user message to state", () => {
    const state = createAgentState();
    addUserMessage(state, "Hello!");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "user");
    assert.equal(state.messages[0].content, "Hello!");
  });
});

describe("addAssistantMessage", () => {
  it("adds assistant message to state", () => {
    const state = createAgentState();
    addAssistantMessage(state, "Hi there!");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "assistant");
    assert.equal(state.messages[0].content, "Hi there!");
  });
});

describe("addToolResult", () => {
  it("adds tool result to state", () => {
    const state = createAgentState();
    addToolResult(state, "call_1", '{"result": "image.png"}');
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "tool");
    assert.equal(state.messages[0].content, '{"result": "image.png"}');
    assert.equal(state.messages[0].tool_call_id, "call_1");
  });
});

describe("needsToolExecution", () => {
  it("returns true when tool calls exist", () => {
    assert.equal(
      needsToolExecution([
        { id: "call_1", name: "test", arguments: "{}" },
      ]),
      true
    );
  });

  it("returns false when no tool calls", () => {
    assert.equal(needsToolExecution([]), false);
  });
});

describe("parseToolArguments", () => {
  it("parses valid JSON", () => {
    const result = parseToolArguments('{"key": "value"}');
    assert.deepEqual(result, { key: "value" });
  });

  it("returns empty object for invalid JSON", () => {
    const result = parseToolArguments("not json");
    assert.deepEqual(result, {});
  });

  it("returns empty object for empty string", () => {
    const result = parseToolArguments("");
    assert.deepEqual(result, {});
  });

  it("parses complex arguments", () => {
    const result = parseToolArguments('{"prompt": "a cat", "size": 1024}');
    assert.equal(result.prompt, "a cat");
    assert.equal(result.size, 1024);
  });
});

describe("Agent state message flow", () => {
  it("maintains correct message order", () => {
    const state = createAgentState("system prompt");
    addUserMessage(state, "hello");
    addAssistantMessage(state, "hi there");
    addUserMessage(state, "draw a cat");

    assert.equal(state.messages.length, 4);
    assert.equal(state.messages[0].role, "system");
    assert.equal(state.messages[1].role, "user");
    assert.equal(state.messages[2].role, "assistant");
    assert.equal(state.messages[3].role, "user");
  });

  it("handles tool result flow", () => {
    const state = createAgentState();
    addUserMessage(state, "generate image");
    addToolResult(state, "call_1", '{"url": "image.png"}');

    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[0].role, "user");
    assert.equal(state.messages[1].role, "tool");
  });
});

// ── Agent loop tests ─────────────────────────────────────────────────

describe("runAgentLoop", () => {
  let _origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    _origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = _origFetch;
  });

  it("handles text-only response (no tools)", async () => {
    mockMiniMax([
      minimaxResponse([
        contentDelta("Hello "),
        contentDelta("world!"),
        finishDelta("stop"),
        sseDone(),
      ]),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    // Should have user message + assistant response
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].content, "Hello world!");

    // Should have text events + done
    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 2);
    assert.equal(textEvents[0].content, "Hello ");
    assert.equal(textEvents[1].content, "world!");

    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);
  });

  it("handles text + one tool call", async () => {
    // First response: some text + tool call
    const firstResponse = minimaxResponse([
      contentDelta("I'll generate an image"),
      toolCallDelta(0, "call_1", "generate_image", '{"prompt":"a cat"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    // Second response: text after tool result
    const secondResponse = minimaxResponse([
      contentDelta("Here's your image!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    // Mock tool execution via the image API
    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      // Tool API call (image generation)
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw a cat" }],
      "test-key",
      onEvent
    );

    // Check events
    const textEvents = events.filter((e) => e.type === "text");
    assert.ok(textEvents.length >= 2);

    const toolStartEvents = events.filter((e) => e.type === "tool_start");
    assert.equal(toolStartEvents.length, 1);
    assert.equal(toolStartEvents[0].id, "call_1");
    assert.equal(toolStartEvents[0].name, "generate_image");

    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 1);
    assert.equal(toolResultEvents[0].id, "call_1");
    assert.equal(toolResultEvents[0].name, "generate_image");
    assert.equal(toolResultEvents[0].result?.type, "image");
    assert.equal(
      toolResultEvents[0].result?.content,
      "https://example.com/cat.png"
    );

    assert.equal(events[events.length - 1].type, "done");

    // Check messages include tool result
    const toolMessages = messages.filter((m) => m.role === "tool");
    assert.equal(toolMessages.length, 1);
    assert.equal(toolMessages[0].tool_call_id, "call_1");
  });

  it("handles multiple tool calls in single turn", async () => {
    const firstResponse = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", '{"prompt":"a cat"}'),
      toolCallDelta(1, "call_2", "text_to_speech", '{"text":"meow"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    const secondResponse = minimaxResponse([
      contentDelta("Done!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      if (urlStr.includes("/v1/image_generation")) {
        return new Response(
          JSON.stringify({
            data: { image_urls: ["https://example.com/cat.png"] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v1/t2a_v2")) {
        return new Response(
          JSON.stringify({ data: { audio: "48656c6c6f" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw and speak" }],
      "test-key",
      onEvent
    );

    const toolStartEvents = events.filter((e) => e.type === "tool_start");
    assert.equal(toolStartEvents.length, 2);

    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 2);

    // One is image, one is audio
    const imageResult = toolResultEvents.find(
      (e) => e.name === "generate_image"
    );
    const audioResult = toolResultEvents.find(
      (e) => e.name === "text_to_speech"
    );
    assert.ok(imageResult);
    assert.ok(audioResult);
    assert.equal(imageResult.result?.type, "image");
    assert.equal(audioResult.result?.type, "audio");

    const toolMessages = messages.filter((m) => m.role === "tool");
    assert.equal(toolMessages.length, 2);
  });

  it("handles multi-iteration loop (tool calls trigger more tool calls)", async () => {
    // Iteration 1: model calls generate_image
    const response1 = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", '{"prompt":"cat"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    // Iteration 2: model calls text_to_speech
    const response2 = minimaxResponse([
      toolCallDelta(0, "call_2", "text_to_speech", '{"text":"done"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    // Iteration 3: model responds with text only
    const response3 = minimaxResponse([
      contentDelta("All done!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        const chatCount = Math.ceil(fetchCallCount / 2);
        if (chatCount === 1) return response1;
        if (chatCount === 2) return response2;
        return response3;
      }
      // Tool calls
      if (urlStr.includes("/v1/image_generation")) {
        return new Response(
          JSON.stringify({
            data: { image_urls: ["https://example.com/cat.png"] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/v1/t2a_v2")) {
        return new Response(
          JSON.stringify({ data: { audio: "48656c6c6f" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw and speak" }],
      "test-key",
      onEvent
    );

    // Should have 2 tool_start events (one per iteration with tools)
    const toolStartEvents = events.filter((e) => e.type === "tool_start");
    assert.equal(toolStartEvents.length, 2);

    // Should have 2 tool_result events
    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 2);

    // Should end with done
    assert.equal(events[events.length - 1].type, "done");

    // Should have 2 tool messages
    const toolMessages = messages.filter((m) => m.role === "tool");
    assert.equal(toolMessages.length, 2);
  });

  it("strips thinking tokens from agent loop output", async () => {
    mockMiniMax([
      minimaxResponse([
        contentDelta(
          "Hello<think_intended>internal reasoning</think_intended> world"
        ),
        finishDelta("stop"),
        sseDone(),
      ]),
    ]);

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    const textEvents = events.filter((e) => e.type === "text");
    const fullText = textEvents.map((e) => e.content).join("");
    assert.equal(fullText, "Hello world");
    assert.ok(!fullText.includes("internal reasoning"));
  });

  it("handles empty response (no content, no tools)", async () => {
    mockMiniMax([
      minimaxResponse([
        finishDelta("stop"),
        sseDone(),
      ]),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    // No text events
    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 0);

    // Done event should be emitted
    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);

    // No assistant message added (no content)
    assert.equal(messages.length, 1);
  });

  it("handles MiniMax API error", async () => {
    mockMiniMax([
      new Response("Internal Server Error", { status: 500 }),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    // Should emit error as text
    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 1);
    assert.ok(textEvents[0].content?.includes("Error"));

    // Should emit done
    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);
  });

  it("handles network failure", async () => {
    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    // Should still complete (graceful error)
    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);
  });

  it("handles chunked tool arguments across SSE events", async () => {
    const firstResponse = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", '{"pro'),
      toolCallDelta(0, undefined, undefined, 'mpt":"a cat"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    const secondResponse = minimaxResponse([
      contentDelta("Image created!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "draw a cat" }],
      "test-key",
      onEvent
    );

    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 1);
    assert.equal(toolResultEvents[0].result?.type, "image");
  });

  it("handles tool call with malformed arguments (gracefully defaults to {})", async () => {
    const firstResponse = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", "{broken"),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    const secondResponse = minimaxResponse([
      contentDelta("Done"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      // Tool call with malformed args → empty object → prompt will be undefined
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/fallback.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "test" }],
      "test-key",
      onEvent
    );

    // Should complete without crashing
    assert.equal(events[events.length - 1].type, "done");
    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 1);
  });
});

// ── Snapshot tests for event sequences ───────────────────────────────

describe("Agent event sequence snapshots", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("snapshot: text-only event sequence", async () => {
    mockMiniMax([
      minimaxResponse([
        contentDelta("Hi"),
        contentDelta(" there"),
        finishDelta("stop"),
        sseDone(),
      ]),
    ]);

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hello" }],
      "test-key",
      onEvent
    );

    const eventTypes = events.map((e) => ({
      type: e.type,
      ...(e.type === "text" ? { content: e.content } : {}),
    }));

    assert.deepEqual(eventTypes, [
      { type: "text", content: "Hi" },
      { type: "text", content: " there" },
      { type: "done" },
    ]);
  });

  it("snapshot: tool call event sequence", async () => {
    const firstResponse = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", '{"prompt":"cat"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    const secondResponse = minimaxResponse([
      contentDelta("Here it is!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "draw" }],
      "test-key",
      onEvent
    );

    const eventTypes = events.map((e) => e.type);
    assert.deepEqual(eventTypes, [
      "tool_start",
      "tool_result",
      "text",
      "done",
    ]);
  });

  it("snapshot: message history after tool call", async () => {
    const firstResponse = minimaxResponse([
      toolCallDelta(0, "call_1", "generate_image", '{"prompt":"cat"}'),
      finishDelta("tool_calls"),
      sseDone(),
    ]);

    const secondResponse = minimaxResponse([
      contentDelta("Done!"),
      finishDelta("stop"),
      sseDone(),
    ]);

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/v1/chat/completions")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw" }],
      "test-key",
      onEvent
    );

    // Should have: user, assistant (empty text), tool result, assistant (final)
    assert.equal(messages.length, 4);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[2].role, "tool");
    assert.equal(messages[2].tool_call_id, "call_1");
    assert.equal(messages[3].role, "assistant");
    assert.equal(messages[3].content, "Done!");
  });
});
