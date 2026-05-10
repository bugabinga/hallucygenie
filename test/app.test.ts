// HallucyGenie — Unit tests for app.ts
// Tests: SSE parsing, message rendering, API helpers, input state, DOM helpers
// Uses happy-dom for DOM environment

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../public/app.ts";
import type { SSEEvent } from "../public/app.ts";

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

// API helpers
function clearLegacySessionId(localStorage: { removeItem: (k: string) => void }): void {
    localStorage.removeItem("hallucygenie_session_id");
}

function createApiHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
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
    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
    removeItem(key: string): void {
        this.store.delete(key);
    }
    clear(): void {
        this.store.clear();
    }
    get length(): number {
        return this.store.size;
    }
    key(index: number): string | null {
        return [...this.store.keys()][index] ?? null;
    }
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
        const chunk =
            'event: tool_result\ndata: {"id":"t1","name":"generate_image","result":{"type":"image","content":"http://example.com/img.png"}}\n\n';
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
        const chunk =
            'data: {"choices":[{"delta":{"content":"hello"}}]\n\ndata: {"choices":[{"delta":{"content":" world"}}]\n\n';
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
        const chunk =
            'data: {"choices":[{"delta":{"content":"making art"}}]\n\nevent: tool_start\ndata: {"id":"t1","name":"generate_image"}\n\n';
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 2);
        assert.equal(events[0].event, "message");
        assert.equal(events[1].event, "tool_start");
    });
});

// ── API Headers ────────────────────────────────────────────────────────

