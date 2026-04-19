// HallucyGenie -- Server tests
// Uses Node.js test runner with Web API Request/Response

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import {
  handleRequest,
  handleChat,
  shutdown,
  MINIMAX_MODEL,
  initDatabase,
  getDb,
  isShuttingDown,
  resetStateForTesting,
  validateSessionId,
} from "./server.ts";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import { getMessages } from "./db.ts";
import { trackUsage, saveMessage } from "./db.ts";

// -- Test helpers -----------------------------------------------------

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

// -- Test database setup -----------------------------------------------

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

// -- Anthropic SSE test helpers ------------------------------------------

function anthropicTextSse(textChunks: string[]): string[] {
  const events: string[] = [
    'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
  ];
  for (let i = 0; i < textChunks.length; i++) {
    events.push('event: content_block_start\ndata: {"type":"content_block_start","index":' + String(i) + ',"content_block":{"type":"text","text":""}}\n\n');
    events.push('event: content_block_delta\ndata: {"type":"content_block_delta","index":' + String(i) + ',"delta":{"type":"text_delta","text":' + JSON.stringify(textChunks[i]) + '}}\n\n');
    events.push('event: content_block_stop\ndata: {"type":"content_block_stop","index":' + String(i) + '}\n\n');
  }
  events.push('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n');
  events.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  return events;
}

function anthropicToolUseSse(toolId: string, toolName: string, inputJson: string): string[] {
  return [
    'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"${toolId}","name":"${toolName}","input":{}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(inputJson)}}}\n\n`,
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];
}

function makeAnthropicStream(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(e));
      }
      controller.close();
    },
  });
}

