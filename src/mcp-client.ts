/**
 * Minimal MCP stdio client (JSON-RPC 2.0 over newline-delimited JSON).
 *
 * Zero-dependency on purpose: the production container image ships no
 * node_modules for src/, so the protocol is implemented on node builtins
 * instead of pulling in the MCP SDK. Covers the client surface Genie needs:
 * initialize handshake, tools/list, tools/call, close.
 */
import { type ChildProcess, spawn } from "node:child_process";

const PROTOCOL_VERSION = "2024-11-05";
const REQUEST_TIMEOUT_MS = 90_000;

export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

export interface McpStdioClientOptions {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    label: string;
}

type Pending = {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/** Test seam: replaces child_process.spawn for one start(). */
export let _spawnOverride:
    | ((command: string, args: string[], options: { env: Record<string, string>; }) => ChildProcess)
    | null = null;

export function _setSpawnOverride(fn: typeof _spawnOverride): void {
    _spawnOverride = fn;
}

export class McpStdioClient {
    readonly label: string;
    private readonly command: string;
    private readonly args: string[];
    private readonly env: Record<string, string>;
    private child: ChildProcess | undefined;
    private buffer = "";
    private nextId = 1;
    private pending = new Map<number, Pending>();
    private initPromise: Promise<void> | undefined;
    private stderrTail = "";
    private closed = false;
    tools: McpToolInfo[] = [];

    constructor(options: McpStdioClientOptions) {
        this.label = options.label;
        this.command = options.command;
        this.args = options.args ?? [];
        this.env = options.env ?? {};
    }

    /** Last stderr lines from the server, for operator diagnostics. Never logged at info. */
    diagnostics(): string {
        return this.stderrTail.slice(-2000);
    }

    private failAll(message: string): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error(message));
        }
        this.pending.clear();
    }

    async start(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            const child = _spawnOverride
                ? _spawnOverride(this.command, this.args, {
                    env: { ...process.env, ...this.env } as Record<string, string>
                })
                : spawn(this.command, this.args, {
                    env: { ...process.env, ...this.env },
                    stdio: ["pipe", "pipe", "pipe"]
                });
            this.child = child;
            child.on(
                "error",
                (error) =>
                    this.failAll(`${this.label} MCP server failed to start: ${String(error)}`)
            );
            child.stderr?.on("data", (chunk: Buffer) => {
                this.stderrTail = (this.stderrTail + chunk.toString()).slice(-4000);
            });
            child.on("exit", (code, signal) => {
                this.closed = true;
                this.failAll(
                    `${this.label} MCP server exited early (code=${code ?? "null"} signal=${
                        signal ?? "null"
                    })${this.stderrTail ? `: ${this.stderrTail.slice(-300)}` : ""}`
                );
            });
            child.stdout?.setEncoding("utf8");
            child.stdout?.on("data", (chunk: string) => this.consume(chunk));
            // A child that exits mid-write delivers EPIPE on the stdin socket;
            // without this handler the error terminates the whole server.
            child.stdin?.on("error", () => this.failAll(`${this.label} MCP stdin pipe broken`));
            await this.request("initialize", {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "hallucygenie", version: "1.0.0" }
            });
            this.notify("notifications/initialized");
        })();
        return this.initPromise;
    }

    private consume(chunk: string): void {
        this.buffer += chunk;
        for (;;) {
            const newline = this.buffer.indexOf("\n");
            if (newline === -1) return;
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            let message: Record<string, unknown>;
            try {
                message = JSON.parse(line) as Record<string, unknown>;
            } catch {
                continue;
            }
            const id = typeof message.id === "number" ? message.id : undefined;
            if (id === undefined || !this.pending.has(id)) continue;
            const pending = this.pending.get(id)!;
            this.pending.delete(id);
            clearTimeout(pending.timer);
            if (message.error !== undefined) {
                const error = message.error as { message?: string; };
                pending.reject(new Error(error?.message ?? "MCP request failed"));
            } else {
                pending.resolve((message.result ?? {}) as Record<string, unknown>);
            }
        }
    }

    private request(
        method: string,
        params: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        if (this.closed || !this.child?.stdin?.writable) {
            return Promise.reject(new Error(`${this.label} MCP server is not running`));
        }
        const id = this.nextId++;
        const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        return new Promise<Record<string, unknown>>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${this.label} MCP request ${method} timed out`));
            }, REQUEST_TIMEOUT_MS);
            this.pending.set(id, { resolve, reject, timer });
            this.child!.stdin!.write(payload, (error) => {
                if (error) {
                    this.pending.delete(id);
                    clearTimeout(timer);
                    reject(new Error(`${this.label} MCP write failed: ${String(error)}`));
                }
            });
        });
    }

    private notify(method: string): void {
        this.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
    }

    async listTools(): Promise<McpToolInfo[]> {
        await this.start();
        const result = await this.request("tools/list", {});
        const tools = result.tools as McpToolInfo[] | undefined;
        this.tools = (tools ?? []).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>
        }));
        return this.tools;
    }

    async callTool(
        name: string,
        args: Record<string, unknown>
    ): Promise<{ text: string; isError: boolean; }> {
        await this.start();
        const result = await this.request("tools/call", { name, arguments: args });
        const content = (result.content as Array<{ type?: string; text?: string; }> | undefined)
            ?? [];
        const text = content
            .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
            .join("\n")
            .trim();
        return { text, isError: result.isError === true };
    }

    async close(): Promise<void> {
        this.closed = true;
        this.failAll(`${this.label} MCP client closed`);
        this.child?.kill();
        await new Promise<void>((resolve) => {
            if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
                return resolve();
            }
            this.child.on("exit", () => resolve());
        });
        this.child = undefined;
        this.initPromise = undefined;
    }
}
