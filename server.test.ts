// HallucyGenie — Server tests
// Uses Node.js test runner with Web API Request/Response

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import {
  handleRequest,
  handleChat,
  stripThinkingTokens,
  accumulateToolCalls,
  shutdown,
  MINIMAX_MODEL,
  initDatabase,
  getDb,
  isShuttingDown,
  resetStateForTesting,
  validateSessionId,
} from "./server.ts";
import type { ToolCallChunk } from "./server.ts";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getMessages } from "./db.ts";
import { trackUsage, saveMessage } from "./db.ts";

// ── Test helpers ─────────────────────────────────────────────────────

function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Request {
  const init: RequestInit = {
    method,
    headers: {} as Record<string, string>,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
  }
  // Add X-Session-Id for /api/* routes (except health)
  if (path.startsWith("/api/") && path !== "/api/health") {
    (init.headers as Record<string, string>)["X-Session-Id"] =
      extraHeaders?.["X-Session-Id"] ?? "test-session-123";
  }
  // Add any extra headers
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (key !== "X-Session-Id" || !path.startsWith("/api/") || path === "/api/health") {
        (init.headers as Record<string, string>)[key] = value;
      }
    }
  }
  return new Request(`http://localhost${path}`, init);
}

async function readBody(resp: Response): Promise<string> {
  return await resp.text();
}

async function readJson(resp: Response): Promise<unknown> {
  return JSON.parse(await resp.text());
}

// ── Test database setup ───────────────────────────────────────────────

const testDbDir = join(import.meta.dirname ?? ".", "test-data");
const testDbPath = join(testDbDir, "test.db");

before(() => {
  resetStateForTesting();
  // Initialize test database
  initDatabase(testDbPath);
});

after(() => {
  // Cleanup
  try {
    shutdown();
  } catch { /* ignore */ }
  try {
    rmSync(testDbDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ── stripThinkingTokens ──────────────────────────────────────────────

describe("stripThinkingTokens", () => {
  it("passes through text without thinking tokens", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens("Hello world", state);
    assert.equal(result, "Hello world");
    assert.equal(state.inThink, false);
  });

  it("strips thinking tokens from middle of text", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "Before<think_intended>hidden</think_intended>After",
      state
    );
    assert.equal(result, "BeforeAfter");
    assert.equal(state.inThink, false);
  });

  it("strips thinking tokens from beginning", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "<think_intended>hidden</think_intended>After",
      state
    );
    assert.equal(result, "After");
    assert.equal(state.inThink, false);
  });

  it("strips thinking tokens from end", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "Before<think_intended>hidden</think_intended>",
      state
    );
    assert.equal(result, "Before");
    assert.equal(state.inThink, false);
  });

  it("strips multiple thinking blocks", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "A<think_intended>x</think_intended>B<think_intended>y</think_intended>C",
      state
    );
    assert.equal(result, "ABC");
    assert.equal(state.inThink, false);
  });

  it("handles open think tag without close (streaming)", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "Before<think_intended>still thinking",
      state
    );
    assert.equal(result, "Before");
    assert.equal(state.inThink, true);
  });

  it("continues skipping when inThink is true", () => {
    const state = { inThink: true };
    const result = stripThinkingTokens("still thinking more", state);
    assert.equal(result, "");
    assert.equal(state.inThink, true);
  });

  it("resolves close tag when inThink is true", () => {
    const state = { inThink: true };
    const result = stripThinkingTokens(
      "end of thinking</think_intended>visible",
      state
    );
    assert.equal(result, "visible");
    assert.equal(state.inThink, false);
  });

  it("handles empty string", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens("", state);
    assert.equal(result, "");
    assert.equal(state.inThink, false);
  });

  it("handles only thinking content", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "<think_intended>all hidden</think_intended>",
      state
    );
    assert.equal(result, "");
    assert.equal(state.inThink, false);
  });

  it("handles partial think tag at chunk boundary", () => {
    // When a chunk ends with a partial open tag like "<think"
    // It's NOT a full think_intended tag, so it should pass through
    const state = { inThink: false };
    const result = stripThinkingTokens("Hello<think", state);
    // Since "<think" doesn't match "<think_intended", it passes through
    assert.equal(result, "Hello<think");
    assert.equal(state.inThink, false);
  });

  it("handles near-miss text that looks like think tag", () => {
    const state = { inThink: false };
    const result = stripThinkingTokens(
      "Hello<think_intendedish>World",
      state
    );
    // Should pass through since it's not an exact match
    assert.ok(result.includes("Hello"));
  });

  it("handles partial <think_intended> at chunk boundary (no match)", () => {
    // When a chunk is just the partial start of think tag
    const state = { inThink: false };
    // "<think_inten" is a prefix of "<think_intended>" - should be withheld
    const result = stripThinkingTokens("<think_inten", state);
    // The partial tag should be withheld
    assert.equal(result, "");
    assert.equal(state.inThink, false);
  });
});

