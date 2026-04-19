// HallucyGenie — HTTP server with SSE chat proxy
// Target: Node.js runtime

import { mkdirSync, writeFileSync } from "node:fs";
import { initDb, saveAsset, getAssets, getAsset } from "./db.ts";
import { dirname } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { createLogger, nextReqId } from "./log.ts";

const log = createLogger({ service: "hallucygenie" });
import type { DatabaseSync } from "node:sqlite";
import {
  runAgentLoop,
  buildSystemPrompt,
  buildContext,
  estimateTokens,
  createSteerQueue,
  queueSteer,
  type SteerQueue,
  type AgentEvent,
} from "./agent.ts";

import { getMessages, saveMessage, getPreferences, trackUsage, checkQuota, getUsageToday, QUOTAS } from "./db.ts";

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
  tool_calls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  system_prompt?: string;
}

// ── Configuration ────────────────────────────────────────────────────

export const PORT = Number(process.env.PORT) || 3000;
export const MINIMAX_BASE = "https://api.minimax.io";
export const MINIMAX_MODEL = "MiniMax-M2.7-highspeed";

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

// ── Anthropic API proxy ──────────────────────────────────────────────
// handleChat delegates to runAgentLoop which builds its own
// Anthropic-format payload internally.

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

  const messages: ChatMessage[] = [];
  messages.push({ role: "system", content: systemPrompt });

  // Load existing history from DB for this session
  if (sessionId) {
    const history = getMessages(database, sessionId);
    for (const row of history) {
      const msg: ChatMessage = {
        role: row.role as ChatMessage["role"],
        content: row.content,
        ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
      };
      // Restore tool_calls from tool_calls_json if available
      if (row.tool_calls_json) {
        try {
          msg.tool_calls = JSON.parse(row.tool_calls_json);
        } catch {
          // Ignore malformed JSON
        }
      }
      messages.push(msg);
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

  // Apply context window trimming to avoid blowing the token limit
  const totalMessages = messages.length;
  const contextMessages = buildContext(messages);
  if (contextMessages.length < totalMessages) {
    const keptMessages = contextMessages.length;
    const estimatedTokens = contextMessages.reduce(
      (sum, m) => sum + estimateTokens(m),
      0,
    );
    log.info("context trimmed", { totalMessages, keptMessages, estimatedTokens });
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
        contextMessages,
        apiKey,
        (event: AgentEvent) => {
          // Convert agent events to SSE for the browser
          switch (event.type) {
            case "thinking": {
              const sseData = `event: thinking\ndata: ${JSON.stringify({
                content: event.content,
              })}\n\n`;
              writer.write(encoder.encode(sseData));
              break;
            }
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
              // Save image/audio assets to disk
              const saved = sessionId
                ? saveAssetFile(event.result!, sessionId, event.name ?? "", event.prompt ?? null)
                : event.result;
              const sseData = `event: tool_result\ndata: ${JSON.stringify({
                id: event.id,
                name: event.name,
                result: saved,
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
          // Store tool_calls as JSON for Anthropic message reconstruction
          const toolCallsJson = msg.tool_calls
            ? JSON.stringify(msg.tool_calls)
            : null;
          saveMessage(
            database,
            sessionId,
            msg.role,
            msg.content,
            toolCallsJson,
            msg.tool_call_id ?? null
          );
        }

        // Track tool usage
        for (let i = existingCount; i < finalMessages.length; i++) {
          const msg = finalMessages[i];
          if (msg.role === "tool") {
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

  // No-session endpoints
  if (path === "/api/quota" && method === "GET") {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: "MINIMAX_API_KEY not configured" }, 503);
    }
    try {
      const resp = await fetch(`${MINIMAX_BASE}/v1/token_plan/remains`, {
        headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": `hallucygenie/1.0` },
      });
      if (!resp.ok) {
        log.warn("quota api error", { status: resp.status });
        return jsonResponse({ error: "Failed to fetch quota" }, 502);
      }
      const data = await resp.json() as {
        model_remains: Array<{
          model_name: string;
          current_interval_total_count: number;
          current_interval_usage_count: number;
          remains_time: number;
        }>;
      };
      const find = (prefix: string) =>
        data.model_remains.find(m => m.model_name.startsWith(prefix)) ?? null;
      const m2 = find("MiniMax-M");
      const speech = find("speech-hd");
      const image = find("image-01");
      const music = find("music-2.6");
      return jsonResponse({
        chat: m2 ? { used: m2.current_interval_usage_count, total: m2.current_interval_total_count, resetsInMs: m2.remains_time } : null,
        speech: speech ? { used: speech.current_interval_usage_count, total: speech.current_interval_total_count, resetsInMs: speech.remains_time } : null,
        image: image ? { used: image.current_interval_usage_count, total: image.current_interval_total_count, resetsInMs: image.remains_time } : null,
        music: music ? { used: music.current_interval_usage_count, total: music.current_interval_total_count, resetsInMs: music.remains_time } : null,
      });
    } catch (err) {
      log.error("quota api error", { error: String(err) });
      return jsonResponse({ error: "Failed to fetch quota" }, 502);
    }
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
          { error: "Server is missing the API key. Ask whoever set this up to add MINIMAX_API_KEY to the environment." },
          503
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

    // GET /assets — list assets for session
    if (path === "/assets" && method === "GET") {
      const database = getDb();
      if (!database) return jsonResponse({ error: "Database not initialized" }, 500);
      const assets = getAssets(database, sessionId!);
      return jsonResponse({ assets });
    }

    // GET /asset/:id — serve a specific asset file
    if (path.startsWith("/asset/") && method === "GET") {
      const assetId = path.slice("/asset/".length);
      const database = getDb();
      if (!database) return jsonResponse({ error: "Database not initialized" }, 500);
      const asset = getAsset(database, assetId);
      if (!asset) return jsonResponse({ error: "Not found" }, 404);
      const filePath = `data/assets/${asset.session_id}/${asset.filename}`;
      try {
        const file = await readFile(filePath);
        return new Response(file, {
          headers: { "Content-Type": asset.mime_type, "Cache-Control": "public, max-age=31536000" },
        });
      } catch {
        return jsonResponse({ error: "File not found" }, 404);
      }
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

// ── Node.js HTTP adapter ──────────────────────────────────────────
// Bridges Node's (IncomingMessage, ServerResponse) to the
// web-standard (Request, Response) used by handleRequest.

async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reqId = nextReqId();
  const reqLog = log.child({ reqId, method: req.method, path: req.url });
  reqLog.debug("request received");
  try {
    // Build a web-standard Request from Node's IncomingMessage
    const url = `http://localhost:${PORT}${req.url}`;
    const method = req.method || "GET";
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    let body: BodyInit | null = null;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const webReq = new Request(url, { method, headers, body });
    const webRes = await handleRequest(webReq);

    // Stream the Response back to Node's ServerResponse
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webRes.body) {
      const reader = webRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
    reqLog.info("response sent", { status: res.statusCode });
  } catch (err) {
    log.error("request handler error", { error: String(err) });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

// ── Server lifecycle ─────────────────────────────────────────────────

let server: Server | null = null;
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

/**
 * Save a data URL (image/audio) to disk and record in SQLite.
 * Returns the saved file path (relative to data/assets/).
 */
function saveAssetFile(
  result: { type: string; content: string },
  sessionId: string,
  toolName: string,
  prompt: string | null
): { type: string; content: string } {
  if (!result.content.startsWith("data:")) {
    return result; // text or error — no file to save
  }

  // Parse data URL: data:{mime};base64,{data}
  const match = result.content.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return result;

  const mime = match[1]!;
  const b64 = match[2]!;
  const ext = mime.split("/")[1]?.replace(/jpeg/, "jpg") ?? "bin";
  const assetId = nextReqId();
  const filename = `${assetId}.${ext}`;

  // Ensure directory exists
  const dir = `data/assets/${sessionId}`;
  mkdirSync(dir, { recursive: true });

  // Write binary file
  const buf = Buffer.from(b64, "base64");
  writeFileSync(`${dir}/${filename}`, buf);

  // Record in SQLite (if db is available)
  if (db) {
    saveAsset(db, {
      id: assetId,
      session_id: sessionId,
      type: result.type as "image" | "audio" | "music",
      filename,
      mime_type: mime,
      prompt,
      tool_name: toolName,
      size_bytes: buf.byteLength,
    });
  }

  // Return asset reference instead of data URL
  return { type: result.type, content: `/asset/${assetId}` };
}

export function startServer(port = PORT): Server {
  server = createServer((req, res) => handleNodeRequest(req, res));
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.error("port in use", { port });
      process.exit(1);
    } else {
      throw err;
    }
  });
  server.listen(port, () => {
    log.info("server started", { port });
  });
  return server;
}

let shuttingDown = false;

export async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server) {
    server.close();
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
    try { server.close(); } catch { /* ignore */ }
    server = null;
  }
}

// Graceful shutdown signal handlers
function setupSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  for (const sig of signals) {
    process.on(sig, async () => {
      log.info("shutting down", { signal: sig });
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
