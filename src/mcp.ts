/**
 * MCP integrations: registry, credentials, connections, and the tool bridge
 * between MCP servers and the chat agent loop.
 *
 * Adding a future MCP server = one catalog entry here (plus its credential
 * env mapping). The UI renders the registry generically.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Database, deleteMcpCredential, getMcpCredential, saveMcpCredential } from "./db.ts";
import { createLogger } from "./log.ts";
import { McpStdioClient } from "./mcp-client.ts";

const log = createLogger({ service: "mcp" });

export interface McpServerCatalogEntry {
    /** Stable id used in routes, tool name prefix, and the credentials table. */
    id: string;
    label: string;
    description: string;
    /** Env keys the server needs; the stored credential is assigned to the first. */
    envKeys: string[];
    /** Spawn candidates, tried in order: dev node_modules/.bin, global bin, npx fallback. */
    commandCandidates: string[][];
    /** Auto-connect servers need no credential and are always enabled. */
    autoConnect?: boolean;
    /** Env vars derived from the runtime environment (workspace paths etc.). */
    buildEnv?: () => Record<string, string>;
}

const YOUTUBE_PACKAGE = "zubeid-youtube-mcp-server";
const FFMPEG_PACKAGE = "ffmpeg-mcp-server";

function localBinCandidates(packageName: string): string[][] {
    try {
        const bin = fileURLToPath(
            new URL("../node_modules/.bin/" + packageName, import.meta.url)
        );
        return existsSync(bin) ? [[bin]] : [];
    } catch {
        return [];
    }
}

export const MCP_SERVERS: readonly McpServerCatalogEntry[] = [
    {
        id: "youtube",
        label: "YouTube",
        description:
            "Search videos, read transcripts, and look up channels and playlists through the YouTube Data API.",
        envKeys: ["YOUTUBE_API_KEY"],
        commandCandidates: [
            ...localBinCandidates(YOUTUBE_PACKAGE),
            [YOUTUBE_PACKAGE],
            ["npx", "-y", `${YOUTUBE_PACKAGE}@1`]
        ]
    },
    {
        id: "ffmpeg",
        label: "FFmpeg",
        description:
            "Cut, convert, concatenate, and clean up video and audio files inside the app's data directory.",
        envKeys: [],
        commandCandidates: [
            // The npm bin wrapper has no shebang → execve falls back to /bin/sh
            // → guaranteed failure. Spawn node directly on the built JS instead.
            [
                process.execPath,
                join(process.cwd(), "node_modules", "ffmpeg-mcp-server", "build", "index.js")
            ],
            ["ffmpeg-mcp"],
            ["npx", "-y", `${FFMPEG_PACKAGE}@1`]
        ],
        autoConnect: true,
        buildEnv: () => ({ FFMPEG_MCP_WORKSPACE: resolve(process.cwd(), "data") })
    }
] as const;

export function mcpCatalogEntry(id: string): McpServerCatalogEntry | undefined {
    return MCP_SERVERS.find((entry) => entry.id === id);
}

export interface McpStatus {
    id: string;
    label: string;
    description: string;
    credentialSet: boolean;
    connected: boolean;
    toolCount: number;
    error: string | null;
    autoConnect: boolean;
}

interface Connection {
    client: McpStdioClient;
    tools: Awaited<ReturnType<McpStdioClient["listTools"]>>;
}

const connections = new Map<string, Connection>();
const connecting = new Map<string, Promise<Connection | null>>();
const connectEpochs = new Map<string, number>();
let closed = false;

/** Test seam: closeMcpConnections permanently stops connects; tests reset it. */
export function _setMcpClosed(value: boolean): void {
    closed = value;
}

function nextEpoch(entryId: string): number {
    const epoch = (connectEpochs.get(entryId) ?? 0) + 1;
    connectEpochs.set(entryId, epoch);
    return epoch;
}

/** Drop any in-flight connect attempt for an entry (credential changed/removed). */
function invalidateConnecting(entryId: string): void {
    nextEpoch(entryId);
    connecting.delete(entryId);
}

