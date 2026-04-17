// HallucyGenie — HTTP server with SSE chat proxy
// Target: Bun runtime (Bun.serve)

import { getToolDefinitions } from "./tools.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  system_prompt?: string;
}

export interface ToolCallChunk {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolCallAccumulated {
  id: string;
  name: string;
  arguments: string;
}

// ── Configuration ────────────────────────────────────────────────────

export const PORT = Number(process.env.PORT) || 3000;
export const MINIMAX_BASE = "https://api.minimax.io";
export const MINIMAX_MODEL = "MiniMax-M2.7-highspeed";

// ── Thinking token stripping ─────────────────────────────────────────

const THINK_OPEN = "<think_intended>";
const THINK_CLOSE = "</think_intended>";

/**
 * Strip thinking tokens from streamed text content.
 * Handles partial markers that arrive across chunk boundaries.
 */
export function stripThinkingTokens(
  text: string,
  state: { inThink: boolean }
): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (state.inThink) {
      const closeIdx = text.indexOf(THINK_CLOSE, i);
      if (closeIdx !== -1) {
        state.inThink = false;
        i = closeIdx + THINK_CLOSE.length;
      } else {
        // Still inside thinking — skip all
        break;
      }
    } else {
      const openIdx = text.indexOf(THINK_OPEN, i);
      if (openIdx !== -1) {
        result += text.slice(i, openIdx);
        state.inThink = true;
        i = openIdx + THINK_OPEN.length;
      } else {
        // Check for partial open tag at end
        const partialStart = Math.max(i, text.length - THINK_OPEN.length);
        const tail = text.slice(partialStart);
        if (THINK_OPEN.startsWith(tail) && tail.length < THINK_OPEN.length) {
          // Might be partial — keep safe part
          result += text.slice(i, partialStart);
          // The partial tail is ambiguous; keep it to be safe
          // Actually, for streaming we should not emit the partial
          state.inThink = false;
          break;
        }
        result += text.slice(i);
        break;
      }
    }
  }
  return result;
}

// ── Tool call accumulator ────────────────────────────────────────────

export function accumulateToolCalls(
  chunks: ToolCallChunk[],
  accumulated: Map<number, ToolCallAccumulated>
): ToolCallAccumulated[] {
  for (const chunk of chunks) {
    const idx = chunk.index;
    if (!accumulated.has(idx)) {
      accumulated.set(idx, {
        id: chunk.id ?? "",
        name: chunk.function?.name ?? "",
        arguments: "",
      });
    }
    const entry = accumulated.get(idx)!;
    if (chunk.id) entry.id = chunk.id;
    if (chunk.function?.name) entry.name = chunk.function.name;
    if (chunk.function?.arguments) entry.arguments += chunk.function.arguments;
  }
  return [...accumulated.values()];
}

// ── CORS helpers ─────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function corsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS };
}

// ── JSON response helpers ────────────────────────────────────────────

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...corsHeaders(),
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}

// ── Request validation ───────────────────────────────────────────────

