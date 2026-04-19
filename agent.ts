// HallucyGenie — Agent loop and tools
// Full agent loop implementation: streaming, tool execution, event emission
// Uses Anthropic-compatible API endpoint

import type { ChatMessage } from "./server.ts";
import { executeTool, getToolDefinitions } from "./tools.ts";
import type { ToolResult } from "./tools.ts";

// ── Chat Personality ────────────────────────────────────────────────

/**
 * Chat personality types. Each maps to a different system prompt prefix.
 * Stored in preferences as { personality: "gaming" | "chill" | "funny" }
 */
export type ChatPersonality = "gaming" | "chill" | "funny";

const PERSONALITY_PROMPTS: Record<ChatPersonality, string> = {
    gaming: "You're an enthusiastic gaming buddy who loves talking about games, Minecraft builds, YouTube ideas, and streaming. Get excited about game news and creative ideas!",
    chill: "You're a super chill dude who's relaxed about everything. Keep it casual, use laid-back language, and never stress about anything.",
    funny: "You're a silly, joke-cracking companion who loves puns, dad jokes, and making the kid laugh. Be playful and lighthearted!",
};

// ── System Prompt ────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are HallucyGenie, a creative buddy for an 11-year-old gaming YouTuber.

Rules:
- Be extremely concise. Short sentences. No filler. No "Sure!" or "I'd be happy to help!". Answer directly.
- Feel like a smart friend, not a corporate assistant. No condescending tone — the user is 11, not 5.
- No lectures, no safety warnings, no disclaimers.
- Know gaming (Roblox, Minecraft, Fortnite, etc.), YouTube, video editing, thumbnail design.
- When generating images or music, craft detailed descriptive prompts yourself. Don't ask the user to refine.
- Give creative ideas: thumbnail concepts, video ideas, game tips, channel growth suggestions.`;

/**
 * Build the full system prompt, applying personality prefix and user preferences.
 */
export function buildSystemPrompt(preferences?: Record<string, string>): string {
    const personality = (preferences?.personality as ChatPersonality) ?? "gaming";
    const prefix = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.gaming;

    if (!preferences || Object.keys(preferences).length === 0) {
        return `${prefix}\n\n${SYSTEM_PROMPT}`;
    }
    const prefLines = Object.entries(preferences)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
    return `${prefix}\n\n${SYSTEM_PROMPT}\n\nWhat you know about the user:\n${prefLines}`;
}

// ── Configuration ────────────────────────────────────────────────────

export const MINIMAX_BASE = "https://api.minimax.io";
export const MINIMAX_MODEL = "MiniMax-M2.7-highspeed";

// ── Types ────────────────────────────────────────────────────────────

export interface AgentEvent {
    type: "text" | "thinking" | "tool_start" | "tool_result" | "done";
    content?: string;
    id?: string;
    name?: string;
    result?: ToolResult;
    prompt?: string; // for tool_result: the main prompt field used
}

export interface SteerQueue {
    queue: string[];
}

export function createSteerQueue(): SteerQueue {
    return { queue: [] };
}

export function queueSteer(steerQueue: SteerQueue, message: string): void {
    steerQueue.queue.push(message);
}

export function drainSteer(steerQueue: SteerQueue): string[] {
    const messages = steerQueue.queue;
    steerQueue.queue = [];
    return messages;
}

export interface ToolCallAccumulated {
    id: string;
    name: string;
    arguments: string;
}

export interface AgentState {
    messages: ChatMessage[];
    pendingToolCalls: ToolCallAccumulated[];
}

// ── State management (from previous HG-003) ──────────────────────────

/**
 * Create a new agent state with optional system prompt.
 */
export function createAgentState(systemPrompt?: string): AgentState {
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }
    return { messages, pendingToolCalls: [] };
}

/**
 * Add a user message to the agent state.
 */
export function addUserMessage(state: AgentState, content: string): void {
    state.messages.push({ role: "user", content });
}

/**
 * Add an assistant message to the agent state.
 */
export function addAssistantMessage(state: AgentState, content: string): void {
    state.messages.push({ role: "assistant", content });
}

/**
 * Add a tool result to the agent state.
 */
export function addToolResult(state: AgentState, toolCallId: string, content: string): void {
    state.messages.push({
        role: "tool",
        content,
        tool_call_id: toolCallId,
    });
}

/**
 * Check if the agent needs to execute tools (finish_reason was "tool_calls").
 */
export function needsToolExecution(toolCalls: ToolCallAccumulated[]): boolean {
    return toolCalls.length > 0;
}

/**
 * Parse tool call arguments safely.
 */
export function parseToolArguments(args: string): Record<string, unknown> {
    try {
        return JSON.parse(args) as Record<string, unknown>;
    } catch {
        return {};
    }
}

// ── Anthropic message format conversion ──────────────────────────────

// ── Token estimation & context window ──────────────────────────────

/** Default max tokens for context input (reserve 4,096 for model output out of 204,800).
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;

/** Estimate tokens for a single message using chars/4 heuristic.
 * Images are estimated at ~1200 tokens each.
 */
export function estimateTokens(message: ChatMessage): number {
    let chars = 0;

    // Count content text
    chars += (message.content ?? "").length;

    // Count tool_call_id text
    if (message.tool_call_id) {
        chars += message.tool_call_id.length;
    }

    // Count tool calls: names + input JSON
    if (message.tool_calls) {
        for (const tc of message.tool_calls) {
            chars += tc.name.length;
            chars += JSON.stringify(tc.input).length;
            chars += tc.id.length;
        }
    }

    // Estimate images in content (~1200 tokens each)
    // Tool results with image URLs contain data:image or URL patterns
    const imageMatches = (message.content ?? "").match(/data:image|image_url/g);
    const imageCount = imageMatches ? imageMatches.length : 0;

    return Math.ceil(chars / 4) + imageCount * 1200;
}

/** Build a context window that fits within maxTokens.
 * Walks backward from newest messages, keeps tool_use+tool_result pairs together,
 * and always includes the first system message.
 */
export function buildContext(
    messages: ChatMessage[],
    maxTokens = DEFAULT_MAX_CONTEXT_TOKENS,
): ChatMessage[] {
    if (messages.length === 0) return [];

    // First message is always the system prompt — include it unconditionally
    const systemMsg = messages[0];
    const systemTokens = estimateTokens(systemMsg);

    // If system prompt alone exceeds the limit, return just it
    if (systemTokens >= maxTokens) {
        return [systemMsg];
    }

    const remainingBudget = maxTokens - systemTokens;
    const result: ChatMessage[] = [];
    let usedTokens = 0;

    // Walk backward from newest messages (excluding system prompt at index 0)
    let i = messages.length - 1;
    while (i > 0) {
        const msg = messages[i];
        const msgTokens = estimateTokens(msg);

        // Check if this is a tool result — need to include its paired tool_use
        if (msg.role === "tool" && msg.tool_call_id) {
            // Find the assistant message with the matching tool_use
            let pairedIndex = -1;
            for (let j = i - 1; j > 0; j--) {
                const prev = messages[j];
                if (prev.role === "assistant" && prev.tool_calls) {
                    if (prev.tool_calls.some((tc) => tc.id === msg.tool_call_id)) {
                        pairedIndex = j;
                        break;
                    }
                }
            }

            if (pairedIndex !== -1) {
                // Collect all messages from pairedIndex to i (the full tool turn)
                const turnTokens = messages
                    .slice(pairedIndex, i + 1)
                    .reduce((sum, m) => sum + estimateTokens(m), 0);

                if (usedTokens + turnTokens > remainingBudget) {
                    break; // Would exceed budget — stop here
                }

                // Add the whole turn (we'll reverse at the end)
                for (let k = pairedIndex; k <= i; k++) {
                    result.unshift(messages[k]);
                }
                usedTokens += turnTokens;
                i = pairedIndex - 1;
            } else {
                // Orphan tool result with no matching tool_use — treat as standalone
                if (usedTokens + msgTokens > remainingBudget) break;
                result.unshift(msg);
                usedTokens += msgTokens;
                i--;
            }
        } else if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
            // Assistant with tool_use — find all corresponding tool results
            const toolCallIds = msg.tool_calls.map((tc) => tc.id);

            // Find all tool result messages that follow this assistant message
            const toolResultIndices: number[] = [];
            for (let j = i + 1; j < messages.length; j++) {
                if (
                    messages[j].role === "tool" &&
                    toolCallIds.includes(messages[j].tool_call_id ?? "")
                ) {
                    toolResultIndices.push(j);
                }
            }

            // Calculate tokens for the full turn (assistant + tool results)
            const turnMessages = [msg, ...toolResultIndices.map((idx) => messages[idx])];
            const turnTokens = turnMessages.reduce((sum, m) => sum + estimateTokens(m), 0);

            if (usedTokens + turnTokens > remainingBudget) break;

            // Add assistant message + tool results in order
            result.unshift(msg, ...toolResultIndices.map((idx) => messages[idx]));
            usedTokens += turnTokens;
            i--;
        } else {
            // Regular message (user, assistant text-only, etc.)
            if (usedTokens + msgTokens > remainingBudget) break;
            result.unshift(msg);
            usedTokens += msgTokens;
            i--;
        }
    }

    // Always prepend the system message
    return [systemMsg, ...result];
}

interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

interface AnthropicToolCall {
    id: string;
    name: string;
    input: string; // accumulated JSON string
}

/**
 * Convert internal ChatMessage[] to Anthropic API format.
 * Extracts system messages, converts tool messages to tool_result blocks,
 * and groups consecutive tool results into a single user message.
 */
export function toAnthropicPayload(
    messages: ChatMessage[],
    tools: AnthropicTool[],
): Record<string, unknown> {
    const system: Array<{ type: string; text: string; cache_control?: { type: string } }> = [];
    const anthropicMessages: Array<{
        role: string;
        content: string | Array<Record<string, unknown>>;
    }> = [];

    for (const msg of messages) {
        if (msg.role === "system") {
            system.push({ type: "text", text: msg.content, cache_control: { type: "ephemeral" } });
        } else if (msg.role === "user") {
            anthropicMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
            const content: Array<Record<string, unknown>> = [];
            if (msg.content) {
                content.push({ type: "text", text: msg.content });
            }
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                    content.push({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.name,
                        input: tc.input,
                    });
                }
            }
            if (content.length === 0) {
                content.push({ type: "text", text: "" });
            }
            anthropicMessages.push({ role: "assistant", content });
        } else if (msg.role === "tool") {
            const toolResult = {
                type: "tool_result",
                tool_use_id: msg.tool_call_id,
                content: msg.content,
            };
            // Group consecutive tool results into one user message
            const lastMsg = anthropicMessages[anthropicMessages.length - 1];
            if (
                lastMsg &&
                lastMsg.role === "user" &&
                Array.isArray(lastMsg.content) &&
                lastMsg.content.some((c) => c.type === "tool_result")
            ) {
                (lastMsg.content as Array<Record<string, unknown>>).push(toolResult);
            } else {
                anthropicMessages.push({
                    role: "user",
                    content: [toolResult],
                });
            }
        }
    }

    // Add cache_control to last tool for prompt caching
    const cachedTools = tools.map((t, i) =>
        i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
    );

    const payload: Record<string, unknown> = {
        model: MINIMAX_MODEL,
        max_tokens: 4096,
        messages: anthropicMessages,
        tools: cachedTools,
        stream: true,
    };
    if (system.length > 0) {
        payload.system = system;
    }
    return payload;
}

// ── Agent loop ───────────────────────────────────────────────────────

/**
 * Run the agent loop: stream from Anthropic-compatible endpoint,
 * execute tools, loop until done.
 *
 * @param messages - Initial message history
 * @param apiKey - MiniMax API key
 * @param onEvent - Callback for agent events (text, thinking, tool_start, tool_result, done)
 * @returns Final message history including all tool results
 */
export async function runAgentLoop(
    messages: ChatMessage[],
    apiKey: string,
    onEvent: (event: AgentEvent) => void,
    steerQueue?: SteerQueue,
): Promise<ChatMessage[]> {
    const localMessages = [...messages];
    const tools = getToolDefinitions() as unknown as AnthropicTool[];

    while (true) {
        const payload = toAnthropicPayload(localMessages, tools);

        let resp: Response;
        try {
            resp = await fetch(`${MINIMAX_BASE}/anthropic/v1/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            onEvent({
                type: "text",
                content: `[Error: Failed to connect to API: ${String(err)}]`,
            });
            onEvent({ type: "done" });
            return localMessages;
        }

        if (!resp.ok) {
            const errorText = await resp.text();
            onEvent({
                type: "text",
                content: `[Error: API returned ${resp.status}: ${errorText}]`,
            });
            onEvent({ type: "done" });
            return localMessages;
        }

        // Process the Anthropic SSE stream
        let textContent = "";
        let stopReason: string | null = null;
        const toolCalls = new Map<number, AnthropicToolCall>();
        let currentBlockType: "thinking" | "text" | "tool_use" | null = null;
        let currentBlockIndex = -1;

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEventType = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue;

                // Parse SSE event type
                if (trimmed.startsWith("event:")) {
                    currentEventType = trimmed.slice(6).trim();
                    continue;
                }

                // Parse SSE data
                if (!trimmed.startsWith("data:")) continue;

                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;

                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    continue;
                }

                // Handle content_block_start
                if (currentEventType === "content_block_start") {
                    const contentBlock = parsed.content_block as
                        | Record<string, unknown>
                        | undefined;
                    if (contentBlock) {
                        currentBlockType = contentBlock.type as "thinking" | "text" | "tool_use";
                        currentBlockIndex = parsed.index as number;

                        if (currentBlockType === "tool_use") {
                            const id = (contentBlock.id as string) || "";
                            const name = (contentBlock.name as string) || "";
                            toolCalls.set(currentBlockIndex, { id, name, input: "" });
                        }
                    }
                    continue;
                }

                // Handle content_block_delta
                if (currentEventType === "content_block_delta") {
                    const delta = parsed.delta as Record<string, unknown> | undefined;
                    if (!delta) continue;

                    const deltaType = delta.type as string;

                    if (deltaType === "thinking_delta") {
                        const thinking = (delta.thinking as string) || "";
                        if (thinking) {
                            onEvent({ type: "thinking", content: thinking });
                        }
                    } else if (deltaType === "text_delta") {
                        const text = (delta.text as string) || "";
                        if (text) {
                            textContent += text;
                            onEvent({ type: "text", content: text });
                        }
                    } else if (deltaType === "input_json_delta") {
                        const partialJson = (delta.partial_json as string) || "";
                        const idx = parsed.index as number;
                        const tc = toolCalls.get(idx);
                        if (tc) {
                            tc.input += partialJson;
                        }
                    }
                    continue;
                }

                // Handle content_block_stop
                if (currentEventType === "content_block_stop") {
                    currentBlockType = null;
                    continue;
                }

                // Handle message_delta (contains stop_reason)
                if (currentEventType === "message_delta") {
                    const delta = parsed.delta as Record<string, unknown> | undefined;
                    if (delta?.stop_reason) {
                        stopReason = delta.stop_reason as string;
                    }
                    continue;
                }

                // message_start and message_stop — no special handling needed
            }
        }

        // Handle finish: if tool_use, execute tools and loop
        if (stopReason === "tool_use" && toolCalls.size > 0) {
            const calls = [...toolCalls.values()];

            // Fix malformed JSON arguments
            for (const tc of calls) {
                if (!tc.input) {
                    tc.input = "{}";
                } else {
                    try {
                        JSON.parse(tc.input);
                    } catch {
                        tc.input = "{}";
                    }
                }
            }

            // Add assistant message with tool_use content blocks
            localMessages.push({
                role: "assistant",
                content: textContent || "",
                tool_calls: calls.map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    input: parseToolArguments(tc.input),
                })),
            });

            // Execute each tool
            for (const tc of calls) {
                const args = parseToolArguments(tc.input);

                onEvent({
                    type: "tool_start",
                    id: tc.id,
                    name: tc.name,
                });

                const result = await executeTool(tc.name, args, apiKey);

                onEvent({
                    type: "tool_result",
                    id: tc.id,
                    name: tc.name,
                    result,
                    prompt:
                        (args.prompt as string | undefined) ??
                        (args.text as string | undefined) ??
                        (args.topic as string | undefined),
                });

                // Append tool result to messages
                localMessages.push({
                    role: "tool",
                    content: result.type === "error" ? `Error: ${result.content}` : result.content,
                    tool_call_id: tc.id,
                });
            }

            // Check for steer messages at turn boundary
            if (steerQueue) {
                const steerMessages = drainSteer(steerQueue);
                if (steerMessages.length > 0) {
                    for (const msg of steerMessages) {
                        localMessages.push({ role: "user", content: msg });
                    }
                }
            }

            // Continue loop — model sees tool results (and any steer messages)
            continue;
        }

        // stop_reason is "end_turn" or no more tool calls
        // Check for steer messages at text turn boundary
        if (steerQueue) {
            const steerMessages = drainSteer(steerQueue);
            if (steerMessages.length > 0) {
                if (textContent) {
                    localMessages.push({
                        role: "assistant",
                        content: textContent,
                    });
                }
                for (const msg of steerMessages) {
                    localMessages.push({ role: "user", content: msg });
                }
                continue;
            }
        }

        if (textContent) {
            localMessages.push({
                role: "assistant",
                content: textContent,
            });
        }

        onEvent({ type: "done" });
        return localMessages;
    }
}
