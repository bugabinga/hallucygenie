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
  createSteerQueue,
  queueSteer,
  drainSteer,
  SYSTEM_PROMPT,
  buildSystemPrompt,
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

// ── Anthropic SSE helpers ────────────────────────────────────────────

function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

function messageStart(): string {
  return sseEvent("message_start", JSON.stringify({
    type: "message_start",
    message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "MiniMax-M2.7-highspeed", stop_reason: null },
  }));
}

function contentBlockStart(index: number, blockType: "thinking" | "text" | "tool_use", extra?: Record<string, unknown>): string {
  const contentBlock: Record<string, unknown> = { type: blockType };
  if (blockType === "thinking") {
    contentBlock.thinking = "";
  } else if (blockType === "text") {
    contentBlock.text = "";
  } else if (blockType === "tool_use") {
    contentBlock.id = extra?.id ?? "tu_1";
    contentBlock.name = extra?.name ?? "";
    contentBlock.input = {};
  }
  return sseEvent("content_block_start", JSON.stringify({
    type: "content_block_start",
    index,
    content_block: contentBlock,
  }));
}

function contentBlockDelta(index: number, deltaType: "thinking_delta" | "text_delta" | "input_json_delta", value: string): string {
  const delta: Record<string, unknown> = { type: deltaType };
  if (deltaType === "thinking_delta") {
    delta.thinking = value;
  } else if (deltaType === "text_delta") {
    delta.text = value;
  } else if (deltaType === "input_json_delta") {
    delta.partial_json = value;
  }
  return sseEvent("content_block_delta", JSON.stringify({
    type: "content_block_delta",
    index,
    delta,
  }));
}

function contentBlockStop(index: number): string {
  return sseEvent("content_block_stop", JSON.stringify({
    type: "content_block_stop",
    index,
  }));
}

function messageDelta(stopReason: string): string {
  return sseEvent("message_delta", JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: stopReason },
    usage: { output_tokens: 10 },
  }));
}

function messageStop(): string {
  return sseEvent("message_stop", JSON.stringify({
    type: "message_stop",
  }));
}

// Helper: text-only response
function textResponse(chunks: string[]): string[] {
  const events: string[] = [messageStart()];
  let idx = 0;
  for (const chunk of chunks) {
    if (idx === 0) events.push(contentBlockStart(idx, "text"));
    events.push(contentBlockDelta(idx, "text_delta", chunk));
    events.push(contentBlockStop(idx));
    idx++;
  }
  events.push(messageDelta("end_turn"));
  events.push(messageStop());
  return events;
}

// Helper: tool call response
function toolUseResponse(toolId: string, toolName: string, inputJson: string, textBefore?: string): string[] {
  const events: string[] = [messageStart()];
  let idx = 0;
  if (textBefore) {
    events.push(contentBlockStart(idx, "text"));
    events.push(contentBlockDelta(idx, "text_delta", textBefore));
    events.push(contentBlockStop(idx));
    idx++;
  }
  events.push(contentBlockStart(idx, "tool_use", { id: toolId, name: toolName }));
  events.push(contentBlockDelta(idx, "input_json_delta", inputJson));
  events.push(contentBlockStop(idx));
  events.push(messageDelta("tool_use"));
  events.push(messageStop());
  return events;
}

// Helper: thinking + text response
function thinkingTextResponse(thinking: string, text: string): string[] {
  const events: string[] = [messageStart()];
  events.push(contentBlockStart(0, "thinking"));
  events.push(contentBlockDelta(0, "thinking_delta", thinking));
  events.push(contentBlockStop(0));
  events.push(contentBlockStart(1, "text"));
  events.push(contentBlockDelta(1, "text_delta", text));
  events.push(contentBlockStop(1));
  events.push(messageDelta("end_turn"));
  events.push(messageStop());
  return events;
}

function makeSseStream(eventChunks: string[]): ReadableStream<Uint8Array> {
  const enc = encoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of eventChunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
}