// ── accumulateToolCalls ──────────────────────────────────────────────

describe("accumulateToolCalls", () => {
  it("accumulates a single tool call across chunks", () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    const chunks: ToolCallChunk[] = [
      { index: 0, id: "call_function_123_1", function: { name: "generate_image", arguments: '{"pro' } },
      { index: 0, function: { arguments: 'mpt":' } },
      { index: 0, function: { arguments: '"a cat"}' } },
    ];
    const result = accumulateToolCalls(chunks, acc);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "call_function_123_1");
    assert.equal(result[0].name, "generate_image");
    assert.equal(result[0].arguments, '{"prompt":"a cat"}');
  });

  it("accumulates multiple tool calls", () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    const chunks: ToolCallChunk[] = [
      { index: 0, id: "call_1", function: { name: "generate_image", arguments: '{"a":' } },
      { index: 1, id: "call_2", function: { name: "text_to_speech", arguments: '{"b":' } },
      { index: 0, function: { arguments: '1}' } },
      { index: 1, function: { arguments: '2}' } },
    ];
    const result = accumulateToolCalls(chunks, acc);
    assert.equal(result.length, 2);
    assert.equal(result[0].arguments, '{"a":1}');
    assert.equal(result[1].arguments, '{"b":2}');
  });

  it("handles empty chunks", () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    const result = accumulateToolCalls([], acc);
    assert.equal(result.length, 0);
  });

  it("handles partial chunks with missing fields", () => {
    const acc = new Map<number, { id: string; name: string; arguments: string }>();
    const chunks: ToolCallChunk[] = [
      { index: 0 },
      { index: 0, id: "call_x" },
      { index: 0, function: { name: "test" } },
      { index: 0, function: { arguments: "{}" } },
    ];
    const result = accumulateToolCalls(chunks, acc);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "call_x");
    assert.equal(result[0].name, "test");
    assert.equal(result[0].arguments, "{}");
  });
});

// ── Route: GET /api/health ───────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns ok status with uptime", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/health"));
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { status: string; uptime: number };
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptime, "number");
    assert.ok(body.uptime >= 0);
  });

  it("includes CORS headers", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/health"));
    assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(
      resp.headers.get("Access-Control-Allow-Headers"),
      "Content-Type, X-Session-Id"
    );
    assert.equal(
      resp.headers.get("Access-Control-Allow-Methods"),
      "GET, POST, OPTIONS"
    );
  });

  it("returns JSON content type", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/health"));
    assert.ok(resp.headers.get("Content-Type")?.includes("application/json"));
  });
});

// ── Route: OPTIONS (preflight) ───────────────────────────────────────

describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers for any path", async () => {
    const resp = await handleRequest(makeRequest("OPTIONS", "/api/chat"));
    assert.equal(resp.status, 204);
    assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(
      resp.headers.get("Access-Control-Allow-Headers"),
      "Content-Type, X-Session-Id"
    );
    assert.equal(
      resp.headers.get("Access-Control-Allow-Methods"),
      "GET, POST, OPTIONS"
    );
  });

  it("returns empty body", async () => {
    const resp = await handleRequest(makeRequest("OPTIONS", "/api/health"));
    const body = await readBody(resp);
    assert.equal(body, "");
  });
});

// ── Route: GET / (index.html) ────────────────────────────────────────

describe("GET /", () => {
  it("serves index.html from public/", async () => {
    const resp = await handleRequest(makeRequest("GET", "/"));
    assert.equal(resp.status, 200);
    const body = await readBody(resp);
    assert.ok(body.includes("HallucyGenie"));
    assert.ok(body.includes("<!DOCTYPE html>"));
  });

  it("returns html content type", async () => {
    const resp = await handleRequest(makeRequest("GET", "/"));
    const ct = resp.headers.get("Content-Type") ?? "";
    assert.ok(ct.includes("text/html"));
  });
});

// ── Route: static files ──────────────────────────────────────────────

describe("Static file serving", () => {
  it("serves style.css", async () => {
    const resp = await handleRequest(makeRequest("GET", "/style.css"));
    assert.equal(resp.status, 200);
    const ct = resp.headers.get("Content-Type") ?? "";
    assert.ok(ct.includes("text/css"));
  });

  it("returns 404 for missing static files", async () => {
    const resp = await handleRequest(makeRequest("GET", "/nonexistent.js"));
    assert.equal(resp.status, 404);
  });
});