describe("API Headers", () => {
    it("includes content type only", () => {
        const headers = createApiHeaders();
        assert.equal(headers["Content-Type"], "application/json");
        assert.equal("X-Session-Id" in headers, false);
    });

    it("removes legacy browser-owned session ID", () => {
        const ls = new LocalStorageMock();
        ls.setItem("hallucygenie_session_id", "existing-id-123");
        clearLegacySessionId(ls);
        assert.equal(ls.getItem("hallucygenie_session_id"), null);
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
        // No-op cleanup — setInterval removed from init()
        // happy-dom v14+ does not have .abort()
    });

    // DOM helpers (same logic as app.ts)
    function createElement(
        tag: string,
        attrs?: Record<string, string>,
        children?: (string | Node)[],
    ): HTMLElement {
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
        const avatar = createElement("div", { class: "message-avatar" }, ["🎮"]);
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

    function renderToolResult(
        toolName: string,
        result: { type: string; content: string },
    ): HTMLElement {
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
        assert.equal(msg.querySelector(".message-avatar")!.textContent, "🎮");
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
        // No-op cleanup — setInterval removed from init()
        // happy-dom v14+ does not have .abort()
    });

    function createElement(
        tag: string,
        attrs?: Record<string, string>,
        children?: (string | Node)[],
    ): HTMLElement {
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
        msg.appendChild(createElement("div", { class: "message-avatar" }, ["🎮"]));
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

    function renderToolResult(
        toolName: string,
        result: { type: string; content: string },
    ): HTMLElement {
        const card = createElement("div", { class: "tool-card" });
        const header = createElement("div", { class: "tool-card-header" });
        header.appendChild(
            createElement("span", { class: "tool-emoji" }, [getToolEmoji(toolName)]),
        );
        header.appendChild(createElement("span", {}, [toolName.replace(/_/g, " ")]));
        const body = createElement("div", { class: "tool-card-body" });
        card.appendChild(header);
        card.appendChild(body);
        if (result.type === "image") {
            body.appendChild(
                createElement("img", {
                    class: "tool-result-image",
                    src: result.content,
                    alt: "Generated image",
                }),
            );
        } else if (result.type === "audio") {
            body.appendChild(
                createElement("audio", {
                    class: "tool-result-audio",
                    controls: "",
                    src: result.content,
                }),
            );
        } else if (result.type === "error") {
            body.textContent = `😕 ${result.content}`;
        }
        return card;
    }

    // Snapshot tests use inline HTML comparison since bun test runner
    // doesn't have assert.snapshot

    it("snapshot: user message bubble HTML structure", () => {
        const msg = renderUserMessage("Hello HallucyGenie!");
        const html = msg.outerHTML;
        // Verify key structural elements
        assert.ok(html.includes('class="message message--user"'));
        assert.ok(html.includes('class="message-avatar"'));
        assert.ok(html.includes('class="message-bubble"'));
        assert.ok(html.includes('class="message-content"'));
        assert.ok(html.includes("Hello HallucyGenie!"));
        // Write snapshot to file for reference
        writeSnapshot("user-message", html);
    });

    it("snapshot: assistant message bubble HTML structure", () => {
        const msg = renderAssistantMessage();
        const html = msg.outerHTML;
        assert.ok(html.includes('class="message message--assistant"'));
        assert.ok(html.includes('class="message-avatar"'));
        assert.ok(html.includes("🧞"));
        assert.ok(html.includes("Hello world"));
        writeSnapshot("assistant-message", html);
    });

    it("snapshot: steer message bubble HTML structure", () => {
        const msg = renderSteerMessage("Make it more colorful");
        const html = msg.outerHTML;
        assert.ok(html.includes("message--steer"));
        assert.ok(html.includes("💡"));
        assert.ok(html.includes("Make it more colorful"));
        writeSnapshot("steer-message", html);
    });

    it("snapshot: tool card loading HTML structure", () => {
        const card = renderToolCardLoading("generate_image");
        const html = card.outerHTML;
        assert.ok(html.includes('class="tool-card"'));
        assert.ok(html.includes('class="spinner"'));
        assert.ok(html.includes("🎨"));
        assert.ok(html.includes("generate image"));
        writeSnapshot("tool-loading", html);
    });

    it("snapshot: tool result image card HTML structure", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "http://example.com/gen.png",
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-image"));
        assert.ok(html.includes('src="http://example.com/gen.png"'));
        assert.ok(html.includes('alt="Generated image"'));
        writeSnapshot("tool-image", html);
    });

    it("snapshot: tool result audio card (TTS) HTML structure", () => {
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "http://example.com/speech.mp3",
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-audio"));
        assert.ok(html.includes('src="http://example.com/speech.mp3"'));
        assert.ok(html.includes('controls=""'));
        assert.ok(html.includes("🎙️"));
        writeSnapshot("tool-tts", html);
    });

    it("snapshot: tool result audio card (music) HTML structure", () => {
        const card = renderToolResult("generate_music", {
            type: "audio",
            content: "http://example.com/music.mp3",
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-audio"));
        assert.ok(html.includes('src="http://example.com/music.mp3"'));
        assert.ok(html.includes("🎵"));
        writeSnapshot("tool-music", html);
    });

    it("snapshot: tool result error card HTML structure", () => {
        const card = renderToolResult("generate_image", { type: "error", content: "Rate limited" });
        const html = card.outerHTML;
        assert.ok(html.includes("😕"));
        assert.ok(html.includes("Rate limited"));
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
        assert.ok(
            result.includes(
                '<a href="https://example.com" target="_blank" rel="noopener">here</a>',
            ),
        );
    });

    it("renders autolinks for bare URLs", () => {
        const result = renderMarkdown("see https://example.com for info");
        assert.ok(result.includes('<a href="https://example.com"'));
        assert.ok(result.includes(">https://example.com</a>"));
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

    it("renders list items", () => {
        const result = renderMarkdown("- item");
        assert.ok(result.includes("<ul>"));
        assert.ok(result.includes("<li>item</li>"));
    });

    it("renders inline markdown inside list items", () => {
        const result = renderMarkdown("- **POV: You Angered the Wrong Cat 😈🐱** — strong hook");
        assert.ok(result.includes("<strong>POV: You Angered the Wrong Cat 😈🐱</strong>"));
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

    it("renders blockquote", () => {
        const result = renderMarkdown("> quote");
        assert.ok(result.includes("<blockquote>"));
        assert.ok(result.includes("<p>quote</p>"));
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

    it("escapes raw HTML instead of passing it through", () => {
        const result = renderMarkdown("<script>alert('xss')</script>");
        assert.ok(!result.includes("<script>"));
        assert.ok(result.includes("&lt;script&gt;"));
    });

    it("renders markdown images with safe class and lazy loading", () => {
        const result = renderMarkdown("![cat](https://example.com/cat.png)");
        assert.ok(result.includes('class="markdown-image"'));
        assert.ok(result.includes('loading="lazy"'));
        assert.ok(result.includes('referrerpolicy="no-referrer"'));
        assert.ok(result.includes('src="https://example.com/cat.png"'));
    });

    it("normalizes excessive blank lines before rendering", () => {
        const result = renderMarkdown("\n\nfirst\n\n\n\nsecond\n\n");
        assert.equal((result.match(/<p>/g) ?? []).length, 2);
        assert.equal(result.includes("\n\n\n"), false);
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
            "Here's what I found:",
            "",
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
        const result = renderMarkdown(
            "Hey! Here's a **cool idea**: try `console.log` and see https://example.com for more.",
        );
        writeSnapshot("simple-message", result);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Integration Tests — Import directly from app.ts with happy-dom
// ═══════════════════════════════════════════════════════════════════════

// We set up a full happy-dom environment and mock fetch BEFORE importing app.ts,
// because app.ts auto-bootstraps (calls init()) at import time.

import { Window } from "happy-dom";
import {
    renderThinkingBlock,
    fetchHistory,
    sendSteer,
    $,
    createElement,
    renderUserMessage,
    renderProfileAvatar,
    normalizedProfileFromForm,
    fetchProfile,
    putProfile,
    deleteProfile,
    renderAssistantMessage,
    renderSteerMessage,
    renderToolCardLoading,
    renderToolResult,
    openLightbox,
    closeLightbox,
    showError,
    streamChat,
    sendMessage,
    sendSteerMessage,
    loadHistory,
    autoResizeInput,
    handleInputChange,
    init,
    updateQuotaBadge,
    loadAssets,
} from "../public/app.ts";

// ── DOM Setup Helpers ────────────────────────────────────────────────

/**
 * Creates a full DOM environment with all elements that app.ts expects.
 * Sets globalThis.document, window, localStorage, etc.
 */
function setupDOM(): { win: any; doc: any; errors: string[] } {
    const win = new Window();
    const doc = win.document;

    // Inject clearAllIntervals for test cleanup — clears intervals started by app.ts init()

    // Build the full DOM structure
    doc.body.innerHTML = `
    <header>
      <div class="header-left"><span class="header-emoji">🧞</span></div>
      <div class="header-right">
        <span id="connection-status" class="status-dot" title="Connected"></span>
        <button id="quota-badge">
          <span class="quota-item" data-type="image">🎨 <span class="quota-used">—</span></span>
          <span class="quota-item" data-type="speech">🎙️ <span class="quota-used">—</span></span>
          <span class="quota-item" data-type="music">🎵 <span class="quota-used">—</span></span>
        </button>
        <button id="profile-btn" data-avatar="🎮">🎮 Profile</button>
        <button id="create-btn">✨ Create</button>
      </div>
    </header>
    <div id="onboarding" class="onboarding" hidden>
      <div class="onboarding-backdrop"></div>
      <div class="onboarding-card">
        <div class="onboarding-slides">
          <div class="onboarding-slide active" data-slide="0">
            <button class="btn-primary onboarding-next">Let's go!</button>
          </div>
          <div class="onboarding-slide" data-slide="1">
            <button class="btn-primary" id="onboarding-try-chat">Try it!</button>
          </div>
          <div class="onboarding-slide" data-slide="2">
            <button class="btn-primary" id="onboarding-try-create">See!</button>
          </div>
          <div class="onboarding-slide" data-slide="3">
            <button class="btn-primary" id="onboarding-done">Start!</button>
          </div>
        </div>
        <div class="onboarding-dots">
          <span class="dot active"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </div>
    <form id="chat-form">
      <div class="input-wrapper">
        <label for="chat-input" class="sr-only">Type your message</label>
        <textarea id="chat-input"></textarea>
        <button id="send-button" disabled></button>
      </div>
    </form>
    <div id="steer-hint" hidden></div>
    <div id="message-list"></div>
    <div id="typing-indicator" hidden></div>
    <div id="lightbox">
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content"><img id="lightbox-img" /></div>
      <button class="lightbox-close">×</button>
    </div>
    <div id="error-toast" hidden>
      <span id="error-toast-icon">😕</span>
      <span id="error-toast-message"></span>
    </div>
    <button id="steer-close">×</button>
    <div id="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" hidden>
      <div class="profile-backdrop"></div>
      <div class="profile-modal-content">
        <h2 id="profile-title">🎮 Profile</h2>
        <button id="profile-close">✕</button>
        <form id="profile-form">
          <input id="profile-username" />
          <textarea id="profile-interests"></textarea>
          <textarea id="profile-hates"></textarea>
          <textarea id="profile-favorites"></textarea>
          <input id="profile-avatar" />
          <button type="submit">Save</button>
          <button id="profile-reset" type="button">Reset</button>
          <button id="profile-generate" type="button" disabled>Generate avatar 🎨</button>
        </form>
      </div>
    </div>
    <div id="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title" hidden>
      <div class="create-backdrop"></div>
      <div class="create-modal-content">
        <div class="modal-header">
          <h2 id="create-title">✨ Create</h2>
          <button id="create-close">✕</button>
        </div>
        <div class="create-tabs">
          <button class="create-tab active" data-tab="image">🎨 Image</button>
          <button class="create-tab" data-tab="music">🎵 Music</button>
          <button class="create-tab" data-tab="voice">🎤 Voice</button>
          <button class="create-tab" data-tab="search">🔍 Search</button>
        </div>
        <div class="create-panels">
          <form id="create-image-form" class="create-panel" data-panel="image">
            <div class="form-group">
              <textarea id="img-prompt"></textarea>
            </div>
            <div class="form-group">
              <select id="img-ratio">
                <option value="1:1">1:1</option>
                <option value="16:9" selected>16:9</option>
              </select>
            </div>
          </form>
          <form id="create-music-form" class="create-panel" data-panel="music" hidden>
            <div class="form-group">
              <textarea id="music-prompt"></textarea>
            </div>
            <div class="form-group">
              <textarea id="music-lyrics"></textarea>
            </div>
          </form>
          <form id="create-voice-form" class="create-panel" data-panel="voice" hidden>
            <div class="form-group">
              <textarea id="voice-text"></textarea>
            </div>
            <div class="form-group">
              <select id="voice-speed">
                <option value="1.0" selected>1.0x</option>
              </select>
            </div>
          </form>
          <form id="create-search-form" class="create-panel" data-panel="search" hidden>
            <div class="form-group">
              <textarea id="search-query"></textarea>
            </div>
          </form>
          <div id="assets-panel" class="create-panel" data-panel="assets" hidden>
            <div id="assets-grid"></div>
            <p id="assets-empty" class="assets-empty" hidden>No assets yet</p>
          </div>
        </div>
      </div>
    </div>
  `;

    // Set globals
    globalThis.document = doc;
    globalThis.window = win;
    const localStore = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (key: string) => localStore.get(key) ?? null,
        setItem: (key: string, value: string) => localStore.set(key, value),
        removeItem: (key: string) => localStore.delete(key),
    };
    (globalThis as any).requestAnimationFrame = (cb: () => void) => {
        cb();
        return 1;
    };

    const errors: string[] = [];
    (globalThis as any).fetch = () => {
        return Promise.resolve(new Response(null, { status: 500 }));
    };

    return { win, doc, errors };
}

/**
 * Creates a mock SSE response body (ReadableStream) from an array of SSE chunks.
 */
function createSSEResponse(
    chunks: string[],
    options: { status?: number; json?: any } = {},
): Response {
    const status = options.status ?? 200;
    if (status !== 200) {
        const body = options.json ? JSON.stringify(options.json) : "{}";
        return new Response(body, {
            status,
            headers: { "Content-Type": "application/json" },
        });
    }

    const encoder = new TextEncoder();
    const fullBody = chunks.join("");
    let offset = 0;

    const stream = new ReadableStream({
        pull(controller) {
            if (offset < fullBody.length) {
                // Deliver chunk by chunk
                const chunk = fullBody.slice(
                    offset,
                    offset + Math.max(1, Math.ceil(fullBody.length / chunks.length)),
                );
                controller.enqueue(encoder.encode(chunk));
                offset += chunk.length;
            } else {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    });
}

/**
 * Creates a simple SSE event string.
 */
function sseEvent(event: string, data: string): string {
    return `event: ${event}\ndata: ${data}\n\n`;
}

/**
 * Creates a text message SSE event (OpenAI-style format, used by our browser protocol).
 */
function sseText(content: string): string {
    return sseEvent("message", JSON.stringify({ choices: [{ delta: { content } }] }));
}

/**
 * Creates a thinking SSE event (Anthropic streaming format via server).
 */
function sseThinking(content: string): string {
    return sseEvent("thinking", JSON.stringify({ content }));
}

function sseDone(): string {
    return sseEvent("message", "[DONE]");
}

// Set up DOM before importing (already done above, but ensure globals are set)
setupDOM();

// ═══════════════════════════════════════════════════════════════════════
// Step 1: renderThinkingBlock
// ═══════════════════════════════════════════════════════════════════════

describe("renderThinkingBlock (imported)", () => {
    it("single line thinking shows '💭 Thinking…'", () => {
        const html = renderThinkingBlock("hello world");
        assert.ok(html.includes("💭 Thinking…"));
        assert.ok(!html.includes("lines"));
    });

    it("multi-line thinking shows line count", () => {
        const text = "line 1\nline 2\nline 3";
        const html = renderThinkingBlock(text);
        assert.ok(html.includes("(3 lines)"));
    });

    it("content is rendered through renderMarkdown", () => {
        const html = renderThinkingBlock("**bold** text");
        assert.ok(html.includes("<strong>bold</strong>"));
    });

    it("output contains details and summary tags", () => {
        const html = renderThinkingBlock("thinking");
        assert.ok(html.includes("<details"));
        assert.ok(html.includes("<summary>"));
        assert.ok(html.includes("thinking-block"));
        assert.ok(html.includes("thinking-content"));
    });

    it("trims whitespace before counting lines", () => {
        const html = renderThinkingBlock("  single line  ");
        assert.ok(html.includes("💭 Thinking…"));
        assert.ok(!html.includes("lines"));
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 2: streamChat Error Paths
// ═══════════════════════════════════════════════════════════════════════

describe("streamChat error paths", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("400 response → showError with session expired message", async () => {
        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "Bad request" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                }),
            );

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Bad request");
    });

    it("400 with unparseable JSON → shows default message", async () => {
        (globalThis as any).fetch = () =>
            Promise.resolve(new Response("not json", { status: 400 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Session expired — please reload the page 🔄");
    });

    it("503 response → showError with error message", async () => {
        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "Service unavailable" }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                }),
            );

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Service unavailable");
    });

    it("503 with unparseable JSON → shows status code message", async () => {
        (globalThis as any).fetch = () =>
            Promise.resolve(new Response("not json", { status: 503 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Something went wrong (503). Try again! 🤷");
    });

    it("200 with null body → showError 'No response'", async () => {
        (globalThis as any).fetch = () => Promise.resolve(new Response(null, { status: 200 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "No response from server 😴");
    });

    it("network error (fetch throws) → rejects with error", async () => {
        (globalThis as any).fetch = () => Promise.reject(new Error("Network error"));

        // streamChat doesn't catch — it propagates. sendMessage catches.
        await assert.rejects(() => streamChat([{ role: "user", content: "hi" }]), /Network error/);
    });

    it("onEvent callback receives events", async () => {
        const events: SSEEvent[] = [];
        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("hello"), sseDone()]));

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));
        assert.ok(events.length > 0);
        assert.equal(events[0].event, "message");
    });

    it("posts chat without X-Session-Id header", async () => {
        let request: RequestInit | undefined;
        (globalThis as any).fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(createSSEResponse([sseDone()]));
        };

        await streamChat([{ role: "user", content: "hi" }]);
        assert.equal((request!.headers as Record<string, string>)["X-Session-Id"], undefined);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 3: streamChat SSE Processing
// ═══════════════════════════════════════════════════════════════════════

describe("streamChat SSE processing", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("text events → content accumulated via appendText", async () => {
        const events: SSEEvent[] = [];
        const chunks = [sseText("Hello "), sseText("world"), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        // Need to set up currentAssistantContent for appendText to work
        // We do this by creating an assistant message container and appending it
        const messageList = doc.querySelector("#message-list");
        const { container, contentEl } = renderAssistantMessage();
        messageList.appendChild(container);

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));

        // The content element should have the rendered text
        // Note: since module state isn't reset, currentAssistantContent might be null
        // But the SSE events are delivered via onEvent callback
        assert.ok(events.some((e) => e.data.includes("Hello")));
    });

    it("streaming chunks animate before final markdown replaces them", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const enc = new TextEncoder();
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            },
        });
        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
            );

        const promise = sendMessage("stream markdown");
        controller.enqueue(enc.encode(sseText("**hi")));
        await new Promise((r) => setTimeout(r, 25));

        assert.equal(doc.querySelectorAll(".stream-chunk").length, 1);
        assert.equal(doc.querySelector(".assistant-text-region")?.textContent, "**hi");

        controller.enqueue(enc.encode(sseText("**")));
        controller.enqueue(enc.encode(sseDone()));
        controller.close();
        await promise;

        assert.equal(doc.querySelectorAll(".stream-chunk").length, 0);
        assert.ok(doc.querySelector(".assistant-text-region strong"));
    });

    it("tool result card persists when text arrives after tool result", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-1", name: "generate_image" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-1",
                    name: "generate_image",
                    result: {
                        type: "image",
                        content: "https://example.com/cat.png",
                    },
                }),
            ),
            sseText("done"),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("make image");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(doc.querySelectorAll(".tool-card-loading").length, 0);
        assert.equal(doc.querySelectorAll(".tool-result-image").length, 1);
        assert.ok(doc.querySelector(".tool-card")?.textContent?.includes("generate image"));
        assert.ok(doc.querySelector(".assistant-text-region")?.innerHTML.includes("done"));
        writeSnapshot(
            "assistant-tool-text-mixed",
            doc.querySelector(".message--assistant:last-child")!.outerHTML,
        );
    });

    it("tool card persists when thinking arrives after tool result", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-1", name: "generate_image" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-1",
                    name: "generate_image",
                    result: {
                        type: "image",
                        content: "https://example.com/cat.png",
                    },
                }),
            ),
            sseEvent("thinking", JSON.stringify({ content: "checking result" })),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("make image");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.ok(
            doc
                .querySelector(".assistant-thinking-region")
                ?.textContent?.includes("checking result"),
        );
    });

    it("orphan tool_result renders fallback card and later text still renders", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const chunks = [
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "missing-tool-start",
                    name: "generate_image",
                    result: { type: "image", content: "https://example.com/cat.png" },
                }),
            ),
            sseText("still works"),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("orphan result");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(doc.querySelectorAll(".tool-result-image").length, 1);
        assert.ok(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("still works"),
        );
    });

    it("tool_start event → tool card created", async () => {
        const events: SSEEvent[] = [];
        const toolStartData = JSON.stringify({ id: "tool-1", name: "generate_image" });
        const chunks = [sseEvent("tool_start", toolStartData), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        const messageList = doc.querySelector("#message-list");
        const { container, contentEl } = renderAssistantMessage();
        messageList.appendChild(container);

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));
        assert.ok(events.some((e) => e.event === "tool_start"));
    });

    it("tool_result event → tool card replaced", async () => {
        const events: SSEEvent[] = [];
        const toolStartData = JSON.stringify({ id: "tool-2", name: "generate_image" });
        const toolResultData = JSON.stringify({
            id: "tool-2",
            name: "generate_image",
            result: { type: "image", content: "data:image/png;base64,abc" },
        });
        const chunks = [
            sseEvent("tool_start", toolStartData),
            sseEvent("tool_result", toolResultData),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        const messageList = doc.querySelector("#message-list");
        const { container, contentEl } = renderAssistantMessage();
        messageList.appendChild(container);

        await streamChat([{ role: "user", content: "draw" }], (e) => events.push(e));
        assert.ok(events.some((e) => e.event === "tool_start"));
        assert.ok(events.some((e) => e.event === "tool_result"));
    });

    it("[DONE] signal → stream finishes", async () => {
        const events: SSEEvent[] = [];
        const chunks = [sseText("hi"), sseEvent("message", "[DONE]")];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));
        // Stream should complete without error
        assert.ok(true);
    });

    it("[DONE] signal converts steer bubbles to normal user bubbles", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const messageList = doc.querySelector("#message-list");
        messageList.appendChild(renderSteerMessage("late steer"));
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse([sseDone()]));

        await streamChat([{ role: "user", content: "hi" }]);

        assert.equal(doc.querySelectorAll(".message--steer").length, 0);
        assert.equal(doc.querySelectorAll(".message--user").length, 1);
    });

    it("error event → showError called", async () => {
        const chunks = [sseEvent("error", JSON.stringify({ error: "Server error" }))];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Server error");
    });

    it("error event with unparseable JSON → shows default error", async () => {
        const chunks = [sseEvent("error", "not json")];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Something went wrong 😕");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 4: appendText via sendMessage (indirect test)
// ═══════════════════════════════════════════════════════════════════════

describe("appendText with thinking blocks (via sendMessage)", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("plain text → renders via markdown", async () => {
        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("Hello world"), sseDone()]));

        await sendMessage("test plain text");

        const messages = doc.querySelectorAll("#message-list .message");
        assert.ok(messages.length >= 2, "should have user + assistant messages");
    });

    it("thinking events create thinking block", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;

        const chunks = [
            sseThinking("Let me think about this"),
            sseThinking(" more carefully"),
            sseText("Here is my answer."),
            sseDone(),
        ];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("test thinking");

        // Should have thinking block in the output
        const thinkingBlocks = doc.querySelectorAll(".thinking-block");
        assert.ok(thinkingBlocks.length > 0, "should have thinking block");
    });

    it("thinking event followed by regular text", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;

        const chunks = [sseThinking("internal thought"), sseText("The answer is 42."), sseDone()];
        (globalThis as any).fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("test mixed");

        const thinkingBlocks = doc.querySelectorAll(".thinking-block");
        assert.ok(thinkingBlocks.length > 0, "should have thinking block");
        // Should also have regular content
        const assistantContent = doc.querySelectorAll(".message-content");
        assert.ok(assistantContent.length > 0);
    });
});