function credentialEnv(entry: McpServerCatalogEntry, secret: string): Record<string, string> {
    const env: Record<string, string> = { ...entry.buildEnv?.() };
    entry.envKeys.forEach((key, index) => {
        if (index === 0) env[key] = secret;
    });
    return env;
}

/** Connect using a credential directly (probe, first use in a route). One spawn per entry. */
async function ensureConnectedWith(
    entry: McpServerCatalogEntry,
    secret: string
): Promise<Connection> {
    const existing = connections.get(entry.id);
    if (closed) throw new Error("MCP subsystem is shut down");
    if (existing) return existing;
    const inFlight = connecting.get(entry.id);
    if (inFlight) {
        const result = await inFlight;
        if (result === null) {
            throw new Error(`${entry.label} connect was superseded; retry the request`);
        }
        return result;
    }
    const epoch = (connectEpochs.get(entry.id) ?? 0) + 1;
    connectEpochs.set(entry.id, epoch);
    const attempt = (async () => {
        let lastError = "no spawn candidate";
        for (const candidate of entry.commandCandidates) {
            const client = new McpStdioClient({
                command: candidate[0]!,
                args: candidate.slice(1),
                env: credentialEnv(entry, secret),
                label: entry.label
            });
            try {
                const tools = await client.listTools();
                if (connectEpochs.get(entry.id) !== epoch) {
                    // A newer credential/invalidation superseded this attempt:
                    // never publish a connection built from a stale secret.
                    await client.close();
                    return null;
                }
                const connection: Connection = { client, tools };
                connections.set(entry.id, connection);
                return connection;
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                await client.close();
            }
        }
        throw new Error(lastError);
    })();
    connecting.set(entry.id, attempt as Promise<Connection>);
    try {
        const result = await attempt;
        if (result === null) {
            throw new Error(`${entry.label} connect was superseded; retry the request`);
        }
        return result;
    } finally {
        if (connecting.get(entry.id) === attempt) connecting.delete(entry.id);
    }
}

/** Connect only from an existing cached connection; never spawns, never reads the db. */
function connectedOnly(entry: McpServerCatalogEntry): Connection {
    const connection = connections.get(entry.id);
    if (!connection) {
        throw new Error(`${entry.label} is not connected. Connect it in Profile → Integrations.`);
    }
    return connection;
}

/** Status for the integrations UI. Never includes the credential value. */
export async function getMcpStatus(db: Database): Promise<McpStatus[]> {
    const statuses: McpStatus[] = [];
    for (const entry of MCP_SERVERS) {
        const credentialSet = entry.autoConnect === true || getMcpCredential(db, entry.id) !== null;
        let connected = false;
        let toolCount = 0;
        let error: string | null = null;
        if (credentialSet) {
            try {
                const secret = entry.autoConnect === true
                    ? ""
                    : (getMcpCredential(db, entry.id) ?? "");
                const connection = await ensureConnectedWith(entry, secret);
                connected = true;
                toolCount = connection.tools.length;
            } catch (error_) {
                error = error_ instanceof Error ? error_.message : String(error_);
                const previous = connections.get(entry.id);
                if (previous) {
                    await previous.client.close();
                    connections.delete(entry.id);
                }
            }
        }
        statuses.push({
            id: entry.id,
            label: entry.label,
            description: entry.description,
            credentialSet,
            connected,
            toolCount,
            error,
            autoConnect: entry.autoConnect === true
        });
    }
    return statuses;
}

/** Store a credential and probe the server so bad keys fail fast at save time. */
export async function setMcpCredential(
    db: Database,
    entryId: string,
    secret: string
): Promise<{ toolCount: number; }> {
    const entry = mcpCatalogEntry(entryId);
    if (!entry) throw new Error(`Unknown MCP integration: ${entryId}`);
    if (entry.autoConnect === true) {
        throw new Error(`Built-in integration ${entry.label} does not need a key`);
    }
    saveMcpCredential(db, entry.id, secret);
    invalidateConnecting(entry.id);
    const previous = connections.get(entry.id);
    if (previous) {
        await previous.client.close();
        connections.delete(entry.id);
    }
    try {
        const connection = await ensureConnectedWith(entry, secret);
        return { toolCount: connection.tools.length };
    } catch (error) {
        // Keep the credential so a slow first connect (cold npx install) can be
        // retried; the UI surfaces the error and offers Disconnect.
        throw error;
    }
}

