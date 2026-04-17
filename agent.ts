// HallucyGenie — Agent loop utilities
// Full agent loop implementation in HG-004

import type {
  ChatMessage,
  ToolCallAccumulated,
  ToolCallChunk,
} from "./server.ts";

export { accumulateToolCalls, stripThinkingTokens } from "./server.ts";

export interface AgentState {
  messages: ChatMessage[];
  pendingToolCalls: ToolCallAccumulated[];
}

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