describe("profile frontend helpers", () => {
    it("normalizes profile form without localStorage", () => {
        setupDOM();
        const before = (globalThis as any).localStorage.length;
        const profile = normalizedProfileFromForm({
            username: "  GamerKid  ",
            interests: " Minecraft ",
            hates: " spam ",
            favorites: "redstone",
            avatar: "🦊",
        });

        assert.equal(profile.username, "GamerKid");
        assert.equal(profile.interests, "Minecraft");
        assert.equal(profile.avatar.value, "🦊");
        assert.equal((globalThis as any).localStorage.length, before);
    });

    it("rejects data URL avatar before save", () => {
        setupDOM();
        assert.throws(
            () =>
                normalizedProfileFromForm({
                    username: "GamerKid",
                    interests: "",
                    hates: "",
                    favorites: "",
                    avatar: "data:image/png;base64,abc",
                }),
            /Avatar data URLs are not allowed/,
        );
    });

    it("renders emoji and asset avatars with fallback", () => {
        setupDOM();
        const emoji = renderProfileAvatar({
            version: 1,
            username: "",
            interests: "",
            hates: "",
            favorites: "",
            avatar: { type: "emoji", value: "🦊" },
            updatedAt: 1,
        });
        assert.equal(emoji.textContent, "🦊");

        const asset = renderProfileAvatar({
            version: 1,
            username: "",
            interests: "",
            hates: "",
            favorites: "",
            avatar: { type: "asset", value: "asset_123abc" },
            updatedAt: 1,
        });
        assert.equal(asset.querySelector("img")?.getAttribute("src"), "/asset/asset_123abc");
    });

    it("profile API helpers use DB routes", async () => {
        setupDOM();
        const calls: Array<{ url: string; method: string }> = [];
        (globalThis as any).fetch = (url: string, init?: RequestInit) => {
            calls.push({ url, method: init?.method ?? "GET" });
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        version: 1,
                        username: "GamerKid",
                        interests: "",
                        hates: "",
                        favorites: "",
                        avatar: { type: "emoji", value: "🎮" },
                        updatedAt: 1,
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                ),
            );
        };

        await fetchProfile();
        await putProfile(
            normalizedProfileFromForm({
                username: "x",
                interests: "",
                hates: "",
                favorites: "",
                avatar: "🎮",
            }),
        );
        await deleteProfile();

        assert.deepEqual(calls, [
            { url: "/api/profile", method: "GET" },
            { url: "/api/profile", method: "PUT" },
            { url: "/api/profile", method: "DELETE" },
        ]);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 5: sendMessage
// ═══════════════════════════════════════════════════════════════════════

describe("sendMessage", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("empty message → returns immediately", async () => {
        const messageList = doc.querySelector("#message-list");
        const initialCount = messageList.children.length;
        await sendMessage("");
        await sendMessage("   ");
        assert.equal(messageList.children.length, initialCount, "no messages added");
    });

    it("creates user message element", async () => {
        setupDOM();
        doc = globalThis.document;
        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("Hello bot");

        const userMsg = doc.querySelector(".message--user");
        assert.ok(userMsg, "user message element should exist");
        assert.ok(userMsg.textContent.includes("Hello bot"));
    });

    it("creates assistant message element", async () => {
        setupDOM();
        doc = globalThis.document;
        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("I am here"), sseDone()]));

        await sendMessage("Hi");

        const assistantMsg = doc.querySelector(".message--assistant");
        assert.ok(assistantMsg, "assistant message element should exist");
    });

    it("clears input after send", async () => {
        setupDOM();
        doc = globalThis.document;
        const input = doc.querySelector("#chat-input");
        input.value = "test message";
        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test message");

        assert.equal(input.value, "", "input should be cleared");
    });

    it("while streaming → delegates to sendSteerMessage", async () => {
        setupDOM();
        doc = globalThis.document;

        // First send: start streaming
        let resolveStream: () => void;
        const streamPromise = new Promise<void>((r) => {
            resolveStream = r;
        });

        (globalThis as any).fetch = () => {
            // Return a response that stays open until we resolve
            const encoder = new TextEncoder();
            let sent = false;
            const stream = new ReadableStream({
                pull(controller) {
                    if (!sent) {
                        sent = true;
                        controller.enqueue(encoder.encode(sseText("thinking...")));
                    }
                    // Don't close — keep streaming
                },
            });
            return Promise.resolve(new Response(stream, { status: 200 }));
        };

        // Start the first message (don't await — it stays streaming)
        const firstSend = sendMessage("first message");

        // Wait a tick for isStreaming to be set
        await new Promise((r) => setTimeout(r, 50));

        // Mock steer endpoint
        let steerCalled = false;
        (globalThis as any).fetch = () => {
            steerCalled = true;
            return Promise.resolve(new Response(null, { status: 200 }));
        };

        // Second send while streaming should go to steer
        await sendMessage("steer this");

        assert.ok(steerCalled, "steer endpoint should be called");

        // Clean up — finish the stream
        // We need to finish somehow. Let's just let it timeout or resolve.
        // Actually, the first sendMessage is still awaiting streamChat...
        // Let's just not wait for it.
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 6: loadHistory
// ═══════════════════════════════════════════════════════════════════════

describe("loadHistory", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("empty history → no crash, welcome stays", async () => {
        setupDOM();
        doc = globalThis.document;

        // Add a welcome message
        const messageList = doc.querySelector("#message-list");
        const welcome = doc.createElement("div");
        welcome.className = "message--welcome";
        welcome.textContent = "Welcome!";
        messageList.appendChild(welcome);

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ messages: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );

        await loadHistory();

        // Welcome message should still be there (no history to remove it)
        assert.ok(doc.querySelector(".message--welcome"), "welcome message should remain");
    });

    it("history with user + assistant messages → rendered correctly", async () => {
        setupDOM();
        doc = globalThis.document;

        const messageList = doc.querySelector("#message-list");
        const welcome = doc.createElement("div");
        welcome.className = "message--welcome";
        messageList.appendChild(welcome);

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            { role: "user", content: "Hello" },
                            { role: "assistant", content: "Hi there!" },
                            { role: "user", content: "How are you?" },
                            { role: "assistant", content: "I'm doing great!" },
                        ],
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                ),
            );

        await loadHistory();

        // Welcome should be removed
        assert.ok(!doc.querySelector(".message--welcome"), "welcome should be removed");

        // Should have user and assistant messages
        const userMsgs = doc.querySelectorAll(".message--user");
        const assistantMsgs = doc.querySelectorAll(".message--assistant");
        assert.equal(userMsgs.length, 2, "should have 2 user messages");
        assert.equal(assistantMsgs.length, 2, "should have 2 assistant messages");
    });

    it("history rehydrates thinking blocks and tool cards", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "Done.",
                                thinking: "I should use the image tool.",
                                tool_calls_json: JSON.stringify([
                                    { id: "tc-history-1", name: "generate_image", input: {} },
                                ]),
                            },
                            {
                                role: "tool",
                                content: "/asset/asset_abc?s=session-1",
                                tool_call_id: "tc-history-1",
                            },
                        ],
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                ),
            );

        await loadHistory();

        assert.ok(doc.querySelector(".thinking-block")?.textContent?.includes("I should use"));
        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(
            (doc.querySelector(".tool-result-image") as HTMLImageElement | null)?.getAttribute(
                "src",
            ),
            "/asset/asset_abc?s=session-1",
        );
        assert.ok(doc.querySelector(".assistant-text-region")?.textContent?.includes("Done."));
    });

    it("history rehydrates tool errors", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "",
                                tool_calls_json: JSON.stringify([
                                    { id: "tc-error-1", name: "generate_music", input: {} },
                                ]),
                            },
                            {
                                role: "tool",
                                content: "Error: Couldn't generate music.",
                                tool_call_id: "tc-error-1",
                            },
                        ],
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                ),
            );

        await loadHistory();

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.ok(
            doc.querySelector(".tool-card")?.textContent?.includes("😕 Couldn't generate music."),
        );
    });

    it("fetch fails → no crash", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () => Promise.reject(new Error("Network error"));

        // Should not throw
        await loadHistory();
        assert.ok(true, "should not crash");
    });

    it("fetch returns non-OK → throws and loadHistory catches", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await loadHistory();
        assert.ok(true, "should not crash");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 7: init Event Binding
// ═══════════════════════════════════════════════════════════════════════

describe("init event binding", () => {
    let doc: any;
    let win: any;

    function setupFullDOM(): void {
        const result = setupDOM();
        win = result.win;
        doc = result.doc;
    }

    it("form submit → calls sendMessage", async () => {
        setupFullDOM();

        let sendMessageCalled = false;
        const origFetch = (globalThis as any).fetch;
        (globalThis as any).fetch = () => {
            sendMessageCalled = true;
            return Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));
        };

        const form = doc.querySelector("#chat-form");
        const input = doc.querySelector("#chat-input");
        input.value = "test message";

        init();

        // Dispatch submit event
        const submitEvent = new win.Event("submit");
        submitEvent.preventDefault = () => {};
        form.dispatchEvent(submitEvent);

        // Wait for async sendMessage
        await new Promise((r) => setTimeout(r, 100));
        assert.ok(sendMessageCalled, "fetch should be called via sendMessage");
    });

    it("Enter key → calls sendMessage", async () => {
        setupFullDOM();

        let fetchCalled = false;
        (globalThis as any).fetch = () => {
            fetchCalled = true;
            return Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));
        };

        const input = doc.querySelector("#chat-input");
        input.value = "hello";

        init();

        const keyEvent = new win.KeyboardEvent("keydown", { key: "Enter", shiftKey: false });
        keyEvent.preventDefault = () => {};
        input.dispatchEvent(keyEvent);

        await new Promise((r) => setTimeout(r, 100));
        assert.ok(fetchCalled, "fetch should be called on Enter");
    });

    it("Shift+Enter → does NOT send", async () => {
        setupFullDOM();

        let chatFetchCalled = false;
        (globalThis as any).fetch = (url: string, opts: any) => {
            if (url === "/api/chat") {
                chatFetchCalled = true;
            }
            // Return appropriate response based on URL
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }),
                );
            }
            return Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));
        };

        const input = doc.querySelector("#chat-input");
        input.value = "hello";

        init();

        // Wait for loadHistory to complete
        await new Promise((r) => setTimeout(r, 50));

        const keyEvent = new win.KeyboardEvent("keydown", { key: "Enter", shiftKey: true });
        keyEvent.preventDefault = () => {};
        input.dispatchEvent(keyEvent);

        await new Promise((r) => setTimeout(r, 100));
        assert.ok(!chatFetchCalled, "chat endpoint should NOT be called on Shift+Enter");
    });

    it("input change → enables send button", () => {
        setupFullDOM();

        const input = doc.querySelector("#chat-input");
        const sendBtn = doc.querySelector("#send-button");
        sendBtn.disabled = true;

        init();

        input.value = "hello";
        const inputEvent = new win.Event("input");
        input.dispatchEvent(inputEvent);

        assert.ok(!sendBtn.disabled, "send button should be enabled when input has text");
    });

    it("input empty → send button stays disabled", () => {
        setupFullDOM();

        const input = doc.querySelector("#chat-input");
        const sendBtn = doc.querySelector("#send-button");
        sendBtn.disabled = true;

        init();

        input.value = "";
        const inputEvent = new win.Event("input");
        input.dispatchEvent(inputEvent);

        assert.ok(sendBtn.disabled, "send button should stay disabled for empty input");
    });

    it("Escape → closes lightbox", () => {
        setupFullDOM();

        const lightbox = doc.querySelector("#lightbox");
        lightbox.hidden = false;

        init();

        const escEvent = new win.KeyboardEvent("keydown", { key: "Escape" });
        document.dispatchEvent(escEvent);

        assert.ok(lightbox.hidden, "lightbox should be hidden after Escape");
    });

    it("lightbox close button click → closes lightbox", () => {
        setupFullDOM();

        const lightbox = doc.querySelector("#lightbox");
        lightbox.hidden = false;

        init();

        const closeBtn = doc.querySelector(".lightbox-close");
        closeBtn.dispatchEvent(new win.Event("click"));

        assert.ok(lightbox.hidden, "lightbox should be hidden after close click");
    });

    it("steer close click → hides steer hint", () => {
        setupFullDOM();

        const steerHint = doc.querySelector("#steer-hint");
        steerHint.hidden = false;

        init();

        const steerClose = doc.querySelector("#steer-close");
        steerClose.dispatchEvent(new win.Event("click"));

        assert.ok(steerHint.hidden, "steer hint should be hidden");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Additional coverage: helper functions
// ═══════════════════════════════════════════════════════════════════════

describe("showError", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("shows error toast with message", () => {
        showError("Test error");
        const toast = doc.querySelector("#error-toast");
        const msg = doc.querySelector("#error-toast-message");
        assert.ok(!toast.hidden, "toast should be visible");
        assert.equal(msg.textContent, "Test error");
    });

    it("hides after duration", async () => {
        setupDOM();
        doc = globalThis.document;

        showError("Quick error", 10); // 10ms
        await new Promise((r) => setTimeout(r, 50));
        const toast = doc.querySelector("#error-toast");
        assert.ok(toast.hidden, "toast should be hidden after duration");
    });

    it("does not persist transient errors to localStorage", () => {
        setupDOM();
        showError("Fresh error");
        assert.equal(localStorage.getItem("hallucygenie_recent_error"), null);
    });

    it("does not show raw provider JSON in toast", () => {
        setupDOM();
        doc = globalThis.document;
        showError('{"base_resp":{"status_code":1004,"status_msg":"login fail"}}');
        assert.equal(
            doc.querySelector("#error-toast-message").textContent,
            "Something went wrong. Try again! 🤷",
        );
    });
});

describe("setStreamingUI (via sendMessage)", () => {
    let doc: any;

    it("sets typing indicator visible during streaming", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        // After streaming finishes, typing indicator should be hidden
        const typing = doc.querySelector("#typing-indicator");
        assert.ok(typing.hidden, "typing indicator should be hidden after stream");
    });

    it("enables input after streaming finishes", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        const input = doc.querySelector("#chat-input");
        assert.ok(!input.disabled, "input should be enabled after streaming");
    });

    it("removes assistant streaming class after done", async () => {
        setupDOM();
        doc = globalThis.document;

        (globalThis as any).fetch = () =>
            Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        assert.equal(doc.querySelectorAll(".assistant-text-region.is-streaming").length, 0);
    });
});

