// HallucyGenie — HTTP server with SSE chat proxy
// Target: Node.js runtime

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
    initDb,
    saveAsset,
    getAssets,
    getAsset,
    getUserProfile,
    saveUserProfile,
    deleteUserProfile,
} from "./db.ts";
import { dirname } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { Readable } from "node:stream";
import { createLogger, nextReqId } from "./log.ts";

const log = createLogger({ service: "hallucygenie" });
import type { Database } from "bun:sqlite";
import { MINIMAX_BASE, type ToolResult } from "./tools.ts";
import {
    runAgentLoop,
    buildSystemPrompt,
    buildContext,
    estimateTokens,
    createSteerQueue,
    queueSteer,
    drainSteer,
    executeToolSafely,
    safeToolResultForUser,
    type SteerQueue,
    type AgentEvent,
} from "./agent.ts";

import {
    getMessages,
    saveMessage,
    getPreferences,
    trackUsage,
    checkQuota,
    getUsageToday,
    getOrCreateActiveSessionId,
    getOrCreateActiveSession,
    QUOTAS,
} from "./db.ts";

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

export interface ExplicitToolDirective {
    name: "generate_image" | "generate_music" | "text_to_speech" | "generate_lyrics";
    args: Record<string, unknown>;
    prompt: string | null;
}

// ── Configuration ────────────────────────────────────────────────────

export const PORT = Number(process.env.PORT) || 3000;

// ── CORS helpers ─────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// ── JSON response helpers ────────────────────────────────────────────

function jsonResponse(
    data: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {},
): Response {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
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
            ...CORS_HEADERS,
        },
    });
}

// ── Request validation ───────────────────────────────────────────────

function validateChatBody(body: unknown):
    | {
          ok: true;
          body: ChatRequestBody;
      }
    | {
          ok: false;
          error: string;
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
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
};

