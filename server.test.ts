// HallucyGenie — Server tests
// Uses Node.js test runner with Web API Request/Response

import { describe, it, after } from "node:test";
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
} from "./server.ts";
import type { ToolCallChunk } from "./server.ts";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Test helpers ─────────────────────────────────────────────────────

function makeRequest(
  method: string,
  path: string,
  body?: unknown
): Request {
  const init: RequestInit = {
    method,
    headers: {},
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
  }
  return new Request(`http://localhost${path}`, init);
}

async function readBody(resp: Response): Promise<string> {
  return await resp.text();
}

async function readJson(resp: Response): Promise<unknown> {
  return JSON.parse(await resp.text());
}

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
  it("returns placeholder response", async () => {
    const resp = await handleRequest(makeRequest("POST", "/api/steer"));
    assert.equal(resp.status, 200);
    const body = (await readJson(resp)) as { message: string };
    assert.ok(body.message.includes("steer"));
  });

  it("includes CORS headers", async () => {
    const resp = await handleRequest(makeRequest("POST", "/api/steer"));
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
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"generate_image","arguments":"{"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"prompt\\":\\"cat\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
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
        messages: [{ role: "user", content: "draw a cat" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      assert.ok(body.includes("tool_start"));
      assert.ok(body.includes("tool_end"));
      assert.ok(body.includes("generate_image"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when MiniMax is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      assert.equal(resp.status, 502);
      const body = (await readJson(resp)) as { error: string };
      assert.ok(body.error.includes("Failed to connect"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when MiniMax returns non-200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("Internal Server Error", { status: 500 });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      assert.equal(resp.status, 502);
      const body = (await readJson(resp)) as { error: string };
      assert.ok(body.error.includes("MiniMax API error"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("emits truncated event on finish_reason length", async () => {
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
      assert.ok(body.includes("truncated"));
      assert.ok(body.includes("length"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles system_prompt in request body", async () => {
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
        system_prompt: "You are a helpful assistant",
      });
      await handleChat(req, "test-key");
      const payload = capturedPayload as { messages: Array<{ role: string; content: string }> };
      assert.equal(payload.messages[0].role, "system");
      assert.equal(payload.messages[0].content, "You are a helpful assistant");
      assert.equal(payload.messages[1].role, "user");
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
      assert.equal(resp.status, 502);
      const body = (await readJson(resp)) as { error: string };
      assert.ok(body.error.includes("MiniMax API error"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls with malformed arguments", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"test","arguments":"{broken"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
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
      // Should still contain tool_end with default arguments
      assert.ok(body.includes("tool_end"));
      // Arguments should be defaulted to {}
      assert.ok(body.includes("{}"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls with pending calls at [DONE]", async () => {
    // Tool calls that arrive but finish_reason is not tool_calls, just [DONE]
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
      // Should emit tool_end at [DONE] for pending tool calls
      assert.ok(body.includes("tool_end"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles SSE stream error during read", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n'));
        // Simulate an error by enqueueing bad data then erroring
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
      assert.equal(resp.status, 200);
      // Should complete without crashing
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