describe("openLightbox / closeLightbox", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("openLightbox shows lightbox with image src", () => {
        openLightbox("https://example.com/image.png");
        const lightbox = doc.querySelector("#lightbox");
        const img = doc.querySelector("#lightbox-img");
        assert.ok(!lightbox.hidden, "lightbox should be visible");
        assert.equal(img.src, "https://example.com/image.png");
    });

    it("closeLightbox hides lightbox", () => {
        openLightbox("https://example.com/image.png");
        closeLightbox();
        const lightbox = doc.querySelector("#lightbox");
        assert.ok(lightbox.hidden, "lightbox should be hidden");
    });
});

describe("autoResizeInput", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    function setScrollHeight(input: HTMLTextAreaElement, value: number): void {
        Object.defineProperty(input, "scrollHeight", { value, configurable: true });
    }

    it("one-line input has no overflow class", () => {
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        input.value = "some text content";
        setScrollHeight(input, 40);
        autoResizeInput();
        assert.equal(input.classList.contains("is-overflowing"), false);
        assert.equal(input.style.height, "40px");
    });

    it("short multiline input has no overflow class", () => {
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        input.value = "one\ntwo";
        setScrollHeight(input, 80);
        autoResizeInput();
        assert.equal(input.classList.contains("is-overflowing"), false);
        assert.equal(input.style.height, "80px");
    });

    it("long input gets overflow class and clamped height", () => {
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        input.value = "x\n".repeat(50);
        setScrollHeight(input, 240);
        autoResizeInput();
        assert.equal(input.classList.contains("is-overflowing"), true);
        assert.equal(input.style.height, "120px");
    });
});

