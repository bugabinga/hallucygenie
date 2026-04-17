import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  handleChat,
  initDatabase,
  resetStateForTesting,
} from "./server.ts";
import { rmSync } from "node:fs";
import { join } from "node:path";

const testDbDir = join(import.meta.dirname ?? ".", "test-debug-dir");
const testDbPath = join(testDbDir, "test.db");

before(() => {
  resetStateForTesting();
  initDatabase(testDbPath);
});

after(() => {
  try { rmSync(testDbDir, { recursive: true, force: true }); } catch {}
});

function makeRequest(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: {} as Record<string, string>,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  if (path.startsWith("/api/") && path !== "/api/health") {
    (init.headers as Record<string, string>)["X-Session-Id"] = "test-session-123";
  }
  return new Request(`http://localhost${path}`, init);
}

describe("tool call test", () => {
  it("handles tool calls in stream", async () => {
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
      console.error("Status:", resp.status);
      const body = await resp.text();
      console.error("Body:", body);
      assert.ok(body.includes("tool_start"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