function mockAnthropic(responses: Response[]): void {
  let callIndex = 0;
  globalThis.fetch = async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return resp;
  };
}

function anthropicResponse(eventChunks: string[]): Response {
  return new Response(makeSseStream(eventChunks), {
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
    mockAnthropic([
      anthropicResponse(textResponse(["Hello ", "world!"])),
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
    const firstResponse = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"a cat"}', "I'll generate an image")
    );

    const secondResponse = anthropicResponse(
      textResponse(["Here's your image!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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
    const firstEvents: string[] = [messageStart()];
    firstEvents.push(contentBlockStart(0, "tool_use", { id: "call_1", name: "generate_image" }));
    firstEvents.push(contentBlockDelta(0, "input_json_delta", '{"prompt":"a cat"}'));
    firstEvents.push(contentBlockStop(0));
    firstEvents.push(contentBlockStart(1, "tool_use", { id: "call_2", name: "text_to_speech" }));
    firstEvents.push(contentBlockDelta(1, "input_json_delta", '{"text":"meow"}'));
    firstEvents.push(contentBlockStop(1));
    firstEvents.push(messageDelta("tool_use"));
    firstEvents.push(messageStop());

    const firstResponse = anthropicResponse(firstEvents);
    const secondResponse = anthropicResponse(textResponse(["Done!"]));

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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
    const response1 = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"cat"}')
    );

    // Iteration 2: model calls text_to_speech
    const response2 = anthropicResponse(
      toolUseResponse("call_2", "text_to_speech", '{"text":"done"}')
    );

    // Iteration 3: model responds with text only
    const response3 = anthropicResponse(
      textResponse(["All done!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        const chatCount = Math.ceil(fetchCallCount / 2);
        if (chatCount === 1) return response1;
        if (chatCount === 2) return response2;
        return response3;
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

    assert.equal(events[events.length - 1].type, "done");

    const toolMessages = messages.filter((m) => m.role === "tool");
    assert.equal(toolMessages.length, 2);
  });

  it("emits thinking events from Anthropic thinking blocks", async () => {
    mockAnthropic([
      anthropicResponse(thinkingTextResponse("Let me think about this...", "Hello world")),
    ]);

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    assert.equal(thinkingEvents.length, 1);
    assert.equal(thinkingEvents[0].content, "Let me think about this...");

    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 1);
    assert.equal(textEvents[0].content, "Hello world");
  });

  it("handles empty response (no content, no tools)", async () => {
    const events_arr: string[] = [messageStart()];
    events_arr.push(messageDelta("end_turn"));
    events_arr.push(messageStop());

    mockAnthropic([
      anthropicResponse(events_arr),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 0);

    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);

    // No assistant message added (no content)
    assert.equal(messages.length, 1);
  });

  it("handles API error", async () => {
    mockAnthropic([
      new Response("Internal Server Error", { status: 500 }),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 1);
    assert.ok(textEvents[0].content?.includes("Error"));

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

    const doneEvents = events.filter((e) => e.type === "done");
    assert.equal(doneEvents.length, 1);
  });

  it("handles chunked tool input JSON across SSE events", async () => {
    const firstEvents: string[] = [messageStart()];
    firstEvents.push(contentBlockStart(0, "tool_use", { id: "call_1", name: "generate_image" }));
    firstEvents.push(contentBlockDelta(0, "input_json_delta", '{"pro'));
    firstEvents.push(contentBlockDelta(0, "input_json_delta", 'mpt":"a cat"}'));
    firstEvents.push(contentBlockStop(0));
    firstEvents.push(messageDelta("tool_use"));
    firstEvents.push(messageStop());

    const firstResponse = anthropicResponse(firstEvents);
    const secondResponse = anthropicResponse(textResponse(["Image created!"]));

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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

  it("handles tool call with malformed JSON (gracefully defaults to {})", async () => {
    const firstResponse = anthropicResponse(
      toolUseResponse("call_1", "generate_image", "{broken")
    );

    const secondResponse = anthropicResponse(
      textResponse(["Done"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        return fetchCallCount === 1 ? firstResponse : secondResponse;
      }
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

    assert.equal(events[events.length - 1].type, "done");
    const toolResultEvents = events.filter((e) => e.type === "tool_result");
    assert.equal(toolResultEvents.length, 1);
  });

  it("handles invalid JSON in SSE data gracefully", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode('event: content_block_start\ndata: {invalid json}\n\n'));
        controller.enqueue(enc.encode('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'));
        controller.enqueue(enc.encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"OK"}}\n\n'));
        controller.enqueue(enc.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n'));
        controller.enqueue(enc.encode('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n'));
        controller.enqueue(enc.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
        controller.close();
      },
    });

    mockAnthropic([
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "test" }],
      "test-key",
      onEvent
    );

    assert.equal(events[events.length - 1].type, "done");
    const textEvents = events.filter((e) => e.type === "text");
    assert.equal(textEvents.length, 1);
    assert.equal(textEvents[0].content, "OK");
  });

  it("sends x-api-key header instead of Authorization Bearer", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return anthropicResponse(textResponse(["Hi"]));
    };

    const { onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "my-secret-key",
      onEvent
    );

    const headers = capturedInit!.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "my-secret-key");
    assert.equal(headers["Authorization"], undefined);
  });

  it("sends Anthropic-format request body", async () => {
    let capturedBody = "";
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return anthropicResponse(textResponse(["Hi"]));
    };

    const { onEvent } = collectEvents();
    await runAgentLoop(
      [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "hello" },
      ],
      "test-key",
      onEvent
    );

    const parsed = JSON.parse(capturedBody);
    // System should be separate, not in messages
    assert.ok(parsed.system);
    assert.equal(parsed.system[0].type, "text");
    assert.equal(parsed.system[0].text, "You are helpful");
    // Messages should not contain system role
    assert.ok(!parsed.messages.some((m: { role: string }) => m.role === "system"));
    assert.equal(parsed.model, "MiniMax-M2.7-highspeed");
    assert.equal(parsed.max_tokens, 4096);
    assert.equal(parsed.stream, true);
    assert.ok(parsed.tools);
  });

  it("converts tool results to Anthropic tool_result format", async () => {
    let capturedBody = "";
    const response1 = anthropicResponse(
      toolUseResponse("tu_1", "generate_image", '{"prompt":"cat"}')
    );
    const response2 = anthropicResponse(textResponse(["Done"]));

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        if (fetchCallCount === 1) {
          return response1;
        }
        capturedBody = init?.body as string;
        return response2;
      }
      return new Response(
        JSON.stringify({ data: { image_urls: ["https://example.com/cat.png"] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const { onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "draw" }],
      "test-key",
      onEvent
    );

    // Second request should have tool_result in Anthropic format
    const parsed = JSON.parse(capturedBody);
    // Find the user message with tool_result content
    const toolResultMsg = parsed.messages.find(
      (m: { role: string; content: Array<{ type: string }> }) =>
        m.role === "user" && Array.isArray(m.content) &&
        m.content.some((c: { type: string }) => c.type === "tool_result")
    );
    assert.ok(toolResultMsg, "Should have user message with tool_result");
    const toolResultContent = toolResultMsg.content.find(
      (c: { type: string }) => c.type === "tool_result"
    );
    assert.equal(toolResultContent.tool_use_id, "tu_1");
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
    mockAnthropic([
      anthropicResponse(textResponse(["Hi", " there"])),
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
    const firstResponse = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"cat"}')
    );

    const secondResponse = anthropicResponse(
      textResponse(["Here it is!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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

  it("snapshot: thinking + text event sequence", async () => {
    mockAnthropic([
      anthropicResponse(thinkingTextResponse("Hmm", "Answer")),
    ]);

    const { events, onEvent } = collectEvents();
    await runAgentLoop(
      [{ role: "user", content: "hello" }],
      "test-key",
      onEvent
    );

    const eventTypes = events.map((e) => e.type);
    assert.deepEqual(eventTypes, [
      "thinking",
      "text",
      "done",
    ]);
  });

  it("snapshot: message history after tool call", async () => {
    const firstResponse = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"cat"}')
    );

    const secondResponse = anthropicResponse(
      textResponse(["Done!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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

    // Should have: user, assistant (with tool_calls), tool result, assistant (final)
    assert.equal(messages.length, 4);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.ok(messages[1].tool_calls, "assistant message should have tool_calls");
    assert.equal(messages[1].tool_calls!.length, 1);
    assert.equal(messages[1].tool_calls![0].id, "call_1");
    assert.equal(messages[2].role, "tool");
    assert.equal(messages[2].tool_call_id, "call_1");
    assert.equal(messages[3].role, "assistant");
    assert.equal(messages[3].content, "Done!");
  });
});

// ── Steering queue tests ──────────────────────────────────────────────

describe("createSteerQueue", () => {
  it("creates empty queue", () => {
    const sq = createSteerQueue();
    assert.deepEqual(sq.queue, []);
  });
});

describe("queueSteer / drainSteer", () => {
  it("queues and drains messages", () => {
    const sq = createSteerQueue();
    queueSteer(sq, "change topic to dogs");
    queueSteer(sq, "use a happy tone");
    assert.equal(sq.queue.length, 2);

    const drained = drainSteer(sq);
    assert.deepEqual(drained, ["change topic to dogs", "use a happy tone"]);
    assert.equal(sq.queue.length, 0);
  });

  it("draining empty queue returns empty array", () => {
    const sq = createSteerQueue();
    const drained = drainSteer(sq);
    assert.deepEqual(drained, []);
  });

  it("draining twice returns messages only once", () => {
    const sq = createSteerQueue();
    queueSteer(sq, "hello");
    const first = drainSteer(sq);
    const second = drainSteer(sq);
    assert.deepEqual(first, ["hello"]);
    assert.deepEqual(second, []);
  });
});

describe("Steering in agent loop", () => {
  let _origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    _origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = _origFetch;
  });

  it("steer mid-loop (during tool execution)", async () => {
    const response1 = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"cat"}')
    );

    const response2 = anthropicResponse(
      textResponse(["Steered response!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        return fetchCallCount === 1 ? response1 : response2;
      }
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const sq = createSteerQueue();
    queueSteer(sq, "now make it a dog");

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw a cat" }],
      "test-key",
      onEvent,
      sq
    );

    const userMessages = messages.filter((m) => m.role === "user");
    assert.equal(userMessages.length, 2);
    assert.equal(userMessages[1].content, "now make it a dog");

    assert.equal(events[events.length - 1].type, "done");
  });

  it("steer when idle (after text-only response)", async () => {
    const response1 = anthropicResponse(textResponse(["Hello!"]));
    const response2 = anthropicResponse(textResponse(["Sure, I'll change topic!"]));

    let fetchCallCount = 0;
    globalThis.fetch = async () => {
      fetchCallCount++;
      return fetchCallCount === 1 ? response1 : response2;
    };

    const sq = createSteerQueue();
    queueSteer(sq, "talk about space");

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent,
      sq
    );

    const userMsgs = messages.filter((m) => m.role === "user");
    assert.equal(userMsgs.length, 2);
    assert.equal(userMsgs[1].content, "talk about space");

    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    assert.equal(assistantMsgs.length, 2);
  });

  it("multiple steers queued at once", async () => {
    const response1 = anthropicResponse(textResponse(["OK"]));
    const response2 = anthropicResponse(textResponse(["Done with all steers!"]));

    let fetchCallCount = 0;
    globalThis.fetch = async () => {
      fetchCallCount++;
      return fetchCallCount === 1 ? response1 : response2;
    };

    const sq = createSteerQueue();
    queueSteer(sq, "steer 1");
    queueSteer(sq, "steer 2");
    queueSteer(sq, "steer 3");

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent,
      sq
    );

    const userMsgs = messages.filter((m) => m.role === "user");
    assert.equal(userMsgs.length, 4);
    assert.equal(userMsgs[1].content, "steer 1");
    assert.equal(userMsgs[2].content, "steer 2");
    assert.equal(userMsgs[3].content, "steer 3");
  });

  it("steer after done (no effect)", async () => {
    const response1 = anthropicResponse(textResponse(["Hello!"]));

    let fetchCallCount = 0;
    globalThis.fetch = async () => {
      fetchCallCount++;
      return response1;
    };

    const sq = createSteerQueue();

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent,
      sq
    );

    assert.equal(messages.length, 2);

    queueSteer(sq, "too late");
    assert.equal(sq.queue.length, 1);
  });

  it("steer during tool execution gets injected after tool results", async () => {
    const response1 = anthropicResponse(
      toolUseResponse("call_1", "generate_image", '{"prompt":"cat"}')
    );

    const response2 = anthropicResponse(
      textResponse(["Responding to steer!"])
    );

    let fetchCallCount = 0;
    globalThis.fetch = async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      fetchCallCount++;
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        return fetchCallCount === 1 ? response1 : response2;
      }
      return new Response(
        JSON.stringify({
          data: { image_urls: ["https://example.com/cat.png"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const sq = createSteerQueue();
    queueSteer(sq, "steer during tool");

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "draw" }],
      "test-key",
      onEvent,
      sq
    );

    // user, assistant(with tool_calls), tool, user(steer), assistant
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[2].role, "tool");
    assert.equal(messages[3].role, "user");
    assert.equal(messages[3].content, "steer during tool");
    assert.equal(messages[4].role, "assistant");
    assert.equal(messages[4].content, "Responding to steer!");
  });

  it("works without steerQueue (backward compatible)", async () => {
    mockAnthropic([
      anthropicResponse(textResponse(["Hello"])),
    ]);

    const { events, onEvent } = collectEvents();
    const messages = await runAgentLoop(
      [{ role: "user", content: "hi" }],
      "test-key",
      onEvent
    );

    assert.equal(messages.length, 2);
    assert.equal(events[events.length - 1].type, "done");
  });
});

