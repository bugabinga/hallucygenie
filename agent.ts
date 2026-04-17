// HallucyGenie — Agent loop and tools
// Full agent loop implementation: streaming, tool execution, event emission

import type {
  ChatMessage,
  ToolCallAccumulated,
  ToolCallChunk,
} from "./server.ts";
import {
  stripThinkingTokens,
  accumulateToolCalls,
} from "./server.ts";
import { executeTool, getToolDefinitions } from "./tools.ts";
import type { ToolResult } from "./tools.ts";

// ── Configuration ────────────────────────────────────────────────────

export const MINIMAX_BASE = "https://api.minimax.io";
export const MINIMAX_MODEL = "MiniMax-M2.7-highspeed";

// ── Types ────────────────────────────────────────────────────────────

export interface AgentEvent {
  type: "text" | "tool_start" | "tool_result" | "done";
  content?: string;
  id?: string;
  name?: string;
  result?: ToolResult;
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
export function addToolResult(
  state: AgentState,
  toolCallId: string,
  content: string
): void {
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

// ── Agent loop ───────────────────────────────────────────────────────

/**
 * Run the agent loop: stream from MiniMax, execute tools, loop until done.
 *
 * @param messages - Initial message history
 * @param apiKey - MiniMax API key
 * @param onEvent - Callback for agent events (text, tool_start, tool_result, done)
 * @returns Final message history including all tool results
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  apiKey: string,
  onEvent: (event: AgentEvent) => void,
  steerQueue?: SteerQueue
): Promise<ChatMessage[]> {
  const localMessages = [...messages];
  const tools = getToolDefinitions();

  while (true) {
    const payload = {
      model: MINIMAX_MODEL,
      messages: localMessages,
      stream: true,
      tools,
    };

    let resp: Response;
    try {
      resp = await fetch(`${MINIMAX_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      onEvent({
        type: "text",
        content: `[Error: Failed to connect to MiniMax API: ${String(err)}]`,
      });
      onEvent({ type: "done" });
      return localMessages;
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      onEvent({
        type: "text",
        content: `[Error: MiniMax API returned ${resp.status}: ${errorText}]`,
      });
      onEvent({ type: "done" });
      return localMessages;
    }

    // Process the SSE stream
    const thinkState = { inThink: false };
    const toolCallAccumulator = new Map<number, ToolCallAccumulated>();
    let textContent = "";
    let finishReason: string | null = null;

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const choices = parsed.choices as
          | Array<{
              delta?: {
                content?: string;
                tool_calls?: ToolCallChunk[];
              };
              finish_reason?: string | null;
            }>
          | undefined;
        if (!choices?.length) continue;

        const choice = choices[0];

        // Handle tool calls — accumulate
        if (choice.delta?.tool_calls) {
          const accumulated = accumulateToolCalls(
            choice.delta.tool_calls,
            toolCallAccumulator
          );

          // Emit tool_start for new tool calls (those with an id)
          for (const tc of choice.delta.tool_calls) {
            if (tc.id) {
              const matchedAcc = accumulated.find(
                (a) => a.id === tc.id
              );
              onEvent({
                type: "tool_start",
                id: tc.id,
                name: matchedAcc?.name ?? tc.function?.name ?? "",
              });
            }
          }
        }

        // Handle content streaming — strip thinking tokens
        if (choice.delta?.content) {
          const cleaned = stripThinkingTokens(
            choice.delta.content,
            thinkState
          );
          if (cleaned) {
            textContent += cleaned;
            onEvent({ type: "text", content: cleaned });
          }
        }

        // Capture finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }

    // Handle finish: if tool_calls, execute them and loop
    if (finishReason === "tool_calls" && toolCallAccumulator.size > 0) {
      // Add assistant message with tool calls to history
      const toolCalls = [...toolCallAccumulator.values()];

      // Fix malformed arguments
      for (const tc of toolCalls) {
        try {
          JSON.parse(tc.arguments);
        } catch {
          tc.arguments = "{}";
        }
      }

      // Add assistant message referencing the tool calls
      localMessages.push({
        role: "assistant",
        content: textContent || "",
      });

      // Execute each tool
      for (const tc of toolCalls) {
        const args = parseToolArguments(tc.arguments);
        const result = await executeTool(tc.name, args, apiKey);

        onEvent({
          type: "tool_result",
          id: tc.id,
          name: tc.name,
          result,
        });

        // Append tool result to messages
        localMessages.push({
          role: "tool",
          content:
            result.type === "error"
              ? `Error: ${result.content}`
              : result.content,
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

    // finish_reason is "stop" or no more tool calls
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
