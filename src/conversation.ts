import type { DatabaseSync } from "node:sqlite";
import { stripModelControlPlaceholders } from "./agent.ts";
import { assertNoRawAssetDataInMessage, getAssets, getMessages, type MessageRow } from "./db.ts";
import type { ChatMessage } from "./server.ts";
import type { ToolDefinition, ToolResult } from "./tools.ts";

export const CONVERSATION_TOOLS: ToolDefinition[] = [
    {
        name: "read_conversation",
        description:
            "Retrieve committed current-session context outside the active window. operation=messages lists latest record previews with next_before_id; operation=message reads one complete record in Unicode-character pages; operation=assets lists stored media metadata with next_cursor. Preview text is not the complete record. Follow returned cursors until the required content is read. Includes Create inputs, lyrics, tool results/errors, prose and visible reasoning. No other sessions or unsent drafts.",
        input_schema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["messages", "message", "assets"],
                    default: "messages"
                },
                before_id: { type: "integer", minimum: 1 },
                message_id: { type: "integer", minimum: 1 },
                offset: {
                    type: "integer",
                    minimum: 0,
                    description: "Unicode-character offset when reading a message."
                },
                max_chars: { type: "integer", minimum: 1, maximum: 16000, default: 16000 },
                cursor: {
                    type: "string",
                    description: "next_cursor from the previous assets page."
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "inspect_asset",
        description:
            "Inspect actual stored current-session media, not its generation prompt. Images: visual analysis. Audio: speech transcription. MP4 video: native visual analysis plus transcription of its audio track. Transcription does not analyze music or arbitrary non-speech sounds. Supply an asset_id from conversation results or read_conversation assets. Raw bytes never enter conversation context.",
        input_schema: {
            type: "object",
            properties: {
                asset_id: { type: "string" },
                question: { type: "string", minLength: 1 }
            },
            required: ["asset_id", "question"],
            additionalProperties: false
        }
    }
];

/** Historical provider tool IDs are deliberately not replayed as protocol blocks. */
export function projectConversation(rows: MessageRow[]): ChatMessage[] {
    const names = new Map<string, string>();
    return rows.map(row => {
        const actions: Array<{ name: string; input: Record<string, unknown>; }> = [];
        if (row.tool_calls_json) {
            const calls = JSON.parse(row.tool_calls_json) as NonNullable<ChatMessage["tool_calls"]>;
            for (const call of calls) {
                names.set(call.id, call.name);
                actions.push({ name: call.name, input: call.input });
            }
        }
        const record = {
            record_id: row.id,
            source: "saved_conversation",
            role: row.role,
            content: row.role === "assistant"
                ? stripModelControlPlaceholders(row.content)
                : row.content,
            ...(row.thinking ? { visible_reasoning: row.thinking } : {}),
            ...(actions.length ? { actions } : {}),
            ...(row.role === "tool"
                ? { tool_name: names.get(row.tool_call_id ?? "") ?? "unknown" }
                : {})
        };
        const content = JSON.stringify(record);
        assertNoRawAssetDataInMessage(content);
        return { role: row.role === "user" ? "user" : "assistant", content };
    });
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error("Invalid read_conversation integer parameter.");
    }
    return value;
}

/** All lookup and pagination are scoped by the server-selected session, never model input. */
export function readConversation(
    database: DatabaseSync,
    sessionId: string,
    input: Record<string, unknown>
): ToolResult {
    try {
        const operation = input.operation ?? "messages";
        let result: unknown;
        if (operation === "assets") {
            const assets = getAssets(database, sessionId);
            const cursor = input.cursor;
            if (cursor !== undefined && typeof cursor !== "string") {
                throw new Error("Invalid asset cursor.");
            }
            const previous = cursor === undefined
                ? -1
                : assets.findIndex(asset => asset.id === cursor);
            if (cursor !== undefined && previous === -1) throw new Error("Invalid asset cursor.");
            const page = assets.slice(previous + 1, previous + 21);
            result = {
                assets: page.map(asset => ({
                    asset_id: asset.id,
                    url: `/asset/${asset.id}`,
                    type: asset.type,
                    mime_type: asset.mime_type,
                    size_bytes: asset.size_bytes,
                    prompt: asset.prompt,
                    tool_name: asset.tool_name,
                    params: asset.params_json ? JSON.parse(asset.params_json) : null
                })),
                next_cursor: previous + 21 < assets.length ? page.at(-1)?.id : null
            };
        } else if (operation === "messages" || operation === "message") {
            const rows = getMessages(database, sessionId);
            const projected = projectConversation(rows);
            if (operation === "message") {
                const id = integer(input.message_id, -1, 1, Number.MAX_SAFE_INTEGER);
                const index = rows.findIndex(row => row.id === id);
                if (index === -1) throw new Error("Invalid message_id for this session.");
                const text = Array.from(projected[index].content);
                const offset = integer(input.offset, 0, 0, text.length);
                const count = integer(input.max_chars, 16000, 1, 16000);
                result = {
                    message_id: id,
                    offset,
                    text: text.slice(offset, offset + count).join(""),
                    total_chars: text.length,
                    next_offset: offset + count < text.length ? offset + count : null
                };
            } else {
                const before = integer(
                    input.before_id,
                    Number.MAX_SAFE_INTEGER,
                    1,
                    Number.MAX_SAFE_INTEGER
                );
                const eligible = rows.map((row, index) => ({ row, message: projected[index] }))
                    .filter(({ row }) => row.id < before);
                const page = eligible.slice(-20);
                result = {
                    records: page.map(({ row, message }) => ({
                        id: row.id,
                        role: row.role,
                        preview: Array.from(message.content).slice(0, 200).join(""),
                        total_chars: Array.from(message.content).length
                    })),
                    next_before_id: eligible.length > page.length ? page[0]?.row.id : null
                };
            }
        } else {
            throw new Error("Invalid read_conversation operation.");
        }
        const content = JSON.stringify(result);
        assertNoRawAssetDataInMessage(content);
        return { type: "text", content };
    } catch (error) {
        return {
            type: "error",
            content: error instanceof Error && error.message.startsWith("Invalid")
                ? error.message
                : "Conversation context could not be read."
        };
    }
}
