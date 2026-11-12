// Helper to derive draft kind from path
const draftKind = (path: string): "chat" | "create" | null =>
    path === "/api/draft/chat" ? "chat" : path === "/api/draft/create" ? "create" : null;

interface ModelRemain {
    model_name: string;
    current_interval_usage_count: number;
    current_interval_total_count: number;
    current_interval_remaining_percent?: number;
    remains_time: number;
    current_weekly_usage_count?: number;
    current_weekly_total_count?: number;
    current_weekly_remaining_percent?: number;
    weekly_remains_time?: number;
}

const quotaEntry = (m: ModelRemain | null, period: "interval" | "weekly" = "interval") => {
    if (!m) return null;
    const total = m[`current_${period}_total_count`];
    const remainingPercent = m[`current_${period}_remaining_percent`];
    if (period === "weekly" && total === undefined && remainingPercent === undefined) return null;
    return {
        used: m[`current_${period}_usage_count`] ?? 0,
        total: total ?? 0,
        remainingPercent,
        resetsInMs: period === "weekly" ? m.weekly_remains_time : m.remains_time
    };
};

// HallucyGenie — HTTP server with SSE chat proxy
// Target: Node.js runtime

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import {
    archiveSession,
    type AssetRow,
    autoNameSession,
    consumeQuota,
    createSession,
    deleteDraft,
    deleteUserProfile,
    getAsset,
    getAssets,
    getDraft,
    getMessages,
    getOrCreateActiveSession,
    getOrCreateActiveSessionId,
    getPreferences,
    getSession,
    getUsageToday,
    getUserProfile,
    hideToolInputHistory,
    initDb,
    listAsyncTtsTasks,
    listSessions,
    listToolInputHistory,
    QUOTAS,
    recordToolInputHistory,
    releaseQuota,
    renameSession,
    saveAsset,
    saveAsyncTtsTask,
    saveDraft,
    saveMessage,
    saveUserProfile,
    saveVideoTask,
    setActiveSessionId,
    updateAsyncTtsTask,
    updateVideoTask
} from "./db.ts";

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { createLogger, nextReqId } from "./log.ts";

const log = createLogger({ service: "hallucygenie" });

function longTextSummary(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return `${compact.slice(0, 180)}${compact.length > 180 ? "…" : ""} (${text.length} chars)`;
}

import type { DatabaseSync as Database } from "node:sqlite";
import {
    type AgentEvent,
    buildContext,
    buildSystemPrompt,
    createSteerQueue,
    drainSteer,
    estimateTokens,
    executeToolSafely,
    MINIMAX_MODEL,
    queueSteer,
    runAgentLoop,
    safeToolResultForUser,
    type SteerQueue
} from "./agent.ts";
import { CONVERSATION_TOOLS, projectConversation, readConversation } from "./conversation.ts";
import { assertNoRawAssetDataInMessage } from "./db.ts";
import {
    clearMcpCredential,
    closeMcpConnections,
    getMcpStatus,
    getMcpToolDefinitions,
    setMcpCredential
} from "./mcp.ts";
import { inspectMediaFile } from "./media.ts";
import { MINIMAX_BASE, MUSIC_DISABLED_MESSAGE, type ToolResult, VIDEO_MODEL } from "./tools.ts";

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
    thinking?: string;
    thinking_signature?: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; name: string; input: Record<string, unknown>; }>;
}

export interface ChatRequestBody {
    messages: ChatMessage[];
    system_prompt?: string;
}

export type DirectToolName =
    | "generate_image"
    | "generate_music"
    | "generate_music_cover"
    | "generate_video"
    | "text_to_speech"
    | "generate_long_speech"
    | "generate_lyrics"
    | "analyze_image"
    | "web_search";

export interface DirectToolExecution {
    name: DirectToolName;
    args: Record<string, unknown>;
    prompt: string | null;
}

export interface ExplicitToolDirective extends DirectToolExecution {
    name:
        | "generate_image"
        | "generate_music"
        | "generate_video"
        | "text_to_speech"
        | "generate_long_speech"
        | "generate_lyrics"
        | "analyze_image";
}

export interface AssetApiRow extends Omit<AssetRow, "params_json"> {
    params: Record<string, unknown>;
    url: string;
    download_url: string;
}

// ── Configuration ────────────────────────────────────────────────────

export const PORT = Number(process.env.PORT) || 3000;

// ── CORS helpers ─────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};

// ── JSON response helpers ────────────────────────────────────────────

function jsonResponse(
    data: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {}
): Response {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
        ...extraHeaders
    };
    return new Response(JSON.stringify(data), { status, headers });
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...CORS_HEADERS
        }
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
    }
{
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
                error: `messages[${i}] must be an object`
            };
        }
        if (typeof msg.role !== "string") {
            return {
                ok: false,
                error: `messages[${i}].role must be a string`
            };
        }
        if (typeof msg.content !== "string") {
            return {
                ok: false,
                error: `messages[${i}].content must be a string`
            };
        }
    }

    if (obj.messages.length !== 1 || obj.messages[0].role !== "user") {
        return { ok: false, error: "Exactly one user message is required." };
    }
    try {
        assertNoRawAssetDataInMessage(obj.messages[0].content);
    } catch {
        return { ok: false, error: "Raw media is not allowed in chat." };
    }
    return {
        ok: true,
        body: obj as unknown as ChatRequestBody
    };
}

// ── Static file serving ──────────────────────────────────────────────

import { readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";

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
    ".ttf": "font/ttf"
};

function headResponse(resp: Response): Response {
    return new Response(null, { status: resp.status, headers: resp.headers });
}

