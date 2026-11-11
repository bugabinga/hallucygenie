// Minimal MCP stdio server stub for unit tests: JSON-RPC over newline-delimited JSON.
// Registers one tool "echo_text"; replies with "stub:<text>".
process.stdin.setEncoding("utf8");
let buffer = "";
const TOOL_NAME = "echo_text";
const TOOL_SCHEMA = {
    type: "object",
    properties: { text: { type: "string", description: "text to echo" } },
    required: ["text"]
};

function send(message) {
    process.stdout.write(JSON.stringify(message) + "\n");
}

function handle(message) {
    if (message.method === "initialize") {
        send({
            jsonrpc: "2.0",
            id: message.id,
            result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "stub-youtube", version: "0.1.0" }
            }
        });
        return;
    }
    if (message.method === "tools/list") {
        send({
            jsonrpc: "2.0",
            id: message.id,
            result: {
                tools: [
                    {
                        name: TOOL_NAME,
                        description: "Echo text back with a stub marker.",
                        inputSchema: TOOL_SCHEMA
                    }
                ]
            }
        });
        return;
    }
    if (message.method === "tools/call") {
        const text = message.params?.arguments?.text ?? "";
        if (message.params?.name !== TOOL_NAME) {
            send({
                jsonrpc: "2.0",
                id: message.id,
                result: {
                    content: [{ type: "text", text: `unknown tool: ${message.params?.name}` }],
                    isError: true
                }
            });
            return;
        }
        send({
            jsonrpc: "2.0",
            id: message.id,
            result: { content: [{ type: "text", text: `stub:${text}` }] }
        });
    }
}

process.stdin.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
            handle(JSON.parse(line));
        } catch {
            // malformed line: ignore, keep serving
        }
    }
});