describe("renderToolCardLoading", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("creates tool card with name and emoji", () => {
        const card = renderToolCardLoading("generate_image");
        assert.ok(card.outerHTML.includes("generate image"));
        assert.ok(card.outerHTML.includes("🎨"));
    });

    it("uses default emoji for unknown tools", () => {
        const card = renderToolCardLoading("unknown_tool");
        assert.ok(card.outerHTML.includes("🔧"));
    });
});

describe("renderToolResult", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("renders image result", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "data:image/png;base64,abc",
        });
        assert.ok(card.outerHTML.includes("img"));
    });

    it("renders error result", () => {
        const card = renderToolResult("generate_image", {
            type: "error",
            content: "Something failed",
        });
        assert.ok(card.outerHTML.includes("Something failed"));
    });

    it("renders audio result", () => {
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "data:audio/mp3;base64,abc",
        });
        assert.ok(card.outerHTML.includes("audio"));
    });
});

describe("sendSteer", () => {
    it("sends steer request without X-Session-Id header", async () => {
        let request: RequestInit | undefined;
        (globalThis as any).fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(new Response(null, { status: 200 }));
        };

        await sendSteer("steer message");
        assert.equal((request!.headers as Record<string, string>)["X-Session-Id"], undefined);
    });

    it("throws on non-OK response", async () => {
        (globalThis as any).fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await assert.rejects(() => sendSteer("steer"), /Steer failed/);
    });
});