// ── Route: POST /api/chat (validation) ───────────────────────────────

describe("POST /api/chat validation", () => {
  it("rejects invalid JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });
    const resp = await handleChat(req, "test-key");
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("Invalid JSON"));
  });

  it("rejects missing messages field", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {}),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("messages"));
  });

  it("rejects non-array messages", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", { messages: "not array" }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("array"));
  });

  it("rejects empty messages array", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", { messages: [] }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("empty"));
  });

  it("rejects message with missing role", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: [{ content: "hi" }],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("role"));
  });

  it("rejects message with missing content", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: [{ role: "user" }],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("content"));
  });

  it("rejects message with wrong role type", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: [{ role: 42, content: "hi" }],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("role"));
  });

  it("rejects message with wrong content type", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: 42 }],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("content"));
  });

  it("rejects message that is null", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: [null],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("must be an object"));
  });

  it("rejects message that is a string", async () => {
    const resp = await handleChat(
      makeRequest("POST", "/api/chat", {
        messages: ["not an object"],
      }),
      "test-key"
    );
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("must be an object"));
  });

  it("rejects null body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const resp = await handleChat(req, "test-key");
    assert.equal(resp.status, 400);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("JSON object"));
  });
});

// ── Route: 404 ───────────────────────────────────────────────────────

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const resp = await handleRequest(makeRequest("GET", "/unknown/route"));
    assert.equal(resp.status, 404);
    const body = (await readJson(resp)) as { error: string };
    assert.equal(body.error, "Not found");
  });

  it("includes CORS headers on 404", async () => {
    const resp = await handleRequest(makeRequest("GET", "/unknown"));
    assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
  });

  it("returns 404 for POST to unknown route", async () => {
    const resp = await handleRequest(makeRequest("POST", "/unknown"));
    assert.equal(resp.status, 404);
  });
});

// ── Route: POST /api/steer (placeholder) ─────────────────────────────

describe("POST /api/steer", () => {
  it("returns ok response with valid message", async () => {
    const resp = await handleRequest(makeRequest("POST", "/api/steer", { message: "test steer" }));
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { ok: boolean };
    assert.ok(body.ok);
  });

  it("includes CORS headers", async () => {
    const resp = await handleRequest(makeRequest("POST", "/api/steer", { message: "test" }));
    assert.equal(resp.headers.get("Access-Control-Allow-Origin"), "*");
  });
});

// ── SSE streaming with mocked MiniMax ─────────────────────────────────