async function serveStaticFile(path: string): Promise<Response | null> {
    // Security: prevent path traversal
    const publicDir = resolve("public");
    const filePath = resolve(join("public", path));

    // Ensure the resolved path is still under public/
    if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) return null;
    if (filePath.includes("..")) return null;

    try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) return null;

        const data = await readFile(filePath);
        const ext = filePath.substring(filePath.lastIndexOf("."));
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const headers: Record<string, string> = {
            "Content-Type": contentType,
            "Content-Length": String(data.byteLength)
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

function contentForPersistence(msg: ChatMessage, savedTool: ToolResult | null): string {
    if (savedTool) {
        if (savedTool.type === "error") return `Error: ${savedTool.content}`;
        if (savedTool.type === "image" && savedTool.urls?.length) return savedTool.urls.join("\n");
        return savedTool.content;
    }
    return msg.content;
}

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
        sessionId ? getPreferences(database) : undefined,
        getUserProfile(database)
    );

    const messages: ChatMessage[] = [];
    messages.push({ role: "system", content: systemPrompt });

    // Load existing history from DB for this session
    if (sessionId) {
        messages.push(...projectConversation(getMessages(database, sessionId)));
    }

    // Append new user messages
    for (const msg of validation.body.messages) {
        messages.push({ role: msg.role, content: msg.content });
    }

    const lastUserMsg = validation.body.messages[validation.body.messages.length - 1];

    const explicitTool = parseExplicitToolDirective(lastUserMsg.content);
    if (explicitTool) {
        if (sessionId) {
            const userCount = countSessionUserMessages(database, sessionId);
            saveMessage(database, sessionId, "user", lastUserMsg.content);
            if (userCount === 0) {
                void autoNameDefaultSession(
                    database,
                    sessionId,
                    explicitTool.prompt ?? explicitTool.name,
                    apiKey
                );
            }
        }
        return handleExplicitToolDirective(explicitTool, apiKey, database, sessionId);
    }

    // Save user message to DB
    if (sessionId) {
        const userCount = countSessionUserMessages(database, sessionId);
        saveMessage(database, sessionId, "user", lastUserMsg.content);
        if (userCount === 0) {
            void autoNameDefaultSession(database, sessionId, lastUserMsg.content, apiKey);
        }
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
    // Previously accepted steering is already in the loaded committed history.
    if (steerQueue) drainSteer(steerQueue);

    // Set up SSE stream
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const savedToolResults = new Map<string, ToolResult>();
    const consumedQuotaByToolId = new Map<string, { feature: string; amount: number; }>();
    let assistantTurnStarts = 0;

    // Run agent loop in background, streaming events to SSE
    const mcpTools = await getMcpToolDefinitions(database);
    (async () => {
        try {
            await runAgentLoop(
                contextMessages,
                apiKey,
                async (event: AgentEvent) => {
                    // Convert agent events to SSE for the browser
                    switch (event.type) {
                        case "thinking_reset": {
                            if (assistantTurnStarts > 0) {
                                await writer.write(
                                    encoder.encode("event: assistant_turn_start\ndata: {}\n\n")
                                );
                            }
                            assistantTurnStarts++;
                            break;
                        }
                        case "thinking": {
                            const sseData = `event: thinking\ndata: ${
                                JSON.stringify({
                                    content: event.content
                                })
                            }\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "text": {
                            const sseData = `data: ${
                                JSON.stringify({
                                    choices: [
                                        {
                                            delta: { content: event.content },
                                            finish_reason: null
                                        }
                                    ]
                                })
                            }\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "tool_start": {
                            const sseData = `event: tool_start\ndata: ${
                                JSON.stringify({
                                    id: event.id,
                                    name: event.name,
                                    input: event.args
                                })
                            }\n\n`;
                            await writer.write(encoder.encode(sseData));
                            break;
                        }
                        case "tool_result": {
                            const sseData = `event: tool_result\ndata: ${
                                JSON.stringify({
                                    id: event.id,
                                    name: event.name,
                                    result: publicToolResult(event.result!),
                                    input: event.args
                                })
                            }\n\n`;
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
                sessionId
                    ? async (toolName: string, _args: Record<string, unknown>, toolId?: string) => {
                        if (toolName === "read_conversation") {
                            return readConversation(database, sessionId, _args);
                        }
                        if (toolName === "inspect_asset") {
                            const { asset_id: assetId, question } = _args;
                            if (
                                typeof assetId !== "string" || !/^asset_[0-9a-f-]+$/i.test(assetId)
                                || typeof question !== "string" || !question.trim()
                            ) {
                                return {
                                    type: "error" as const,
                                    content: "Invalid asset inspection input."
                                };
                            }
                            const asset = getAsset(database, assetId);
                            if (
                                !asset || asset.session_id !== sessionId
                                || basename(asset.filename) !== asset.filename
                            ) {
                                return {
                                    type: "error" as const,
                                    content: "Invalid asset for this session."
                                };
                            }
                            return inspectMediaFile(
                                resolve("data/assets", asset.session_id, asset.filename),
                                asset.mime_type,
                                question,
                                apiKey
                            );
                        }
                        const feature = featureForTool(toolName);
                        if (feature) {
                            const amount = quotaAmountForTool(toolName, _args);
                            if (consumeQuota(database, feature, amount) === null) {
                                return {
                                    type: "error" as const,
                                    content: `Daily ${feature} quota is used up.`
                                };
                            }
                            if (toolId) consumedQuotaByToolId.set(toolId, { feature, amount });
                        }
                        try {
                            const args = await explicitExecutionArgs(
                                { name: toolName, args: _args },
                                database,
                                sessionId
                            );
                            return safeToolResultForUser(
                                toolName,
                                await executeToolSafely(toolName, args, apiKey)
                            );
                        } catch {
                            return {
                                type: "error" as const,
                                content: "Invalid session asset reference."
                            };
                        }
                    }
                    : undefined,
                {
                    tools: sessionId ? [...CONVERSATION_TOOLS, ...mcpTools] : mcpTools,
                    onMessage: sessionId
                        ? (msg) => {
                            if (msg.role === "user") return; // Steering is durable before acknowledgement.
                            const savedTool = msg.tool_call_id
                                ? savedToolResults.get(msg.tool_call_id) ?? null
                                : null;
                            saveMessage(
                                database,
                                sessionId,
                                msg.role,
                                contentForPersistence(msg, savedTool),
                                msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
                                msg.tool_call_id ?? null,
                                msg.thinking ?? null
                            );
                        }
                        : undefined,
                    onToolResult: async (event) => {
                        if (!event.result) throw new Error("tool_result event missing result");
                        // Save image/audio assets to disk
                        const saved = sessionId
                            ? await saveAssetFile(
                                event.result,
                                sessionId,
                                event.name ?? "",
                                event.prompt ?? null,
                                event.args
                            )
                            : event.result;
                        if (event.id) {
                            savedToolResults.set(event.id, saved);
                            const consumed = consumedQuotaByToolId.get(event.id);
                            if (consumed && saved.type === "error") {
                                releaseQuota(database, consumed.feature, consumed.amount);
                                consumedQuotaByToolId.delete(event.id);
                            }
                        }
                        if (
                            sessionId
                            && getSession(database, sessionId)
                            && event.name
                            && event.args
                        ) {
                            try {
                                recordToolInputHistory(database, {
                                    session_id: sessionId,
                                    origin: "agent",
                                    tool_name: event.name,
                                    input: event.args,
                                    status: saved.type === "error" ? "failed" : "succeeded",
                                    asset_id: assetIdFromToolResult(saved),
                                    provider: event.result.provider
                                });
                            } catch (err) {
                                log.warn("tool history save failed", { error: String(err) });
                            }
                        }
                        return saved;
                    }
                }
            );
        } catch (err) {
            log.warn("chat interrupted", { error: err instanceof Error ? err.name : "unknown" });
            const error = "Chat interrupted. Please try again.";
            if (sessionId) saveMessage(database, sessionId, "assistant", `[Error: ${error}]`);
            try {
                await writer.write(
                    encoder.encode(`event: error\ndata: ${JSON.stringify({ error })}\n\n`)
                );
            } catch { /* Client disconnected; committed records remain available. */ }
        } finally {
            if (steerQueue) drainSteer(steerQueue);
            try {
                await writer.close();
            } catch { /* Client disconnected. */ }
        }
    })();

    return sseResponse(readable);
}

// ── Explicit Create tool directives ─────────────────────────────────

export function sanitizeAssistantMediaMarkup(content: string): string {
    const cleaned = content
        .replace(/!\[[^\]\n]*\]\([^)\n]+\)/g, "")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<audio\b[\s\S]*?<\/audio>/gi, "")
        .replace(/<video\b[\s\S]*?<\/video>/gi, "")
        .replace(/https?:\/\/\S*(?:hailuo-image|image_inference_output|aliyuncs)\S*/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (/^here(?:'s| is) your (?:image|music|audio)[:!.\s]*$/i.test(cleaned)) {
        return "Generated media is shown in the tool card.";
    }
    return cleaned;
}

function parseToolParams(raw: string | undefined, allowed: Set<string>): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (!raw) return params;

    for (const part of raw.split(/[\n,]+/)) {
        const match = part.trim().match(/^([a-z_]+)\s*=\s*(.+)$/i);
        if (!match) continue;
        const key = match[1];
        if (!key || !allowed.has(key)) continue;

        const value = match[2]?.trim().replace(/^['"]|['"]$/g, "");
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
        /^Use\s+(generate_image|generate_music|generate_video|text_to_speech|generate_long_speech|generate_lyrics|analyze_image)\s+with\s+(prompt|text|image_url|lyrics):\s*([\s\S]*?)(?:\nTool params:\s*([\s\S]*))?$/i
    );
    if (!match) return null;

    const name = match[1]?.toLowerCase() as ExplicitToolDirective["name"];
    const field = match[2]?.toLowerCase();
    const value = match[3]?.trim();
    if (!value) return null;

    const allowedParams: Record<ExplicitToolDirective["name"], Set<string>> = {
        generate_image: new Set([
            "aspect_ratio",
            "n",
            "seed",
            "width",
            "height",
            "prompt_optimizer"
        ]),
        generate_music: new Set(["lyrics"]),
        generate_video: new Set(["duration", "resolution"]),
        text_to_speech: new Set(["voice_id", "speed", "volume", "pitch"]),
        generate_long_speech: new Set(["voice_id", "speed", "volume", "pitch"]),
        generate_lyrics: new Set(["mode", "lyrics", "title"]),
        analyze_image: new Set(["prompt"])
    };
    const args = parseToolParams(match[4], allowedParams[name]);

    if (name === "text_to_speech" || name === "generate_long_speech") {
        args.text = value;
        return {
            name,
            args,
            prompt: name === "generate_long_speech" ? longTextSummary(value) : value
        };
    }

    if (name === "analyze_image") {
        if (field !== "image_url") return null;
        args.image_url = value;
        return { name, args, prompt: typeof args.prompt === "string" ? args.prompt : value };
    }

    if (name === "generate_lyrics") {
        if (field !== "prompt" && field !== "lyrics") return null;
        args.prompt = value;
        return { name, args, prompt: value };
    }

    if (field !== "prompt") return null;
    args.prompt = value;
    return { name, args, prompt: value };
}

function featureForTool(name: string): "image" | "speech" | "music" | "lyrics" | null {
    if (name === "generate_image") return "image";
    if (name === "text_to_speech" || name === "generate_long_speech") return "speech";
    if (name === "generate_music" || name === "generate_music_cover") return "music";
    if (name === "generate_lyrics") return "lyrics";
    return null;
}

function quotaAmountForTool(name: string, args: Record<string, unknown>): number {
    if (name === "generate_image") {
        const n = Number(args.n ?? 1);
        if (!Number.isFinite(n)) return 1;
        return Math.max(1, Math.min(9, Math.floor(n)));
    }
    if (name !== "text_to_speech" && name !== "generate_long_speech") return 1;
    const text = args.text;
    if (typeof text !== "string") return 1;
    return Math.max(1, Array.from(text).length);
}

function analyzeDataMime(mime: string): "jpeg" | "png" | "webp" | "gif" {
    if (mime === "image/jpeg") return "jpeg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    throw new Error("analyze image type invalid");
}

async function localAnalyzeAssetDataUrl(
    database: Database,
    sessionId: string,
    imageUrl: string
): Promise<string> {
    const match = imageUrl.match(/^\/asset\/(asset_[0-9a-f-]+)$/i);
    if (!match) return imageUrl;
    const assetId = match[1];
    if (!assetId) return imageUrl;
    const asset = getAsset(database, assetId);
    if (!asset || asset.session_id !== sessionId) throw new Error("analyze image asset not found");
    if (!isAllowedImageMime(asset.mime_type, ANALYZE_IMAGE_MIMES)) {
        throw new Error("analyze image type invalid");
    }
    if (asset.size_bytes > 20 * 1024 * 1024) throw new Error("analyze image too large");
    const file = await readFile(`data/assets/${asset.session_id}/${asset.filename}`);
    if (file.byteLength > 20 * 1024 * 1024) throw new Error("analyze image too large");
    return `data:image/${analyzeDataMime(asset.mime_type)};base64,${
        Buffer.from(file).toString("base64")
    }`;
}

async function localReferenceAssetDataUrl(
    database: Database,
    sessionId: string,
    assetId: string
): Promise<string> {
    if (!/^asset_[0-9a-f-]+$/i.test(assetId)) throw new Error("reference image asset invalid");
    const asset = getAsset(database, assetId);
    if (!asset || asset.session_id !== sessionId) {
        throw new Error("reference image asset not found");
    }
    if (!isAllowedImageMime(asset.mime_type, REFERENCE_IMAGE_MIMES)) {
        throw new Error("reference image must be PNG or JPG");
    }
    if (asset.size_bytes > 20 * 1024 * 1024) throw new Error("reference image too large");
    const file = await readFile(`data/assets/${asset.session_id}/${asset.filename}`);
    if (file.byteLength > 20 * 1024 * 1024) throw new Error("reference image too large");
    return `data:${asset.mime_type};base64,${Buffer.from(file).toString("base64")}`;
}

async function explicitExecutionArgs(
    directive: { name: string; args: Record<string, unknown>; },
    database: Database,
    sessionId?: string
): Promise<Record<string, unknown>> {
    const { allow_data_url: _untrustedFlag, ...publicArgs } = directive.args;
    directive = { ...directive, args: publicArgs };
    if (directive.name === "generate_image") {
        const referenceAssetId = directive.args.reference_asset_id;
        if (typeof referenceAssetId !== "string") return directive.args;
        if (!sessionId) throw new Error("reference image asset requires a session");
        const { reference_asset_id: _referenceAssetId, ...args } = directive.args;
        return {
            ...args,
            subject_reference: [
                {
                    type: "character",
                    image_file: await localReferenceAssetDataUrl(
                        database,
                        sessionId,
                        referenceAssetId
                    )
                }
            ]
        };
    }
    if (directive.name !== "analyze_image") return directive.args;
    const imageUrl = directive.args.image_url;
    if (typeof imageUrl !== "string" || !imageUrl.startsWith("/asset/")) return directive.args;
    if (!sessionId) throw new Error("analyze image asset requires a session");
    return {
        ...directive.args,
        image_url: await localAnalyzeAssetDataUrl(database, sessionId, imageUrl),
        allow_data_url: true
    };
}

function parseStringField(
    input: Record<string, unknown>,
    key: string,
    max: number
): string | null {
    const value = input[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Array.from(trimmed).slice(0, max).join("");
}

function optionalStringField(
    input: Record<string, unknown>,
    key: string,
    max: number
): string | undefined {
    const value = input[key];
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return Array.from(trimmed).slice(0, max).join("");
}

function optionalNumberField(
    input: Record<string, unknown>,
    key: string,
    min: number,
    max: number
): number | undefined {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

function optionalIntegerField(
    input: Record<string, unknown>,
    key: string,
    min: number,
    max: number
): number | undefined {
    const value = input[key];
    if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
    return Math.min(max, Math.max(min, value));
}

function optionalBooleanField(input: Record<string, unknown>, key: string): boolean | undefined {
    return typeof input[key] === "boolean" ? input[key] : undefined;
}

function normalizeCreateToolExecution(body: unknown): DirectToolExecution | string {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "body must be an object";
    const obj = body as Record<string, unknown>;
    const name = obj.tool_name;
    const input = obj.input;
    if (typeof name !== "string") return "tool_name required";
    if (!input || typeof input !== "object" || Array.isArray(input)) return "input required";
    const fields = input as Record<string, unknown>;

    if (name === "generate_image") {
        const prompt = parseStringField(fields, "prompt", 1500);
        if (!prompt) return "prompt required";
        const args: Record<string, unknown> = { prompt };
        const aspectRatio = fields.aspect_ratio;
        if (typeof aspectRatio === "string") args.aspect_ratio = aspectRatio;
        const n = optionalIntegerField(fields, "n", 1, 9);
        if (n !== undefined) args.n = n;
        const seed = optionalIntegerField(fields, "seed", 0, Number.MAX_SAFE_INTEGER);
        if (seed !== undefined) args.seed = seed;
        const width = optionalIntegerField(fields, "width", 512, 2048);
        const height = optionalIntegerField(fields, "height", 512, 2048);
        if (width !== undefined) args.width = width;
        if (height !== undefined) args.height = height;
        const promptOptimizer = optionalBooleanField(fields, "prompt_optimizer");
        if (promptOptimizer !== undefined) args.prompt_optimizer = promptOptimizer;
        const referenceAssetId = optionalStringField(fields, "reference_asset_id", 80);
        if (referenceAssetId !== undefined) args.reference_asset_id = referenceAssetId;
        return { name, args, prompt };
    }

    if (name === "generate_music") {
        const prompt = parseStringField(fields, "prompt", 2000);
        if (!prompt) return "prompt required";
        const args: Record<string, unknown> = { prompt };
        const lyrics = optionalStringField(fields, "lyrics", 3500);
        if (lyrics !== undefined) args.lyrics = lyrics;
        return { name, args, prompt };
    }

    if (name === "generate_video") {
        const prompt = parseStringField(fields, "prompt", 2000);
        if (!prompt) return "prompt required";
        const args: Record<string, unknown> = { prompt };
        const duration = optionalIntegerField(fields, "duration", 4, 10);
        if (duration === 4 || duration === 6 || duration === 10) args.duration = duration;
        const resolution = optionalStringField(fields, "resolution", 20);
        if (resolution === "768p" || resolution === "2k") args.resolution = resolution;
        return { name, args, prompt };
    }

    if (name === "generate_music_cover") {
        const prompt = parseStringField(fields, "prompt", 2000);
        const lyrics = parseStringField(fields, "lyrics", 3500);
        const coverFeatureId = parseStringField(fields, "cover_feature_id", 200);
        if (!prompt) return "prompt required";
        if (!lyrics) return "lyrics required";
        if (!coverFeatureId) return "cover_feature_id required";
        return { name, args: { prompt, lyrics, cover_feature_id: coverFeatureId }, prompt };
    }

    if (name === "text_to_speech") {
        const text = parseStringField(fields, "text", 10000);
        if (!text) return "text required";
        const args: Record<string, unknown> = { text };
        const voiceId = optionalStringField(fields, "voice_id", 120);
        if (voiceId !== undefined) args.voice_id = voiceId;
        const speed = optionalNumberField(fields, "speed", 0.5, 2);
        if (speed !== undefined) args.speed = speed;
        const volume = optionalNumberField(fields, "volume", 0.01, 10);
        if (volume !== undefined) args.volume = volume;
        const pitch = optionalNumberField(fields, "pitch", -12, 12);
        if (pitch !== undefined) args.pitch = pitch;
        return { name, args, prompt: text };
    }

    if (name === "generate_long_speech") {
        const text = parseStringField(fields, "text", 50000);
        if (!text) return "text required";
        const args: Record<string, unknown> = { text };
        const voiceId = optionalStringField(fields, "voice_id", 120);
        if (voiceId !== undefined) args.voice_id = voiceId;
        const speed = optionalNumberField(fields, "speed", 0.5, 2);
        if (speed !== undefined) args.speed = speed;
        const volume = optionalNumberField(fields, "volume", 0.01, 10);
        if (volume !== undefined) args.volume = volume;
        const pitch = optionalNumberField(fields, "pitch", -12, 12);
        if (pitch !== undefined) args.pitch = pitch;
        return { name, args, prompt: longTextSummary(text) };
    }

    if (name === "generate_lyrics") {
        const prompt = parseStringField(fields, "prompt", 2000);
        if (!prompt) return "prompt required";
        const args: Record<string, unknown> = { prompt };
        const mode = fields.mode;
        if (mode === "write_full_song" || mode === "edit") args.mode = mode;
        const lyrics = optionalStringField(fields, "lyrics", 3500);
        if (lyrics !== undefined) args.lyrics = lyrics;
        const title = optionalStringField(fields, "title", 200);
        if (title !== undefined) args.title = title;
        return { name, args, prompt };
    }

    if (name === "analyze_image") {
        const imageUrl = parseStringField(fields, "image_url", 2048);
        if (!imageUrl) return "image_url required";
        const prompt = optionalStringField(fields, "prompt", 1000) ?? "What do you see?";
        return { name, args: { image_url: imageUrl, prompt }, prompt };
    }

    if (name === "web_search") {
        const query = parseStringField(fields, "query", 300);
        if (!query) return "query required";
        return { name, args: { query }, prompt: query };
    }

    return "unsupported tool_name";
}

function handleDirectToolExecution(
    directive: DirectToolExecution,
    apiKey: string,
    database: Database,
    sessionId: string | undefined,
    origin: "chat" | "create",
    clearCreateDraftOnSuccess: boolean
): Response {
    if (directive.name === "generate_music" || directive.name === "generate_music_cover") {
        return jsonResponse({ error: MUSIC_DISABLED_MESSAGE }, 503);
    }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const toolCallId = `direct_${randomUUID()}`;
    let resultCommitted = false;
    let reservation: { feature: string; amount: number; } | null = null;

    const writeSse = async (event: string | null, data: unknown) => {
        const prefix = event ? `event: ${event}\n` : "";
        await writer.write(encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`));
    };

    (async () => {
        try {
            const publicInput = directive.args;
            if (sessionId) {
                saveMessage(
                    database,
                    sessionId,
                    "assistant",
                    "",
                    JSON.stringify([{
                        id: toolCallId,
                        name: directive.name,
                        input: publicInput
                    }]),
                    null
                );
            }
            await writeSse("tool_start", {
                id: toolCallId,
                name: directive.name,
                input: publicInput
            });

            const feature = featureForTool(directive.name);
            const quotaAmount = quotaAmountForTool(directive.name, directive.args);
            const quotaBlocked = feature
                ? consumeQuota(database, feature, quotaAmount) === null
                : false;
            if (feature && !quotaBlocked) reservation = { feature, amount: quotaAmount };
            const executionArgs = quotaBlocked
                ? directive.args
                : await explicitExecutionArgs(directive, database, sessionId);
            const videoTaskId = sessionId && directive.name === "generate_video"
                ? `video_${randomUUID()}`
                : null;
            const asyncTtsTaskId = sessionId && directive.name === "generate_long_speech"
                ? `tts_${randomUUID()}`
                : null;
            if (videoTaskId && sessionId) {
                const now = Date.now();
                saveVideoTask(database, {
                    id: videoTaskId,
                    session_id: sessionId,
                    provider_task_id: toolCallId,
                    status: quotaBlocked ? "failed" : "running",
                    prompt: directive.prompt ?? "",
                    file_id: null,
                    asset_id: null,
                    error: quotaBlocked ? `Daily ${feature} quota is used up.` : null,
                    created_at: now,
                    updated_at: now
                });
            }
            if (asyncTtsTaskId && sessionId) {
                const now = Date.now();
                saveAsyncTtsTask(database, {
                    id: asyncTtsTaskId,
                    session_id: sessionId,
                    provider_task_id: toolCallId,
                    status: quotaBlocked ? "failed" : "running",
                    text_summary: longTextSummary(String(directive.args.text ?? "")),
                    voice_id: typeof directive.args.voice_id === "string"
                        ? directive.args.voice_id
                        : null,
                    file_id: null,
                    asset_id: null,
                    error: quotaBlocked ? `Daily ${feature} quota is used up.` : null,
                    created_at: now,
                    updated_at: now
                });
            }
            const rawResult = quotaBlocked
                ? { type: "error" as const, content: `Daily ${feature} quota is used up.` }
                : await executeToolSafely(directive.name, executionArgs, apiKey);
            const result = quotaBlocked
                ? rawResult
                : safeToolResultForUser(directive.name, rawResult);
            const saved = sessionId
                ? await saveAssetFile(
                    result,
                    sessionId,
                    directive.name,
                    directive.prompt,
                    directive.args
                )
                : result;
            if (videoTaskId) {
                updateVideoTask(
                    database,
                    videoTaskId,
                    saved.type === "error"
                        ? {
                            status: "failed",
                            error: saved.content,
                            ...providerTaskColumns(result.provider)
                        }
                        : {
                            status: "succeeded",
                            asset_id: assetIdFromToolResult(saved),
                            ...providerTaskColumns(result.provider)
                        }
                );
            }
            if (asyncTtsTaskId) {
                updateAsyncTtsTask(
                    database,
                    asyncTtsTaskId,
                    saved.type === "error"
                        ? {
                            status: "failed",
                            error: saved.content,
                            ...providerTaskColumns(result.provider)
                        }
                        : {
                            status: "succeeded",
                            asset_id: assetIdFromToolResult(saved),
                            ...providerTaskColumns(result.provider)
                        }
                );
            }
            if (feature && !quotaBlocked && saved.type === "error") {
                releaseQuota(database, feature, quotaAmount);
            }
            reservation = null;

            if (sessionId && getSession(database, sessionId)) {
                try {
                    recordToolInputHistory(database, {
                        session_id: sessionId,
                        origin,
                        tool_name: directive.name,
                        input: publicInput,
                        status: saved.type === "error" ? "failed" : "succeeded",
                        asset_id: assetIdFromToolResult(saved),
                        provider: result.provider
                    });
                } catch (err) {
                    log.warn("tool history save failed", { error: String(err) });
                }
            }

            if (sessionId) {
                saveMessage(
                    database,
                    sessionId,
                    "tool",
                    saved.type === "error"
                        ? `Error: ${saved.content}`
                        : saved.type === "image" && saved.urls?.length
                        ? saved.urls.join("\n")
                        : saved.content,
                    null,
                    toolCallId
                );
            }
            resultCommitted = true;
            await writeSse("tool_result", {
                id: toolCallId,
                name: directive.name,
                result: publicToolResult(saved),
                input: publicInput
            });
            if (sessionId && saved.type !== "error" && clearCreateDraftOnSuccess) {
                deleteDraft(database, sessionId, "create");
            }
            await writer.write(encoder.encode("data: [DONE]\n\n"));
        } catch (cause) {
            if (reservation) releaseQuota(database, reservation.feature, reservation.amount);
            const error = cause instanceof Error
                    && /^(?:reference image|analyze image) (?:asset (?:invalid|requires a session|not found)|type invalid|must be PNG or JPG|too large)$/
                        .test(cause.message)
                ? cause.message
                : "Invalid tool input or interrupted execution.";
            if (sessionId && !resultCommitted) {
                saveMessage(database, sessionId, "tool", `Error: ${error}`, null, toolCallId);
            }
            try {
                await writeSse("error", { error });
            } catch { /* Disconnected client. */ }
        } finally {
            try {
                await writer.close();
            } catch { /* Disconnected client. */ }
        }
    })();

    return sseResponse(readable);
}

function handleExplicitToolDirective(
    directive: ExplicitToolDirective,
    apiKey: string,
    database: Database,
    sessionId?: string
): Response {
    return handleDirectToolExecution(directive, apiKey, database, sessionId, "chat", true);
}

async function handleCreateTool(
    req: Request,
    apiKey: string,
    database: Database
): Promise<Response> {
    let parsed: unknown;
    try {
        parsed = await req.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON in request body" }, 400);
    }
    const normalized = normalizeCreateToolExecution(parsed);
    if (typeof normalized === "string") return jsonResponse({ error: normalized }, 400);
    if (normalized.name === "generate_music" || normalized.name === "generate_music_cover") {
        return jsonResponse({ error: MUSIC_DISABLED_MESSAGE }, 503);
    }
    const sessionId = resolveSessionId(req, database);
    if (countSessionUserMessages(database, sessionId) === 0) {
        void autoNameDefaultSession(
            database,
            sessionId,
            normalized.prompt ?? normalized.name,
            apiKey
        );
    }
    return handleDirectToolExecution(
        normalized,
        apiKey,
        database,
        sessionId,
        "create",
        normalized.name !== "generate_lyrics"
    );
}

// ── Session validation ──────────────────────────────────────────────

export function validateSessionId(req: Request): string | null {
    const trimmed = req.headers.get("X-Session-Id")?.trim() ?? "";
    return trimmed || null;
}

export function resolveSessionId(req: Request, database: Database): string {
    return validateSessionId(req) ?? getOrCreateActiveSessionId(database);
}

function resolveExistingSessionId(req: Request, database: Database): string {
    const sessionId = resolveSessionId(req, database);
    const session = getSession(database, sessionId);
    if (!session || session.archived_at) throw new Error("session not found");
    return sessionId;
}

// ── Health check ─────────────────────────────────────────────────────

const startTime = Date.now();

function handleHealth(): Response {
    return jsonResponse({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000)
    });
}

function countSessionUserMessages(database: Database, sessionId: string): number {
    const row = database
        .prepare("SELECT count(*) AS count FROM messages WHERE session_id = ? AND role = 'user'")
        .get(sessionId) as { count: number; };
    return row.count;
}

export async function generateSessionNameFromPrompt(
    apiKey: string,
    prompt: string
): Promise<string> {
    const systemPrompt =
        "You are a session namer. Given a user prompt, generate a short 2-5 word session name. "
        + "Return ONLY the name, nothing else. No quotes, no explanation. "
        + "Examples: 'Dragon Game Art', 'Minecraft Build Tips', 'YouTube Thumbnail Ideas'.";

    const payload = {
        model: MINIMAX_MODEL,
        max_tokens: 50,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ]
    };

    const resp = await fetch(`${MINIMAX_BASE}/anthropic/v1/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey
        },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        throw new Error(`LLM naming failed: ${resp.status}`);
    }

    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string; }>; };
    const textBlock = data.content?.find((b) => b.type === "text");
    if (!textBlock?.text) {
        throw new Error("LLM returned no text block");
    }

    return textBlock.text.trim().split(/\s+/).slice(0, 5).join(" ") || "New idea";
}

async function autoNameDefaultSession(
    database: Database,
    sessionId: string,
    prompt: string,
    apiKey: string
): Promise<void> {
    const session = getSession(database, sessionId);
    if (session?.name_source !== "default") return;
    try {
        const name = await generateSessionNameFromPrompt(apiKey, prompt);
        autoNameSession(database, sessionId, name);
    } catch (err) {
        log.warn("session auto-name failed", { sessionId, error: String(err) });
    }
}

function parseJsonObject(input: unknown, label: string): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error(`${label} must be an object`);
    }
    return input as Record<string, unknown>;
}

export function parseLimitOffset(url: URL): { limit: number; offset: number; } {
    const rawLimit = Number(url.searchParams.get("limit") ?? 20);
    const rawOffset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 0), 50);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);
    return { limit, offset };
}