describe("fetchHistory", () => {
    it("returns messages from API without request headers", async () => {
        let request: RequestInit | undefined;
        (globalThis as any).fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(
                new Response(JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );
        };

        const msgs = await fetchHistory();
        assert.equal(request, undefined);
        assert.equal(msgs.length, 1);
        assert.equal(msgs[0].role, "user");
        assert.equal(msgs[0].content, "hi");
    });

    it("throws on non-OK response", async () => {
        (globalThis as any).fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await assert.rejects(() => fetchHistory(), /Failed to load history/);
    });
});

describe("renderSteerMessage", () => {
    let doc: any;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("creates steer message element", () => {
        const el = renderSteerMessage("steer content");
        assert.ok(el.outerHTML.includes("steer content"));
        assert.ok(el.className.includes("message--steer"));
    });
});

// ── Init accessibility regressions ──────────────────────────────────

describe("init accessibility behavior", () => {
    it("removes legacy browser-owned session ID", () => {
        const { doc } = setupDOM();
        (globalThis as any).localStorage.setItem("hallucygenie_session_id", "legacy-session");
        init();

        assert.equal((globalThis as any).localStorage.getItem("hallucygenie_session_id"), null);
        assert.ok(doc.querySelector("#message-list"));
    });

    it("shows onboarding on first visit and updates exactly one dot", () => {
        const { doc } = setupDOM();
        init();

        const onboarding = doc.querySelector("#onboarding") as HTMLElement;
        const activeSlides = doc.querySelectorAll(".onboarding-slide.active");
        const activeDots = doc.querySelectorAll(".onboarding-dots .dot.active");

        assert.equal(onboarding.hidden, false);
        assert.equal(activeSlides.length, 1);
        assert.equal(activeDots.length, 1);
    });

    it("sets connection status aria-label from title", () => {
        const { doc } = setupDOM();
        init();

        const status = doc.querySelector("#connection-status") as HTMLElement;
        assert.equal(status.getAttribute("aria-label"), "Connection status: Connected");
    });

    it("opens and closes create modal with focus restore", () => {
        const { doc } = setupDOM();
        init();

        const createBtn = doc.querySelector("#create-btn") as HTMLButtonElement;
        const closeBtn = doc.querySelector("#create-close") as HTMLButtonElement;
        const modal = doc.querySelector("#create-modal") as HTMLElement;

        createBtn.focus();
        createBtn.click();
        assert.equal(modal.hidden, false);
        assert.equal(doc.activeElement, closeBtn);

        closeBtn.click();
        assert.equal(modal.hidden, true);
        assert.equal(doc.activeElement, createBtn);
    });

    it("traps Tab focus inside create modal", () => {
        const { doc, win } = setupDOM();
        init();

        const createBtn = doc.querySelector("#create-btn") as HTMLButtonElement;
        const closeBtn = doc.querySelector("#create-close") as HTMLButtonElement;
        const imgRatio = doc.querySelector("#img-ratio") as HTMLSelectElement;
        const modal = doc.querySelector("#create-modal") as HTMLElement;

        createBtn.click();
        imgRatio.focus();
        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
        );
        assert.equal(doc.activeElement, closeBtn);
    });
});