function validateChatBody(body: unknown): {
  ok: true; body: ChatRequestBody;
} | {
  ok: false; error: string;
} {
  if (body === null || body === undefined || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const obj = body as Record<string, unknown>;

  if (!("messages" in obj)) {
    return { ok: false, error: "Missing required field: messages" };
  }
  if (!Array.isArray(obj.messages)) {
    return { ok: false, error: "Field 'messages' must be an array" };
  }
  if (obj.messages.length === 0) {
    return { ok: false, error: "Field 'messages' must not be empty" };
  }

  for (let i = 0; i < obj.messages.length; i++) {
    const msg = obj.messages[i];
    if (typeof msg !== "object" || msg === null) {
      return {
        ok: false,
        error: `messages[${i}] must be an object`,
      };
    }
    if (typeof msg.role !== "string") {
      return {
        ok: false,
        error: `messages[${i}].role must be a string`,
      };
    }
    if (typeof msg.content !== "string") {
      return {
        ok: false,
        error: `messages[${i}].content must be a string`,
      };
    }
  }

  return {
    ok: true,
    body: obj as unknown as ChatRequestBody,
  };
}

// ── Static file serving ──────────────────────────────────────────────

import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

async function serveStaticFile(path: string): Promise<Response | null> {
  // Security: prevent path traversal
  const publicDir = resolve("public");
  const filePath = resolve(join("public", path));

  // Ensure the resolved path is still under public/
  if (!filePath.startsWith(publicDir)) return null;
  if (filePath.includes("..")) return null;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;

    const data = await readFile(filePath);
    const ext = filePath.substring(filePath.lastIndexOf("."));
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(data, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return null;
  }
}

// ── MiniMax API proxy ────────────────────────────────────────────────

function buildMiniMaxPayload(body: ChatRequestBody) {
  const messages: ChatMessage[] = [];

  if (body.system_prompt) {
    messages.push({ role: "system", content: body.system_prompt });
  }

  messages.push(...body.messages);

  return {
    model: MINIMAX_MODEL,
    messages,
    stream: true,
    tools: getToolDefinitions(),
  };
}

export async function handleChat(
  req: Request,
  apiKey: string
): Promise<Response> {
  // Parse body
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  const validation = validateChatBody(parsed);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const payload = buildMiniMaxPayload(validation.body);

  // Forward to MiniMax with streaming
  let minimaxResp: Response;
  try {
    minimaxResp = await fetch(`${MINIMAX_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to connect to MiniMax API", detail: String(err) },
      502
    );
  }

  if (!minimaxResp.ok) {
    const errorText = await minimaxResp.text();
    return jsonResponse(
      {
        error: `MiniMax API error: ${minimaxResp.status}`,
        detail: errorText,
      },
      minimaxResp.status >= 400 && minimaxResp.status < 500 ? 502 : 502
    );
  }

  // Stream SSE events from MiniMax back to the browser
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process the SSE stream from MiniMax in background
  (async () => {
    const thinkState = { inThink: false };
    const toolCallAccumulator = new Map<number, ToolCallAccumulated>();
    const reader = minimaxResp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            // Send any pending tool calls
            if (toolCallAccumulator.size > 0) {
              const toolCalls = [...toolCallAccumulator.values()];
              for (const tc of toolCalls) {
                try {
                  JSON.parse(tc.arguments);
                } catch {
                  tc.arguments = "{}";
                }
              }
              const toolEndEvent = `event: tool_end\ndata: ${JSON.stringify(toolCalls)}\n\n`;
              await writer.write(encoder.encode(toolEndEvent));
            }
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const choices = parsed.choices as
            | Array<{
              delta?: {
                content?: string;
                tool_calls?: ToolCallChunk[];
              };
              finish_reason?: string | null;
            }>
            | undefined;
          if (!choices?.length) continue;

          const choice = choices[0];

          // Handle tool calls
          if (choice.delta?.tool_calls) {
            const accumulated = accumulateToolCalls(
              choice.delta.tool_calls,
              toolCallAccumulator
            );

            // Emit tool_start if this is the first chunk for a tool call
            for (const tc of choice.delta.tool_calls) {
              if (tc.id) {
                const toolStartEvent = `event: tool_start\ndata: ${JSON.stringify({
                  id: tc.id,
                  name: tc.function?.name ?? accumulated[tc.index]?.name ?? "",
                })}\n\n`;
                await writer.write(encoder.encode(toolStartEvent));
              }
            }
          }

          // Handle finish_reason: tool_calls
          if (choice.finish_reason === "tool_calls") {
            const toolCalls = [...toolCallAccumulator.values()];
            for (const tc of toolCalls) {
              try {
                JSON.parse(tc.arguments);
              } catch {
                tc.arguments = "{}";
              }
            }
            const toolEndEvent = `event: tool_end\ndata: ${JSON.stringify(toolCalls)}\n\n`;
            await writer.write(encoder.encode(toolEndEvent));
          }

          // Handle finish_reason: length
          if (choice.finish_reason === "length") {
            const truncatedEvent = `event: truncated\ndata: ${JSON.stringify({ reason: "length" })}\n\n`;
            await writer.write(encoder.encode(truncatedEvent));
          }

          // Handle content streaming (strip thinking tokens)
          if (choice.delta?.content) {
            const cleaned = stripThinkingTokens(
              choice.delta.content,
              thinkState
            );
            if (cleaned) {
              const contentEvent = `data: ${JSON.stringify({
                choices: [
                  {
                    delta: { content: cleaned },
                    finish_reason: choice.finish_reason ?? null,
                  },
                ],
              })}\n\n`;
              await writer.write(encoder.encode(contentEvent));
            }
          } else if (
            !choice.delta?.tool_calls &&
            choice.finish_reason &&
            choice.finish_reason !== "tool_calls"
          ) {
            // Send finish event without content
            const finishEvent = `data: ${JSON.stringify({
              choices: [
                {
                  delta: {},
                  finish_reason: choice.finish_reason,
                },
              ],
            })}\n\n`;
            await writer.write(encoder.encode(finishEvent));
          }
        }
      }
    } catch (err) {
      const errorEvent = `event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`;
      await writer.write(encoder.encode(errorEvent));
    } finally {
      await writer.close();
    }
  })();

  return sseResponse(readable);
}

// ── Health check ─────────────────────────────────────────────────────

const startTime = Date.now();

function handleHealth(): Response {
  return jsonResponse({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
}

// ── Main request handler ─────────────────────────────────────────────

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // API routes
  if (path === "/api/health" && method === "GET") {
    return handleHealth();
  }

  if (path === "/api/chat" && method === "POST") {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        { error: "MINIMAX_API_KEY environment variable is required" },
        500
      );
    }
    return handleChat(req, apiKey);
  }

  if (path === "/api/steer" && method === "POST") {
    return jsonResponse({ message: "steer endpoint - not yet implemented" });
  }

  // Static files
  if (path === "/") {
    const resp = await serveStaticFile("/index.html");
    if (resp) return resp;
  }

  if (method === "GET") {
    const resp = await serveStaticFile(path);
    if (resp) return resp;
  }

  // 404
  return jsonResponse({ error: "Not found" }, 404);
}

// ── Server lifecycle ─────────────────────────────────────────────────

let server: ReturnType<typeof Bun.serve> | null = null;

export function startServer(port = PORT): ReturnType<typeof Bun.serve> {
  server = Bun.serve({
    port,
    fetch: handleRequest,
  });

  console.log(`HallucyGenie server running on http://localhost:${port}`);

  return server;
}

export async function shutdown(): Promise<void> {
  if (server) {
    server.stop(true);
    server = null;
  }
}

// Start if run directly
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("server.ts")
) {
  startServer();
}