function isAllowedImageMime(mime: string, allowedMimes: string[]): boolean {
    return allowedMimes.includes(mime);
}

const AVATAR_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ANALYZE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const REFERENCE_IMAGE_MIMES = ["image/png", "image/jpeg"];

function profileAvatarPrompt(profile: ReturnType<typeof getUserProfile>): string {
    const parts = [
        profile.username ? `username: ${profile.username}` : "kid gamer creator",
        profile.interests ? `topics: ${profile.interests}` : "gaming and YouTube",
        profile.favorites ? `style ingredients: ${profile.favorites}` : "fun bright mascot",
        profile.hates ? `avoid: ${profile.hates}` : ""
    ].filter(Boolean);
    return `Square friendly gaming avatar for a kid creator. ${
        parts.join(". ")
    }. Clean icon, expressive, safe for YouTube profile picture.`.slice(
        0,
        1500
    );
}

function saveProfileAvatar(
    database: Database,
    profileInput: unknown,
    assetId: string
): ReturnType<typeof getUserProfile> {
    const profile = saveUserProfile(database, {
        ...parseJsonObject(profileInput, "profile"),
        avatar: { type: "asset", value: assetId }
    });
    return profile;
}

interface ImageUploadOptions<T = unknown> {
    /** Form field holding the uploaded file. */
    field: string;
    allowedMimes: string[];
    maxBytes: number;
    toolName: string;
    prompt: string;
    missingFileError: string;
    invalidMimeError: string;
    tooLargeError: string;
    saveFailedError: string;
    /** Runs after validation and before the asset is stored. May throw. */
    prepare?: (form: FormData) => T;
    toResponse: (
        saved: ToolResult,
        assetId: string,
        prepared: T | undefined
    ) => Record<string, unknown>;
}

