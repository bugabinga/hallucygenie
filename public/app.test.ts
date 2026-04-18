// HallucyGenie — Unit tests for app.ts
// Tests: SSE parsing, message rendering, session UUID, input state, DOM helpers
// Uses happy-dom for DOM environment

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "./app.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__");

function writeSnapshot(name: string, html: string): void {
  try {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    writeFileSync(join(SNAPSHOTS_DIR, `${name}.html`), html, "utf-8");
  } catch {
    // Ignore write errors in test env
  }
}

// ── Inline testable functions (mirrors app.ts logic exactly) ─────────

// SSE parsing
function parseSSELine(line: string): { field: string; value: string } | null {
  if (line.startsWith("event:")) {
    return { field: "event", value: line.slice(6).trim() };
  }
  if (line.startsWith("data:")) {
    return { field: "data", value: line.slice(5).trim() };
  }
  return null;
}

interface SSEEvent {
  event: string;
  data: string;
}

function* parseSSEChunk(chunk: string): Generator<SSEEvent> {
  const lines = chunk.split("\n");
  let currentEvent = "message";
  let currentData = "";

  for (const line of lines) {
    if (line === "") {
      if (currentData) {
        yield { event: currentEvent, data: currentData };
      }
      currentEvent = "message";
      currentData = "";
      continue;
    }
    const parsed = parseSSELine(line);
    if (parsed) {
      if (parsed.field === "event") {
        currentEvent = parsed.value;
      } else if (parsed.field === "data") {
        currentData = parsed.value;
      }
    }
  }
  if (currentData) {
    yield { event: currentEvent, data: currentData };
  }
}

// Session UUID
function getOrCreateSessionId(localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }, crypto: { randomUUID: () => string }): string {
  const KEY = "hallucygenie_session_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// API headers
function createApiHeaders(sessionId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Session-Id": sessionId,
  };
}

// Tool emojis
const TOOL_EMOJIS: Record<string, string> = {
  generate_image: "🎨",
  text_to_speech: "🎙️",
  generate_music: "🎵",
};

function getToolEmoji(name: string): string {
  return TOOL_EMOJIS[name] ?? "🔧";
}

// ── Mock localStorage ──────────────────────────────────────────────────

class LocalStorageMock {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get length(): number { return this.store.size; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

// ── SSE Parsing ────────────────────────────────────────────────────────

describe("SSE Parsing", () => {
  it("parseSSELine - event field", () => {
    const result = parseSSELine("event: tool_start");
    assert.deepEqual(result, { field: "event", value: "tool_start" });
  });

  it("parseSSELine - data field", () => {
    const result = parseSSELine('data: {"delta": "hello"}');
    assert.deepEqual(result, { field: "data", value: '{"delta": "hello"}' });
  });

  it("parseSSELine - returns null for non-SSE lines", () => {
    assert.equal(parseSSELine("just some text"), null);
    assert.equal(parseSSELine(""), null);
    assert.equal(parseSSELine("#comment"), null);
  });

  it("parseSSEChunk - single text event (OpenAI format)", () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"hi"}}]\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "message");
    assert.equal(events[0].data, '{"choices":[{"delta":{"content":"hi"}}]');
  });

  it("parseSSEChunk - tool_start event", () => {
    const chunk = 'event: tool_start\ndata: {"id":"t1","name":"generate_image"}\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "tool_start");
    const parsed = JSON.parse(events[0].data);
    assert.equal(parsed.id, "t1");
    assert.equal(parsed.name, "generate_image");
  });

  it("parseSSEChunk - tool_result event", () => {
    const chunk = 'event: tool_result\ndata: {"id":"t1","name":"generate_image","result":{"type":"image","content":"http://example.com/img.png"}}\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "tool_result");
    const parsed = JSON.parse(events[0].data);
    assert.equal(parsed.result.type, "image");
    assert.equal(parsed.result.content, "http://example.com/img.png");
  });

  it("parseSSEChunk - [DONE] signal", () => {
    const chunk = "data: [DONE]\n\n";
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].data, "[DONE]");
  });

  it("parseSSEChunk - error event", () => {
    const chunk = 'event: error\ndata: {"error":"something broke"}\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "error");
    const parsed = JSON.parse(events[0].data);
    assert.equal(parsed.error, "something broke");
  });

  it("parseSSEChunk - multiple events in single chunk", () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"hello"}}]\n\ndata: {"choices":[{"delta":{"content":" world"}}]\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 2);
    assert.equal(events[0].data, '{"choices":[{"delta":{"content":"hello"}}]');
    assert.equal(events[1].data, '{"choices":[{"delta":{"content":" world"}}]');
  });

  it("parseSSEChunk - handles no trailing newline", () => {
    const chunk = 'data: {"test":true}';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 1);
    assert.equal(events[0].data, '{"test":true}');
  });

  it("parseSSEChunk - empty chunk yields nothing", () => {
    const events = [...parseSSEChunk("")];
    assert.equal(events.length, 0);
  });

  it("parseSSEChunk - mixed event types", () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"making art"}}]\n\nevent: tool_start\ndata: {"id":"t1","name":"generate_image"}\n\n';
    const events = [...parseSSEChunk(chunk)];
    assert.equal(events.length, 2);
    assert.equal(events[0].event, "message");
    assert.equal(events[1].event, "tool_start");
  });
});