/** Remove the credential and drop the connection. */
export async function clearMcpCredential(db: Database, entryId: string): Promise<void> {
    const entry = mcpCatalogEntry(entryId);
    if (!entry) throw new Error(`Unknown MCP integration: ${entryId}`);
    if (entry.autoConnect === true) {
        throw new Error(`Built-in integration ${entry.label} cannot be disconnected`);
    }
    deleteMcpCredential(db, entryId);
    invalidateConnecting(entryId);
    const connection = connections.get(entryId);
    if (connection) {
        await connection.client.close();
        connections.delete(entryId);
    }
}

/** MCP tools for every connected server, exposed to the model as mcp__<id>__<tool>.
 *
 * Chat start must never block on an MCP spawn: this reads cached connections only.
 * The Integrations panel (status probe / credential save) warms the cache up.
 */
export async function getMcpToolDefinitions(
    db: Database
): Promise<Array<{ name: string; description: string; input_schema: Record<string, unknown>; }>> {
    const definitions: Array<
        { name: string; description: string; input_schema: Record<string, unknown>; }
    > = [];
    for (const entry of MCP_SERVERS) {
        const secret = entry.autoConnect === true ? "" : getMcpCredential(db, entry.id);
        if (secret === null) continue;
        const connection = connections.get(entry.id);
        if (!connection) {
            // Warm up auto-connect entries on first chat request; never blocks.
            if (entry.autoConnect === true) {
                void ensureConnectedWith(entry, "").catch(() => {});
            }
            continue;
        }
        for (const tool of connection.tools) {
            definitions.push({
                name: `mcp__${entry.id}__${tool.name}`,
                description: tool.description ?? tool.name,
                input_schema: (tool.inputSchema ?? { type: "object" }) as Record<string, unknown>
            });
        }
    }
    return definitions;
}

/** Route an mcp__<id>__<tool> call to its server. Returns a Genie ToolResult. */
export async function executeMcpTool(
    name: string,
    args: Record<string, unknown>
): Promise<{ type: "text" | "error"; content: string; }> {
    const match = name.match(/^mcp__([A-Za-z0-9_-]+)__(.+)$/);
    if (!match) return { type: "error", content: `Unknown MCP tool: ${name}` };
    const [, serverId, toolName] = match;
    const entry = mcpCatalogEntry(serverId);
    if (!entry) return { type: "error", content: `Unknown MCP integration: ${serverId}` };
    let connection: Connection;
    try {
        connection = connectedOnly(entry);
    } catch (error) {
        return { type: "error", content: error instanceof Error ? error.message : String(error) };
    }
    try {
        const result = await connection.client.callTool(toolName, args);
        if (result.isError) return { type: "error", content: result.text || `${toolName} failed.` };
        return { type: "text", content: result.text };
    } catch (error) {
        return { type: "error", content: error instanceof Error ? error.message : String(error) };
    }
}

/** Best-effort reconnect of credential-set servers (called at server startup). */
export async function warmMcpConnections(db: Database): Promise<void> {
    for (const entry of MCP_SERVERS) {
        const secret = entry.autoConnect === true ? "" : getMcpCredential(db, entry.id);
        if (secret === null || connections.has(entry.id)) continue;
        try {
            await ensureConnectedWith(entry, secret);
            log.info("mcp reconnected", {
                server: entry.id,
                tools: connections.get(entry.id)?.tools.length ?? 0
            });
        } catch (error) {
            log.warn("mcp warm-up failed", {
                server: entry.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

/** Close every MCP connection (shutdown, tests). Permanently stops connects. */
export async function closeMcpConnections(): Promise<void> {
    closed = true;
    for (const id of new Set([...connectEpochs.keys(), ...connections.keys()])) {
        nextEpoch(id);
    }
    connecting.clear();
    for (const [id, connection] of connections) {
        await connection.client.close();
        connections.delete(id);
    }
}