/** Shared upload path: validate the file, store it as an asset, map the result. */
async function handleImageUpload<T = unknown>(
    req: Request,
    database: Database,
    options: ImageUploadOptions<T>
): Promise<Response> {
    try {
        const sessionId = resolveExistingSessionId(req, database);
        const form = await req.formData();
        const file = form.get(options.field);
        if (!(file instanceof File)) {
            return jsonResponse({ error: options.missingFileError }, 400);
        }
        if (!isAllowedImageMime(file.type, options.allowedMimes)) {
            return jsonResponse({ error: options.invalidMimeError }, 400);
        }
        if (file.size > options.maxBytes) {
            return jsonResponse({ error: options.tooLargeError }, 400);
        }
        const prepared = options.prepare ? options.prepare(form) : undefined;
        const saved = saveAssetBuffer(
            "image",
            Buffer.from(await file.arrayBuffer()),
            file.type,
            sessionId,
            options.toolName,
            options.prompt,
            { source: "upload" }
        );
        const assetId = assetIdFromToolResult(saved);
        if (!assetId) throw new Error(options.saveFailedError);
        return jsonResponse(options.toResponse(saved, assetId, prepared));
    } catch (err) {
        return jsonResponse({ error: errorMessage(err) }, 400);
    }
}

async function handleProfileAvatarUpload(req: Request, database: Database): Promise<Response> {
    return handleImageUpload(req, database, {
        field: "avatar",
        allowedMimes: AVATAR_IMAGE_MIMES,
        maxBytes: 2 * 1024 * 1024,
        toolName: "profile_avatar",
        prompt: "Uploaded profile avatar",
        missingFileError: "avatar file required",
        invalidMimeError: "avatar image type invalid",
        tooLargeError: "avatar image too large",
        saveFailedError: "avatar asset save failed",
        prepare: (form) => JSON.parse(String(form.get("profile") ?? "{}")) as unknown,
        toResponse: (saved, assetId, profileInput) => ({
            profile: saveProfileAvatar(database, profileInput, assetId),
            assetUrl: saved.content
        })
    });
}