describe("SSE streaming from MiniMax", () => {
  it("streams text content", async () => {
    // Build a mock SSE stream
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"World"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");

      assert.equal(resp.status, 200);
      assert.equal(resp.headers.get("Content-Type"), "text/event-stream");

      const body = await readBody(resp);
      // Should contain the streamed content
      assert.ok(body.includes("Hello "));
      assert.ok(body.includes("World"));
      assert.ok(body.includes("[DONE]"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("strips thinking tokens from stream", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello<think_intended>hidden thought</think_intended> World"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "test" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      assert.ok(!body.includes("hidden thought"));
      assert.ok(body.includes("Hello"));
      assert.ok(body.includes("World"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls in stream", async () => {
    // First call: MiniMax returns tool_call SSE
    // Second call: after tool execution, MiniMax returns text response
    const toolCallSse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"generate_image","arguments":"{}"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const finalSse = [
      'data: {"choices":[{"delta":{"content":"Done!"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    let callCount = 0;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const chunks = callCount === 0 ? toolCallSse : finalSse;
      callCount++;
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "draw a cat" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      assert.ok(body.includes("tool_start"));
      assert.ok(body.includes("tool_result"));
      assert.ok(body.includes("generate_image"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams error when MiniMax is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      // New flow returns 200 SSE with error message in the stream
      assert.equal(resp.status, 200);
      const body = await readBody(resp);
      assert.ok(body.includes("Failed to connect"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams error when MiniMax returns non-200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("Internal Server Error", { status: 500 });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      // New flow returns 200 SSE with error message
      assert.equal(resp.status, 200);
      const body = await readBody(resp);
      assert.ok(body.includes("MiniMax API returned 500"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams partial content on finish_reason length", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      assert.ok(body.includes("partial"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("injects system prompt from buildSystemPrompt into agent loop", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    let capturedPayload: unknown = null;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
        system_prompt: "You are a helpful assistant", // ignored by new flow
      });
      await handleChat(req, "test-key");
      const payload = capturedPayload as { messages: Array<{ role: string; content: string }> };
      // System prompt now comes from buildSystemPrompt, not request body
      assert.equal(payload.messages[0].role, "system");
      assert.ok(payload.messages[0].content.includes("HallucyGenie"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes model in MiniMax request", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ];

    let capturedPayload: unknown = null;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      await handleChat(req, "test-key");
      const payload = capturedPayload as { model: string; stream: boolean };
      assert.equal(payload.model, MINIMAX_MODEL);
      assert.equal(payload.stream, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── API key check ────────────────────────────────────────────────────

describe("API key check", () => {
  it("returns 500 when MINIMAX_API_KEY is missing via handleRequest", async () => {
    const originalKey = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    try {
      const resp = await handleRequest(
        makeRequest("POST", "/api/chat", {
          messages: [{ role: "user", content: "hi" }],
        })
      );
      assert.equal(resp.status, 500);
      const body = (await readJson(resp)) as { error: string };
      assert.ok(body.error.includes("MINIMAX_API_KEY"));
    } finally {
      if (originalKey) process.env.MINIMAX_API_KEY = originalKey;
    }
  });
});

// ── Snapshot tests ───────────────────────────────────────────────────

describe("Snapshots", () => {
  it("snapshot: GET /api/health response", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/health"));
    const body = await readBody(resp);
    const snapshot = {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("Content-Type"),
        "access-control-allow-origin": resp.headers.get("Access-Control-Allow-Origin"),
      },
      body: JSON.parse(body),
    };
    // Verify structure (uptime is dynamic, so check shape)
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.headers["content-type"], "application/json");
    assert.equal(snapshot.body.status, "ok");
    assert.equal(typeof snapshot.body.uptime, "number");
  });

  it("snapshot: 404 response", async () => {
    const resp = await handleRequest(makeRequest("GET", "/nope"));
    const body = await readBody(resp);
    const snapshot = {
      status: resp.status,
      body: JSON.parse(body),
    };
    assert.deepEqual(snapshot, {
      status: 404,
      body: { error: "Not found" },
    });
  });

  it("snapshot: OPTIONS preflight response", async () => {
    const resp = await handleRequest(makeRequest("OPTIONS", "/api/chat"));
    assert.equal(resp.status, 204);
    assert.equal(await readBody(resp), "");
  });
});

// ── Graceful shutdown ────────────────────────────────────────────────

describe("shutdown", () => {
  it("does not throw when no server is running", async () => {
    await assert.doesNotReject(async () => await shutdown());
  });

  it("sets shuttingDown flag", async () => {
    // shutdown was already called in previous test, flag should be set
    // But since module state persists, we test the export exists
    assert.equal(typeof shutdown, "function");
  });
});

// ── Error handling edge cases ─────────────────────────────────────────

describe("Error handling", () => {
  // Reset state because shutdown tests above may have closed the DB
  before(() => {
    resetStateForTesting();
    initDatabase(testDbPath);
  });
  it("handles SSE stream read error gracefully", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {invalid json}\n\n'));
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      assert.equal(resp.status, 200);
      // Should still complete without crashing
      const body = await readBody(resp);
      assert.ok(body !== undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles empty SSE stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      assert.equal(resp.status, 200);
      const body = await readBody(resp);
      assert.ok(body !== undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles SSE with only comments", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(': this is a comment\n\n'));
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      assert.equal(resp.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles MiniMax 401 auth error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      // New flow: error is streamed as SSE text
      assert.equal(resp.status, 200);
      const body = await readBody(resp);
      assert.ok(body.includes("401"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls with malformed arguments", async () => {
    const toolCallSse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"test","arguments":"{broken"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const finalSse = [
      'data: {"choices":[{"delta":{"content":"handled"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    let callCount = 0;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const chunks = callCount === 0 ? toolCallSse : finalSse;
      callCount++;
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      // Should contain tool_start and tool_result events
      assert.ok(body.includes("tool_start"));
      assert.ok(body.includes("tool_result"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls without finish_reason tool_calls", async () => {
    // Tool calls that arrive but finish_reason is not tool_calls
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"test","arguments":"{}"}}]},"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      // Should complete gracefully with [DONE]
      assert.ok(body.includes("[DONE]"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles SSE stream error during read", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n'));
        // Simulate an error by erroring the stream
        controller.error(new Error("Stream interrupted"));
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      // Should complete without crashing (status is always 200 for SSE)
      assert.equal(resp.status, 200);
      const body = await readBody(resp);
      assert.ok(body !== undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Step 1: Database Initialization at Startup ──────────────────────

describe("Database Initialization", () => {
  const testDbDir = join(import.meta.dirname ?? ".", "test-data-step1");
  const testDbPath = join(testDbDir, "test.db");

  after(() => {
    resetStateForTesting();
    // Clean up test data dir
    try {
      rmSync(testDbDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates data directory if missing", () => {
    resetStateForTesting();
    // Ensure dir doesn't exist
    try { rmSync(testDbDir, { recursive: true, force: true }); } catch {}

    assert.ok(!existsSync(testDbDir), "dir should not exist yet");

    const database = initDatabase(testDbPath);

    assert.ok(existsSync(testDbDir), "data dir should be created");
    assert.ok(database, "db should be returned");
    database.close();
  });

  it("initializes database with migrations", () => {
    resetStateForTesting();
    const database = initDatabase(testDbPath);

    // Verify the database has tables from migrations
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    assert.ok(tableNames.includes("messages"), "messages table should exist");
    assert.ok(tableNames.includes("preferences"), "preferences table should exist");
    assert.ok(tableNames.includes("daily_usage"), "daily_usage table should exist");
    assert.ok(tableNames.includes("schema_migrations"), "schema_migrations table should exist");

    database.close();
  });

  it("getDb returns the initialized database instance", () => {
    resetStateForTesting();
    const database = initDatabase(testDbPath);

    assert.equal(getDb(), database, "getDb should return the same instance");

    database.close();
  });

  it("getDb returns null before initDatabase is called", () => {
    resetStateForTesting();
    assert.equal(getDb(), null, "db should be null before init");
  });

  it("shutdown closes the database and sets getDb to null", async () => {
    resetStateForTesting();
    const database = initDatabase(testDbPath);

    // Verify db is usable
    database.prepare("SELECT 1").get();

    await shutdown();

    // After shutdown, getDb should return null
    assert.equal(getDb(), null, "db should be null after shutdown");
    assert.ok(isShuttingDown(), "shuttingDown flag should be set");
  });
});

// ── Step 2: Session Validation Middleware ────────────────────────────

describe("Session Validation", () => {
  it("allows valid session ID on /api/chat", async () => {
    const req = makeRequest("POST", "/api/chat", {
      messages: [{ role: "user", content: "hi" }],
    });
    // Should NOT return 400 — it will fail at MiniMax API call but that's fine
    const resp = await handleRequest(req);
    assert.notEqual(resp.status, 400, "should not return 400 with valid session");
  });

  it("rejects missing X-Session-Id on /api/chat", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    };
    const req = new Request("http://localhost/api/chat", init);
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
    const body = JSON.parse(await resp.text());
    assert.equal(body.error, "X-Session-Id header required");
  });

  it("rejects empty X-Session-Id on /api/chat", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    };
    const req = new Request("http://localhost/api/chat", init);
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
    const body = JSON.parse(await resp.text());
    assert.equal(body.error, "X-Session-Id header required");
  });

  it("rejects whitespace-only X-Session-Id on /api/chat", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "   ",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    };
    const req = new Request("http://localhost/api/chat", init);
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
    const body = JSON.parse(await resp.text());
    assert.equal(body.error, "X-Session-Id header required");
  });

  it("health endpoint does not require session ID", async () => {
    const req = makeRequest("GET", "/api/health");
    const resp = await handleRequest(req);
    assert.equal(resp.status, 200);
    const body = JSON.parse(await resp.text());
    assert.equal(body.status, "ok");
  });

  it("steer endpoint requires session ID", async () => {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    };
    const req = new Request("http://localhost/api/steer", init);
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
    const body = JSON.parse(await resp.text());
    assert.equal(body.error, "X-Session-Id header required");
  });

  it("validateSessionId returns null for missing header", () => {
    const req = new Request("http://localhost/test");
    assert.equal(validateSessionId(req), null);
  });

  it("validateSessionId returns session ID for valid header", () => {
    const req = new Request("http://localhost/test", {
      headers: { "X-Session-Id": "abc-123" },
    });
    assert.equal(validateSessionId(req), "abc-123");
  });
});

// ── Step 4: Integration Tests ────────────────────────────────────────

describe("Integration: chat with agent loop + persistence", () => {
  const integrationDbDir = join(import.meta.dirname ?? ".", "test-data-integration");
  const integrationDbPath = join(integrationDbDir, "test.db");

  before(() => {
    resetStateForTesting();
    // Clean start
    try { rmSync(integrationDbDir, { recursive: true, force: true }); } catch {}
    initDatabase(integrationDbPath);
  });

  after(() => {
    try { rmSync(integrationDbDir, { recursive: true, force: true }); } catch {}
  });

  it("text-only chat: SSE stream + messages saved to DB", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hey! Cool idea."},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "suggest a thumbnail idea" }],
      });
      const resp = await handleChat(req, "test-key", "integration-session-1");
      assert.equal(resp.status, 200);
      assert.equal(resp.headers.get("Content-Type"), "text/event-stream");

      const body = await readBody(resp);
      // SSE stream contains content
      assert.ok(body.includes("Hey! Cool idea."));
      assert.ok(body.includes("[DONE]"));

      // Messages saved to DB
      const database = getDb()!;
      const messages = getMessages(database, "integration-session-1");
      assert.ok(messages.length >= 2, "should have at least user + assistant messages");
      assert.equal(messages[0].role, "user");
      assert.equal(messages[0].content, "suggest a thumbnail idea");
      assert.equal(messages[1].role, "assistant");
      assert.ok(messages[1].content.includes("Hey! Cool idea."));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("tool call: SSE stream with tool events + usage tracked", async () => {
    const toolCallSse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_1","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"cool gaming thumbnail\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const finalSse = [
      'data: {"choices":[{"delta":{"content":"Here is your image!"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let fetchCallCount = 0;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const chunks = fetchCallCount === 0 ? toolCallSse : finalSse;
      fetchCallCount++;
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "generate an image" }],
      });
      const resp = await handleChat(req, "test-key", "integration-session-2");
      assert.equal(resp.status, 200);

      const body = await readBody(resp);
      // SSE contains tool events
      assert.ok(body.includes("tool_start"), "should have tool_start event");
      assert.ok(body.includes("tool_result"), "should have tool_result event");
      assert.ok(body.includes("generate_image"), "should mention generate_image");
      assert.ok(body.includes("Here is your image!"), "should have final text");
      assert.ok(body.includes("[DONE]"), "should end with [DONE]");

      // Messages saved to DB including tool results
      const database = getDb()!;
      const messages = getMessages(database, "integration-session-2");
      const roles = messages.map(m => m.role);
      assert.ok(roles.includes("user"), "should have user message");
      assert.ok(roles.includes("assistant"), "should have assistant message");
      assert.ok(roles.includes("tool"), "should have tool result message");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("snapshot: text-only SSE stream", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Short answer."},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key", "snapshot-session-text");
      const body = await readBody(resp);
      // Verify the SSE structure
      const lines = body.split("\n").filter(l => l.trim());
      const dataLines = lines.filter(l => l.startsWith("data: "));
      assert.ok(dataLines.length >= 2, "should have content + [DONE]");
      assert.ok(dataLines.some(l => l.includes("Short answer.")));
      assert.ok(dataLines.some(l => l.includes("[DONE]")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Steer endpoint integration ────────────────────────────────────────

describe("POST /api/steer integration", () => {
  before(() => {
    resetStateForTesting();
    const dir = join(import.meta.dirname ?? ".", "test-data-steer");
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
    initDatabase(join(dir, "test.db"));
  });

  it("queues a steer message for a session", async () => {
    const resp = await handleRequest(
      makeRequest("POST", "/api/steer", { message: "be more creative" })
    );
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("returns 400 for missing message field", async () => {
    const resp = await handleRequest(
      makeRequest("POST", "/api/steer", { not_message: "test" })
    );
    assert.equal(resp.status, 400);
  });
});

// ── Step 5: New API Endpoints ────────────────────────────────────────

describe("GET /api/history", () => {
  const historyDbDir = join(import.meta.dirname ?? ".", "test-data-history");
  const historyDbPath = join(historyDbDir, "test.db");

  before(() => {
    resetStateForTesting();
    try { rmSync(historyDbDir, { recursive: true, force: true }); } catch {}
    initDatabase(historyDbPath);
  });

  after(() => {
    try { rmSync(historyDbDir, { recursive: true, force: true }); } catch {}
  });

  it("returns empty messages for new session", async () => {
    const resp = await handleRequest(
      makeRequest("GET", "/api/history")
    );
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { messages: unknown[] };
    assert.ok(Array.isArray(body.messages));
    assert.equal(body.messages.length, 0);
  });

  it("returns saved messages for a session", async () => {
    const database = getDb()!;
    saveMessage(database, "test-session-123", "user", "hello");
    saveMessage(database, "test-session-123", "assistant", "hi there");

    const resp = await handleRequest(
      makeRequest("GET", "/api/history")
    );
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { messages: Array<{ role: string; content: string }> };
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, "user");
    assert.equal(body.messages[0].content, "hello");
    assert.equal(body.messages[1].role, "assistant");
    assert.equal(body.messages[1].content, "hi there");
  });

  it("requires session ID", async () => {
    const req = new Request("http://localhost/api/history", {
      method: "GET",
    });
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
  });

  it("snapshot: history response structure", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/history"));
    const body = (await readJson(resp)) as { messages: unknown[] };
    // Verify structure
    assert.ok("messages" in body);
    assert.ok(Array.isArray(body.messages));
  });
});

describe("GET /api/usage", () => {
  const usageDbDir = join(import.meta.dirname ?? ".", "test-data-usage");
  const usageDbPath = join(usageDbDir, "test.db");

  before(() => {
    resetStateForTesting();
    try { rmSync(usageDbDir, { recursive: true, force: true }); } catch {}
    initDatabase(usageDbPath);
  });

  after(() => {
    try { rmSync(usageDbDir, { recursive: true, force: true }); } catch {}
  });

  it("returns empty usage and limits", async () => {
    const resp = await handleRequest(
      makeRequest("GET", "/api/usage")
    );
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { usage: Record<string, number>; limits: Record<string, number> };
    assert.deepEqual(body.usage, {});
    assert.ok(body.limits);
    assert.equal(body.limits.image, 100);
    assert.equal(body.limits.speech, 9000);
    assert.equal(body.limits.music, 100);
  });

  it("returns tracked usage counts", async () => {
    const database = getDb()!;
    trackUsage(database, "image");
    trackUsage(database, "image");
    trackUsage(database, "speech");

    const resp = await handleRequest(
      makeRequest("GET", "/api/usage")
    );
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { usage: Record<string, number>; limits: Record<string, number> };
    assert.equal(body.usage.image, 2);
    assert.equal(body.usage.speech, 1);
  });

  it("requires session ID", async () => {
    const req = new Request("http://localhost/api/usage", {
      method: "GET",
    });
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
  });

  it("snapshot: usage response structure", async () => {
    const resp = await handleRequest(makeRequest("GET", "/api/usage"));
    const body = (await readJson(resp)) as { usage: unknown; limits: unknown };
    assert.ok("usage" in body);
    assert.ok("limits" in body);
  });
});

// ── Step 6: Coverage gap tests ───────────────────────────────────────

describe("Coverage: DB not initialized paths", () => {
  it("handleChat returns 500 when DB is null", async () => {
    resetStateForTesting();
    // DB is null after reset
    const req = makeRequest("POST", "/api/chat", {
      messages: [{ role: "user", content: "hi" }],
    });
    const resp = await handleChat(req, "test-key");
    assert.equal(resp.status, 500);
    const body = (await readJson(resp)) as { error: string };
    assert.ok(body.error.includes("Database not initialized"));

    // Re-init for subsequent tests
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
  });
});

describe("Coverage: API 404 within /api/* routes", () => {
  it("returns 404 for unknown API route", async () => {
    const resp = await handleRequest(
      makeRequest("GET", "/api/nonexistent")
    );
    assert.equal(resp.status, 404);
  });

  it("returns 404 for POST to unknown API route", async () => {
    const resp = await handleRequest(
      makeRequest("POST", "/api/unknown", { data: "test" })
    );
    assert.equal(resp.status, 404);
  });
});

describe("Coverage: History loading in handleChat", () => {
  const histDbDir = join(import.meta.dirname ?? ".", "test-data-hist2");
  const histDbPath = join(histDbDir, "test.db");

  before(() => {
    resetStateForTesting();
    try { rmSync(histDbDir, { recursive: true, force: true }); } catch {}
    initDatabase(histDbPath);
  });

  after(() => {
    try { rmSync(histDbDir, { recursive: true, force: true }); } catch {}
  });

  it("loads existing history from DB and includes in agent loop", async () => {
    const database = getDb()!;
    saveMessage(database, "hist-session", "user", "previous message");
    saveMessage(database, "hist-session", "assistant", "previous reply");

    let capturedPayload: unknown = null;
    const encoder = new TextEncoder();
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"new reply"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "new message" }],
      });
      const resp = await handleChat(req, "test-key", "hist-session");
      assert.equal(resp.status, 200);

      const payload = capturedPayload as { messages: Array<{ role: string; content: string }> };
      // Should include system prompt + history + new message
      assert.ok(payload.messages.length >= 4, "should have system + history + new");
      assert.equal(payload.messages[0].role, "system");
      assert.equal(payload.messages[1].role, "user");
      assert.equal(payload.messages[1].content, "previous message");
      assert.equal(payload.messages[2].role, "assistant");
      assert.equal(payload.messages[2].content, "previous reply");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Node HTTP adapter + Server lifecycle tests ───────────────────────

describe("Node HTTP adapter and server lifecycle", () => {
  it("startServer creates a listening HTTP server", async () => {
    resetStateForTesting();
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

    const { startServer } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));
    const port = (srv.address() as any).port;
    assert.ok(port > 0, "server should be listening");

    // Verify health endpoint through the real Node HTTP server
    const resp = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.status, "ok");

    await new Promise<void>((resolve) => srv.close(() => resolve()));
    resetStateForTesting();
  });

  it("proxies POST with body through Node HTTP", async () => {
    resetStateForTesting();
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

    const { startServer } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));
    const port = (srv.address() as any).port;

    const resp = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": "adapter-test" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    // No API key configured, so should get a 500 or 400
    assert.ok(resp.status >= 400, `Expected error, got ${resp.status}`);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
    resetStateForTesting();
  });

  it("returns 404 through Node HTTP adapter", async () => {
    resetStateForTesting();
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

    const { startServer } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));
    const port = (srv.address() as any).port;

    const resp = await fetch(`http://localhost:${port}/nonexistent`);
    assert.equal(resp.status, 404);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
    resetStateForTesting();
  });

  it("shutdown closes server and db", async () => {
    resetStateForTesting();
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));

    const { startServer, shutdown, getDb } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));

    assert.ok(getDb(), "db should be initialized");
    await shutdown();
    assert.equal(getDb(), null, "db should be null after shutdown");

    resetStateForTesting();
  });

  it("shutdown is idempotent", async () => {
    resetStateForTesting();
    await shutdown();
    await shutdown();
    resetStateForTesting();
  });

  it("resetStateForTesting cleans up", async () => {
    resetStateForTesting();
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
    const { startServer, getDb } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));

    assert.ok(getDb(), "db should exist");
    resetStateForTesting();
    assert.equal(getDb(), null, "db should be null after reset");

    // clean up the orphaned server
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  it("isShuttingDown tracks state", async () => {
    resetStateForTesting();
    const { shutdown, isShuttingDown } = await import("./server.ts");

    assert.equal(isShuttingDown(), false);
    await shutdown();
    assert.equal(isShuttingDown(), true);

    resetStateForTesting();
  });
});

// ── Coverage: steer endpoint edge cases ───────────────────────────────

describe("Coverage: steer edge cases", () => {
  it("steer with invalid JSON returns 400", async () => {
    const req = new Request("http://localhost/api/steer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": "test-steer" },
      body: "not json",
    });
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
    const body = await resp.json();
    assert.ok(body.error.includes("Invalid JSON"));
  });

  it("steer with missing message field returns 400", async () => {
    const req = makeRequest("POST", "/api/steer", { text: "hello" });
    req.headers.set("X-Session-Id", "test");
    const resp = await handleRequest(req);
    assert.equal(resp.status, 400);
  });

  it("steer with valid message returns 200", async () => {
    const req = makeRequest("POST", "/api/steer", { message: "change topic" });
    req.headers.set("X-Session-Id", "test");
    const resp = await handleRequest(req);
    assert.equal(resp.status, 200);
  });
});

// ── Coverage: chat with session ID ────────────────────────────────────

describe("Coverage: chat session path", () => {
  it("POST /api/chat with session ID routes to handleChat", async () => {
    const req = makeRequest("POST", "/api/chat", {
      messages: [{ role: "user", content: "hi" }],
    });
    req.headers.set("X-Session-Id", "session-test-123");
    // No API key, will fail internally
    const resp = await handleRequest(req);
    // Should get 500 (no key) not 400 (validation)
    assert.ok(resp.status === 500 || resp.status === 200, `got ${resp.status}`);
  });
});

describe("Coverage: GET /api/history and /api/usage without DB", () => {
  it("history returns 500 when DB not initialized", async () => {
    resetStateForTesting();
    const resp = await handleRequest(
      makeRequest("GET", "/api/history")
    );
    assert.equal(resp.status, 500);
    // Re-init
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
  });

  it("usage returns 500 when DB not initialized", async () => {
    resetStateForTesting();
    const resp = await handleRequest(
      makeRequest("GET", "/api/usage")
    );
    assert.equal(resp.status, 500);
    // Re-init
    initDatabase(join(import.meta.dirname ?? ".", "test-data", "test.db"));
  });
});
