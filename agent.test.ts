// HallucyGenie — Agent tests
// Uses Node.js test runner

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAgentState,
  addUserMessage,
  addAssistantMessage,
  addToolResult,
  needsToolExecution,
  parseToolArguments,
} from "./agent.ts";

describe("createAgentState", () => {
  it("creates empty state without system prompt", () => {
    const state = createAgentState();
    assert.equal(state.messages.length, 0);
    assert.deepEqual(state.pendingToolCalls, []);
  });

  it("creates state with system prompt", () => {
    const state = createAgentState("You are helpful");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "system");
    assert.equal(state.messages[0].content, "You are helpful");
  });
});

describe("addUserMessage", () => {
  it("adds user message to state", () => {
    const state = createAgentState();
    addUserMessage(state, "Hello!");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "user");
    assert.equal(state.messages[0].content, "Hello!");
  });
});

describe("addAssistantMessage", () => {
  it("adds assistant message to state", () => {
    const state = createAgentState();
    addAssistantMessage(state, "Hi there!");
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "assistant");
    assert.equal(state.messages[0].content, "Hi there!");
  });
});

describe("addToolResult", () => {
  it("adds tool result to state", () => {
    const state = createAgentState();
    addToolResult(state, "call_1", '{"result": "image.png"}');
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, "tool");
    assert.equal(state.messages[0].content, '{"result": "image.png"}');
    assert.equal(state.messages[0].tool_call_id, "call_1");
  });
});

describe("needsToolExecution", () => {
  it("returns true when tool calls exist", () => {
    assert.equal(
      needsToolExecution([
        { id: "call_1", name: "test", arguments: "{}" },
      ]),
      true
    );
  });

  it("returns false when no tool calls", () => {
    assert.equal(needsToolExecution([]), false);
  });
});

describe("parseToolArguments", () => {
  it("parses valid JSON", () => {
    const result = parseToolArguments('{"key": "value"}');
    assert.deepEqual(result, { key: "value" });
  });

  it("returns empty object for invalid JSON", () => {
    const result = parseToolArguments("not json");
    assert.deepEqual(result, {});
  });

  it("returns empty object for empty string", () => {
    const result = parseToolArguments("");
    assert.deepEqual(result, {});
  });

  it("parses complex arguments", () => {
    const result = parseToolArguments('{"prompt": "a cat", "size": 1024}');
    assert.equal(result.prompt, "a cat");
    assert.equal(result.size, 1024);
  });
});

describe("Agent state message flow", () => {
  it("maintains correct message order", () => {
    const state = createAgentState("system prompt");
    addUserMessage(state, "hello");
    addAssistantMessage(state, "hi there");
    addUserMessage(state, "draw a cat");

    assert.equal(state.messages.length, 4);
    assert.equal(state.messages[0].role, "system");
    assert.equal(state.messages[1].role, "user");
    assert.equal(state.messages[2].role, "assistant");
    assert.equal(state.messages[3].role, "user");
  });

  it("handles tool result flow", () => {
    const state = createAgentState();
    addUserMessage(state, "generate image");
    addToolResult(state, "call_1", '{"url": "image.png"}');

    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[0].role, "user");
    assert.equal(state.messages[1].role, "tool");
  });
});