function headResponse(resp: Response): Response {
    return new Response(null, { status: resp.status, headers: resp.headers });
}

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
        const headers: Record<string, string> = {
            "Content-Type": contentType,
            "Content-Length": String(data.byteLength),
        };
        if (path.startsWith("/fonts/")) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable";
        }
        return new Response(data, { headers });
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
    sessionId?: string,
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
        sessionId ? getPreferences(database) : undefined,
        getUserProfile(database),
    );

    const messages: ChatMessage[] = [];
    messages.push({ role: "system", content: systemPrompt });

    // Load existing history from DB for this session
    if (sessionId) {
        const history = getMessages(database, sessionId);
        for (const row of history) {
            // MiniMax rejects replayed historical tool_result ids. Keep saved tool rows
            // for assets/history, but never resend old tool protocol messages to chat.
            if (row.role === "tool") continue;
            if (row.role === "assistant" && row.tool_calls_json) continue;

            const content =
                row.role === "assistant" ? sanitizeAssistantMediaMarkup(row.content) : row.content;
            if (row.role === "assistant" && !content.trim()) continue;

            const msg: ChatMessage = {
                role: row.role as ChatMessage["role"],
                content,
            };
            messages.push(msg);
        }
    }

    // Append new user messages
    for (const msg of validation.body.messages) {
        messages.push({ role: msg.role, content: msg.content });
    }

    const lastUserMsg = validation.body.messages[validation.body.messages.length - 1];

    // Save user message to DB
    if (sessionId) {
        saveMessage(database, sessionId, "user", lastUserMsg.content);
    }

    const explicitTool = parseExplicitToolDirective(lastUserMsg.content);
    if (explicitTool) {
        return handleExplicitToolDirective(explicitTool, apiKey, database, sessionId);
    }

    // Apply context window trimming to avoid blowing the token limit
    const totalMessages = messages.length;
    const contextMessages = buildContext(messages);
    if (contextMessages.length < totalMessages) {
        const keptMessages = contextMessages.length;
        const estimatedTokens = contextMessages.reduce((sum, m) => sum + estimateTokens(m), 0);
        log.info("context trimmed", { totalMessages, keptMessages, estimatedTokens });
    }
    // Get or create steer queue for this session
    const steerQueue = sessionId ? getOrCreateSteerQueue(sessionId) : undefined;

    // Set up SSE stream
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const savedToolResults = new Map<string, ToolResult>();
    let thinkingBuffer = "";

    // Run agent loop in background, streaming events to SSE
    (async () => {
        try {
            const finalMessages = await runAgentLoop(
                contextMessages,
                apiKey,
                async (event: AgentEvent) => {
                    // Convert agent events to SSE for the browser
                    switch (event.type) {
                        case "thinking": {
                            thinkingBuffer += event.content ?? "";
                            const sseData = `event: thinking\ndata: ${JSON.stringify({
                                content: event.content,
                            })}\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "text": {
                            const sseData = `data: ${JSON.stringify({
                                choices: [
                                    { delta: { content: event.content }, finish_reason: null },
                                ],
                            })}\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "tool_start": {
                            const sseData = `event: tool_start\ndata: ${JSON.stringify({
                                id: event.id,
                                name: event.name,
                            })}\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "tool_result": {
                            if (!event.result) throw new Error("tool_result event missing result");
                            // Save image/audio assets to disk
                            const saved = sessionId
                                ? await saveAssetFile(
                                      event.result,
                                      sessionId,
                                      event.name ?? "",
                                      event.prompt ?? null,
                                      event.args,
                                  )
                                : event.result;
                            if (event.id) savedToolResults.set(event.id, saved);
                            const sseData = `event: tool_result\ndata: ${JSON.stringify({
                                id: event.id,
                                name: event.name,
                                result: saved,
                            })}\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "done": {
                            await writer.write(encoder.encode("data: [DONE]\n\n"));
                            break;
                        }
                    }
                },
                steerQueue,
            );

            // Save assistant messages and tool results to DB
            if (sessionId) {
                // Find new messages (those beyond what we sent)
                // Use contextMessages.length, not messages.length, because finalMessages
                // is built from the trimmed context, not the full untrimmed array.
                const existingCount = contextMessages.length;
                let thinkingSaved = false;
                for (let i = existingCount; i < finalMessages.length; i++) {
                    const msg = finalMessages[i];
                    // Store tool_calls as JSON for Anthropic message reconstruction
                    const toolCallsJson = msg.tool_calls ? JSON.stringify(msg.tool_calls) : null;
                    const savedTool = msg.tool_call_id
                        ? savedToolResults.get(msg.tool_call_id)
                        : null;
                    const content =
                        msg.role === "assistant"
                            ? msg.tool_calls
                                ? ""
                                : sanitizeAssistantMediaMarkup(msg.content)
                            : savedTool
                              ? savedTool.type === "error"
                                  ? `Error: ${savedTool.content}`
                                  : savedTool.content
                              : msg.content;
                    const thinking =
                        !thinkingSaved && msg.role === "assistant" && thinkingBuffer.trim()
                            ? thinkingBuffer
                            : null;
                    saveMessage(
                        database,
                        sessionId,
                        msg.role,
                        content,
                        toolCallsJson,
                        msg.tool_call_id ?? null,
                        thinking,
                    );
                    if (thinking) thinkingSaved = true;
                }

                if (steerQueue) {
                    for (const msg of drainSteer(steerQueue)) {
                        saveMessage(database, sessionId, "user", msg);
                    }
                }

                // Track tool usage by correlating tool results with tool calls
                const toolCallById = new Map<string, string>();
                for (let i = existingCount; i < finalMessages.length; i++) {
                    const msg = finalMessages[i];
                    if (msg.role === "assistant" && msg.tool_calls) {
                        for (const tc of msg.tool_calls) {
                            toolCallById.set(tc.id, tc.name);
                        }
                    }
                    if (msg.role === "tool" && msg.tool_call_id) {
                        const toolName = toolCallById.get(msg.tool_call_id);
                        const featureMap: Record<string, string> = {
                            generate_image: "image",
                            text_to_speech: "speech",
                            generate_music: "music",
                            generate_lyrics: "lyrics",
                        };
                        const feature = toolName ? featureMap[toolName] : null;
                        if (feature) {
                            const quotaStatus = checkQuota(database, feature);
                            if (!quotaStatus.blocked) {
                                trackUsage(database, feature);
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

// ── Explicit Create tool directives ─────────────────────────────────

export function sanitizeAssistantMediaMarkup(content: string): string {
    const withoutMarkdownImages = content.replace(/!\[[^\]\n]*\]\([^\)\n]+\)/g, "");
    const withoutHtmlMedia = withoutMarkdownImages
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<audio\b[\s\S]*?<\/audio>/gi, "")
        .replace(/<video\b[\s\S]*?<\/video>/gi, "");
    const withoutGeneratedUrls = withoutHtmlMedia.replace(
        /https?:\/\/\S*(?:hailuo-image|image_inference_output|aliyuncs)\S*/gi,
        "",
    );
    const normalized = withoutGeneratedUrls
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (/^here(?:'s| is) your (?:image|music|audio)[:!.\s]*$/i.test(normalized)) {
        return "Generated media is shown in the tool card.";
    }
    return normalized;
}

function parseToolParams(raw: string | undefined, allowed: Set<string>): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (!raw) return params;

    for (const part of raw.split(/[\n,]+/)) {
        const match = part.trim().match(/^([a-z_]+)\s*=\s*(.+)$/i);
        if (!match) continue;
        const key = match[1]!;
        if (!allowed.has(key)) continue;

        const value = match[2]!.trim().replace(/^['\"]|['\"]$/g, "");
        if (value === "true") {
            params[key] = true;
        } else if (value === "false") {
            params[key] = false;
        } else if (/^-?\d+(?:\.\d+)?$/.test(value)) {
            params[key] = Number(value);
        } else {
            params[key] = value;
        }
    }
    return params;
}

export function parseExplicitToolDirective(content: string): ExplicitToolDirective | null {
    const match = content.match(
        /^Use\s+(generate_image|generate_music|text_to_speech|generate_lyrics)\s+with\s+(prompt|text):\s*([\s\S]*?)(?:\nTool params:\s*([\s\S]*))?$/i,
    );
    if (!match) return null;

    const name = match[1]!.toLowerCase() as ExplicitToolDirective["name"];
    const field = match[2]!.toLowerCase();
    const value = match[3]!.trim();
    if (!value) return null;

    const allowedParams: Record<ExplicitToolDirective["name"], Set<string>> = {
        generate_image: new Set(["aspect_ratio"]),
        generate_music: new Set(["lyrics"]),
        text_to_speech: new Set(["voice_id", "speed", "volume", "pitch"]),
        generate_lyrics: new Set(["mode", "lyrics", "title"]),
    };
    const args = parseToolParams(match[4], allowedParams[name]);

    if (name === "text_to_speech") {
        args.text = value;
        return { name, args, prompt: value };
    }

    if (field !== "prompt") return null;
    args.prompt = value;
    return { name, args, prompt: value };
}

function featureForTool(name: string): "image" | "speech" | "music" | "lyrics" | null {
    if (name === "generate_image") return "image";
    if (name === "text_to_speech") return "speech";
    if (name === "generate_music") return "music";
    if (name === "generate_lyrics") return "lyrics";
    return null;
}

function handleExplicitToolDirective(
    directive: ExplicitToolDirective,
    apiKey: string,
    database: Database,
    sessionId?: string,
): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const toolCallId = `direct_${randomUUID()}`;

    const writeSse = async (event: string | null, data: unknown) => {
        const prefix = event ? `event: ${event}\n` : "";
        await writer.write(encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`));
    };

    (async () => {
        try {
            await writeSse("tool_start", { id: toolCallId, name: directive.name });

            const feature = featureForTool(directive.name);
            const quota = feature ? checkQuota(database, feature) : { blocked: false };
            const result = safeToolResultForUser(
                directive.name,
                quota.blocked
                    ? { type: "error" as const, content: `Daily ${feature} quota is used up.` }
                    : await executeToolSafely(directive.name, directive.args, apiKey),
            );
            const saved = sessionId
                ? await saveAssetFile(
                      result,
                      sessionId,
                      directive.name,
                      directive.prompt,
                      directive.args,
                  )
                : result;

            await writeSse("tool_result", {
                id: toolCallId,
                name: directive.name,
                result: saved,
            });
            await writer.write(encoder.encode("data: [DONE]\n\n"));

            if (sessionId) {
                saveMessage(
                    database,
                    sessionId,
                    "assistant",
                    "",
                    JSON.stringify([
                        { id: toolCallId, name: directive.name, input: directive.args },
                    ]),
                    null,
                );
                saveMessage(
                    database,
                    sessionId,
                    "tool",
                    saved.type === "error" ? `Error: ${saved.content}` : saved.content,
                    null,
                    toolCallId,
                );
                if (feature && !quota.blocked && saved.type !== "error") {
                    trackUsage(database, feature);
                }
            }
        } catch (err) {
            await writeSse("error", { error: String(err) });
        } finally {
            await writer.close();
        }
    })();

    return sseResponse(readable);
}

// ── Session validation ──────────────────────────────────────────────

export function validateSessionId(req: Request): string | null {
    const trimmed = req.headers.get("X-Session-Id")?.trim() ?? "";
    return trimmed || null;
}

export function resolveSessionId(req: Request, database: Database): string {
    return validateSessionId(req) ?? getOrCreateActiveSessionId(database);
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
    const path = new URL(req.url).pathname;
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
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
            const data = (await resp.json()) as {
                model_remains: Array<{
                    model_name: string;
                    current_interval_total_count: number;
                    current_interval_usage_count: number;
                    remains_time: number;
                }>;
            };
            const find = (prefix: string) =>
                data.model_remains.find((m) => m.model_name.startsWith(prefix)) ?? null;
            const m2 = find("MiniMax-M");
            const speech = find("speech-hd");
            const image = find("image-01");
            const music = find("music-2.6");
            const lyrics = find("lyrics-01") ?? find("lyrics");
            return jsonResponse({
                chat: m2
                    ? {
                          used: m2.current_interval_usage_count,
                          total: m2.current_interval_total_count,
                          resetsInMs: m2.remains_time,
                      }
                    : null,
                speech: speech
                    ? {
                          used: speech.current_interval_usage_count,
                          total: speech.current_interval_total_count,
                          resetsInMs: speech.remains_time,
                      }
                    : null,
                image: image
                    ? {
                          used: image.current_interval_usage_count,
                          total: image.current_interval_total_count,
                          resetsInMs: image.remains_time,
                      }
                    : null,
                music: music
                    ? {
                          used: music.current_interval_usage_count,
                          total: music.current_interval_total_count,
                          resetsInMs: music.remains_time,
                      }
                    : null,
                lyrics: lyrics
                    ? {
                          used: lyrics.current_interval_usage_count,
                          total: lyrics.current_interval_total_count,
                          resetsInMs: lyrics.remains_time,
                      }
                    : null,
            });
        } catch (err) {
            log.error("quota api error", { error: String(err) });
            return jsonResponse({ error: "Failed to fetch quota" }, 502);
        }
    }

    if (path.startsWith("/api/")) {
        const dbOrErr = requireDb();
        if (dbOrErr instanceof Response) return dbOrErr;
        const database = dbOrErr;

        if (path === "/api/state" && method === "GET") {
            const activeSession = getOrCreateActiveSession(database);
            return jsonResponse({
                activeSession: {
                    id: activeSession.id,
                    name: activeSession.name,
                    nameSource: activeSession.name_source,
                },
                ui: { maxMessageLength: 2000 },
            });
        }

        if (path === "/api/profile" && method === "GET") {
            return jsonResponse(getUserProfile(database));
        }

        if (path === "/api/profile" && method === "PUT") {
            let parsed: unknown;
            try {
                parsed = await req.json();
                return jsonResponse(saveUserProfile(database, parsed));
            } catch (err) {
                return jsonResponse(
                    { error: String(err instanceof Error ? err.message : err) },
                    400,
                );
            }
        }

        if (path === "/api/profile" && method === "DELETE") {
            return jsonResponse(deleteUserProfile(database));
        }

        if (path === "/api/chat" && method === "POST") {
            const apiKey = process.env.MINIMAX_API_KEY;
            if (!apiKey) {
                return jsonResponse(
                    {
                        error: "Server is missing the API key. Ask whoever set this up to add MINIMAX_API_KEY to the environment.",
                    },
                    503,
                );
            }
            return handleChat(req, apiKey, resolveSessionId(req, database));
        }

        if (path === "/api/steer" && method === "POST") {
            let parsed: unknown;
            try {
                parsed = await req.json();
            } catch {
                return jsonResponse({ error: "Invalid JSON in request body" }, 400);
            }
            if (
                !parsed ||
                typeof parsed !== "object" ||
                !("message" in parsed) ||
                typeof (parsed as { message: unknown }).message !== "string"
            ) {
                return jsonResponse({ error: "Missing required field: message" }, 400);
            }
            const queue = getOrCreateSteerQueue(resolveSessionId(req, database));
            queueSteer(queue, (parsed as { message: string }).message);
            return jsonResponse({ ok: true });
        }

        if (path === "/api/history" && method === "GET") {
            const messages = getMessages(database, resolveSessionId(req, database));
            return jsonResponse({ messages });
        }

        if (path === "/api/usage" && method === "GET") {
            const usage = getUsageToday(database);
            return jsonResponse({ usage, limits: QUOTAS });
        }

        return jsonResponse({ error: "Not found" }, 404);
    }

    // ── Non-API routes ───────────────────────────────────────────────

    // GET /assets — list assets for explicit or active session
    if (path === "/assets" && method === "GET") {
        const dbOrErr = requireDb();
        if (dbOrErr instanceof Response) return dbOrErr;
        const assets = getAssets(dbOrErr, resolveSessionId(req, dbOrErr));
        return jsonResponse({ assets });
    }

    // GET /asset/:id — serve a specific asset file for explicit or active session
    if (path.startsWith("/asset/") && method === "GET") {
        const dbOrErr = requireDb();
        if (dbOrErr instanceof Response) return dbOrErr;
        const database = dbOrErr;

        const sessionId = resolveSessionId(req, database);

        const assetId = path.slice("/asset/".length);
        const asset = getAsset(database, assetId);
        if (!asset || asset.session_id !== sessionId)
            return jsonResponse({ error: "Not found" }, 404);
        const filePath = `data/assets/${asset.session_id}/${asset.filename}`;
        try {
            const file = await readFile(filePath);
            return new Response(file, {
                headers: {
                    "Content-Type": asset.mime_type,
                    "Cache-Control": "public, max-age=31536000",
                },
            });
        } catch {
            return jsonResponse({ error: "File not found" }, 404);
        }
    }

    // Static files
    if ((method === "GET" || method === "HEAD") && path === "/") {
        const resp = await serveStaticFile("/index.html");
        if (resp) return method === "HEAD" ? headResponse(resp) : resp;
    }

    if (method === "GET" || method === "HEAD") {
        const resp = await serveStaticFile(path);
        if (resp) return method === "HEAD" ? headResponse(resp) : resp;
    }

    // 404
    return jsonResponse({ error: "Not found" }, 404);
}

// ── Node.js HTTP adapter ──────────────────────────────────────────
// Bridges Node's (IncomingMessage, ServerResponse) to the
// web-standard (Request, Response) used by handleRequest.

function hasPathTraversal(rawUrl: string): boolean {
    const rawPath = rawUrl.split("?")[0] ?? "/";
    try {
        return decodeURIComponent(rawPath).split("/").includes("..");
    } catch {
        return rawPath.includes("..") || /%2e/i.test(rawPath);
    }
}

export async function handleNodeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reqId = nextReqId();
    const reqLog = log.child({ reqId, method: req.method, path: req.url });
    reqLog.debug("request received");
    try {
        if (hasPathTraversal(req.url ?? "/")) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Not found" }));
            reqLog.info("response sent", { status: res.statusCode });
            return;
        }

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const readable = Readable.fromWeb(webRes.body as any);

            // Propagate stream errors to the error handler below
            readable.on("error", (err: Error) => {
                reqLog.error("response stream error", { error: String(err) });
                if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: "Upstream error" }));
                }
            });

            // Handle client disconnect — clean up resources
            res.on("close", () => readable.destroy());

            // pipe() calls res.end() automatically when readable closes cleanly
            readable.pipe(res);
        } else {
            res.end();
        }
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
let db: Database | null = null;

/**
 * Get the database instance (null if not initialized).
 */
export function getDb(): Database | null {
    return db;
}

/** Get db or return 500 immediately. For use inside request handler only. */
function requireDb(): Database | Response {
    const database = db;
    return database ?? jsonResponse({ error: "Database not initialized" }, 500);
}

/**
 * Initialize the database: create data directory and run migrations.
 */
export function initDatabase(dbPath = "data/hallucygenie.db"): Database {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    db = initDb(dbPath);
    return db;
}

function extensionForMime(mime: string): string {
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
    return mime.split("/")[1]?.replace(/jpeg/, "jpg") ?? "bin";
}

function stringParam(args: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = args?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberParam(args: Record<string, unknown> | undefined, key: string): number | undefined {
    const value = args?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assetParamsJson(
    toolName: string,
    prompt: string | null,
    args?: Record<string, unknown>,
): string | null {
    if (toolName === "generate_image") {
        return JSON.stringify({
            model: "image-01",
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            aspect_ratio: stringParam(args, "aspect_ratio") ?? null,
        });
    }
    if (toolName === "text_to_speech") {
        return JSON.stringify({
            model: "speech-2.8-hd",
            text: prompt ?? stringParam(args, "text") ?? null,
            voice_id: stringParam(args, "voice_id") ?? null,
            speed: numberParam(args, "speed") ?? null,
            volume: numberParam(args, "volume") ?? null,
            pitch: numberParam(args, "pitch") ?? null,
        });
    }
    if (toolName === "generate_music") {
        const lyrics = stringParam(args, "lyrics") ?? "";
        return JSON.stringify({
            model: "music-2.6",
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            lyrics_present: lyrics.length > 0,
            lyrics_excerpt: lyrics ? lyrics.slice(0, 200) : null,
            is_instrumental: lyrics.length === 0,
        });
    }
    if (toolName === "generate_lyrics") {
        return JSON.stringify({
            endpoint: "lyrics_generation",
            mode: stringParam(args, "mode") ?? null,
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            title: stringParam(args, "title") ?? null,
            lyrics_present: Boolean(stringParam(args, "lyrics")),
        });
    }
    return null;
}

function saveAssetBuffer(
    resultType: ToolResult["type"],
    buf: Buffer,
    mime: string,
    sessionId: string,
    toolName: string,
    prompt: string | null,
    args?: Record<string, unknown>,
): ToolResult {
    const assetId = `asset_${randomUUID()}`;
    const filename = `${assetId}.${extensionForMime(mime)}`;
    const dir = `data/assets/${sessionId}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${filename}`, buf);

    if (!db) throw new Error("Database not initialized");
    saveAsset(db, {
        id: assetId,
        session_id: sessionId,
        type: resultType === "image" ? "image" : toolName === "generate_music" ? "music" : "audio",
        filename,
        mime_type: mime,
        prompt,
        tool_name: toolName,
        size_bytes: buf.byteLength,
        params_json: assetParamsJson(toolName, prompt, args),
    });

    return { type: resultType, content: `/asset/${assetId}` };
}

async function downloadImageAsset(url: string): Promise<{ buf: Buffer; mime: string }> {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("image asset URL must be http(s)");
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`image download failed: ${resp.status}`);

    const mime = resp.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!mime.startsWith("image/")) throw new Error(`image download returned ${mime || "unknown"}`);

    return { buf: Buffer.from(await resp.arrayBuffer()), mime };
}

/**
 * Save generated media to disk and record in SQLite.
 * Returns a local /asset URL for browser rendering.
 */
async function saveAssetFile(
    result: ToolResult,
    sessionId: string,
    toolName: string,
    prompt: string | null,
    args?: Record<string, unknown>,
): Promise<ToolResult> {
    try {
        if (result.type === "image" && /^https?:\/\//i.test(result.content)) {
            const downloaded = await downloadImageAsset(result.content);
            return saveAssetBuffer(
                "image",
                downloaded.buf,
                downloaded.mime,
                sessionId,
                toolName,
                prompt,
                args,
            );
        }

        const match = result.content.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return result;

        const mime = match[1]!;
        const buf = Buffer.from(match[2]!, "base64");
        return saveAssetBuffer(result.type, buf, mime, sessionId, toolName, prompt, args);
    } catch (err) {
        log.warn("asset save failed", { toolName, error: String(err) });
        return { type: "error", content: `Couldn't save generated ${result.type}. Try again.` };
    }
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
        try {
            db.close();
        } catch {
            /* ignore */
        }
        db = null;
    }
    if (server) {
        try {
            server.close();
        } catch {
            /* ignore */
        }
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
if (typeof process !== "undefined" && process.argv[1]?.endsWith("server.ts")) {
    initDatabase();
    startServer();
    setupSignalHandlers();
}
