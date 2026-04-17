// HallucyGenie — HTTP server with SSE chat proxy
// Target: Bun runtime (Bun.serve)

import { getToolDefinitions } from "./tools.ts";
import { initDb } from "./db.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  runAgentLoop,
  buildSystemPrompt,
  createSteerQueue,
  queueSteer,
  type SteerQueue,
  type AgentEvent,
} from "./agent.ts";
import { getMessages, saveMessage, getPreferences, trackUsage, checkQuota, getUsageToday, QUOTAS } from "./db.ts";

// ── Steer queues per session ────────────────────────────────────────

const steerQueues = new Map<string, SteerQueue>();

function getOrCreateSteerQueue(sessionId: string): SteerQueue {
  let queue = steerQueues.get(sessionId);
  if (!queue) {
    queue = createSteerQueue();
    steerQueues.set(sessionId, queue);
  }
  return queue;
}

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
// Note: buildMiniMaxPayload is no longer used; handleChat delegates to runAgentLoop
// which builds its own payload internally.

export async function handleChat(
  req: Request,
  apiKey: string,
  sessionId?: string
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

  // Get the database instance
  const database = getDb();
  if (!database) {
    return jsonResponse({ error: "Database not initialized" }, 500);
  }

  // Build message history: load from DB, append new user message
  const systemPrompt = buildSystemPrompt(
    sessionId ? getPreferences(database) : undefined
  );

  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [];
  messages.push({ role: "system", content: systemPrompt });

  // Load existing history from DB for this session
  if (sessionId) {
    const history = getMessages(database, sessionId);
    for (const row of history) {
      messages.push({
        role: row.role,
        content: row.content,
        ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
      });
    }
  }

  // Append new user messages
  for (const msg of validation.body.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Save user message to DB
  if (sessionId) {
    const lastUserMsg = validation.body.messages[validation.body.messages.length - 1];
    saveMessage(database, sessionId, "user", lastUserMsg.content);
  }

  // Get or create steer queue for this session
  const steerQueue = sessionId ? getOrCreateSteerQueue(sessionId) : undefined;

  // Set up SSE stream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Run agent loop in background, streaming events to SSE
  (async () => {
    try {
      const finalMessages = await runAgentLoop(
        messages as ChatMessage[],
        apiKey,
        (event: AgentEvent) => {
          // Convert agent events to SSE
          switch (event.type) {
            case "text": {
              const sseData = `data: ${JSON.stringify({
                choices: [{ delta: { content: event.content }, finish_reason: null }],
              })}\n\n`;
              writer.write(encoder.encode(sseData));
              break;
            }
            case "tool_start": {
              const sseData = `event: tool_start\ndata: ${JSON.stringify({
                id: event.id,
                name: event.name,
              })}\n\n`;
              writer.write(encoder.encode(sseData));
              break;
            }
            case "tool_result": {
              const sseData = `event: tool_result\ndata: ${JSON.stringify({
                id: event.id,
                name: event.name,
                result: event.result,
              })}\n\n`;
              writer.write(encoder.encode(sseData));
              break;
            }
            case "done": {
              writer.write(encoder.encode("data: [DONE]\n\n"));
              break;
            }
          }
        },
        steerQueue
      );

      // Save assistant messages and tool results to DB
      if (sessionId) {
        // Find new messages (those beyond what we sent)
        const existingCount = messages.length;
        for (let i = existingCount; i < finalMessages.length; i++) {
          const msg = finalMessages[i];
          saveMessage(
            database,
            sessionId,
            msg.role,
            msg.content,
            null, // tool_calls_json
            msg.tool_call_id ?? null
          );
        }

        // Track tool usage
        for (let i = existingCount; i < finalMessages.length; i++) {
          const msg = finalMessages[i];
          if (msg.role === "tool") {
            // Determine which feature was used
            // We need to figure out what tool was called
            // The assistant message before the tool result has the tool name info
            const prevAssistant = finalMessages
              .slice(0, i)
              .reverse()
              .find(m => m.role === "assistant");
            // Track usage for known features
            for (const feature of ["image", "speech", "music"]) {
              if (msg.content.includes(feature) || msg.content.includes("url") || msg.content.includes("data:")) {
                const quotaStatus = checkQuota(database, feature);
                if (!quotaStatus.blocked) {
                  trackUsage(database, feature);
                }
              }
            }
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

// ── Session validation ──────────────────────────────────────────────

export function validateSessionId(req: Request): string | null {
  const sessionId = req.headers.get("X-Session-Id");
  if (!sessionId || sessionId.trim() === "") return null;
  return sessionId;
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

  // Session validation for all /api/* routes except health
  if (path.startsWith("/api/")) {
    const sessionId = validateSessionId(req);
    if (!sessionId) {
      return jsonResponse({ error: "X-Session-Id header required" }, 400);
    }

    // Route to handler with validated session ID
    if (path === "/api/chat" && method === "POST") {
      const apiKey = process.env.MINIMAX_API_KEY;
      if (!apiKey) {
        return jsonResponse(
          { error: "MINIMAX_API_KEY environment variable is required" },
          500
        );
      }
      return handleChat(req, apiKey, sessionId);
    }

    if (path === "/api/steer" && method === "POST") {
      let parsed: unknown;
      try {
        parsed = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON in request body" }, 400);
      }
      if (!parsed || typeof parsed !== "object" || !("message" in parsed) || typeof (parsed as { message: unknown }).message !== "string") {
        return jsonResponse({ error: "Missing required field: message" }, 400);
      }
      const queue = getOrCreateSteerQueue(sessionId!);
      queueSteer(queue, (parsed as { message: string }).message);
      return jsonResponse({ ok: true });
    }

    if (path === "/api/history" && method === "GET") {
      const database = getDb();
      if (!database) {
        return jsonResponse({ error: "Database not initialized" }, 500);
      }
      const messages = getMessages(database, sessionId!);
      return jsonResponse({ messages });
    }

    if (path === "/api/usage" && method === "GET") {
      const database = getDb();
      if (!database) {
        return jsonResponse({ error: "Database not initialized" }, 500);
      }
      const usage = getUsageToday(database);
      return jsonResponse({ usage, limits: QUOTAS });
    }

    return jsonResponse({ error: "Not found" }, 404);
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
let db: DatabaseSync | null = null;

/**
 * Get the database instance (null if not initialized).
 */
export function getDb(): DatabaseSync | null {
  return db;
}

/**
 * Initialize the database: create data directory and run migrations.
 */
export function initDatabase(dbPath = "data/hallucygenie.db"): DatabaseSync {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  db = initDb(dbPath);
  return db;
}

export function startServer(port = PORT): ReturnType<typeof Bun.serve> {
  server = Bun.serve({
    port,
    fetch: handleRequest,
  });

  console.log(`HallucyGenie server running on http://localhost:${port}`);

  return server;
}

let shuttingDown = false;

export async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server) {
    server.stop(true);
    server = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Reset server state for testing. Not for production use.
 */
export function resetStateForTesting(): void {
  shuttingDown = false;
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
  if (server) {
    try { server.stop(true); } catch { /* ignore */ }
    server = null;
  }
}

// Graceful shutdown signal handlers
function setupSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  for (const sig of signals) {
    process.on(sig, async () => {
      console.log(`\nReceived ${sig}, shutting down gracefully...`);
      await shutdown();
      process.exit(0);
    });
  }
}

// Start if run directly
if (
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("server.ts")
) {
  initDatabase();
  startServer();
  setupSignalHandlers();
}