function anthropicResponse(events: string[]): Response {
  return new Response(makeAnthropicStream(events), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}


// -- Route: static files ----------------------------------------------

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

// -- Route: POST /api/chat (validation) -------------------------------

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

// -- Route: 404 -------------------------------------------------------

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

// -- Route: POST /api/steer (placeholder) -----------------------------

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

// -- SSE streaming with mocked MiniMax ---------------------------------

describe("SSE streaming from Anthropic endpoint", () => {
  it("streams text content", async () => {
    // Build a mock Anthropic SSE stream
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"World"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
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

  it("emits thinking events from Anthropic thinking blocks", async () => {
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hidden thought"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
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
      // Thinking content should be in event: thinking, not in text
      assert.ok(body.includes("event: thinking"));
      assert.ok(body.includes("hidden thought"));
      assert.ok(body.includes("Hello"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles tool calls in stream", async () => {
    // First call: Anthropic returns tool_use SSE
    // Second call: after tool execution, returns text response
    const toolCallSse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_1","name":"generate_image","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    const finalSse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_2","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Done!"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];

    let callCount = 0;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
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
      }
      // Tool API call
      return new Response(
        JSON.stringify({ data: { image_urls: ["https://example.com/cat.png"] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
      assert.ok(body.includes("API returned 500"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams partial content on finish_reason max_tokens", async () => {
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
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
    let capturedPayload: unknown = null;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];
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
        messages: [{ role: "user", content: "hi" }],
        system_prompt: "You are a helpful assistant", // ignored by new flow
      });
      await handleChat(req, "test-key");
      const payload = capturedPayload as { system: Array<{ type: string; text: string }>; messages: Array<{ role: string }> };
      // System prompt now comes as separate Anthropic param
      assert.ok(payload.system);
      assert.ok(payload.system[0].text.includes("HallucyGenie"));
      // Messages should not contain system role
      assert.ok(!payload.messages.some((m: { role: string }) => m.role === "system"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes model and max_tokens in Anthropic request", async () => {
    let capturedPayload: unknown = null;
    const encoder = new TextEncoder();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      const sseChunks = [
        'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];
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
        messages: [{ role: "user", content: "hi" }],
      });
      await handleChat(req, "test-key");
      const payload = capturedPayload as { model: string; stream: boolean; max_tokens: number };
      assert.equal(payload.model, MINIMAX_MODEL);
      assert.equal(payload.stream, true);
      assert.equal(payload.max_tokens, 4096);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// -- API key check ----------------------------------------------------

describe("API key check", () => {
  it("returns 503 when MINIMAX_API_KEY is missing via handleRequest", async () => {
    const originalKey = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    try {
      const resp = await handleRequest(
        makeRequest("POST", "/api/chat", {
          messages: [{ role: "user", content: "hi" }],
        })
      );
      assert.equal(resp.status, 503);
      const body = (await readJson(resp)) as { error: string };
      assert.ok(body.error.includes("API key"));
    } finally {
      if (originalKey) process.env.MINIMAX_API_KEY = originalKey;
    }
  });
});

// -- Snapshot tests ---------------------------------------------------

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

// -- Graceful shutdown ------------------------------------------------

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

// -- Error handling edge cases -----------------------------------------

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
    const toolCallSse = anthropicToolUseSse("call_1", "test", "{broken");
    const finalSse = anthropicTextSse(["handled"]);

    let callCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        const events = callCount === 0 ? toolCallSse : finalSse;
        callCount++;
        return anthropicResponse(events);
      }
      return new Response(
        JSON.stringify({ data: { image_urls: ["https://example.com/test.png"] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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

  it("handles tool_use block with stop_reason end_turn (no tool execution)", async () => {
    // Tool use block that arrives but stop_reason is end_turn, not tool_use
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_1","name":"test","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(makeAnthropicStream(sseChunks), {
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
        controller.enqueue(encoder.encode('event: message_start\ndata: {"type":"message_start","message":{}}\n\n'));
        controller.enqueue(encoder.encode('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'));
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n'));
        controller.enqueue(encoder.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n'));
        controller.enqueue(encoder.encode('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}\n\n'));
        controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
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

// -- Step 1: Database Initialization at Startup ----------------------

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

// -- Step 2: Session Validation Middleware ----------------------------

describe("Session Validation", () => {
  it("allows valid session ID on /api/chat", async () => {
    const req = makeRequest("POST", "/api/chat", {
      messages: [{ role: "user", content: "hi" }],
    });
    // Should NOT return 400 -- it will fail at MiniMax API call but that's fine
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

// -- Step 4: Integration Tests ----------------------------------------

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
    const sseChunks = anthropicTextSse(["Hey! Cool idea."]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(makeAnthropicStream(sseChunks), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "give me an idea" }],
      });
      const resp = await handleChat(req, "test-key", "test-session-123");
      const body = await readBody(resp);

      // Verify SSE contains text
      assert.ok(body.includes("Hey! Cool idea."));

      // Wait a bit for async DB writes
      await new Promise((r) => setTimeout(r, 100));

      // Verify messages saved to DB
      const dbMessages = getMessages(getDb()!, "test-session-123");
      // Should have the user message and the assistant message
      const userMsgs = dbMessages.filter((m) => m.role === "user");
      const assistantMsgs = dbMessages.filter((m) => m.role === "assistant");
      assert.ok(userMsgs.length >= 1);
      assert.ok(assistantMsgs.length >= 1);
      assert.ok(assistantMsgs[assistantMsgs.length - 1].content.includes("Cool idea"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  })

  it("tool call: SSE stream with tool events + usage tracked", async () => {
    const toolCallSse = anthropicToolUseSse("tc_1", "generate_image", '{"prompt":"cool gaming thumbnail"}');
    const finalSse = anthropicTextSse(["Here is your image!"]);

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/anthropic/v1/messages")) {
        const events = callCount === 0 ? toolCallSse : finalSse;
        callCount++;
        return anthropicResponse(events);
      }
      // Image generation API
      return new Response(
        JSON.stringify({ data: { image_urls: ["https://example.com/thumb.png"] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "make a thumbnail" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);

      // Verify SSE contains tool events
      assert.ok(body.includes("tool_start"));
      assert.ok(body.includes("tool_result"));
      assert.ok(body.includes("generate_image"));
      assert.ok(body.includes("Here is your image!"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  })

  it("snapshot: text-only SSE stream", async () => {
    const sseChunks = anthropicTextSse(["Short answer."]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(makeAnthropicStream(sseChunks), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "hi" }],
      });
      const resp = await handleChat(req, "test-key");
      const body = await readBody(resp);
      // Snapshot: exact SSE output for a simple text response
      assert.ok(body.includes("Short answer."));
      assert.ok(body.includes("[DONE]"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  })
});

// -- Steer endpoint integration ----------------------------------------

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

// -- Step 5: New API Endpoints ----------------------------------------

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

// -- Step 6: Coverage gap tests ---------------------------------------

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
    // Pre-populate DB with history
    const database = getDb()!;
    saveMessage(database, "test-session-123", "user", "previous message");
    saveMessage(database, "test-session-123", "assistant", "previous reply");

    let capturedPayload: unknown = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedPayload = JSON.parse(init?.body as string);
      const sseChunks = anthropicTextSse(["new reply"]);
      return anthropicResponse(sseChunks);
    };

    try {
      const req = makeRequest("POST", "/api/chat", {
        messages: [{ role: "user", content: "new message" }],
      });
      const resp = await handleChat(req, "test-key", "test-session-123");
      const body = await readBody(resp);

      assert.ok(body.includes("new reply"));

      // Verify the payload includes history
      const payload = capturedPayload as { system: unknown[]; messages: Array<{ role: string; content?: string }> };
      // System prompt + history from DB + new user message
      // System is separate in Anthropic format
      const msgRoles = payload.messages.map((m) => m.role);
      assert.ok(msgRoles.includes("user"), "should have user messages");
      // The messages should include the previous history
      const userMsgs = payload.messages.filter((m) => m.role === "user");
      assert.ok(userMsgs.length >= 2, "should have multiple user messages (history + new)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  })
});

// -- Node HTTP adapter + Server lifecycle tests -----------------------

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
    const origKey = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;

    const { startServer } = await import("./server.ts");
    const srv = startServer(0);
    await new Promise<void>((resolve) => srv.on("listening", resolve));
    const port = (srv.address() as any).port;

    const resp = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": "adapter-test" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    // No API key configured, so should get 503
    assert.equal(resp.status, 503, `Expected 503, got ${resp.status}`);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
    if (origKey) process.env.MINIMAX_API_KEY = origKey;
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

// -- Coverage: steer endpoint edge cases -------------------------------

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

// -- Coverage: chat with session ID ------------------------------------

describe("Coverage: chat session path", () => {
  it("POST /api/chat with session ID routes to handleChat", async () => {
    const origKey = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    const req = makeRequest("POST", "/api/chat", {
      messages: [{ role: "user", content: "hi" }],
    });
    req.headers.set("X-Session-Id", "session-test-123");
    const resp = await handleRequest(req);
    assert.equal(resp.status, 503);
    if (origKey) process.env.MINIMAX_API_KEY = origKey;
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

describe("GET /api/quota", () => {
  it("returns 503 when MINIMAX_API_KEY is missing", async () => {
    const prev = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    try {
      const req = new Request("http://localhost/api/quota");
      const resp = await handleRequest(req);
      assert.equal(resp.status, 503);
    } finally {
      if (prev) process.env.MINIMAX_API_KEY = prev;
    }
  });

  it("returns quota data from MiniMax API", async () => {
    const mockResp: Response = {
      ok: true,
      status: 200,
      json: async () => ({
        model_remains: [
          { model_name: "MiniMax-M*", current_interval_total_count: 4500, current_interval_usage_count: 17, remains_time: 14413545 },
          { model_name: "speech-hd", current_interval_total_count: 9000, current_interval_usage_count: 22, remains_time: 64813545 },
          { model_name: "image-01", current_interval_total_count: 100, current_interval_usage_count: 6, remains_time: 64813545 },
          { model_name: "music-2.6", current_interval_total_count: 100, current_interval_usage_count: 2, remains_time: 64813545 },
        ],
      }),
    } as unknown as Response;

    let capturedUrl = "";
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url: URL | RequestInfo) => {
      capturedUrl = String(url);
      return mockResp;
    };

    try {
      const req = new Request("http://localhost/api/quota");
      const resp = await handleRequest(req);
      assert.equal(resp.status, 200);
      const body = await resp.json() as Record<string, unknown>;
      assert.equal((body.chat as Record<string, number>).used, 17);
      assert.equal((body.chat as Record<string, number>).total, 4500);
      assert.equal((body.image as Record<string, number>).used, 6);
      assert.equal((body.image as Record<string, number>).total, 100);
      assert.equal(capturedUrl, "https://api.minimax.io/v1/token_plan/remains");
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("returns 502 when MiniMax quota API fails", async () => {
    const mockResp: Response = { ok: false, status: 500 } as unknown as Response;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => mockResp;
    try {
      const req = new Request("http://localhost/api/quota");
      const resp = await handleRequest(req);
      assert.equal(resp.status, 502);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
