import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import {
    deleteMcpCredential,
    getMcpCredential,
    getMessages,
    initDb,
    saveMcpCredential
} from "../../src/db.ts";

// MCP integration tests: registry shape, credential CRUD, and the full
// mcp__youtube__* bridge over the stub MCP server (JSON-RPC stdio).
process.env.MINIMAX_API_KEY = "test-key-for-mcp-tests";

const stubServer = new URL("../fixtures/mcp-stub-server.mjs", import.meta.url).pathname;

describe("mcp catalog", () => {
    it("registers YouTube with env keys and spawn candidates", async () => {
        const { MCP_SERVERS } = await import("../../src/mcp.ts");
        assert.equal(MCP_SERVERS.length, 1);
        const entry = MCP_SERVERS[0];
        assert.equal(entry.id, "youtube");
        assert.equal(entry.label, "YouTube");
        assert.deepEqual(entry.envKeys, ["YOUTUBE_API_KEY"]);
        assert.ok(entry.commandCandidates.length >= 2, "needs local + fallback spawn candidates");
    });
});

describe("mcp credential store", () => {
    it("round-trips, overwrites, and deletes credentials", () => {
        const db = initDb(":memory:");
        assert.equal(getMcpCredential(db, "youtube"), null);
        saveMcpCredential(db, "youtube", "key-1");
        assert.equal(getMcpCredential(db, "youtube"), "key-1");
        saveMcpCredential(db, "youtube", "key-2");
        assert.equal(getMcpCredential(db, "youtube"), "key-2");
        deleteMcpCredential(db, "youtube");
        assert.equal(getMcpCredential(db, "youtube"), null);
        db.close();
    });
});

describe("mcp bridge over stub server", () => {
    it("exposes stub tools as mcp__youtube__* and routes calls through executeTool", async () => {
        const { _setSpawnOverride } = await import("../../src/mcp-client.ts");
        const {
            _setMcpClosed,
            executeMcpTool,
            getMcpToolDefinitions,
            setMcpCredential,
            closeMcpConnections,
            MCP_SERVERS
        } = await import("../../src/mcp.ts");
        const { executeTool } = await import("../../src/tools.ts");

        _setMcpClosed(false);
        let spawns = 0;
        _setSpawnOverride((command, args, options) => {
            spawns += 1;
            assert.ok(
                options.env.YOUTUBE_API_KEY === "stub-key",
                "credential must reach the server env"
            );
            return spawn(process.execPath, [stubServer], {
                env: options.env,
                stdio: ["pipe", "pipe", "pipe"]
            });
        });
        const db = initDb(":memory:");
        try {
            await setMcpCredential(db, MCP_SERVERS[0].id, "stub-key");

            const definitions = await getMcpToolDefinitions(db);
            assert.equal(definitions.length, 1);
            assert.equal(definitions[0].name, "mcp__youtube__echo_text");
            assert.equal(definitions[0].input_schema.type, "object");
            assert.equal(
                JSON.stringify(definitions).includes("stub-key"),
                false,
                "secret must not leak into tool defs"
            );

            const direct = await executeMcpTool("mcp__youtube__echo_text", { text: "direct" });
            assert.equal(direct.type, "text");
            assert.equal(direct.content, "stub:direct");

            const viaExecuteTool = await executeTool("mcp__youtube__echo_text", {
                text: "dispatch"
            }, "unused-key");
            assert.equal(viaExecuteTool.type, "text");
            assert.equal(viaExecuteTool.content, "stub:dispatch");

            const unknown = await executeMcpTool("mcp__youtube__nope", {});
            assert.equal(unknown.type, "error");
        } finally {
            await closeMcpConnections();
            _setSpawnOverride(null);
            _setMcpClosed(true);
            db.close();
        }
        assert.ok(spawns >= 1);
    });

    it("never leaks the credential through getMessages-style surfaces", () => {
        const db = initDb(":memory:");
        saveMcpCredential(db, "youtube", "super-secret-key");
        assert.equal(getMcpCredential(db, "youtube"), "super-secret-key");
        const messages = getMessages(db, "nonexistent");
        assert.deepEqual(messages, []);
        db.close();
    });
});