async function handleAnalyzeImageUpload(req: Request, database: Database): Promise<Response> {
    return handleImageUpload(req, database, {
        field: "image",
        allowedMimes: ANALYZE_IMAGE_MIMES,
        maxBytes: 20 * 1024 * 1024,
        toolName: "analyze_image",
        prompt: "Uploaded image for analysis",
        missingFileError: "image file required",
        invalidMimeError: "image type must be PNG, JPG, GIF, or WebP",
        tooLargeError: "image too large",
        saveFailedError: "analyze image asset save failed",
        toResponse: (saved, assetId) => ({ assetId, assetUrl: saved.content })
    });
}

async function handleReferenceImageUpload(req: Request, database: Database): Promise<Response> {
    return handleImageUpload(req, database, {
        field: "image",
        allowedMimes: REFERENCE_IMAGE_MIMES,
        maxBytes: 20 * 1024 * 1024,
        toolName: "reference_image",
        prompt: "Uploaded character reference",
        missingFileError: "reference image required",
        invalidMimeError: "reference image must be PNG or JPG",
        tooLargeError: "reference image too large",
        saveFailedError: "reference image asset save failed",
        toResponse: (saved, assetId) => ({ assetId, assetUrl: saved.content })
    });
}

async function handleProfileAvatarGenerate(req: Request, database: Database): Promise<Response> {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) return jsonResponse({ error: "MINIMAX_API_KEY not configured" }, 503);
    try {
        const sessionId = resolveSessionId(req, database);
        const profileInput = await req.json();
        const profile = saveUserProfile(database, profileInput);
        if (consumeQuota(database, "image") === null) {
            return jsonResponse({ error: "Daily image quota is used up." }, 429);
        }
        const args = { prompt: profileAvatarPrompt(profile), aspect_ratio: "1:1" };
        const result = safeToolResultForUser(
            "generate_image",
            await executeToolSafely("generate_image", args, apiKey)
        );
        const saved = await saveAssetFile(result, sessionId, "generate_image", args.prompt, args);
        if (saved.type === "error") {
            releaseQuota(database, "image");
            return jsonResponse({ error: saved.content }, 502);
        }
        const assetId = assetIdFromToolResult(saved);
        if (!assetId) throw new Error("avatar asset save failed");
        const savedProfile = saveProfileAvatar(database, profile, assetId);
        return jsonResponse({ profile: savedProfile, assetUrl: saved.content });
    } catch (err) {
        return jsonResponse({ error: errorMessage(err) }, 400);
    }
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
                headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": `hallucygenie/1.0` }
            });
            if (!resp.ok) {
                log.warn("quota api error", { status: resp.status });
                return jsonResponse({ error: "Failed to fetch quota" }, 502);
            }
            const data = (await resp.json()) as {
                model_remains: ModelRemain[];
            };
            const find = (name: string) =>
                data.model_remains.find((m) => m.model_name === name) ?? null;
            const general = find("general") ?? data.model_remains[0] ?? null;
            return jsonResponse({
                general: quotaEntry(general),
                weekly: quotaEntry(general, "weekly"),
                video: quotaEntry(find("video"))
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
                    nameSource: activeSession.name_source
                },
                ui: { maxMessageLength: 2000 }
            });
        }

        if (path === "/api/profile" && method === "GET") {
            return jsonResponse(getUserProfile(database));
        }

        if (path === "/api/profile/avatar" && method === "POST") {
            return handleProfileAvatarUpload(req, database);
        }

        if (path === "/api/profile/avatar/generate" && method === "POST") {
            return handleProfileAvatarGenerate(req, database);
        }

        if (path === "/api/analyze-image" && method === "POST") {
            return handleAnalyzeImageUpload(req, database);
        }

        if (path === "/api/reference-image" && method === "POST") {
            return handleReferenceImageUpload(req, database);
        }

        if (path === "/api/async-tts-tasks" && method === "GET") {
            return jsonResponse({
                tasks: listAsyncTtsTasks(database, resolveSessionId(req, database))
            });
        }

        if (path === "/api/music-cover/status" && method === "GET") {
            return jsonResponse({ enabled: false, youtubeEnabled: false });
        }

        if (path === "/api/music-cover/preprocess" && method === "POST") {
            return jsonResponse({ error: MUSIC_DISABLED_MESSAGE }, 503);
        }

        if (path === "/api/profile" && method === "PUT") {
            let parsed: unknown;
            try {
                parsed = await req.json();
                return jsonResponse(saveUserProfile(database, parsed));
            } catch (err) {
                return jsonResponse({ error: errorMessage(err) }, 400);
            }
        }

        if (path === "/api/profile" && method === "DELETE") {
            return jsonResponse(deleteUserProfile(database));
        }

        if (path === "/api/mcp" && method === "GET") {
            return jsonResponse(await getMcpStatus(database));
        }

        const mcpCredentialMatch = path.match(/^\/api\/mcp\/([^/]+)\/credential$/);
        if (mcpCredentialMatch && method === "PUT") {
            const entryId = decodeURIComponent(mcpCredentialMatch[1]!);
            let secret: unknown;
            try {
                secret = ((await req.json()) as { secret?: unknown; }).secret;
            } catch {
                return jsonResponse({ error: "Invalid JSON body" }, 400);
            }
            if (typeof secret !== "string" || secret.trim().length === 0) {
                return jsonResponse({ error: "secret must be a non-empty string" }, 400);
            }
            try {
                const { toolCount } = await setMcpCredential(database, entryId, secret.trim());
                log.info("mcp credential stored", { mcpId: entryId, toolCount });
                return jsonResponse({ ok: true, toolCount });
            } catch (err) {
                log.warn("mcp credential probe failed", { mcpId: entryId });
                return jsonResponse({ error: errorMessage(err) }, 502);
            }
        }

        const mcpMatch = path.match(/^\/api\/mcp\/([^/]+)$/);
        if (mcpMatch && method === "DELETE") {
            const entryId = decodeURIComponent(mcpMatch[1]!);
            await clearMcpCredential(database, entryId);
            log.info("mcp credential removed", { mcpId: entryId });
            return jsonResponse({ ok: true });
        }

        if (path === "/api/sessions" && method === "GET") {
            const activeId = getOrCreateActiveSessionId(database);
            return jsonResponse({ activeSessionId: activeId, sessions: listSessions(database) });
        }

        if (path === "/api/sessions" && method === "POST") {
            const session = createSession(database);
            setActiveSessionId(database, session.id);
            return jsonResponse({ session }, 201);
        }

        const activateMatch = path.match(/^\/api\/sessions\/([^/]+)\/activate$/);
        const activateSessionId = activateMatch?.[1];
        if (activateSessionId && method === "POST") {
            const session = getSession(database, decodeURIComponent(activateSessionId));
            if (!session || session.archived_at) return jsonResponse({ error: "Not found" }, 404);
            setActiveSessionId(database, session.id);
            return jsonResponse({ session });
        }

        const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
        const matchedSessionId = sessionMatch?.[1];
        if (matchedSessionId && method === "PATCH") {
            let body: unknown;
            try {
                body = await req.json();
                const obj = parseJsonObject(body, "session");
                if (typeof obj.name !== "string") throw new Error("name must be a string");
                return jsonResponse({
                    session: renameSession(database, matchedSessionId, obj.name)
                });
            } catch (err) {
                return jsonResponse({ error: errorMessage(err) }, 400);
            }
        }

        if (matchedSessionId && method === "DELETE") {
            try {
                const id = matchedSessionId;
                const activeId = getOrCreateActiveSessionId(database);
                archiveSession(database, id);
                if (activeId === id) setActiveSessionId(database, createSession(database).id);
                return jsonResponse({ ok: true });
            } catch {
                return jsonResponse({ error: "Not found" }, 404);
            }
        }

        const matchedDraftKind = draftKind(path);
        if (matchedDraftKind && method === "GET") {
            const row = getDraft(database, resolveSessionId(req, database), matchedDraftKind);
            return jsonResponse({ draft: row ? JSON.parse(row.value_json) : null });
        }

        if (matchedDraftKind && method === "PUT") {
            try {
                const value = await req.json();
                return jsonResponse({
                    draft: JSON.parse(
                        saveDraft(
                            database,
                            resolveSessionId(req, database),
                            matchedDraftKind,
                            value
                        ).value_json
                    )
                });
            } catch (err) {
                return jsonResponse({ error: errorMessage(err) }, 400);
            }
        }

        if (matchedDraftKind && method === "DELETE") {
            deleteDraft(database, resolveSessionId(req, database), matchedDraftKind);
            return jsonResponse({ ok: true });
        }

        if (path === "/api/create-history" && method === "GET") {
            const url = new URL(req.url);
            const { limit, offset } = parseLimitOffset(url);
            const kind = url.searchParams.get("kind") ?? undefined;
            const items = listToolInputHistory(database, resolveSessionId(req, database), {
                kind,
                limit,
                offset
            }).map((item) => ({ ...item, input: JSON.parse(item.input_json) }));
            return jsonResponse({ items });
        }

        const historyMatch = path.match(/^\/api\/create-history\/([^/]+)$/);
        if (historyMatch && method === "DELETE") {
            try {
                const historyId = historyMatch[1];
                if (!historyId) return jsonResponse({ error: "Not found" }, 404);
                hideToolInputHistory(database, resolveSessionId(req, database), historyId);
                return jsonResponse({ ok: true });
            } catch {
                return jsonResponse({ error: "Not found" }, 404);
            }
        }

        if (path === "/api/create-tool" && method === "POST") {
            const apiKey = process.env.MINIMAX_API_KEY;
            if (!apiKey) {
                return jsonResponse(
                    {
                        error:
                            "Server is missing the API key. Ask whoever set this up to add MINIMAX_API_KEY to the environment."
                    },
                    503
                );
            }
            return handleCreateTool(req, apiKey, database);
        }

        if (path === "/api/chat" && method === "POST") {
            const apiKey = process.env.MINIMAX_API_KEY;
            if (!apiKey) {
                return jsonResponse(
                    {
                        error:
                            "Server is missing the API key. Ask whoever set this up to add MINIMAX_API_KEY to the environment."
                    },
                    503
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
                !parsed
                || typeof parsed !== "object"
                || !("message" in parsed)
                || typeof (parsed as { message: unknown; }).message !== "string"
            ) {
                return jsonResponse({ error: "Missing required field: message" }, 400);
            }
            let sessionId: string;
            try {
                sessionId = resolveExistingSessionId(req, database);
            } catch {
                return jsonResponse({ error: "Session not found" }, 404);
            }
            const message = (parsed as { message: string; }).message;
            try {
                assertNoRawAssetDataInMessage(message);
            } catch {
                return jsonResponse({ error: "Raw media is not allowed in steering." }, 400);
            }
            saveMessage(database, sessionId, "user", message);
            const queue = getOrCreateSteerQueue(sessionId);
            queueSteer(queue, message);
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
        try {
            const assets = getAssets(dbOrErr, resolveSessionId(req, dbOrErr)).map(assetApiRow);
            return jsonResponse({ assets });
        } catch (err) {
            log.error("asset metadata error", { error: String(err) });
            return jsonResponse({ error: "Invalid asset metadata" }, 500);
        }
    }

    // GET /asset/:id — serve a specific asset file for explicit or active session
    if (path.startsWith("/asset/") && method === "GET") {
        const dbOrErr = requireDb();
        if (dbOrErr instanceof Response) return dbOrErr;
        const database = dbOrErr;

        const sessionId = validateSessionId(req) ?? new URL(req.url).searchParams.get("session_id")
            ?? getOrCreateActiveSessionId(database);

        const assetId = path.slice("/asset/".length);
        const asset = getAsset(database, assetId);
        if (!asset || asset.session_id !== sessionId) {
            return jsonResponse({ error: "Not found" }, 404);
        }
        const filePath = `data/assets/${asset.session_id}/${asset.filename}`;
        try {
            const file = await readFile(filePath);
            return new Response(file, {
                headers: {
                    "Content-Type": asset.mime_type,
                    "Cache-Control": "private, no-store"
                }
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
            const readable = Readable.fromWeb(
                webRes.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>
            );

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

function parseAssetParams(paramsJson: string | null): Record<string, unknown> {
    if (!paramsJson) return {};
    const parsed = JSON.parse(paramsJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("asset params_json must be an object");
    }
    return parsed as Record<string, unknown>;
}

function assetApiRow(asset: AssetRow): AssetApiRow {
    const { params_json: paramsJson, ...row } = asset;
    const url = `/asset/${asset.id}`;
    return {
        ...row,
        params: parseAssetParams(paramsJson),
        url,
        download_url: url
    };
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

function assetIdFromToolResult(result: ToolResult): string | null {
    const first = result.urls?.[0] ?? result.content;
    const match = first.match(/^\/asset\/(asset_[0-9a-f-]+)$/i);
    return match?.[1] ?? null;
}

function publicToolResult(result: ToolResult): ToolResult {
    const { provider: _provider, ...publicResult } = result;
    return publicResult;
}

function providerColumns(provider: ToolResult["provider"]): Record<string, unknown> {
    return {
        provider_stage: provider?.stage ?? null,
        provider_status_code: provider?.status_code ?? null,
        provider_status_msg: provider?.status_msg ?? null,
        provider_file_id: provider?.file_id ?? null
    };
}

function providerTaskColumns(provider: ToolResult["provider"]): Record<string, unknown> {
    return {
        ...providerColumns(provider),
        ...(provider?.task_id ? { provider_task_id: provider.task_id } : {}),
        ...(provider?.file_id ? { file_id: provider.file_id } : {})
    };
}

function extensionForMime(mime: string): string {
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3";
    if (mime === "video/mp4") return "mp4";
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
    args?: Record<string, unknown>
): string | null {
    if (toolName === "generate_image") {
        const params: Record<string, unknown> = {
            model: "image-01",
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            aspect_ratio: stringParam(args, "aspect_ratio") ?? null
        };
        const referenceAssetId = stringParam(args, "reference_asset_id");
        if (referenceAssetId) params.reference_asset_id = referenceAssetId;
        return JSON.stringify(params);
    }
    if (toolName === "text_to_speech") {
        return JSON.stringify({
            model: "speech-2.8-hd",
            text: prompt ?? stringParam(args, "text") ?? null,
            voice_id: stringParam(args, "voice_id") ?? null,
            speed: numberParam(args, "speed") ?? null,
            volume: numberParam(args, "volume") ?? null,
            pitch: numberParam(args, "pitch") ?? null
        });
    }
    if (toolName === "generate_long_speech") {
        const text = stringParam(args, "text") ?? "";
        return JSON.stringify({
            model: "speech-2.8-hd",
            endpoint: "t2a_async_v2",
            text_summary: prompt ?? longTextSummary(text),
            text_length: text.length,
            voice_id: stringParam(args, "voice_id") ?? null,
            speed: numberParam(args, "speed") ?? null,
            volume: numberParam(args, "volume") ?? null,
            pitch: numberParam(args, "pitch") ?? null
        });
    }
    if (toolName === "generate_music") {
        const lyrics = stringParam(args, "lyrics") ?? "";
        return JSON.stringify({
            model: "music-2.6",
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            lyrics_present: lyrics.length > 0,
            lyrics_excerpt: lyrics ? lyrics.slice(0, 200) : null,
            is_instrumental: lyrics.length === 0
        });
    }
    if (toolName === "generate_music_cover") {
        const lyrics = stringParam(args, "lyrics") ?? "";
        return JSON.stringify({
            model: "music-cover",
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            cover_feature_id_present: Boolean(stringParam(args, "cover_feature_id")),
            lyrics_present: lyrics.length > 0,
            lyrics_excerpt: lyrics ? lyrics.slice(0, 200) : null
        });
    }
    if (toolName === "generate_lyrics") {
        return JSON.stringify({
            endpoint: "anthropic/v1/messages",
            model: MINIMAX_MODEL,
            mode: stringParam(args, "mode") ?? null,
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            title: stringParam(args, "title") ?? null,
            lyrics_present: Boolean(stringParam(args, "lyrics"))
        });
    }
    if (toolName === "generate_video") {
        return JSON.stringify({
            model: VIDEO_MODEL,
            prompt: prompt ?? stringParam(args, "prompt") ?? null,
            duration: numberParam(args, "duration") ?? 4,
            resolution: stringParam(args, "resolution") ?? "768p"
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
    args?: Record<string, unknown>
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
        type: resultType === "image"
            ? "image"
            : resultType === "video"
            ? "video"
            : toolName === "generate_music" || toolName === "generate_music_cover"
            ? "music"
            : "audio",
        filename,
        mime_type: mime,
        prompt,
        tool_name: toolName,
        size_bytes: buf.byteLength,
        params_json: assetParamsJson(toolName, prompt, args)
    });

    return { type: resultType, content: `/asset/${assetId}` };
}

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_GENERATED_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_GENERATED_VIDEO_BYTES = 200 * 1024 * 1024;
const GENERATED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const GENERATED_AUDIO_MIMES = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/opus"
]);
const GENERATED_AUDIO_BUNDLE_MIMES = new Set(["application/x-tar", "application/tar"]);
const GENERATED_AUDIO_DOWNLOAD_MIMES = new Set([
    ...GENERATED_AUDIO_MIMES,
    ...GENERATED_AUDIO_BUNDLE_MIMES
]);
const GENERATED_VIDEO_MIMES = new Set(["video/mp4"]);

async function readResponseBytesCapped(
    resp: Response,
    maxBytes: number,
    label: string
): Promise<Buffer> {
    if (!resp.body) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.byteLength > maxBytes) throw new Error(`${label} download too large`);
        return buf;
    }
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) throw new Error(`${label} download too large`);
        chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

/** Fetch an http(s) asset, enforcing the MIME allow-list and the byte cap. */
async function downloadAsset(
    url: string,
    allowedMimes: Set<string>,
    maxBytes: number,
    label: string
): Promise<{ buf: Buffer; mime: string; }> {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`${label} asset URL must be http(s)`);
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${label} download failed: ${resp.status}`);

    const mime = resp.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!allowedMimes.has(mime)) {
        throw new Error(`${label} download returned ${mime || "unknown"}`);
    }
    const contentLength = Number(resp.headers.get("Content-Length") ?? "0");
    if (contentLength > maxBytes) throw new Error(`${label} download too large`);

    return { buf: await readResponseBytesCapped(resp, maxBytes, label), mime };
}

async function downloadImageAsset(url: string): Promise<{ buf: Buffer; mime: string; }> {
    return downloadAsset(url, GENERATED_IMAGE_MIMES, MAX_GENERATED_IMAGE_BYTES, "image");
}

async function downloadVideoAsset(url: string): Promise<{ buf: Buffer; mime: string; }> {
    return downloadAsset(url, GENERATED_VIDEO_MIMES, MAX_GENERATED_VIDEO_BYTES, "video");
}

function audioMimeForFilename(filename: string): string | null {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".flac")) return "audio/flac";
    if (lower.endsWith(".opus")) return "audio/opus";
    return null;
}

function parseTarSize(raw: string): number {
    const clean = raw.replace(/\0.*$/, "").trim();
    return clean ? Number.parseInt(clean, 8) : 0;
}

function extractAudioFromTar(buf: Buffer): { buf: Buffer; mime: string; } {
    let offset = 0;
    while (offset + 512 <= buf.byteLength) {
        const header = buf.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) break;
        const filename = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
        const size = parseTarSize(header.subarray(124, 136).toString("ascii"));
        const dataStart = offset + 512;
        const dataEnd = dataStart + size;
        if (dataEnd > buf.byteLength) throw new Error("audio bundle truncated");
        const mime = audioMimeForFilename(filename);
        if (mime) return { buf: Buffer.from(buf.subarray(dataStart, dataEnd)), mime };
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    throw new Error("audio bundle had no generated audio");
}

async function downloadAudioAsset(url: string): Promise<{ buf: Buffer; mime: string; }> {
    const { buf, mime } = await downloadAsset(
        url,
        GENERATED_AUDIO_DOWNLOAD_MIMES,
        MAX_GENERATED_AUDIO_BYTES,
        "audio"
    );
    if (GENERATED_AUDIO_BUNDLE_MIMES.has(mime)) return extractAudioFromTar(buf);
    return { buf, mime };
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
    args?: Record<string, unknown>
): Promise<ToolResult> {
    try {
        if (result.type === "image" && result.urls?.some((url) => /^https?:\/\//i.test(url))) {
            const saved: string[] = [];
            for (const url of result.urls) {
                if (!/^https?:\/\//i.test(url)) {
                    throw new Error("image asset URL must be http(s)");
                }
                const downloaded = await downloadImageAsset(url);
                saved.push(
                    saveAssetBuffer(
                        "image",
                        downloaded.buf,
                        downloaded.mime,
                        sessionId,
                        toolName,
                        prompt,
                        args
                    ).content
                );
            }
            return { type: "image", content: saved[0], urls: saved };
        }

        if (result.type === "image" && /^https?:\/\//i.test(result.content)) {
            const downloaded = await downloadImageAsset(result.content);
            return saveAssetBuffer(
                "image",
                downloaded.buf,
                downloaded.mime,
                sessionId,
                toolName,
                prompt,
                args
            );
        }

        if (result.type === "video" && /^https?:\/\//i.test(result.content)) {
            const downloaded = await downloadVideoAsset(result.content);
            return saveAssetBuffer(
                "video",
                downloaded.buf,
                downloaded.mime,
                sessionId,
                toolName,
                prompt,
                args
            );
        }

        if (result.type === "audio" && /^https?:\/\//i.test(result.content)) {
            const downloaded = await downloadAudioAsset(result.content);
            return saveAssetBuffer(
                "audio",
                downloaded.buf,
                downloaded.mime,
                sessionId,
                toolName,
                prompt,
                args
            );
        }

        if (
            (result.type === "image" || result.type === "audio" || result.type === "video")
            && /^[a-z][a-z0-9+.-]*:/i.test(result.content)
            && !/^data:/i.test(result.content)
        ) {
            throw new Error(`${result.type} asset URL must be http(s)`);
        }

        const match = result.content.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return result;

        const mime = match[1];
        const base64 = match[2];
        if (!mime || !base64) return result;
        const buf = Buffer.from(base64, "base64");
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
    await closeMcpConnections();
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
    void closeMcpConnections();
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