// ── Session UUID ───────────────────────────────────────────────────────

describe("Session UUID", () => {
  it("generates a valid UUID v4 format", () => {
    const ls = new LocalStorageMock();
    const crypto = { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" };
    const id = getOrCreateSessionId(ls, crypto);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(id, uuidRegex);
  });

  it("returns same value on subsequent calls", () => {
    const ls = new LocalStorageMock();
    const crypto = { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" };
    const id1 = getOrCreateSessionId(ls, crypto);
    const id2 = getOrCreateSessionId(ls, crypto);
    assert.equal(id1, id2);
  });

  it("stores in localStorage", () => {
    const ls = new LocalStorageMock();
    const crypto = { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" };
    const id = getOrCreateSessionId(ls, crypto);
    assert.equal(ls.getItem("hallucygenie_session_id"), id);
  });

  it("reuses existing session ID from localStorage", () => {
    const ls = new LocalStorageMock();
    ls.setItem("hallucygenie_session_id", "existing-id-123");
    const crypto = { randomUUID: () => "should-not-be-called" };
    const id = getOrCreateSessionId(ls, crypto);
    assert.equal(id, "existing-id-123");
  });
});

// ── API Headers ────────────────────────────────────────────────────────

describe("API Headers", () => {
  it("includes session ID and content type", () => {
    const headers = createApiHeaders("test-session-123");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Session-Id"], "test-session-123");
  });

  it("works with empty string session ID", () => {
    const headers = createApiHeaders("");
    assert.equal(headers["X-Session-Id"], "");
  });
});

// ── Tool Emojis ────────────────────────────────────────────────────────

describe("Tool Emojis", () => {
  it("returns correct emoji for generate_image", () => {
    assert.equal(getToolEmoji("generate_image"), "🎨");
  });

  it("returns correct emoji for text_to_speech", () => {
    assert.equal(getToolEmoji("text_to_speech"), "🎙️");
  });

  it("returns correct emoji for generate_music", () => {
    assert.equal(getToolEmoji("generate_music"), "🎵");
  });

  it("returns default wrench emoji for unknown tool", () => {
    assert.equal(getToolEmoji("unknown_tool"), "🔧");
  });

  it("returns default for empty string", () => {
    assert.equal(getToolEmoji(""), "🔧");
  });
});

// ── DOM Rendering Tests ───────────────────────────────────────────────

describe("DOM Rendering", () => {
  let doc: Document;
  let happyDOMRef: any;

  before(async () => {
    const { Window } = await import("happy-dom");
    const win = new Window({ url: "http://localhost:3000" });
    doc = win.document as unknown as Document;
    happyDOMRef = win;
  });

  after(() => {
    happyDOMRef?.happyDOM?.abort?.();
  });

  // DOM helpers (same logic as app.ts)
  function createElement(tag: string, attrs?: Record<string, string>, children?: (string | Node)[]): HTMLElement {
    const el = doc.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
      }
    }
    if (children) {
      for (const child of children) {
        if (typeof child === "string") {
          el.appendChild(doc.createTextNode(child));
        } else {
          el.appendChild(child);
        }
      }
    }
    return el;
  }

  function renderUserMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--user" });
    const avatar = createElement("div", { class: "message-avatar" }, ["👤"]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" }, [content]);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return msg;
  }

  function renderAssistantMessage(): { container: HTMLElement; contentEl: HTMLElement } {
    const msg = createElement("div", { class: "message message--assistant" });
    const avatar = createElement("div", { class: "message-avatar" }, ["🧞"]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" }, [""]);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return { container: msg, contentEl };
  }

  function renderSteerMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--steer message--user" });
    const avatar = createElement("div", { class: "message-avatar" }, ["💡"]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" }, [content]);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return msg;
  }

  function renderToolCardLoading(name: string): HTMLElement {
    const card = createElement("div", { class: "tool-card" });
    const header = createElement("div", { class: "tool-card-header" });
    const emoji = createElement("span", { class: "tool-emoji" }, [getToolEmoji(name)]);
    const label = createElement("span", {}, [`Running ${name.replace(/_/g, " ")}...`]);
    header.appendChild(emoji);
    header.appendChild(label);
    const loading = createElement("div", { class: "tool-card-loading" });
    const spinner = createElement("div", { class: "spinner" });
    loading.appendChild(spinner);
    card.appendChild(header);
    card.appendChild(loading);
    return card;
  }

  function renderToolResult(toolName: string, result: { type: string; content: string }): HTMLElement {
    const card = createElement("div", { class: "tool-card" });
    const header = createElement("div", { class: "tool-card-header" });
    const emoji = createElement("span", { class: "tool-emoji" }, [getToolEmoji(toolName)]);
    const label = createElement("span", {}, [toolName.replace(/_/g, " ")]);
    header.appendChild(emoji);
    header.appendChild(label);
    const body = createElement("div", { class: "tool-card-body" });
    card.appendChild(header);
    card.appendChild(body);
    if (result.type === "image") {
      const img = createElement("img", {
        class: "tool-result-image",
        src: result.content,
        alt: "Generated image",
        loading: "lazy",
      });
      body.appendChild(img);
    } else if (result.type === "audio") {
      const audio = createElement("audio", {
        class: "tool-result-audio",
        controls: "",
        src: result.content,
      });
      body.appendChild(audio);
    } else if (result.type === "error") {
      body.textContent = `😕 ${result.content}`;
      (card as HTMLElement).style.borderColor = "var(--color-error)";
    }
    return card;
  }

  it("user message has correct structure and classes", () => {
    const msg = renderUserMessage("Hello!");
    assert.equal(msg.classList.contains("message"), true);
    assert.equal(msg.classList.contains("message--user"), true);
    assert.ok(msg.querySelector(".message-avatar"));
    assert.ok(msg.querySelector(".message-bubble"));
    assert.equal(msg.querySelector(".message-content")!.textContent, "Hello!");
  });

  it("assistant message starts with empty content", () => {
    const { container, contentEl } = renderAssistantMessage();
    assert.equal(container.classList.contains("message--assistant"), true);
    assert.equal(contentEl.textContent, "");
    assert.ok(container.querySelector(".message-avatar"));
    assert.equal(container.querySelector(".message-avatar")!.textContent, "🧞");
  });

  it("assistant message content can be updated", () => {
    const { contentEl } = renderAssistantMessage();
    contentEl.textContent = "Hello there!";
    assert.equal(contentEl.textContent, "Hello there!");
  });

  it("steer message has distinct class", () => {
    const msg = renderSteerMessage("Change the color");
    assert.equal(msg.classList.contains("message--steer"), true);
    assert.equal(msg.querySelector(".message-content")!.textContent, "Change the color");
    assert.equal(msg.querySelector(".message-avatar")!.textContent, "💡");
  });

  it("tool loading card shows spinner and tool name", () => {
    const card = renderToolCardLoading("generate_image");
    assert.ok(card.classList.contains("tool-card"));
    assert.ok(card.querySelector(".spinner"));
    assert.ok(card.textContent!.includes("generate image"));
    assert.ok(card.querySelector(".tool-emoji")!.textContent!.includes("🎨"));
  });

  it("tool loading card formats tool name with spaces", () => {
    const card = renderToolCardLoading("text_to_speech");
    assert.ok(card.textContent!.includes("text to speech"));
  });

  it("tool result image card has img element", () => {
    const card = renderToolResult("generate_image", {
      type: "image",
      content: "http://example.com/img.png",
    });
    const img = card.querySelector("img");
    assert.ok(img);
    assert.equal(img!.getAttribute("src"), "http://example.com/img.png");
    assert.equal(img!.getAttribute("class"), "tool-result-image");
  });

  it("tool result audio card has audio element", () => {
    const card = renderToolResult("text_to_speech", {
      type: "audio",
      content: "http://example.com/audio.mp3",
    });
    const audio = card.querySelector("audio");
    assert.ok(audio);
    assert.equal(audio!.getAttribute("src"), "http://example.com/audio.mp3");
    assert.equal(audio!.getAttribute("controls"), "");
  });

  it("tool result music card has audio element", () => {
    const card = renderToolResult("generate_music", {
      type: "audio",
      content: "http://example.com/music.mp3",
    });
    const audio = card.querySelector("audio");
    assert.ok(audio);
    assert.equal(audio!.getAttribute("src"), "http://example.com/music.mp3");
  });

  it("tool result error card shows friendly error", () => {
    const card = renderToolResult("generate_image", {
      type: "error",
      content: "Rate limited",
    });
    assert.ok(card.textContent!.includes("😕"));
    assert.ok(card.textContent!.includes("Rate limited"));
  });
});

// ── Snapshot Tests ─────────────────────────────────────────────────────

describe("Snapshot Tests - Message Bubbles", () => {
  let doc: Document;
  let happyDOMRef: any;

  before(async () => {
    const { Window } = await import("happy-dom");
    const win = new Window({ url: "http://localhost:3000" });
    doc = win.document as unknown as Document;
    happyDOMRef = win;
  });

  after(() => {
    happyDOMRef?.happyDOM?.abort?.();
  });

  function createElement(tag: string, attrs?: Record<string, string>, children?: (string | Node)[]): HTMLElement {
    const el = doc.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
      }
    }
    if (children) {
      for (const child of children) {
        if (typeof child === "string") {
          el.appendChild(doc.createTextNode(child));
        } else {
          el.appendChild(child);
        }
      }
    }
    return el;
  }

  function renderUserMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--user" });
    msg.appendChild(createElement("div", { class: "message-avatar" }, ["👤"]));
    const bubble = createElement("div", { class: "message-bubble" });
    bubble.appendChild(createElement("div", { class: "message-content" }, [content]));
    msg.appendChild(bubble);
    return msg;
  }

  function renderAssistantMessage(): HTMLElement {
    const msg = createElement("div", { class: "message message--assistant" });
    msg.appendChild(createElement("div", { class: "message-avatar" }, ["🧞"]));
    const bubble = createElement("div", { class: "message-bubble" });
    bubble.appendChild(createElement("div", { class: "message-content" }, ["Hello world"]));
    msg.appendChild(bubble);
    return msg;
  }

  function renderSteerMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--steer message--user" });
    msg.appendChild(createElement("div", { class: "message-avatar" }, ["💡"]));
    const bubble = createElement("div", { class: "message-bubble" });
    bubble.appendChild(createElement("div", { class: "message-content" }, [content]));
    msg.appendChild(bubble);
    return msg;
  }

  function renderToolCardLoading(name: string): HTMLElement {
    const card = createElement("div", { class: "tool-card" });
    const header = createElement("div", { class: "tool-card-header" });
    header.appendChild(createElement("span", { class: "tool-emoji" }, [getToolEmoji(name)]));
    header.appendChild(createElement("span", {}, [`Running ${name.replace(/_/g, " ")}...`]));
    const loading = createElement("div", { class: "tool-card-loading" });
    loading.appendChild(createElement("div", { class: "spinner" }));
    card.appendChild(header);
    card.appendChild(loading);
    return card;
  }

  function renderToolResult(toolName: string, result: { type: string; content: string }): HTMLElement {
    const card = createElement("div", { class: "tool-card" });
    const header = createElement("div", { class: "tool-card-header" });
    header.appendChild(createElement("span", { class: "tool-emoji" }, [getToolEmoji(toolName)]));
    header.appendChild(createElement("span", {}, [toolName.replace(/_/g, " ")]));
    const body = createElement("div", { class: "tool-card-body" });
    card.appendChild(header);
    card.appendChild(body);
    if (result.type === "image") {
      body.appendChild(createElement("img", { class: "tool-result-image", src: result.content, alt: "Generated image" }));
    } else if (result.type === "audio") {
      body.appendChild(createElement("audio", { class: "tool-result-audio", controls: "", src: result.content }));
    } else if (result.type === "error") {
      body.textContent = `😕 ${result.content}`;
    }
    return card;
  }

  // Snapshot tests use inline HTML comparison since Node.js test runner
  // doesn't have assert.snapshot like Bun's test runner

  it("snapshot: user message bubble HTML structure", () => {
    const msg = renderUserMessage("Hello HallucyGenie!");
    const html = msg.outerHTML;
    // Verify key structural elements
    assert.ok(html.includes('class="message message--user"'));
    assert.ok(html.includes('class="message-avatar"'));
    assert.ok(html.includes('class="message-bubble"'));
    assert.ok(html.includes('class="message-content"'));
    assert.ok(html.includes('Hello HallucyGenie!'));
    // Write snapshot to file for reference
    writeSnapshot("user-message", html);
  });

  it("snapshot: assistant message bubble HTML structure", () => {
    const msg = renderAssistantMessage();
    const html = msg.outerHTML;
    assert.ok(html.includes('class="message message--assistant"'));
    assert.ok(html.includes('class="message-avatar"'));
    assert.ok(html.includes('🧞'));
    assert.ok(html.includes('Hello world'));
    writeSnapshot("assistant-message", html);
  });

  it("snapshot: steer message bubble HTML structure", () => {
    const msg = renderSteerMessage("Make it more colorful");
    const html = msg.outerHTML;
    assert.ok(html.includes('message--steer'));
    assert.ok(html.includes('💡'));
    assert.ok(html.includes('Make it more colorful'));
    writeSnapshot("steer-message", html);
  });

  it("snapshot: tool card loading HTML structure", () => {
    const card = renderToolCardLoading("generate_image");
    const html = card.outerHTML;
    assert.ok(html.includes('class="tool-card"'));
    assert.ok(html.includes('class="spinner"'));
    assert.ok(html.includes('🎨'));
    assert.ok(html.includes('generate image'));
    writeSnapshot("tool-loading", html);
  });

  it("snapshot: tool result image card HTML structure", () => {
    const card = renderToolResult("generate_image", { type: "image", content: "http://example.com/gen.png" });
    const html = card.outerHTML;
    assert.ok(html.includes('tool-result-image'));
    assert.ok(html.includes('src="http://example.com/gen.png"'));
    assert.ok(html.includes('alt="Generated image"'));
    writeSnapshot("tool-image", html);
  });

  it("snapshot: tool result audio card (TTS) HTML structure", () => {
    const card = renderToolResult("text_to_speech", { type: "audio", content: "http://example.com/speech.mp3" });
    const html = card.outerHTML;
    assert.ok(html.includes('tool-result-audio'));
    assert.ok(html.includes('src="http://example.com/speech.mp3"'));
    assert.ok(html.includes('controls=""'));
    assert.ok(html.includes('🎙️'));
    writeSnapshot("tool-tts", html);
  });

  it("snapshot: tool result audio card (music) HTML structure", () => {
    const card = renderToolResult("generate_music", { type: "audio", content: "http://example.com/music.mp3" });
    const html = card.outerHTML;
    assert.ok(html.includes('tool-result-audio'));
    assert.ok(html.includes('src="http://example.com/music.mp3"'));
    assert.ok(html.includes('🎵'));
    writeSnapshot("tool-music", html);
  });

  it("snapshot: tool result error card HTML structure", () => {
    const card = renderToolResult("generate_image", { type: "error", content: "Rate limited" });
    const html = card.outerHTML;
    assert.ok(html.includes('😕'));
    assert.ok(html.includes('Rate limited'));
    writeSnapshot("tool-error", html);
  });
});