// ── System Prompt ────────────────────────────────────────────────────

describe("System Prompt", () => {
  it("SYSTEM_PROMPT is a non-empty string", () => {
    assert.equal(typeof SYSTEM_PROMPT, "string");
    assert.ok(SYSTEM_PROMPT.length > 0, "system prompt should not be empty");
  });

  it("SYSTEM_PROMPT mentions key context", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes("gaming"), "should mention gaming");
    assert.ok(lower.includes("concise"), "should mention conciseness");
    assert.ok(lower.includes("youtube"), "should mention YouTube");
  });

  it("buildSystemPrompt returns base prompt without preferences", () => {
    assert.equal(buildSystemPrompt(), SYSTEM_PROMPT);
    assert.equal(buildSystemPrompt({}), SYSTEM_PROMPT);
    assert.equal(buildSystemPrompt(undefined), SYSTEM_PROMPT);
  });

  it("buildSystemPrompt appends preferences", () => {
    const prefs = { favorite_game: "Roblox", channel_name: "GamerKid" };
    const result = buildSystemPrompt(prefs);
    assert.ok(result.startsWith(SYSTEM_PROMPT), "should start with base prompt");
    assert.ok(result.includes("What you know about the user:"), "should have preferences header");
    assert.ok(result.includes("favorite_game: Roblox"), "should include game pref");
    assert.ok(result.includes("channel_name: GamerKid"), "should include channel pref");
  });

  it("buildSystemPrompt with single preference", () => {
    const result = buildSystemPrompt({ name: "Alex" });
    assert.ok(result.includes("name: Alex"));
    assert.ok(result.includes("What you know about the user:"));
  });
});