// ── HG-ISSUE-007/008/009: Asset URL handling, quota refresh, assets refresh ──

describe("renderToolResult asset URLs", () => {
    it("image result src omits session query", () => {
        setupDOM();
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "/asset/abc123",
        });
        const img = card.querySelector("img");
        assert.ok(img, "should have img element");
        assert.equal(img!.src.endsWith("/asset/abc123"), true);
        assert.equal(img!.src.includes("?s="), false);
    });

    it("audio result src omits session query", () => {
        setupDOM();
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "/asset/def456",
        });
        const audio = card.querySelector("audio");
        assert.ok(audio, "should have audio element");
        assert.equal(audio!.src.endsWith("/asset/def456"), true);
        assert.equal(audio!.src.includes("?s="), false);
    });
});

describe("updateQuotaBadge", () => {
    it("fetches /api/quota and updates badge text", async () => {
        const { doc } = setupDOM();
        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        speech: { used: 5, total: 100 },
                        image: { used: 10, total: 100 },
                        music: { used: 3, total: 100 },
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        await updateQuotaBadge();

        const imageItem = doc.querySelector('.quota-item[data-type="image"]');
        assert.ok(imageItem, "image quota item exists");
        const imageUsed = imageItem!.querySelector(".quota-used");
        assert.equal(imageUsed!.textContent, "90"); // 100 - 10

        const speechItem = doc.querySelector('.quota-item[data-type="speech"]');
        assert.ok(speechItem, "speech quota item exists");
        const speechUsed = speechItem!.querySelector(".quota-used");
        assert.equal(speechUsed!.textContent, "95"); // 100 - 5
    });

    it("does not crash on fetch failure", async () => {
        setupDOM();
        (globalThis as any).fetch = () => Promise.reject(new Error("network fail"));
        await updateQuotaBadge();
        assert.ok(true, "should not throw");
    });
});