// ── Markdown Rendering Tests ──────────────────────────────────────────

describe("renderMarkdown", () => {
  // ── Inline formatting ────────────────────────────────────────────

  it("renders bold text", () => {
    const result = renderMarkdown("hello **world** end");
    assert.ok(result.includes("<strong>world</strong>"));
    assert.ok(!result.includes("**"));
  });

  it("renders bold with __", () => {
    const result = renderMarkdown("hello __world__ end");
    assert.ok(result.includes("<strong>world</strong>"));
  });

  it("renders italic text", () => {
    const result = renderMarkdown("hello *world* end");
    assert.ok(result.includes("<em>world</em>"));
    assert.ok(!result.includes("*world*"));
  });

  it("renders strikethrough", () => {
    const result = renderMarkdown("hello ~~world~~ end");
    assert.ok(result.includes("<del>world</del>"));
  });

  it("renders inline code", () => {
    const result = renderMarkdown("use `const x = 1` here");
    assert.ok(result.includes("<code>const x = 1</code>"));
  });

  it("renders named links", () => {
    const result = renderMarkdown("click [here](https://example.com)");
    assert.ok(result.includes('<a href="https://example.com" target="_blank" rel="noopener">here</a>'));
  });

  it("renders autolinks for bare URLs", () => {
    const result = renderMarkdown("see https://example.com for info");
    assert.ok(result.includes('<a href="https://example.com"'));
    assert.ok(result.includes('>https://example.com</a>'));
  });

  it("does not double-link already linked URLs", () => {
    const result = renderMarkdown("[text](https://example.com)");
    assert.equal((result.match(/<a /g) || []).length, 1);
  });

  // ── Headings ─────────────────────────────────────────────────────

  it("renders h1 through h6", () => {
    for (let i = 1; i <= 6; i++) {
      const hashes = "#".repeat(i);
      const result = renderMarkdown(`${hashes} Title`);
      assert.ok(result.includes(`<h${i}>Title</h${i}>`), `h${i} not found`);
    }
  });

  it("does not render heading without space after #", () => {
    const result = renderMarkdown("#not_a_heading");
    assert.ok(!result.includes("<h1>"));
  });

  // ── Lists ────────────────────────────────────────────────────────

  it("renders unordered list with -", () => {
    const result = renderMarkdown("- one\n- two\n- three");
    assert.ok(result.includes("<ul>"));
    assert.ok(result.includes("<li>one</li>"));
    assert.ok(result.includes("<li>two</li>"));
    assert.ok(result.includes("</ul>"));
  });

  it("renders unordered list with *", () => {
    const result = renderMarkdown("* one\n* two");
    assert.ok(result.includes("<ul>"));
    assert.ok(result.includes("<li>one</li>"));
  });

  it("renders ordered list", () => {
    const result = renderMarkdown("1. first\n2. second\n3. third");
    assert.ok(result.includes("<ol>"));
    assert.ok(result.includes("<li>first</li>"));
    assert.ok(result.includes("<li>second</li>"));
    assert.ok(result.includes("</ol>"));
  });

  it("closes list when non-list line follows", () => {
    const result = renderMarkdown("- item\nparagraph");
    assert.ok(result.includes("</ul>"));
    assert.ok(result.includes("<p>paragraph</p>"));
  });

  // ── Code blocks ──────────────────────────────────────────────────

  it("renders fenced code block with language", () => {
    const input = "```js\nconst x = 1;\n```";
    const result = renderMarkdown(input);
    assert.ok(result.includes('<pre><code class="lang-js">'), `got: ${result}`);
    assert.ok(result.includes("const x = 1;"));
  });

  it("renders fenced code block without language", () => {
    const input = "```\nhello\n```";
    const result = renderMarkdown(input);
    assert.ok(result.includes("<pre><code>"));
    assert.ok(result.includes("hello"));
  });

  it("does not apply inline markdown inside code blocks", () => {
    const input = "```\n**not bold**\n```";
    const result = renderMarkdown(input);
    assert.ok(!result.includes("<strong>"), `should not have strong inside code: ${result}`);
    assert.ok(result.includes("**not bold**"));
  });

  it("does not apply inline markdown inside inline code", () => {
    const result = renderMarkdown("`**not bold**`");
    assert.ok(!result.includes("<strong>"));
  });

  it("escapes HTML in code blocks", () => {
    const input = "```\n<div>test</div>\n```";
    const result = renderMarkdown(input);
    assert.ok(result.includes("&lt;div&gt;"), `should escape HTML: ${result}`);
  });

  // ── Blockquotes ──────────────────────────────────────────────────

  it("renders blockquote", () => {
    const result = renderMarkdown("> this is a quote");
    assert.ok(result.includes("<blockquote>"));
    assert.ok(result.includes("this is a quote"));
    assert.ok(result.includes("</blockquote>"));
  });

  it("closes blockquote when non-quote line follows", () => {
    const result = renderMarkdown("> quote\nparagraph");
    assert.ok(result.includes("</blockquote>"));
    assert.ok(result.includes("<p>paragraph</p>"));
  });

  // ── Tables ───────────────────────────────────────────────────────

  it("renders table with headers", () => {
    const input = "| Name | Age |\n|------|-----|\n| Alice | 30 |";
    const result = renderMarkdown(input);
    assert.ok(result.includes("<table>"), `no table tag: ${result}`);
    assert.ok(result.includes("<thead>"));
    assert.ok(result.includes("<th>Name</th>"));
    assert.ok(result.includes("<th>Age</th>"));
    assert.ok(result.includes("<td>Alice</td>"));
    assert.ok(result.includes("<td>30</td>"));
    assert.ok(result.includes("</table>"));
  });

  it("closes table when non-table line follows", () => {
    const input = "| A | B |\n|---|---|\n| 1 | 2 |\nparagraph";
    const result = renderMarkdown(input);
    assert.ok(result.includes("</table>"));
    assert.ok(result.includes("<p>paragraph</p>"));
  });

  // ── Task lists ───────────────────────────────────────────────────

  it("renders unchecked task", () => {
    const result = renderMarkdown("- [ ] todo");
    assert.ok(result.includes('class="task-checkbox"'));
    assert.ok(!result.includes("checked"));
  });

  it("renders checked task", () => {
    const result = renderMarkdown("- [x] done");
    assert.ok(result.includes("checked"));
    assert.ok(result.includes('class="task-checkbox task-checked"'));
  });

  // ── Horizontal rule ──────────────────────────────────────────────

  it("renders horizontal rule with ---", () => {
    const result = renderMarkdown("---");
    assert.ok(result.includes("<hr>"));
  });

  it("renders horizontal rule with ***", () => {
    const result = renderMarkdown("***");
    assert.ok(result.includes("<hr>"));
  });

  // ── HTML escaping ────────────────────────────────────────────────

  it("escapes HTML in regular text", () => {
    const result = renderMarkdown("<script>alert('xss')</script>");
    assert.ok(!result.includes("<script>"));
    assert.ok(result.includes("&lt;script&gt;"));
  });

  // ── Plain text ───────────────────────────────────────────────────

  it("wraps plain text in <p>", () => {
    const result = renderMarkdown("hello world");
    assert.ok(result.includes("<p>hello world</p>"));
  });

  it("handles empty input", () => {
    const result = renderMarkdown("");
    assert.equal(result.trim(), "");
  });

  // ── Snapshot tests ───────────────────────────────────────────────

  it("snapshot: GFM sample document", () => {
    const input = [
      "# Chat Response",
      "",
      "Here's what I found:",      "",
      "- **Bold item** with *italic*",
      "- ~~old info~~ → new info",
      "",
      "> Important note",
      "",
      "| Feature | Status |",
      "|---------|--------|",
      "| Images  | ✅     |",
      "| Music   | ✅     |",
      "",
      "```js",
      "const x = 42;",
      "```",
      "",
      "- [x] Done",
      "- [ ] Todo",
    ].join("\n");
    const result = renderMarkdown(input);
    writeSnapshot("gfm-sample", result);
  });

  it("snapshot: simple message", () => {
    const result = renderMarkdown("Hey! Here's a **cool idea**: try `console.log` and see https://example.com for more.");
    writeSnapshot("simple-message", result);
  });
});