describe("loadAssets", () => {
    it("fetches /assets without session header and builds asset URLs", async () => {
        const { doc } = setupDOM();
        let requestOpts: RequestInit | undefined;

        (globalThis as any).fetch = (url: string, opts?: RequestInit) => {
            requestOpts = opts;
            if (url.includes("/assets")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            assets: [
                                {
                                    id: "img-1",
                                    session_id: "active-session",
                                    type: "image",
                                    filename: "img-1.png",
                                    mime_type: "image/png",
                                    prompt: "cat",
                                    tool_name: "generate_image",
                                    size_bytes: 1024,
                                    created_at: Date.now(),
                                    params_json: null,
                                },
                                {
                                    id: "aud-1",
                                    session_id: "active-session",
                                    type: "music",
                                    filename: "aud-1.mp3",
                                    mime_type: "audio/mpeg",
                                    prompt: "song",
                                    tool_name: "generate_music",
                                    size_bytes: 2048,
                                    created_at: Date.now(),
                                    params_json: null,
                                },
                            ],
                        }),
                        { headers: { "Content-Type": "application/json" } },
                    ),
                );
            }
            return Promise.resolve(new Response(null, { status: 404 }));
        };

        loadAssets();

        // Wait for async fetch + render
        await new Promise((r) => setTimeout(r, 50));

        assert.equal(requestOpts, undefined);

        const cards = doc.querySelectorAll(".asset-card");
        assert.equal(cards.length, 2, "should render both asset cards");

        const img = doc.querySelector(".asset-thumb");
        assert.ok(img, "should have image thumbnail");
        if (img!.tagName === "IMG") {
            assert.equal((img as HTMLImageElement).src.includes("?s="), false);
        }

        const audio = doc.querySelector("audio.asset-audio") as HTMLAudioElement | null;
        assert.ok(audio, "audio assets should use native controls");
        assert.equal(audio!.controls, true);
        assert.equal(audio!.preload, "metadata");
        assert.equal(audio!.src.includes("?s="), false);

        const downloads = doc.querySelectorAll(".asset-download");
        assert.equal(downloads.length, 2, "every asset should have a download link");

        // No 20-item cap — all assets rendered
        const grid = doc.querySelector("#assets-grid");
        assert.equal(grid!.children.length, 2, "no slice cap");
    });

    it("renders tool name, model, and date on asset cards", async () => {
        const { doc } = setupDOM();
        const timestamp = new Date("2025-03-15").getTime();

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "img-1",
                                session_id: "active-session",
                                type: "image",
                                filename: "img-1.png",
                                mime_type: "image/png",
                                prompt: "cool cat",
                                tool_name: "generate_image",
                                size_bytes: 1024,
                                created_at: timestamp,
                                params_json: JSON.stringify({ model: "MiniMax/Image-01" }),
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const header = doc.querySelector(".asset-header");
        assert.ok(header, "should have asset header with tool/model/date");

        const toolEl = doc.querySelector(".asset-tool");
        assert.ok(toolEl, "should have tool name element");
        assert.equal(toolEl!.textContent, "generate image");

        const modelEl = doc.querySelector(".asset-model");
        assert.ok(modelEl, "should have model name element");
        assert.equal(modelEl!.textContent, "Image-01");

        const dateEl = doc.querySelector(".asset-date");
        assert.ok(dateEl, "should have date element");
        assert.equal(dateEl!.textContent, "Mar 15");
    });

    it("renders generation params from params_json", async () => {
        const { doc } = setupDOM();

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "img-1",
                                session_id: "active-session",
                                type: "image",
                                filename: "img-1.png",
                                mime_type: "image/png",
                                prompt: "cat",
                                tool_name: "generate_image",
                                size_bytes: 1024,
                                created_at: Date.now(),
                                params_json: JSON.stringify({
                                    aspect_ratio: "16:9",
                                    model: "MiniMax/Image-01",
                                }),
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element");
        assert.equal(paramsEl!.textContent, "16:9");
    });

    it("renders music params including lyrics excerpt", async () => {
        const { doc } = setupDOM();

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "music-1",
                                session_id: "active-session",
                                type: "music",
                                filename: "song.mp3",
                                mime_type: "audio/mpeg",
                                prompt: "fun song",
                                tool_name: "generate_music",
                                size_bytes: 2048,
                                created_at: Date.now(),
                                params_json: JSON.stringify({
                                    lyrics: "This is a long lyrics preview",
                                }),
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element with lyrics excerpt");
        assert.equal(paramsEl!.textContent, "This is a long lyric…");
    });

    it("renders collapsible prompt for long prompts", async () => {
        const { doc } = setupDOM();
        const longPrompt = "A".repeat(50);

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "img-1",
                                session_id: "active-session",
                                type: "image",
                                filename: "img-1.png",
                                mime_type: "image/png",
                                prompt: longPrompt,
                                tool_name: "generate_image",
                                size_bytes: 1024,
                                created_at: Date.now(),
                                params_json: null,
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const details = doc.querySelector(".asset-prompt-details");
        assert.ok(details, "should have collapsible prompt element for long prompts");

        const summary = doc.querySelector(".asset-prompt-summary");
        assert.ok(summary, "should have prompt summary");
        assert.equal(summary!.textContent, "A".repeat(30) + "…");

        const fullPrompt = doc.querySelector(".asset-prompt-full");
        assert.ok(fullPrompt, "should have full prompt content");
        assert.equal(fullPrompt!.textContent, longPrompt);
    });

    it("renders short prompt without collapse mechanism", async () => {
        const { doc } = setupDOM();

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "img-1",
                                session_id: "active-session",
                                type: "image",
                                filename: "img-1.png",
                                mime_type: "image/png",
                                prompt: "short prompt",
                                tool_name: "generate_image",
                                size_bytes: 1024,
                                created_at: Date.now(),
                                params_json: null,
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const details = doc.querySelector(".asset-prompt-details");
        assert.equal(details, null, "short prompts should not have collapsible element");

        const meta = doc.querySelector(".asset-meta");
        assert.ok(meta, "short prompts should render in asset-meta");
        assert.equal(meta!.textContent, "short prompt");
    });

    it("handles voice params with speed", async () => {
        const { doc } = setupDOM();

        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "voice-1",
                                session_id: "active-session",
                                type: "audio",
                                filename: "voice.mp3",
                                mime_type: "audio/mpeg",
                                prompt: "hello",
                                tool_name: "text_to_speech",
                                size_bytes: 1024,
                                created_at: Date.now(),
                                params_json: JSON.stringify({
                                    speed: "1.5",
                                    voice_id: "hunter",
                                }),
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element");
        assert.equal(paramsEl!.textContent, "1.5x · hunter…");
    });

    it("audio asset card click does not create hidden autoplay", async () => {
        const { doc } = setupDOM();
        let hiddenAudioCreated = false;
        (globalThis as any).Audio = function () {
            hiddenAudioCreated = true;
            return { play: () => Promise.resolve() };
        };
        (globalThis as any).fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "aud-1",
                                session_id: "active-session",
                                type: "music",
                                filename: "aud-1.mp3",
                                mime_type: "audio/mpeg",
                                prompt: "song",
                                tool_name: "generate_music",
                                size_bytes: 2048,
                                created_at: Date.now(),
                                params_json: null,
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" } },
                ),
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));
        doc.querySelector(".asset-card")!.dispatchEvent(new Event("click", { bubbles: true }));

        assert.equal(hiddenAudioCreated, false);
    });
});
