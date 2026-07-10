// HallucyGenie — Unit tests for app.ts
// Tests: SSE parsing, message rendering, API helpers, input state, DOM helpers
// Uses happy-dom for DOM environment

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
    imageCreateValidationError,
    imageDimensionsForPreset,
    imageSeedForSubmit,
    imageSeedStatusText,
    imageSurpriseCode,
    renderMarkdown
} from "../../public/app.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__");
// Capture the real (native) fetch. Use getOwnPropertyDescriptor so we
// reliably get the native fetch even if this file is loaded in a worker
// where another parallel file already reassigned globalThis.fetch.
const ORIGINAL_FETCH = Object.getOwnPropertyDescriptor(globalThis, "fetch")?.value
    ?? globalThis.fetch;

after(() => {
    globalThis.fetch = ORIGINAL_FETCH;
});

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
function parseSSELine(line: string): { field: string; value: string; } | null {
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
function createApiHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json"
    };
}

// Tool emojis
const TOOL_EMOJIS: Record<string, string> = {
    generate_image: "🎨",
    text_to_speech: "🎙️",
    generate_long_speech: "📖",
    generate_music: "🎵",
    generate_music_cover: "🎵",
    generate_video: "🎬",
    analyze_image: "🔎",
    web_search: "🔍"
};

function getToolEmoji(name: string): string {
    return TOOL_EMOJIS[name] ?? "🔧";
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
        const result = parseSSELine("data: {\"delta\": \"hello\"}");
        assert.deepEqual(result, { field: "data", value: "{\"delta\": \"hello\"}" });
    });

    it("parseSSELine - returns null for non-SSE lines", () => {
        assert.equal(parseSSELine("just some text"), null);
        assert.equal(parseSSELine(""), null);
        assert.equal(parseSSELine("#comment"), null);
    });

    it("parseSSEChunk - single text event (OpenAI format)", () => {
        const chunk = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]\n\n";
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 1);
        assert.equal(events[0].event, "message");
        assert.equal(events[0].data, "{\"choices\":[{\"delta\":{\"content\":\"hi\"}}]");
    });

    it("parseSSEChunk - tool_start event", () => {
        const chunk = "event: tool_start\ndata: {\"id\":\"t1\",\"name\":\"generate_image\"}\n\n";
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 1);
        assert.equal(events[0].event, "tool_start");
        const parsed = JSON.parse(events[0].data);
        assert.equal(parsed.id, "t1");
        assert.equal(parsed.name, "generate_image");
    });

    it("parseSSEChunk - tool_result event", () => {
        const chunk =
            "event: tool_result\ndata: {\"id\":\"t1\",\"name\":\"generate_image\",\"result\":{\"type\":\"image\",\"content\":\"http://example.com/img.png\"}}\n\n";
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
        const chunk = "event: error\ndata: {\"error\":\"something broke\"}\n\n";
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 1);
        assert.equal(events[0].event, "error");
        const parsed = JSON.parse(events[0].data);
        assert.equal(parsed.error, "something broke");
    });

    it("parseSSEChunk - multiple events in single chunk", () => {
        const chunk =
            "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]\n\n";
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 2);
        assert.equal(events[0].data, "{\"choices\":[{\"delta\":{\"content\":\"hello\"}}]");
        assert.equal(events[1].data, "{\"choices\":[{\"delta\":{\"content\":\" world\"}}]");
    });

    it("parseSSEChunk - handles no trailing newline", () => {
        const chunk = "data: {\"test\":true}";
        const events = [...parseSSEChunk(chunk)];
        assert.equal(events.length, 1);
        assert.equal(events[0].data, "{\"test\":true}");
    });

    it("parseSSEChunk - empty chunk yields nothing", () => {
        const events = [...parseSSEChunk("")];
        assert.equal(events.length, 0);
    });

    it("parseSSEChunk - mixed event types", () => {
        const chunk =
            "data: {\"choices\":[{\"delta\":{\"content\":\"making art\"}}]\n\nevent: tool_start\ndata: {\"id\":\"t1\",\"name\":\"generate_image\"}\n\n";
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
});

// ── Exported API helpers ──────────────────────────────────────────────

describe("exported API helpers", () => {
    it("loads history and profile data", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input: RequestInfo | URL) => {
            calls.push(String(input));
            if (String(input) === "/api/history") {
                return new Response(
                    JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }
            if (String(input) === "/api/profile") {
                return new Response(
                    JSON.stringify({
                        version: 1,
                        username: "Player",
                        interests: "games",
                        hates: "lag",
                        favorites: "blue",
                        avatar: { type: "asset", value: "" },
                        updatedAt: 1
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            throw new Error(`unexpected fetch ${String(input)}`);
        };

        assert.deepEqual(await fetchHistory(), [{ role: "user", content: "hi" }]);
        assert.equal((await fetchProfile()).username, "Player");
        assert.deepEqual(calls, ["/api/history", "/api/profile"]);
    });

    it("saves, deletes, and steers with JSON requests", async () => {
        const calls: Array<{ url: string; init?: RequestInit; }> = [];
        const profile = {
            version: 1,
            username: "Player",
            interests: "games",
            hates: "lag",
            favorites: "blue",
            avatar: { type: "asset" as const, value: "" },
            updatedAt: 1
        };
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init });
            return new Response(JSON.stringify(profile), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        };

        assert.equal((await putProfile(profile)).username, "Player");
        assert.equal((await deleteProfile()).username, "Player");
        await sendSteer("make it brighter");

        assert.equal(calls[0]?.url, "/api/profile");
        assert.equal(calls[0]?.init?.method, "PUT");
        assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "application/json");
        assert.equal(JSON.parse(String(calls[0]?.init?.body)).username, "Player");
        assert.equal(calls[1]?.url, "/api/profile");
        assert.equal(calls[1]?.init?.method, "DELETE");
        assert.equal(calls[2]?.url, "/api/steer");
        assert.equal(calls[2]?.init?.method, "POST");
        assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { message: "make it brighter" });
    });

    it("throws named errors for failed API helpers", async () => {
        globalThis.fetch = async () => new Response("nope", { status: 500 });

        await assert.rejects(() => fetchHistory(), /Failed to load history: 500/);
        await assert.rejects(() => sendSteer("x"), /Steer failed: 500/);
        await assert.rejects(() => fetchProfile(), /Failed to load profile: 500/);
        await assert.rejects(
            () =>
                putProfile({
                    version: 1,
                    username: "x",
                    interests: "",
                    hates: "",
                    favorites: "",
                    avatar: { type: "asset", value: "" },
                    updatedAt: 1
                }),
            /Failed to save profile: 500/
        );
        await assert.rejects(() => deleteProfile(), /Failed to reset profile: 500/);
    });
});

// ── Tool Emojis ────────────────────────────────────────────────────────

describe("Create image control helpers", () => {
    it("keeps size presets linked to aspect ratio", () => {
        assert.deepEqual(imageDimensionsForPreset("16:9", "medium"), {
            width: 1536,
            height: 864
        });
        assert.deepEqual(imageDimensionsForPreset("9:16", "medium"), {
            width: 864,
            height: 1536
        });
        assert.deepEqual(imageDimensionsForPreset("1:1", "small"), {
            width: 1024,
            height: 1024
        });
        assert.equal(imageDimensionsForPreset("16:9", ""), null);
    });

    it("creates bounded surprise codes for optional seeds", () => {
        assert.equal(
            imageSurpriseCode(() => 0),
            "1"
        );
        assert.equal(
            imageSurpriseCode(() => 0.5),
            "1073741824"
        );
    });

    it("omits surprise code for multi-image submits", () => {
        assert.equal(imageSeedForSubmit("", "123"), 123);
        assert.equal(imageSeedForSubmit("2", "123"), null);
        assert.equal(
            imageSeedStatusText("2", "123"),
            "Surprise code is off for multiple pictures so each one is different."
        );
    });

    it("validates image create input before submit", () => {
        assert.equal(imageCreateValidationError("", ""), "Describe your image first.");
        assert.equal(imageCreateValidationError("cat", "9"), "Choose 1, 2, or 4 pictures.");
        assert.equal(imageCreateValidationError("cat", "4"), null);
    });
});

describe("Tool Emojis", () => {
    it("returns correct emoji for generate_image", () => {
        assert.equal(getToolEmoji("generate_image"), "🎨");
    });

    it("returns correct emoji for text_to_speech", () => {
        assert.equal(getToolEmoji("text_to_speech"), "🎙️");
    });

    it("returns correct emoji for generate_long_speech", () => {
        assert.equal(getToolEmoji("generate_long_speech"), "📖");
    });

    it("returns correct emoji for generate_music", () => {
        assert.equal(getToolEmoji("generate_music"), "🎵");
    });

    it("returns correct emoji for generate_video", () => {
        assert.equal(getToolEmoji("generate_video"), "🎬");
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
    let _happyDOMRef: unknown;

    before(async () => {
        const win = createTestWindow({ url: "http://localhost:3000" });
        doc = win.document as unknown as Document;
        _happyDOMRef = win;
    });

    after(() => {
        // No-op cleanup — setInterval removed from init()
        // happy-dom v14+ does not have .abort()
    });

    // DOM helpers (same logic as app.ts)
    function createElement(
        tag: string,
        attrs?: Record<string, string>,
        children?: (string | Node)[]
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

    function renderAssistantMessage(): { container: HTMLElement; contentEl: HTMLElement; } {
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
        result: { type: string; content: string; }
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
                loading: "lazy"
            });
            body.appendChild(img);
        } else if (result.type === "audio") {
            const audio = createElement("audio", {
                class: "tool-result-audio",
                controls: "",
                src: result.content
            });
            body.appendChild(audio);
        } else if (result.type === "video") {
            const video = createElement("video", {
                class: "tool-result-video",
                controls: "",
                src: result.content,
                preload: "metadata"
            });
            body.appendChild(video);
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
        assert.equal(msg.querySelector(".message-avatar")?.textContent, "🎮");
        assert.ok(msg.querySelector(".message-bubble"));
        assert.equal(msg.querySelector(".message-content")?.textContent, "Hello!");
    });

    it("assistant message starts with empty content", () => {
        const { container, contentEl } = renderAssistantMessage();
        assert.equal(container.classList.contains("message--assistant"), true);
        assert.equal(contentEl.textContent, "");
        assert.ok(container.querySelector(".message-avatar"));
        assert.equal(container.querySelector(".message-avatar")?.textContent, "🧞");
    });

    it("assistant message content can be updated", () => {
        const { contentEl } = renderAssistantMessage();
        contentEl.textContent = "Hello there!";
        assert.equal(contentEl.textContent, "Hello there!");
    });

    it("steer message has distinct class", () => {
        const msg = renderSteerMessage("Change the color");
        assert.equal(msg.classList.contains("message--steer"), true);
        assert.equal(msg.querySelector(".message-content")?.textContent, "Change the color");
        assert.equal(msg.querySelector(".message-avatar")?.textContent, "💡");
    });

    it("tool loading card shows spinner and tool name", () => {
        const card = renderToolCardLoading("generate_image");
        assert.ok(card.classList.contains("tool-card"));
        assert.ok(card.querySelector(".spinner"));
        assert.ok(card.textContent?.includes("generate image"));
        assert.ok(card.querySelector(".tool-emoji")?.textContent?.includes("🎨"));
    });

    it("tool loading card formats tool name with spaces", () => {
        const card = renderToolCardLoading("text_to_speech");
        assert.ok(card.textContent?.includes("text to speech"));
    });

    it("tool result image card has img element", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "http://example.com/img.png"
        });
        const img = card.querySelector("img");
        assert.ok(img);
        assert.equal(img?.getAttribute("src"), "http://example.com/img.png");
        assert.equal(img?.getAttribute("class"), "tool-result-image");
    });

    it("tool result audio card has audio element", () => {
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "http://example.com/audio.mp3"
        });
        const audio = card.querySelector("audio");
        assert.ok(audio);
        assert.equal(audio?.getAttribute("src"), "http://example.com/audio.mp3");
        assert.equal(audio?.getAttribute("controls"), "");
    });

    it("tool result music card has audio element", () => {
        const card = renderToolResult("generate_music", {
            type: "audio",
            content: "http://example.com/music.mp3"
        });
        const audio = card.querySelector("audio");
        assert.ok(audio);
        assert.equal(audio?.getAttribute("src"), "http://example.com/music.mp3");
    });

    it("tool result video card has video element", () => {
        const card = renderToolResult("generate_video", {
            type: "video",
            content: "/asset/asset_video"
        });
        const video = card.querySelector("video");
        assert.ok(video);
        assert.equal(video?.getAttribute("src"), "/asset/asset_video");
        assert.equal(video?.getAttribute("controls"), "");
    });

    it("tool result error card shows friendly error", () => {
        const card = renderToolResult("generate_image", {
            type: "error",
            content: "Rate limited"
        });
        assert.ok(card.textContent?.includes("😕"));
        assert.ok(card.textContent?.includes("Rate limited"));
    });
});

// ── Snapshot Tests ─────────────────────────────────────────────────────

describe("Snapshot Tests - Message Bubbles", () => {
    let doc: Document;
    let _happyDOMRef: unknown;

    before(async () => {
        const win = createTestWindow({ url: "http://localhost:3000" });
        doc = win.document as unknown as Document;
        _happyDOMRef = win;
    });

    after(() => {
        // No-op cleanup — setInterval removed from init()
        // happy-dom v14+ does not have .abort()
    });

    function createElement(
        tag: string,
        attrs?: Record<string, string>,
        children?: (string | Node)[]
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
        header.appendChild(
            createElement("span", { class: "tool-emoji" }, [getToolEmoji(name)])
        );
        header.appendChild(
            createElement("span", {}, [`Running ${name.replace(/_/g, " ")}...`])
        );
        const loading = createElement("div", { class: "tool-card-loading" });
        loading.appendChild(createElement("div", { class: "spinner" }));
        card.appendChild(header);
        card.appendChild(loading);
        return card;
    }

    function renderToolResult(
        toolName: string,
        result: { type: string; content: string; }
    ): HTMLElement {
        const card = createElement("div", { class: "tool-card" });
        const header = createElement("div", { class: "tool-card-header" });
        header.appendChild(
            createElement("span", { class: "tool-emoji" }, [getToolEmoji(toolName)])
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
                    alt: "Generated image"
                })
            );
        } else if (result.type === "audio") {
            body.appendChild(
                createElement("audio", {
                    class: "tool-result-audio",
                    controls: "",
                    src: result.content
                })
            );
        } else if (result.type === "error") {
            body.textContent = `😕 ${result.content}`;
        }
        return card;
    }

    // Snapshot tests use inline HTML comparison.

    it("snapshot: user message bubble HTML structure", () => {
        const msg = renderUserMessage("Hello HallucyGenie!");
        const html = msg.outerHTML;
        // Verify key structural elements
        assert.ok(html.includes("class=\"message message--user\""));
        assert.ok(html.includes("class=\"message-avatar\""));
        assert.ok(html.includes("class=\"message-bubble\""));
        assert.ok(html.includes("class=\"message-content\""));
        assert.ok(html.includes("Hello HallucyGenie!"));
        // Write snapshot to file for reference
        writeSnapshot("user-message", html);
    });

    it("snapshot: assistant message bubble HTML structure", () => {
        const msg = renderAssistantMessage();
        const html = msg.outerHTML;
        assert.ok(html.includes("class=\"message message--assistant\""));
        assert.ok(html.includes("class=\"message-avatar\""));
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
        assert.ok(html.includes("class=\"tool-card\""));
        assert.ok(html.includes("class=\"spinner\""));
        assert.ok(html.includes("🎨"));
        assert.ok(html.includes("generate image"));
        writeSnapshot("tool-loading", html);
    });

    it("snapshot: tool result image card HTML structure", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "http://example.com/gen.png"
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-image"));
        assert.ok(html.includes("src=\"http://example.com/gen.png\""));
        assert.ok(html.includes("alt=\"Generated image\""));
        writeSnapshot("tool-image", html);
    });

    it("snapshot: tool result audio card (TTS) HTML structure", () => {
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "http://example.com/speech.mp3"
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-audio"));
        assert.ok(html.includes("src=\"http://example.com/speech.mp3\""));
        assert.ok(html.includes("controls=\"\""));
        assert.ok(html.includes("🎙️"));
        writeSnapshot("tool-tts", html);
    });

    it("snapshot: tool result audio card (music) HTML structure", () => {
        const card = renderToolResult("generate_music", {
            type: "audio",
            content: "http://example.com/music.mp3"
        });
        const html = card.outerHTML;
        assert.ok(html.includes("tool-result-audio"));
        assert.ok(html.includes("src=\"http://example.com/music.mp3\""));
        assert.ok(html.includes("🎵"));
        writeSnapshot("tool-music", html);
    });

    it("snapshot: tool result error card HTML structure", () => {
        const card = renderToolResult("generate_image", {
            type: "error",
            content: "Rate limited"
        });
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
                "<a href=\"https://example.com\" target=\"_blank\" rel=\"noopener\">here</a>"
            )
        );
    });

    it("renders autolinks for bare URLs", () => {
        const result = renderMarkdown("see https://example.com for info");
        assert.ok(result.includes("<a href=\"https://example.com\""));
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
        assert.ok(result.includes("<pre><code class=\"lang-js\">"), `got: ${result}`);
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
        assert.ok(result.includes("class=\"task-checkbox\""));
        assert.ok(!result.includes("checked"));
    });

    it("renders checked task", () => {
        const result = renderMarkdown("- [x] done");
        assert.ok(result.includes("checked"));
        assert.ok(result.includes("class=\"task-checkbox task-checked\""));
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

    it("rewrites markdown images to safe links", () => {
        const result = renderMarkdown("![cat](https://example.com/cat.png)");
        assert.ok(!result.includes("<img"));
        assert.ok(result.includes("[image: cat]"));
        assert.ok(result.includes("href=\"https://example.com/cat.png\""));
        assert.ok(result.includes("rel=\"noopener nofollow\""));
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
            "- [ ] Todo"
        ].join("\n");
        const result = renderMarkdown(input);
        writeSnapshot("gfm-sample", result);
    });

    it("snapshot: simple message", () => {
        const result = renderMarkdown(
            "Hey! Here's a **cool idea**: try `console.log` and see https://example.com for more."
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

function createTestWindow(options?: ConstructorParameters<typeof Window>[0]): Window {
    const win = new Window(options);
    Object.assign(win, { SyntaxError, TypeError });
    return win;
}

import {
    autoResizeInput,
    closeLightbox,
    createElement,
    deleteProfile,
    fetchHistory,
    fetchProfile,
    init,
    loadAssets,
    loadHistory,
    normalizedProfileFromForm,
    openLightbox,
    parseSSEChunk as appParseSSEChunk,
    parseSSELine as appParseSSELine,
    putProfile,
    renderAssistantMessage,
    renderProfileAvatar,
    renderSteerMessage,
    renderThinkingBlock,
    renderToolCardLoading,
    renderToolResult,
    renderUserMessage,
    sendCreateTool,
    sendMessage,
    sendSteer,
    sendSteerMessage,
    showError,
    streamChat,
    updateQuotaBadge
} from "../../public/app.ts";

// ── DOM Setup Helpers ────────────────────────────────────────────────

/**
 * Creates a full DOM environment with all elements that app.ts expects.
 * Sets globalThis.document, window, localStorage, etc.
 */
function setupDOM(): { win: Window; doc: Document; errors: string[]; } {
    const win = createTestWindow();
    const doc = win.document;

    // Inject clearAllIntervals for test cleanup — clears intervals started by app.ts init()

    // Build the full DOM structure
    doc.body.innerHTML = `
    <header>
      <div class="header-left"><span class="header-emoji">🧞</span></div>
      <div class="header-right">
        <span id="connection-status" class="status-dot" title="Connected"></span>
        <button id="quota-badge">
          <span class="quota-item" data-type="general">🧮 <span class="quota-used">—</span></span>
          <span class="quota-item" data-type="video">🎬 <span class="quota-used">—</span></span>
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
    <div id="typing-indicator" role="status" aria-live="polite" aria-label="Genie is thinking" aria-hidden="true"></div>
    <div id="lightbox" role="dialog" aria-modal="true" aria-label="Image preview" hidden>
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content"><img id="lightbox-img" /></div>
      <button class="lightbox-close" aria-label="Close image preview">×</button>
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
          <button id="profile-avatar-preview" type="button" aria-label="Current avatar. Click to upload image">
            <span id="profile-avatar-fallback">🎮</span>
            <img id="profile-avatar-img" hidden />
            <span class="profile-avatar-spinner"></span>
          </button>
          <span id="profile-avatar-status" role="status" aria-live="polite">Avatar ready.</span>
          <input id="profile-avatar-asset" type="hidden" />
          <input id="profile-avatar-upload" type="file" />
          <button type="submit">Save</button>
          <button id="profile-reset" type="button">Reset</button>
          <button id="profile-generate" type="button">Generate avatar 🎨</button>
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
          <button class="create-tab" data-tab="video">🎬 Video</button>
          <button class="create-tab" data-tab="cover">🎧 Cover Song</button>
          <button class="create-tab" data-tab="voice">🎤 Voice</button>
          <button class="create-tab" data-tab="analyze">🔎 Analyze</button>
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
            <select id="img-count"><option value="">1 picture</option><option value="2">2 pictures</option></select>
            <select id="img-size"><option value="">Genie picks</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select>
            <input id="img-seed" type="hidden" />
            <button id="img-seed-random" type="button">Roll surprise code 🎲</button>
            <button id="img-seed-clear" type="button" disabled>Clear surprise code</button>
            <p id="img-seed-status" role="status">Optional: same code can make a similar picture again.</p>
            <input id="img-width" type="hidden" />
            <input id="img-height" type="hidden" />
            <input id="img-reference-asset" type="hidden" />
            <input id="img-reference-file" type="file" />
            <p id="img-reference-status" role="status"></p>
            <div id="img-reference-preview" hidden></div>
            <button id="img-reference-clear" type="button" disabled>Clear reference</button>
            <input id="img-prompt-optimizer" type="checkbox" />
            <button id="img-submit" class="create-submit" type="submit" disabled>Generate image</button>
          </form>
          <form id="create-music-form" class="create-panel" data-panel="music" hidden>
            <div class="form-group">
              <textarea id="music-prompt"></textarea>
            </div>
            <div class="form-group">
              <textarea id="music-lyrics"></textarea>
            </div>
            <button id="write-lyrics-btn" type="button">Write lyrics</button>
          </form>
          <form id="create-video-form" class="create-panel" data-panel="video" hidden>
            <textarea id="video-prompt"></textarea>
            <select id="video-duration"><option value="6">6 seconds</option><option value="10">10 seconds</option></select>
            <select id="video-resolution"><option value="768p">768p</option><option value="1080p">1080p</option></select>
          </form>
          <form id="create-cover-form" class="create-panel" data-panel="cover" hidden>
            <select id="cover-source-kind"><option value="direct">Audio URL</option><option value="upload">Audio file</option><option value="youtube">YouTube link</option></select>
            <div class="cover-url-group"><input id="cover-audio-url" /></div>
            <div class="cover-file-group"><input id="cover-audio-file" type="file" /></div>
            <textarea id="cover-style"></textarea>
            <button id="cover-preprocess" type="button">Prepare cover lyrics</button>
            <input id="cover-feature-id" type="hidden" />
            <p id="cover-status" role="status"></p>
            <textarea id="cover-lyrics"></textarea>
            <button id="cover-generate" type="button" disabled>Prepare source first 🎧</button>
          </form>
          <form id="create-voice-form" class="create-panel" data-panel="voice" hidden>
            <div class="form-group">
              <textarea id="voice-text" maxlength="50000"></textarea>
            </div>
            <select id="voice-pause-duration"><option value="0.5">0.5 sec</option></select>
            <button id="voice-insert-pause" type="button">Insert pause</button>
            <select id="voice-interjection"><option value="laughs">laughs</option></select>
            <button id="voice-insert-interjection" type="button">Insert interjection</button>
            <p id="voice-composer-status" role="status"></p>
            <div class="form-group">
              <select id="voice-speed">
                <option value="1.0" selected>1.0x</option>
              </select>
            </div>
            <select id="voice-id"><option value="English_expressive_narrator">Expressive Narrator</option></select>
            <input id="voice-volume" type="range" value="1" />
            <input id="voice-pitch" type="range" value="0" />
          </form>
          <form id="create-analyze-form" class="create-panel" data-panel="analyze" hidden>
            <div class="form-group">
              <input id="analyze-url" />
            </div>
            <div class="form-group">
              <textarea id="analyze-prompt">What do you see?</textarea>
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
    Object.assign(globalThis, {
        Event: win.Event,
        MouseEvent: win.MouseEvent,
        KeyboardEvent: win.KeyboardEvent,
        InputEvent: win.InputEvent,
        FocusEvent: win.FocusEvent,
        CustomEvent: win.CustomEvent
    });
    const localStore = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => localStore.get(key) ?? null,
        setItem: (key: string, value: string) => localStore.set(key, value),
        removeItem: (key: string) => localStore.delete(key)
    };
    globalThis.requestAnimationFrame = (cb: () => void) => {
        cb();
        return 1;
    };

    const errors: string[] = [];
    globalThis.fetch = () => {
        return Promise.resolve(new Response(null, { status: 500 }));
    };

    return { win, doc, errors };
}

/**
 * Creates a mock SSE response body (ReadableStream) from an array of SSE chunks.
 */
function createSSEResponse(
    chunks: string[],
    options: { status?: number; json?: unknown; } = {}
): Response {
    const status = options.status ?? 200;
    if (status !== 200) {
        const body = options.json ? JSON.stringify(options.json) : "{}";
        return new Response(body, {
            status,
            headers: { "Content-Type": "application/json" }
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
                    offset + Math.max(1, Math.ceil(fullBody.length / chunks.length))
                );
                controller.enqueue(encoder.encode(chunk));
                offset += chunk.length;
            } else {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
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

describe("exported app edge helpers", () => {
    it("parses SSE comments, trailing buffers, and data-only events", () => {
        assert.equal(appParseSSELine(":keep-alive"), null);
        assert.deepEqual([...appParseSSEChunk("data: {\"delta\":\"tail\"}")], [
            { event: "message", data: "{\"delta\":\"tail\"}" }
        ]);
    });

    it("createElement handles missing attrs and node children", () => {
        setupDOM();
        const child = document.createElement("strong");
        child.textContent = "node";
        const el = createElement("p", undefined, ["text ", child]);
        assert.equal(el.tagName, "P");
        assert.equal(el.textContent, "text node");
    });

    it("asset avatar falls back on image load error", () => {
        setupDOM();
        const avatar = renderProfileAvatar({
            version: 1,
            username: "",
            avatar: { kind: "asset", value: "asset_dead-beef" },
            preferences: { tone: "", safety: "", theme: "" }
        });
        const img = avatar.querySelector("img") as HTMLImageElement;
        img.dispatchEvent(new Event("error"));
        assert.equal(avatar.textContent, "🎮");
    });

    it("tool tweak button dispatches tweak detail", () => {
        setupDOM();
        const card = renderToolResult(
            "generate_image",
            { type: "image", content: "/asset/a.png" },
            {
                prompt: "cat"
            }
        );
        let detail: unknown;
        document.addEventListener("hallucygenie:tweak-tool", (event) => {
            detail = (event as CustomEvent).detail;
        });
        (card.querySelector(".tool-tweak-button") as HTMLButtonElement).click();
        assert.deepEqual(detail, { toolName: "generate_image", input: { prompt: "cat" } });
    });

    it("loadAssets shows failure copy on fetch rejection", async () => {
        setupDOM();
        globalThis.fetch = () => Promise.reject(new Error("offline"));
        loadAssets();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const empty = document.querySelector("#assets-empty") as HTMLElement;
        assert.equal(empty.hidden, false);
        assert.equal(empty.textContent, "Failed to load assets 😕");
    });

    it("showError hides provider JSON and leaked bearer tokens", () => {
        setupDOM();
        showError("authorization: Bearer abc.def-123");
        assert.equal(
            document.querySelector("#error-toast-message")?.textContent,
            "Something went wrong. Try again! 🤷"
        );
    });
});

describe("streamChat error paths", () => {
    let doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("400 response → showError with session expired message", async () => {
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "Bad request" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                })
            );

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Bad request");
    });

    it("400 with unparseable JSON → shows default message", async () => {
        globalThis.fetch = () => Promise.resolve(new Response("not json", { status: 400 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Session expired — please reload the page 🔄");
    });

    it("503 response → showError with error message", async () => {
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "Service unavailable" }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" }
                })
            );

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Service unavailable");
    });

    it("503 with unparseable JSON → shows status code message", async () => {
        globalThis.fetch = () => Promise.resolve(new Response("not json", { status: 503 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Something went wrong (503). Try again! 🤷");
    });

    it("200 with null body → showError 'No response'", async () => {
        globalThis.fetch = () => Promise.resolve(new Response(null, { status: 200 }));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "No response from server 😴");
    });

    it("assistant turn start resets prior streamed assistant buffers", async () => {
        setupDOM();
        const chunks = [
            sseText("first"),
            sseEvent("assistant_turn_start", "{}"),
            sseText("second"),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("hi");

        assert.equal(document.querySelectorAll(".message--assistant").length, 2);
        assert.match(document.querySelector("#message-list")?.textContent ?? "", /first/);
        assert.match(document.querySelector("#message-list")?.textContent ?? "", /second/);
    });

    it("processes trailing SSE buffer without final blank line", async () => {
        setupDOM();
        const encoder = new TextEncoder();
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(encoder.encode("data: {\"delta\":\"tail\"}"));
                            controller.close();
                        }
                    }),
                    { status: 200 }
                )
            );
        const events: Array<{ event: string; data: string; }> = [];
        await streamChat([{ role: "user", content: "hi" }], (event) => events.push(event));
        assert.deepEqual(events, [{ event: "message", data: "{\"delta\":\"tail\"}" }]);
    });

    it("network error (fetch throws) → rejects with error", async () => {
        globalThis.fetch = () => Promise.reject(new Error("Network error"));

        // streamChat doesn't catch — it propagates. sendMessage catches.
        await assert.rejects(
            () => streamChat([{ role: "user", content: "hi" }]),
            /Network error/
        );
    });

    it("onEvent callback receives events", async () => {
        const events: SSEEvent[] = [];
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("hello"), sseDone()]));

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));
        assert.ok(events.length > 0);
        assert.equal(events[0].event, "message");
    });

    it("posts chat without X-Session-Id header", async () => {
        let request: RequestInit | undefined;
        globalThis.fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(createSSEResponse([sseDone()]));
        };

        await streamChat([{ role: "user", content: "hi" }]);
        assert.ok(request);
        assert.equal((request.headers as Record<string, string>)["X-Session-Id"], undefined);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 3: streamChat SSE Processing
// ═══════════════════════════════════════════════════════════════════════

describe("streamChat SSE processing", () => {
    let doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("text events → content accumulated via appendText", async () => {
        const events: SSEEvent[] = [];
        const chunks = [sseText("Hello "), sseText("world"), sseDone()];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        // Need to set up currentAssistantContent for appendText to work
        // We do this by creating an assistant message container and appending it
        const messageList = doc.querySelector("#message-list");
        const { container } = renderAssistantMessage();
        messageList.appendChild(container);

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));

        // The content element should have the rendered text
        // Note: since module state isn't reset, currentAssistantContent might be null
        // But the SSE events are delivered via onEvent callback
        assert.ok(events.some((e) => e.data.includes("Hello")));
    });

    it("renders markdown during streaming before final done", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const enc = new TextEncoder();
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
            }
        });
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
            );

        const promise = sendMessage("stream markdown");
        controller.enqueue(enc.encode(sseText("## Thumbnail Ideas\n\n")));
        await new Promise((r) => setTimeout(r, 25));

        const region = doc.querySelector(".assistant-text-region");
        assert.ok(region?.classList.contains("is-streaming"));
        assert.ok(doc.querySelector(".assistant-text-region h2 .stream-chunk"));
        assert.equal(region?.classList.contains("stream-render-tick"), false);
        assert.equal(region?.textContent?.includes("##"), false);

        controller.enqueue(enc.encode(sseText("- **Big Sparkle Face** with `OMG!` text\n")));
        await new Promise((r) => setTimeout(r, 25));

        assert.ok(doc.querySelector(".assistant-text-region strong"));
        assert.ok(doc.querySelector(".assistant-text-region code"));
        assert.ok(doc.querySelector(".assistant-text-region li .stream-chunk"));
        assert.equal(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("**"),
            false
        );
        assert.equal(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("`"),
            false
        );

        controller.enqueue(enc.encode(sseDone()));
        controller.close();
        await promise;

        assert.ok(doc.querySelector(".assistant-text-region strong"));
        assert.equal(
            doc.querySelector(".assistant-text-region")?.classList.contains("is-streaming"),
            false
        );
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
                        content: "https://example.com/cat.png"
                    }
                })
            ),
            sseText("done"),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("make image");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(doc.querySelectorAll(".tool-card-loading").length, 0);
        assert.equal(doc.querySelectorAll(".tool-result-image").length, 1);
        assert.ok(doc.querySelector(".tool-card")?.textContent?.includes("generate image"));
        assert.ok(doc.querySelector(".assistant-text-region")?.innerHTML.includes("done"));
        writeSnapshot(
            "assistant-tool-text-mixed",
            doc.querySelector(".message--assistant:last-child")?.outerHTML
        );
    });

    it("create draft clears only after successful tool result", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        const calls: Array<{ url: string; method: string; }> = [];
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-ok", name: "text_to_speech" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-ok",
                    name: "text_to_speech",
                    result: { type: "audio", content: "/asset/voice.mp3" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? "GET" });
            if (String(url) === "/api/chat") return Promise.resolve(createSSEResponse(chunks));
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendMessage("Use text_to_speech with text: hello", "create");
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(
            calls.some((call) => call.url === "/api/draft/create" && call.method === "DELETE"),
            true
        );
    });

    it("renders streamed video tool results as playable video cards", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-video", name: "generate_video" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-video",
                    name: "generate_video",
                    result: { type: "video", content: "/asset/clip.mp4" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string) => {
            if (String(url) === "/api/chat") return Promise.resolve(createSSEResponse(chunks));
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendMessage("Make a fox video");

        const video = doc.querySelector("video.tool-result-video") as HTMLVideoElement | null;
        assert.ok(video);
        assert.equal(video.getAttribute("src"), "/asset/clip.mp4");
    });

    it("Create tool endpoint renders kid label and clears draft after success", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        const calls: Array<{ url: string; method: string; body: string; }> = [];
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-ok", name: "generate_image" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-ok",
                    name: "generate_image",
                    result: { type: "image", content: "/asset/img.png" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({
                url: String(url),
                method: init?.method ?? "GET",
                body: String(init?.body ?? "")
            });
            if (String(url) === "/api/create-tool") {
                return Promise.resolve(createSSEResponse(chunks));
            }
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendCreateTool("generate_image", { prompt: "cat" }, "Create image: cat");
        await new Promise((resolve) => setTimeout(resolve, 0));

        const createCall = calls.find((call) => call.url === "/api/create-tool");
        assert.ok(createCall);
        assert.deepEqual(JSON.parse(createCall.body), {
            tool_name: "generate_image",
            input: { prompt: "cat" }
        });
        assert.equal(
            doc.querySelector(".message--user")?.textContent?.includes("Create image: cat"),
            true
        );
        assert.equal(
            doc.querySelector(".message--user")?.textContent?.includes("Use generate_"),
            false
        );
        assert.equal(
            calls.some((call) => call.url === "/api/draft/create" && call.method === "DELETE"),
            true
        );
    });

    it("Create lyrics helper does not clear create draft", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        const calls: Array<{ url: string; method: string; body: string; }> = [];
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "lyrics-ok", name: "generate_lyrics" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "lyrics-ok",
                    name: "generate_lyrics",
                    result: { type: "text", content: "Verse one\nChorus" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({
                url: String(url),
                method: init?.method ?? "GET",
                body: String(init?.body ?? "")
            });
            if (String(url) === "/api/create-tool") {
                return Promise.resolve(createSSEResponse(chunks));
            }
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendCreateTool("generate_lyrics", { prompt: "boss" }, "Write lyrics: boss", false);
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(
            calls.some((call) => call.url === "/api/draft/create" && call.method === "DELETE"),
            false
        );
    });

    it("create draft survives when stream has no tool success", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        const calls: Array<{ url: string; method: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? "GET" });
            if (String(url) === "/api/chat") {
                return Promise.resolve(createSSEResponse([sseText("no tool"), sseDone()]));
            }
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendMessage("write only", "create");
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(
            calls.some((call) => call.url === "/api/draft/create" && call.method === "DELETE"),
            false
        );
    });

    it("draft API failures never block restore, save, or clear", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        globalThis.fetch = (url: string, _init?: RequestInit) => {
            if (String(url).startsWith("/api/draft/")) {
                return Promise.reject(new Error("draft db down"));
            }
            if (String(url) === "/api/chat") return Promise.resolve(createSSEResponse([sseDone()]));
            if (String(url) === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };

        init();
        await Promise.resolve();
        (doc.querySelector("#create-btn") as HTMLButtonElement).click();
        (doc.querySelector("#create-close") as HTMLButtonElement).click();
        await sendMessage("hello");

        assert.equal((doc.querySelector("#create-modal") as HTMLElement).hidden, true);
    });

    it("sendMessage shows connection error when chat stream fails", async () => {
        setupDOM();
        globalThis.fetch = () => Promise.reject(new Error("offline"));

        await sendMessage("hello");

        assert.match(
            document.querySelector("#error-toast-message")?.textContent ?? "",
            /Connection lost/
        );
    });

    it("sendCreateTool shows connection error when create stream fails", async () => {
        setupDOM();
        globalThis.fetch = () => Promise.reject(new Error("offline"));
        await sendCreateTool("generate_image", { prompt: "cat" }, "Create image: cat");
        assert.match(
            document.querySelector("#error-toast-message")?.textContent ?? "",
            /Connection lost/
        );
    });

    it("sendSteerMessage ignores blank/non-streaming and reports steer failures while streaming", async () => {
        setupDOM();
        await sendSteerMessage("ignored");
        assert.equal(document.querySelector("#message-list")?.textContent ?? "", "");

        let calls = 0;
        let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
        globalThis.fetch = (url: string) => {
            calls++;
            if (url === "/api/chat") {
                return Promise.resolve(
                    new Response(
                        new ReadableStream({
                            start(c) {
                                controller = c;
                            }
                        }),
                        { status: 200 }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({ error: "no" }), { status: 500 }));
        };
        const pending = sendMessage("hi");
        await new Promise((resolve) => setTimeout(resolve, 20));
        await sendSteerMessage("left please");
        assert.match(document.querySelector("#message-list")?.textContent ?? "", /left please/);
        assert.match(
            document.querySelector("#error-toast-message")?.textContent ?? "",
            /Couldn't steer/
        );
        assert.equal(calls >= 2, true);
        controller?.close();
        await pending;
    });

    it("tool result error preserves create draft after done", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        doc.body.appendChild(sessionSelect);
        const calls: Array<{ url: string; method: string; }> = [];
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-err", name: "text_to_speech" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-err",
                    name: "text_to_speech",
                    result: { type: "error", content: "bad text" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? "GET" });
            if (String(url) === "/api/chat") return Promise.resolve(createSSEResponse(chunks));
            return Promise.resolve(new Response("{}", { status: 200 }));
        };

        await sendMessage("Use text_to_speech with text: bad", "create");
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(
            calls.some((call) => call.url === "/api/draft/create" && call.method === "DELETE"),
            false
        );
        assert.ok(doc.querySelector(".tool-card")?.textContent?.includes("bad text"));
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
                        content: "https://example.com/cat.png"
                    }
                })
            ),
            sseEvent("thinking", JSON.stringify({ content: "checking result" })),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("make image");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.ok(
            doc
                .querySelector(".assistant-thinking-region")
                ?.textContent?.includes("checking result")
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
                    result: { type: "image", content: "https://example.com/cat.png" }
                })
            ),
            sseText("still works"),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("orphan result");

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(doc.querySelectorAll(".tool-result-image").length, 1);
        assert.ok(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("still works")
        );
    });

    it("tool_start event → tool card created", async () => {
        const events: SSEEvent[] = [];
        const toolStartData = JSON.stringify({ id: "tool-1", name: "generate_image" });
        const chunks = [sseEvent("tool_start", toolStartData), sseDone()];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        const messageList = doc.querySelector("#message-list");
        const { container } = renderAssistantMessage();
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
            result: { type: "image", content: "data:image/png;base64,abc" }
        });
        const chunks = [
            sseEvent("tool_start", toolStartData),
            sseEvent("tool_result", toolResultData),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        const messageList = doc.querySelector("#message-list");
        const { container } = renderAssistantMessage();
        messageList.appendChild(container);

        await streamChat([{ role: "user", content: "draw" }], (e) => events.push(e));
        assert.ok(events.some((e) => e.event === "tool_start"));
        assert.ok(events.some((e) => e.event === "tool_result"));
    });

    it("keeps bottom-follow when image tool result grows after load", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const messageList = doc.querySelector("#message-list");
        let scrollTop = 500;
        let scrollHeight = 1000;
        Object.defineProperties(messageList, {
            scrollTop: {
                get: () => scrollTop,
                set: (value) => (scrollTop = value),
                configurable: true
            },
            scrollHeight: { get: () => scrollHeight, configurable: true },
            clientHeight: { get: () => 500, configurable: true }
        });
        const chunks = [
            sseEvent("tool_start", JSON.stringify({ id: "tool-grow", name: "generate_image" })),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "tool-grow",
                    name: "generate_image",
                    result: { type: "image", content: "https://example.com/big.png" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "draw" }]);
        assert.equal(scrollTop, 1000);

        scrollHeight = 1600;
        doc.querySelector(".tool-result-image")?.dispatchEvent(new Event("load"));
        assert.equal(scrollTop, 1600);
    });

    it("does not force-scroll orphan tool results when user scrolled up", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const messageList = doc.querySelector("#message-list");
        let scrollTop = 100;
        Object.defineProperties(messageList, {
            scrollTop: {
                get: () => scrollTop,
                set: (value) => (scrollTop = value),
                configurable: true
            },
            scrollHeight: { get: () => 1000, configurable: true },
            clientHeight: { get: () => 500, configurable: true }
        });
        const chunks = [
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "orphan-grow",
                    name: "generate_image",
                    result: { type: "image", content: "https://example.com/orphan.png" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "draw" }]);
        doc.querySelector(".tool-result-image")?.dispatchEvent(new Event("load"));

        assert.equal(scrollTop, 100);
    });

    it("[DONE] signal → stream finishes", async () => {
        const events: SSEEvent[] = [];
        const chunks = [sseText("hi"), sseEvent("message", "[DONE]")];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }], (e) => events.push(e));
        // Stream should complete without error
        assert.ok(true);
    });

    it("closed stream without DONE removes streaming caret state", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("**hi**")]));

        await sendMessage("stream closes early");

        assert.ok(doc.querySelector(".assistant-text-region strong"));
        assert.equal(doc.querySelectorAll(".assistant-text-region.is-streaming").length, 0);
        assert.equal(doc.querySelectorAll(".stream-chunk").length, 0);
    });

    it("stream completion clears stale caret state from previous messages", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const messageList = doc.querySelector("#message-list");
        messageList.innerHTML =
            `<div class="message message--assistant"><div class="message-bubble"><div class="message-content"><div class="assistant-text-region is-streaming"><span class="stream-chunk">old done</span></div></div></div></div>`;
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseDone()]));

        await sendMessage("next turn");

        assert.equal(doc.querySelectorAll(".assistant-text-region.is-streaming").length, 0);
        assert.equal(doc.querySelectorAll(".stream-chunk").length, 0);
        assert.ok(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("old done")
        );
    });

    it("[DONE] signal converts steer bubbles to normal user bubbles", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;
        const messageList = doc.querySelector("#message-list");
        messageList.appendChild(renderSteerMessage("late steer"));
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseDone()]));

        await streamChat([{ role: "user", content: "hi" }]);

        assert.equal(doc.querySelectorAll(".message--steer").length, 0);
        assert.equal(doc.querySelectorAll(".message--user").length, 1);
    });

    it("error event → showError called", async () => {
        const chunks = [sseEvent("error", JSON.stringify({ error: "Server error" }))];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Server error");
    });

    it("error event with unparseable JSON → shows default error", async () => {
        const chunks = [sseEvent("error", "not json")];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await streamChat([{ role: "user", content: "hi" }]);
        const msg = doc.querySelector("#error-toast-message").textContent;
        assert.equal(msg, "Something went wrong 😕");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 4: appendText via sendMessage (indirect test)
// ═══════════════════════════════════════════════════════════════════════

describe("appendText with thinking blocks (via sendMessage)", () => {
    let doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        doc = d;
    });

    it("plain text → renders via markdown", async () => {
        globalThis.fetch = () =>
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
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

        await sendMessage("test thinking");

        // Should have thinking block in the output
        const thinkingBlocks = doc.querySelectorAll(".thinking-block");
        assert.ok(thinkingBlocks.length > 0, "should have thinking block");
    });

    it("thinking event followed by regular text", async () => {
        const { doc: newDoc } = setupDOM();
        doc = newDoc;

        const chunks = [
            sseThinking("internal thought"),
            sseText("The answer is 42."),
            sseDone()
        ];
        globalThis.fetch = () => Promise.resolve(createSSEResponse(chunks));

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
        const before = globalThis.localStorage.length;
        const profile = normalizedProfileFromForm({
            username: "  GamerKid  ",
            interests: " Minecraft ",
            hates: " spam ",
            favorites: "redstone"
        });

        assert.equal(profile.username, "GamerKid");
        assert.equal(profile.interests, "Minecraft");
        assert.deepEqual(profile.avatar, { type: "asset", value: "" });
        assert.equal(globalThis.localStorage.length, before);
    });

    it("rejects invalid avatar asset ids before save", () => {
        setupDOM();
        assert.throws(
            () =>
                normalizedProfileFromForm({
                    username: "GamerKid",
                    interests: "",
                    hates: "",
                    favorites: "",
                    avatarAsset: "data:image/png;base64,abc"
                }),
            /Avatar asset id is invalid/
        );
    });

    it("preserves uploaded asset avatar from the form", () => {
        setupDOM();
        const profile = normalizedProfileFromForm({
            username: "GamerKid",
            interests: "Minecraft",
            hates: "spam",
            favorites: "blue fire",
            avatarAsset: "asset_123abc"
        });

        assert.deepEqual(profile.avatar, { type: "asset", value: "asset_123abc" });
    });

    it("renders fallback and asset avatars", () => {
        setupDOM();
        const fallback = renderProfileAvatar({
            version: 1,
            username: "",
            interests: "",
            hates: "",
            favorites: "",
            avatar: { type: "asset", value: "" },
            updatedAt: 1
        });
        assert.equal(fallback.textContent, "🎮");

        const asset = renderProfileAvatar({
            version: 1,
            username: "",
            interests: "",
            hates: "",
            favorites: "",
            avatar: { type: "asset", value: "asset_123abc" },
            updatedAt: 1
        });
        assert.equal(asset.querySelector("img")?.getAttribute("src"), "/asset/asset_123abc");
    });

    it("profile API helpers use DB routes", async () => {
        setupDOM();
        const calls: Array<{ url: string; method: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url, method: init?.method ?? "GET" });
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        version: 1,
                        username: "GamerKid",
                        interests: "",
                        hates: "",
                        favorites: "",
                        avatar: { type: "asset", value: "" },
                        updatedAt: 1
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
            );
        };

        await fetchProfile();
        await putProfile(
            normalizedProfileFromForm({
                username: "x",
                interests: "",
                hates: "",
                favorites: ""
            })
        );
        await deleteProfile();

        assert.deepEqual(calls, [
            { url: "/api/profile", method: "GET" },
            { url: "/api/profile", method: "PUT" },
            { url: "/api/profile", method: "DELETE" }
        ]);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 5: sendMessage
// ═══════════════════════════════════════════════════════════════════════

describe("sendMessage", () => {
    let doc: Document;

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
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("Hello bot");

        const userMsg = doc.querySelector(".message--user");
        assert.ok(userMsg, "user message element should exist");
        assert.ok(userMsg.textContent.includes("Hello bot"));
    });

    it("creates assistant message element", async () => {
        setupDOM();
        doc = globalThis.document;
        globalThis.fetch = () =>
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
        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test message");

        assert.equal(input.value, "", "input should be cleared");
    });

    it("while streaming → delegates to sendSteerMessage", async () => {
        setupDOM();
        doc = globalThis.document;

        // First send: start streaming and keep the stream open until this test closes it.
        const encoder = new TextEncoder();
        let streamController!: ReadableStreamDefaultController<Uint8Array>;
        globalThis.fetch = () => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    streamController = controller;
                    controller.enqueue(encoder.encode(sseText("thinking...")));
                }
            });
            return Promise.resolve(new Response(stream, { status: 200 }));
        };

        // Start the first message (don't await — it stays streaming)
        const firstSend = sendMessage("first message");

        // Wait a tick for isStreaming to be set
        await new Promise((r) => setTimeout(r, 50));

        // Mock steer endpoint
        let steerCalled = false;
        globalThis.fetch = () => {
            steerCalled = true;
            return Promise.resolve(new Response(null, { status: 200 }));
        };

        // Second send while streaming should go to steer
        await sendMessage("steer this");

        assert.ok(steerCalled, "steer endpoint should be called");

        // Clean up so later tests do not inherit the streaming module state.
        streamController.enqueue(encoder.encode(sseDone()));
        streamController.close();
        await firstSend;
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 6: loadHistory
// ═══════════════════════════════════════════════════════════════════════

describe("loadHistory", () => {
    let doc: Document;

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

        globalThis.fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify({ messages: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
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

        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            { role: "user", content: "Hello" },
                            { role: "assistant", content: "Hi there!" },
                            { role: "user", content: "How are you?" },
                            { role: "assistant", content: "I'm doing great!" }
                        ]
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
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

        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "Done.",
                                thinking: "I should use the image tool.",
                                tool_calls_json: JSON.stringify([
                                    { id: "tc-history-1", name: "generate_image", input: {} }
                                ])
                            },
                            {
                                role: "tool",
                                content: "/asset/asset_abc?s=session-1",
                                tool_call_id: "tc-history-1"
                            }
                        ]
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
            );

        await loadHistory();

        assert.ok(doc.querySelector(".thinking-block")?.textContent?.includes("I should use"));
        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.equal(
            (doc.querySelector(".tool-result-image") as HTMLImageElement | null)?.getAttribute(
                "src"
            ),
            "/asset/asset_abc?s=session-1"
        );
        assert.ok(doc.querySelector(".assistant-text-region")?.textContent?.includes("Done."));
    });

    it("history ignores malformed tool call JSON and infers audio/video tool cards", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "Bad metadata survives.",
                                tool_calls_json: "{bad json"
                            },
                            {
                                role: "assistant",
                                content: "",
                                tool_calls_json: JSON.stringify([
                                    { id: "tc-audio", name: "text_to_speech", input: {} },
                                    { id: "tc-video", name: "generate_video", input: {} },
                                    { id: 42, name: null, input: {} }
                                ])
                            },
                            {
                                role: "tool",
                                content: "https://cdn.example/sound.mp3",
                                tool_call_id: "tc-audio"
                            },
                            {
                                role: "tool",
                                content: "https://cdn.example/movie.mp4",
                                tool_call_id: "tc-video"
                            }
                        ]
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
            );

        await loadHistory();

        assert.ok(
            doc.querySelector(".assistant-text-region")?.textContent?.includes("Bad metadata")
        );
        assert.equal(doc.querySelectorAll("audio.tool-result-audio").length, 1);
        assert.equal(doc.querySelectorAll("video.tool-result-video").length, 1);
    });

    it("history rehydrates tool errors", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "",
                                tool_calls_json: JSON.stringify([
                                    { id: "tc-error-1", name: "generate_music", input: {} }
                                ])
                            },
                            {
                                role: "tool",
                                content: "Error: Couldn't generate music.",
                                tool_call_id: "tc-error-1"
                            }
                        ]
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
            );

        await loadHistory();

        assert.equal(doc.querySelectorAll(".tool-card").length, 1);
        assert.ok(
            doc.querySelector(".tool-card")?.textContent?.includes("😕 Couldn't generate music.")
        );
    });

    it("fetch fails → no crash", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () => Promise.reject(new Error("Network error"));

        // Should not throw
        await loadHistory();
        assert.ok(true, "should not crash");
    });

    it("loadHistory restores video tool cards and plain text tool fallbacks", async () => {
        setupDOM();
        doc = globalThis.document;
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        messages: [
                            {
                                role: "assistant",
                                content: "Here",
                                tool_calls_json: JSON.stringify([
                                    { id: "video-tool", name: "generate_video", input: {} },
                                    { id: "text-tool", name: "web_search", input: {} }
                                ])
                            },
                            {
                                role: "tool",
                                content: "/asset/movie.mp4",
                                tool_call_id: "video-tool"
                            },
                            { role: "tool", content: "plain result", tool_call_id: "text-tool" }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        await loadHistory();

        assert.ok(doc.querySelector("video.tool-result-video"));
        assert.match(doc.querySelector("#message-list")?.textContent ?? "", /plain result/);
    });

    it("fetch returns non-OK → throws and loadHistory catches", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await loadHistory();
        assert.ok(true, "should not crash");
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 7: init Event Binding
// ═══════════════════════════════════════════════════════════════════════

describe("init event binding", () => {
    let doc: Document;
    let win: Window;

    function setupFullDOM(): void {
        const result = setupDOM();
        win = result.win;
        doc = result.doc;
    }

    it("form submit → calls sendMessage", async () => {
        setupFullDOM();

        let sendMessageCalled = false;
        const _origFetch = globalThis.fetch;
        globalThis.fetch = () => {
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
        globalThis.fetch = () => {
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
        globalThis.fetch = (url: string, _opts: RequestInit | undefined) => {
            if (url === "/api/chat") {
                chatFetchCalled = true;
            }
            // Return appropriate response based on URL
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
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

    it("DB empty chat draft clears Firefox-restored text", async () => {
        setupFullDOM();

        const input = doc.querySelector("#chat-input");
        input.value = "browser restored stale draft";

        globalThis.fetch = (url: string) => {
            if (url === "/api/draft/chat") {
                return Promise.resolve(
                    new Response(JSON.stringify({ draft: null }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/draft/create") {
                return Promise.resolve(
                    new Response(JSON.stringify({ draft: null }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/sessions") {
                return Promise.resolve(
                    new Response(JSON.stringify({ activeSessionId: "s1", sessions: [] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };

        init();
        await new Promise((r) => setTimeout(r, 20));

        assert.equal(input.value, "");
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

    it("Create image surprise code can be cleared", async () => {
        setupFullDOM();
        init();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const prompt = doc.querySelector("#img-prompt");
        const seed = doc.querySelector("#img-seed");
        const roll = doc.querySelector("#img-seed-random");
        const clear = doc.querySelector("#img-seed-clear");
        const status = doc.querySelector("#img-seed-status");
        const submit = doc.querySelector("#img-submit");

        prompt.value = "cat";
        prompt.dispatchEvent(new win.Event("input"));
        roll.click();
        assert.ok(seed.value);
        assert.equal(clear.disabled, false);
        assert.equal(submit.disabled, false);

        clear.click();
        assert.equal(seed.value, "");
        assert.equal(clear.disabled, true);
        assert.match(status.textContent, /Optional/);
    });

    it("Create image can use an existing asset as reference", async () => {
        setupFullDOM();
        init();
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.dispatchEvent(
            new win.CustomEvent("hallucygenie:use-reference-asset", {
                detail: {
                    assetId: "asset_12345678-1234-1234-1234-123456789abc",
                    assetUrl: "/asset/asset_12345678-1234-1234-1234-123456789abc"
                }
            })
        );

        const referenceAsset = doc.querySelector("#img-reference-asset") as HTMLInputElement;
        const status = doc.querySelector("#img-reference-status") as HTMLElement;
        const preview = doc.querySelector("#img-reference-preview img") as HTMLImageElement;
        assert.equal(referenceAsset.value, "asset_12345678-1234-1234-1234-123456789abc");
        assert.match(status.textContent ?? "", /Reference ready/);
        assert.ok(preview.src.includes("/asset/asset_12345678"));
    });

    it("Pasted chat image rejects bad images and restores placeholder on upload failure", async () => {
        setupFullDOM();
        globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({}), { status: 500 }));
        init();
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        input.placeholder = "Say hi";

        const bad = new win.File(["x"], "bad.txt", { type: "text/plain" });
        const ignored = new win.Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(ignored, "clipboardData", { value: { files: [bad] } });
        input.dispatchEvent(ignored);
        assert.equal(doc.querySelector("#error-toast-message")?.textContent ?? "", "");

        const huge = new win.File(["x"], "huge.png", { type: "image/png" });
        Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024, configurable: true });
        const invalid = new win.Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(invalid, "clipboardData", { value: { files: [huge] } });
        input.dispatchEvent(invalid);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(doc.querySelector("#error-toast-message")?.textContent ?? "", /too big/);

        const good = new win.File(["png"], "clip.png", { type: "image/png" });
        const fail = new win.Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(fail, "clipboardData", { value: { files: [good] } });
        input.dispatchEvent(fail);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to upload pasted image/
        );
        assert.equal(input.placeholder, "Say hi");
    });

    it("Create image reference upload validates, previews, fails, and clears", async () => {
        setupFullDOM();
        const calls: string[] = [];
        globalThis.fetch = (url: string) => {
            calls.push(url);
            if (url === "/api/reference-image") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ assetId: "asset_ref", assetUrl: "/asset/asset_ref" }),
                        { status: 200 }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const fileInput = doc.querySelector("#img-reference-file") as HTMLInputElement;
        const asset = doc.querySelector("#img-reference-asset") as HTMLInputElement;
        const status = doc.querySelector("#img-reference-status") as HTMLElement;
        const clear = doc.querySelector("#img-reference-clear") as HTMLButtonElement;

        const bad = new win.File(["bad"], "ref.gif", { type: "image/gif" });
        Object.defineProperty(fileInput, "files", { value: [bad], configurable: true });
        fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.match(doc.querySelector("#error-toast-message")?.textContent ?? "", /PNG or JPG/);

        const good = new win.File(["jpg"], "ref.jpg", { type: "image/jpeg" });
        Object.defineProperty(fileInput, "files", { value: [good], configurable: true });
        fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(calls.includes("/api/reference-image"));
        assert.equal(asset.value, "asset_ref");
        assert.match(status.textContent ?? "", /Reference ready/);
        assert.equal(
            doc.querySelector<HTMLImageElement>("#img-reference-preview img")?.getAttribute("src"),
            "/asset/asset_ref"
        );

        clear.click();
        assert.equal(asset.value, "");
        assert.equal(clear.disabled, true);

        globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({}), { status: 500 }));
        Object.defineProperty(fileInput, "files", { value: [good], configurable: true });
        fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to upload reference/
        );
    });

    it("draft persistence runs on input, visibility hidden, and pagehide", async () => {
        setupFullDOM();
        doc.querySelector("header")?.insertAdjacentHTML(
            "beforeend",
            "<select id=\"session-select\"></select>"
        );
        const draftCalls: Array<{ url: string; body: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            if (String(url).startsWith("/api/draft/")) {
                draftCalls.push({ url: String(url), body: String(init?.body ?? "") });
                return Promise.resolve(
                    new Response(JSON.stringify({ draft: null }), { status: 200 })
                );
            }
            if (url === "/api/sessions") {
                return Promise.resolve(
                    new Response(JSON.stringify({ activeSessionId: "s1", sessions: [] }), {
                        status: 200
                    })
                );
            }
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        await new Promise((resolve) => setTimeout(resolve, 20));

        const chat = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        chat.value = "draft text";
        chat.dispatchEvent(new win.Event("input", { bubbles: true }));
        (doc.querySelector("#music-prompt") as HTMLTextAreaElement).value = "draft music";
        doc.querySelector("#music-prompt")?.dispatchEvent(
            new win.Event("input", { bubbles: true })
        );
        Object.defineProperty(doc, "visibilityState", { value: "hidden", configurable: true });
        win.dispatchEvent(new win.Event("visibilitychange"));
        win.dispatchEvent(new win.Event("pagehide"));
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.ok(
            draftCalls.some((call) =>
                call.url === "/api/draft/chat" && call.body.includes("draft text")
            )
        );
        assert.ok(
            draftCalls.some((call) =>
                call.url === "/api/draft/create" && call.body.includes("draft music")
            )
        );
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

    it("pasted chat image uploads asset and starts analyze tool", async () => {
        setupFullDOM();
        const calls: Array<{ url: string; method: string; body: unknown; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
            if (url === "/api/analyze-image") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ assetId: "asset_1", assetUrl: "/asset/asset_1" }),
                        {
                            status: 200,
                            headers: { "Content-Type": "application/json" }
                        }
                    )
                );
            }
            if (url === "/api/create-tool") {
                return Promise.resolve(createSSEResponse([sseDone()]));
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        const file = new win.File([new Uint8Array([1, 2, 3])], "paste.png", {
            type: "image/png"
        });
        const event = new win.Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
        doc.querySelector("#chat-input").dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 40));

        const upload = calls.find((call) => call.url === "/api/analyze-image");
        const create = calls.find((call) => call.url === "/api/create-tool");
        assert.ok(upload);
        assert.ok(create);
        assert.deepEqual(JSON.parse(String(create.body)), {
            tool_name: "analyze_image",
            input: { image_url: "/asset/asset_1", prompt: "What do you see in this image?" }
        });
        assert.equal(JSON.stringify(calls).includes("data:image"), false);
    });

    it("Create form submitters send exact tool payloads", async () => {
        setupFullDOM();
        const calls: Array<{ url: string; body: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), body: String(init?.body ?? "") });
            if (url === "/api/create-tool") return Promise.resolve(createSSEResponse([sseDone()]));
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        (doc.querySelector("#img-prompt") as HTMLTextAreaElement).value = "sky castle";
        (doc.querySelector("#img-seed") as HTMLInputElement).value = "12345";
        (doc.querySelector("#img-width") as HTMLInputElement).value = "1024";
        (doc.querySelector("#img-height") as HTMLInputElement).value = "576";
        (doc.querySelector("#img-reference-asset") as HTMLInputElement).value = "asset_ref";
        (doc.querySelector("#img-prompt-optimizer") as HTMLInputElement).checked = true;
        (doc.querySelector("#create-image-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));

        (doc.querySelector("#music-prompt") as HTMLTextAreaElement).value = "boss music";
        (doc.querySelector("#music-lyrics") as HTMLTextAreaElement).value = "la la";
        (doc.querySelector("#create-music-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));

        (doc.querySelector("#video-prompt") as HTMLTextAreaElement).value = "fox trailer";
        (doc.querySelector("#video-duration") as HTMLSelectElement).value = "10";
        (doc.querySelector("#video-resolution") as HTMLSelectElement).value = "1080p";
        (doc.querySelector("#create-video-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));

        (doc.querySelector("#voice-text") as HTMLTextAreaElement).value = "short line";
        (doc.querySelector("#create-voice-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));

        (doc.querySelector("#analyze-url") as HTMLInputElement).value =
            "https://example.com/cat.png";
        (doc.querySelector("#analyze-prompt") as HTMLTextAreaElement).value = "Name it";
        (doc.querySelector("#create-analyze-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));

        (doc.querySelector("#search-query") as HTMLTextAreaElement).value = "minecraft redstone";
        (doc.querySelector("#create-search-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 40));

        const payloads = calls
            .filter((call) => call.url === "/api/create-tool")
            .map((call) => JSON.parse(call.body));
        assert.deepEqual(payloads, [
            {
                tool_name: "generate_image",
                input: {
                    prompt: "sky castle",
                    aspect_ratio: "16:9",
                    prompt_optimizer: true,
                    seed: 12345,
                    width: 1024,
                    height: 576,
                    reference_asset_id: "asset_ref"
                }
            },
            {
                tool_name: "generate_music",
                input: { prompt: "boss music", lyrics: "la la" }
            },
            {
                tool_name: "generate_video",
                input: { prompt: "fox trailer", duration: 10, resolution: "1080p" }
            },
            {
                tool_name: "text_to_speech",
                input: {
                    text: "short line",
                    speed: 1,
                    voice_id: "English_expressive_narrator",
                    volume: 1,
                    pitch: 0
                }
            },
            {
                tool_name: "analyze_image",
                input: { image_url: "https://example.com/cat.png", prompt: "Name it" }
            },
            { tool_name: "web_search", input: { query: "minecraft redstone" } }
        ]);
    });

    it("What's New modal opens, traps focus, closes, and restores focus", () => {
        setupFullDOM();
        doc.querySelector("header")?.insertAdjacentHTML(
            "beforeend",
            "<button id=\"whats-new-btn\" type=\"button\">v1.0</button><div id=\"whats-new-modal\" hidden><div class=\"whats-new-backdrop\"></div><button id=\"whats-new-close\" type=\"button\">Close</button><a href=\"#x\">Link</a></div>"
        );
        init();

        const btn = doc.querySelector("#whats-new-btn") as HTMLButtonElement;
        const modal = doc.querySelector("#whats-new-modal") as HTMLElement;
        const close = doc.querySelector("#whats-new-close") as HTMLButtonElement;
        const link = modal.querySelector("a") as HTMLAnchorElement;

        btn.focus();
        btn.click();
        assert.equal(modal.hidden, false);
        assert.equal(doc.activeElement, close);

        link.focus();
        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, close);

        close.click();
        assert.equal(modal.hidden, true);
        assert.equal(doc.activeElement, btn);

        btn.click();
        modal.querySelector<HTMLElement>(".whats-new-backdrop")?.click();
        assert.equal(modal.hidden, true);
    });

    it("Create form validation blocks empty required fields", async () => {
        setupFullDOM();
        const calls: string[] = [];
        globalThis.fetch = (url: string) => {
            calls.push(String(url));
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200 }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        (doc.querySelector("#create-image-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Describe your image/
        );

        (doc.querySelector("#create-analyze-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Choose an image/
        );

        (doc.querySelector("#music-prompt") as HTMLTextAreaElement).value = "";
        doc.querySelector("#write-lyrics-btn")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Describe the music/
        );

        const coverSourceKind = doc.querySelector("#cover-source-kind") as HTMLSelectElement;
        coverSourceKind.value = "direct";
        doc.querySelector("#cover-preprocess")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Paste an audio or YouTube URL/
        );

        doc.querySelector("#cover-generate")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Prepare the cover/
        );
        assert.equal(calls.includes("/api/create-tool"), false);
    });

    it("Profile modal reports validation and API failures", async () => {
        setupFullDOM();
        globalThis.fetch = (url: string, init?: RequestInit) => {
            if (url === "/api/profile" && init?.method === "PUT") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            if (url === "/api/profile" && init?.method === "DELETE") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            if (url === "/api/profile/avatar/generate") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            if (url === "/api/profile/avatar") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        (doc.querySelector("#profile-btn") as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to load profile/
        );

        const avatarAsset = doc.querySelector("#profile-avatar-asset") as HTMLInputElement;
        avatarAsset.value = "data:image/png;base64,bad";
        (doc.querySelector("#profile-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Avatar asset id is invalid/
        );

        (doc.querySelector("#profile-generate") as HTMLButtonElement).click();
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Avatar asset id is invalid/
        );

        const avatarInput = doc.querySelector("#profile-avatar-upload") as HTMLInputElement;
        Object.defineProperty(avatarInput, "files", {
            value: [new win.File(["x"], "a.png", { type: "image/png" })],
            configurable: true
        });
        avatarInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Avatar asset id is invalid/
        );

        avatarAsset.value = "";
        (doc.querySelector("#profile-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to save profile/
        );

        (doc.querySelector("#profile-reset") as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to reset profile/
        );

        (doc.querySelector("#profile-generate") as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to generate avatar/
        );

        Object.defineProperty(avatarInput, "files", {
            value: [new win.File(["x"], "a.png", { type: "image/png" })],
            configurable: true
        });
        avatarInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to upload avatar/
        );
    });

    it("Profile modal loads, saves, resets, and uploads avatar assets", async () => {
        setupFullDOM();
        const calls: Array<{ url: string; method: string; body: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({
                url: String(url),
                method: init?.method ?? "GET",
                body: String(init?.body ?? "")
            });
            if (url === "/api/profile/avatar") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            profile: {
                                version: 1,
                                username: "Kid",
                                interests: "blocks",
                                hates: "lag",
                                favorites: "diamonds",
                                avatar: { type: "asset", value: "asset_abcdef" },
                                updatedAt: 3
                            }
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/profile" && init?.method === "PUT") {
                return Promise.resolve(new Response(String(init.body), { status: 200 }));
            }
            if (url === "/api/profile" && init?.method === "DELETE") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 4
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "Kid",
                            interests: "blocks",
                            hates: "lag",
                            favorites: "diamonds",
                            avatar: { type: "asset", value: "asset_123abc" },
                            updatedAt: 2
                        }),
                        { status: 200 }
                    )
                );
            }
            if (String(url).startsWith("/api/create-history")) {
                return Promise.resolve(
                    new Response(JSON.stringify({ items: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        (doc.querySelector("#profile-btn") as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal((doc.querySelector("#profile-username") as HTMLInputElement).value, "Kid");
        assert.equal(
            doc.querySelector<HTMLImageElement>("#profile-avatar-img")?.getAttribute("src"),
            "/asset/asset_123abc"
        );

        (doc.querySelector("#profile-username") as HTMLInputElement).value = " Saved ";
        (doc.querySelector("#profile-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        const save = calls.find((call) => call.method === "PUT" && call.url === "/api/profile");
        assert.equal(JSON.parse(save?.body ?? "{}").username, "Saved");

        const avatarInput = doc.querySelector("#profile-avatar-upload") as HTMLInputElement;
        const file = new win.File(["png"], "avatar.png", { type: "image/png" });
        Object.defineProperty(avatarInput, "files", { value: [file], configurable: true });
        avatarInput.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(
            calls.some((call) => call.method === "POST" && call.url === "/api/profile/avatar")
        );
        assert.equal(
            (doc.querySelector("#profile-avatar-asset") as HTMLInputElement).value,
            "asset_abcdef"
        );

        (doc.querySelector("#profile-reset") as HTMLButtonElement).click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(calls.some((call) => call.method === "DELETE" && call.url === "/api/profile"));
    });

    it("Analyze dropzone supports drag states, drop upload failure, and oversize validation", async () => {
        setupFullDOM();
        doc.querySelector("#create-analyze-form")?.insertAdjacentHTML(
            "afterbegin",
            "<button id=\"analyze-dropzone\" type=\"button\">Drop image</button><input id=\"analyze-file\" type=\"file\"><p id=\"analyze-file-status\"></p><div id=\"analyze-file-preview\" hidden></div>"
        );
        globalThis.fetch = (url: string) => {
            if (url === "/api/analyze-image") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "no" }), { status: 500 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const dropzone = doc.querySelector("#analyze-dropzone") as HTMLButtonElement;
        const status = doc.querySelector("#analyze-file-status") as HTMLElement;
        dropzone.dispatchEvent(new win.Event("dragover", { bubbles: true, cancelable: true }));
        assert.equal(dropzone.classList.contains("is-dragging"), true);
        dropzone.dispatchEvent(new win.Event("dragleave", { bubbles: true }));
        assert.equal(dropzone.classList.contains("is-dragging"), false);

        const huge = new win.File(["x"], "huge.png", { type: "image/png" });
        Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024, configurable: true });
        const hugeDrop = new win.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(hugeDrop, "dataTransfer", { value: { files: [huge] } });
        dropzone.dispatchEvent(hugeDrop);
        assert.match(status.textContent ?? "", /too big/);

        const good = new win.File(["png"], "cat.png", { type: "image/png" });
        const failDrop = new win.Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(failDrop, "dataTransfer", { value: { files: [good] } });
        dropzone.dispatchEvent(failDrop);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(status.textContent, "Upload failed.");
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Failed to upload image/
        );
    });

    it("Analyze file picker validates, uploads, previews, and submits stored assets", async () => {
        setupFullDOM();
        doc.querySelector("#create-analyze-form")?.insertAdjacentHTML(
            "afterbegin",
            "<button id=\"analyze-dropzone\" type=\"button\">Drop image</button><input id=\"analyze-file\" type=\"file\"><p id=\"analyze-file-status\"></p><div id=\"analyze-file-preview\" hidden></div>"
        );
        const calls: Array<{ url: string; body: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), body: String(init?.body ?? "") });
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/analyze-image") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ assetId: "asset_img", assetUrl: "/asset/asset_img" }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/create-tool") return Promise.resolve(createSSEResponse([sseDone()]));
            if (String(url).startsWith("/api/create-history")) {
                return Promise.resolve(
                    new Response(JSON.stringify({ items: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const inputFile = doc.querySelector("#analyze-file") as HTMLInputElement;
        const status = doc.querySelector("#analyze-file-status") as HTMLElement;
        const bad = new win.File(["no"], "note.txt", { type: "text/plain" });
        Object.defineProperty(inputFile, "files", { value: [bad], configurable: true });
        inputFile.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.match(status.textContent ?? "", /PNG, JPG, GIF, or WebP/);

        const good = new win.File(["png"], "cat.png", { type: "image/png" });
        Object.defineProperty(inputFile, "files", { value: [good], configurable: true });
        inputFile.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(status.textContent, "Selected cat.png");
        assert.equal(
            doc.querySelector<HTMLImageElement>("#analyze-file-preview img")?.getAttribute("src"),
            "/asset/asset_img"
        );

        (doc.querySelector("#analyze-prompt") as HTMLTextAreaElement).value = "Describe upload";
        (doc.querySelector("#create-analyze-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        const create = calls.find((call) => call.url === "/api/create-tool");
        assert.deepEqual(JSON.parse(create?.body ?? "{}"), {
            tool_name: "analyze_image",
            input: { image_url: "/asset/asset_img", prompt: "Describe upload" }
        });

        (doc.querySelector("#analyze-url") as HTMLInputElement).value =
            "https://example.com/fallback.png";
        doc.querySelector("#analyze-url")?.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.equal(status.textContent, "Using image URL fallback.");
        assert.equal((doc.querySelector("#analyze-file-preview") as HTMLElement).hidden, true);
    });

    it("Tweak events refill Create forms for every tool kind", async () => {
        setupFullDOM();
        globalThis.fetch = (url: string) => {
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200 }
                    )
                );
            }
            if (String(url).startsWith("/api/create-history")) {
                return Promise.resolve(
                    new Response(JSON.stringify({ items: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: {
                    toolName: "generate_image",
                    input: {
                        prompt: "castle",
                        aspect_ratio: "1:1",
                        n: 2,
                        width: 1024,
                        height: 1024,
                        reference_asset_id: "asset_123abc",
                        prompt_optimizer: true
                    }
                }
            })
        );
        assert.equal((doc.querySelector("#img-prompt") as HTMLTextAreaElement).value, "castle");
        assert.equal((doc.querySelector("#img-ratio") as HTMLSelectElement).value, "1:1");
        assert.equal((doc.querySelector("#img-count") as HTMLSelectElement).value, "2");
        assert.equal(
            (doc.querySelector("#img-reference-asset") as HTMLInputElement).value,
            "asset_123abc"
        );
        assert.equal(
            (doc.querySelector("#img-prompt-optimizer") as HTMLInputElement).checked,
            true
        );

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: {
                    toolName: "generate_music_cover",
                    input: { prompt: "reggae", lyrics: "hey", cover_feature_id: "cover_1" }
                }
            })
        );
        assert.equal((doc.querySelector("#music-prompt") as HTMLTextAreaElement).value, "reggae");
        assert.equal((doc.querySelector("#cover-feature-id") as HTMLInputElement).value, "cover_1");
        assert.equal(doc.querySelector<HTMLElement>("[data-panel=\"cover\"]")?.hidden, false);

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: {
                    toolName: "generate_video",
                    input: { prompt: "space", duration: 10, resolution: "1080p" }
                }
            })
        );
        assert.equal((doc.querySelector("#video-duration") as HTMLSelectElement).value, "10");

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: {
                    toolName: "text_to_speech",
                    input: { text: "hello", speed: 1, voice_id: "English_expressive_narrator" }
                }
            })
        );
        assert.equal((doc.querySelector("#voice-text") as HTMLTextAreaElement).value, "hello");

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: {
                    toolName: "analyze_image",
                    input: { image_url: "https://example.com/a.png", prompt: "describe" }
                }
            })
        );
        assert.equal(
            (doc.querySelector("#analyze-url") as HTMLInputElement).value,
            "https://example.com/a.png"
        );

        doc.dispatchEvent(
            new win.CustomEvent("hallucygenie:tweak-tool", {
                detail: { toolName: "web_search", input: { query: "latest minimax" } }
            })
        );
        assert.equal(
            (doc.querySelector("#search-query") as HTMLTextAreaElement).value,
            "latest minimax"
        );

        doc.dispatchEvent(new win.CustomEvent("hallucygenie:tweak-tool", { detail: {} }));
    });

    it("Recent Create history can refill and remove a saved tool input", async () => {
        setupFullDOM();
        const videoRecent = doc.createElement("div");
        videoRecent.className = "create-recent";
        videoRecent.dataset.kind = "video";
        doc.querySelector("[data-panel=\"video\"]")?.appendChild(videoRecent);
        const calls: string[] = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push(`${init?.method ?? "GET"} ${url}`);
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200 }
                    )
                );
            }
            if (String(url).startsWith("/api/create-history?kind=video")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            items: [
                                {
                                    id: "hist_1",
                                    tool_name: "generate_video",
                                    input: {
                                        prompt: "recent video",
                                        duration: 10,
                                        resolution: "1080p"
                                    }
                                }
                            ]
                        }),
                        { status: 200 }
                    )
                );
            }
            if (String(url).startsWith("/api/create-history")) {
                return Promise.resolve(
                    new Response(JSON.stringify({ items: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        doc.querySelector<HTMLButtonElement>(".create-tab[data-tab=\"video\"]")?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        doc.querySelector<HTMLButtonElement>(".create-recent[data-kind=\"video\"] .recent-button")
            ?.click();
        assert.equal(
            (doc.querySelector("#video-prompt") as HTMLTextAreaElement).value,
            "recent video"
        );
        assert.equal((doc.querySelector("#video-duration") as HTMLSelectElement).value, "10");

        doc.querySelector<HTMLButtonElement>(".create-recent[data-kind=\"video\"] .recent-remove")
            ?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.ok(calls.includes("DELETE /api/create-history/hist_1"));
    });

    it("Session controls switch chats, create chats, and restore scoped drafts", async () => {
        setupFullDOM();
        doc.querySelector("header")?.insertAdjacentHTML(
            "beforeend",
            "<select id=\"session-select\"></select><button id=\"session-new\" type=\"button\">New chat</button>"
        );
        const calls: string[] = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push(`${init?.method ?? "GET"} ${url}`);
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/sessions" && init?.method === "POST") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({ session: { id: "s3", name: "New Chat" } }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/sessions") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            activeSessionId: "s1",
                            sessions: [
                                { id: "s1", name: "One" },
                                { id: "s2", name: "Two" }
                            ]
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/draft/chat") {
                return Promise.resolve(
                    new Response(JSON.stringify({ draft: { text: "saved chat draft" } }), {
                        status: 200
                    })
                );
            }
            if (url === "/api/draft/create") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            draft: {
                                selectedTab: "video",
                                image: {
                                    prompt: "",
                                    aspect_ratio: "16:9",
                                    n: "",
                                    seed: "",
                                    width: "",
                                    height: "",
                                    prompt_optimizer: false,
                                    reference_asset_id: ""
                                },
                                music: {
                                    prompt: "",
                                    lyrics: "",
                                    cover_source_kind: "direct",
                                    cover_audio_url: "",
                                    cover_style: "",
                                    cover_feature_id: "",
                                    cover_lyrics: ""
                                },
                                video: {
                                    prompt: "saved video",
                                    duration: "10",
                                    resolution: "1080p"
                                },
                                voice: {
                                    text: "",
                                    speed: "1.0",
                                    voice_id: "English_expressive_narrator",
                                    volume: "1",
                                    pitch: "0"
                                },
                                analyze: { image_url: "", prompt: "What do you see?" },
                                search: { query: "" }
                            }
                        }),
                        { status: 200 }
                    )
                );
            }
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), { status: 200 })
                );
            }
            if (url === "/assets") {
                return Promise.resolve(
                    new Response(JSON.stringify({ assets: [] }), { status: 200 })
                );
            }
            if (String(url).startsWith("/api/create-history")) {
                return Promise.resolve(
                    new Response(JSON.stringify({ items: [] }), { status: 200 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const sessionSelect = doc.querySelector("#session-select") as HTMLSelectElement;
        assert.equal(sessionSelect.options.length, 2);
        assert.equal(
            (doc.querySelector("#chat-input") as HTMLTextAreaElement).value,
            "saved chat draft"
        );
        assert.equal(
            (doc.querySelector("#video-prompt") as HTMLTextAreaElement).value,
            "saved video"
        );

        sessionSelect.value = "s2";
        sessionSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.ok(calls.includes("POST /api/sessions/s2/activate"));

        doc.querySelector<HTMLButtonElement>("#session-new")?.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.ok(calls.includes("POST /api/sessions"));
    });

    it("Voice sends async TTS for long text transparently", async () => {
        setupFullDOM();
        const calls: Array<{ url: string; body: string; }> = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), body: String(init?.body ?? "") });
            if (url === "/api/create-tool") {
                return Promise.resolve(createSSEResponse([sseDone()]));
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        const longText = "Long story. ".repeat(100);
        const text = doc.querySelector("#voice-text") as HTMLTextAreaElement;
        text.value = longText;
        (doc.querySelector("#create-voice-form") as HTMLFormElement).dispatchEvent(
            new win.Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 40));

        const create = calls.find((call) => call.url === "/api/create-tool");
        assert.ok(create);
        assert.deepEqual(JSON.parse(create.body), {
            tool_name: "generate_long_speech",
            input: {
                text: longText,
                speed: 1,
                voice_id: "English_expressive_narrator",
                volume: 1,
                pitch: 0
            }
        });
    });

    it("lyrics helper edits current lyrics when textarea has text", async () => {
        setupFullDOM();
        const calls: Array<{ url: string; body: string; }> = [];
        const chunks = [
            sseEvent(
                "tool_start",
                JSON.stringify({ id: "lyrics-edit", name: "generate_lyrics" })
            ),
            sseEvent(
                "tool_result",
                JSON.stringify({
                    id: "lyrics-edit",
                    name: "generate_lyrics",
                    result: { type: "text", content: "better lyrics" }
                })
            ),
            sseDone()
        ];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), body: String(init?.body ?? "") });
            if (url === "/api/create-tool") return Promise.resolve(createSSEResponse(chunks));
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        const prompt = doc.querySelector("#music-prompt");
        const lyrics = doc.querySelector("#music-lyrics");
        const button = doc.querySelector("#write-lyrics-btn");
        prompt.value = "boss fight";
        lyrics.value = "draft lyrics";
        lyrics.dispatchEvent(new win.Event("input"));
        assert.equal(button.textContent, "Improve my lyrics ✨");

        button.dispatchEvent(new win.Event("click"));
        await new Promise((resolve) => setTimeout(resolve, 30));

        const call = calls.find((item) => item.url === "/api/create-tool");
        assert.ok(call);
        assert.deepEqual(JSON.parse(call.body), {
            tool_name: "generate_lyrics",
            input: { prompt: "boss fight", mode: "edit", lyrics: "draft lyrics" }
        });
        assert.equal(lyrics.value, "better lyrics");
    });

    it("create controls apply presets, reject bad pauses, and send cover generation", async () => {
        setupFullDOM();
        const bodies: unknown[] = [];
        globalThis.fetch = (url: string, init?: RequestInit) => {
            if (url === "/api/create-tool") {
                bodies.push(JSON.parse(String(init?.body)));
                return Promise.resolve(createSSEResponse([sseDone()]));
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const ratio = doc.querySelector("#img-ratio") as HTMLSelectElement;
        const size = doc.querySelector("#img-size") as HTMLSelectElement;
        ratio.value = "1:1";
        ratio.dispatchEvent(new win.Event("change", { bubbles: true }));
        size.value = "medium";
        size.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.equal((doc.querySelector("#img-width") as HTMLInputElement).value, "1536");
        assert.equal((doc.querySelector("#img-height") as HTMLInputElement).value, "1536");

        const pauseSelect = doc.querySelector("#voice-pause-duration") as HTMLSelectElement;
        pauseSelect.insertAdjacentHTML("beforeend", "<option value=\"100\">100 sec</option>");
        pauseSelect.value = "100";
        (doc.querySelector("#voice-insert-pause") as HTMLButtonElement).click();
        assert.match(
            doc.querySelector("#voice-composer-status")?.textContent ?? "",
            /0.01 to 99.99/
        );

        (doc.querySelector("#cover-feature-id") as HTMLInputElement).value = "cover_1";
        (doc.querySelector("#cover-style") as HTMLTextAreaElement).value = "ska";
        (doc.querySelector("#cover-lyrics") as HTMLTextAreaElement).value = "la la";
        doc.querySelector("#cover-generate")?.dispatchEvent(new win.Event("click"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(bodies[0], {
            tool_name: "generate_music_cover",
            input: { prompt: "ska", lyrics: "la la", cover_feature_id: "cover_1" }
        });
    });

    it("cover controls validate source, URL changes, prepare failures, and generate fields", async () => {
        setupFullDOM();
        globalThis.fetch = (url: string) => {
            if (url === "/api/music-cover/preprocess") {
                return Promise.resolve(
                    new Response(JSON.stringify({ error: "bad cover" }), { status: 500 })
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const sourceKind = doc.querySelector("#cover-source-kind") as HTMLSelectElement;
        const url = doc.querySelector("#cover-audio-url") as HTMLInputElement;
        const file = doc.querySelector("#cover-audio-file") as HTMLInputElement;
        const status = doc.querySelector("#cover-status") as HTMLElement;
        const generate = doc.querySelector("#cover-generate") as HTMLButtonElement;

        sourceKind.value = "upload";
        sourceKind.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.equal(status.textContent, "Prepare the cover source first.");

        doc.querySelector("#cover-preprocess")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Choose an audio file/
        );

        sourceKind.value = "direct";
        sourceKind.dispatchEvent(new win.Event("change", { bubbles: true }));
        doc.querySelector("#cover-preprocess")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Paste an audio/
        );

        Object.defineProperty(file, "files", {
            value: [new win.File(["mp3"], "song.mp3", { type: "audio/mpeg" })],
            configurable: true
        });
        file.dispatchEvent(new win.Event("change", { bubbles: true }));
        assert.equal(sourceKind.value, "upload");
        assert.match(status.textContent ?? "", /Audio file selected/);

        sourceKind.value = "upload";
        url.value = "https://example.com/song.mp3";
        url.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.equal(sourceKind.value, "direct");
        assert.match(status.textContent ?? "", /URL changed/);

        doc.querySelector("#cover-preprocess")?.dispatchEvent(new win.Event("click"));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.match(status.textContent ?? "", /Prepare failed: bad cover/);

        generate.disabled = false;
        doc.querySelector("#cover-generate")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Prepare the cover source/
        );

        (doc.querySelector("#cover-feature-id") as HTMLInputElement).value = "cover_1";
        doc.querySelector("#cover-generate")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /Describe the new style/
        );

        (doc.querySelector("#cover-style") as HTMLTextAreaElement).value = "rock";
        doc.querySelector("#cover-generate")?.dispatchEvent(new win.Event("click"));
        assert.match(
            doc.querySelector("#error-toast-message")?.textContent ?? "",
            /lyrics are required/
        );
    });

    it("cover prepare prefers selected file over source dropdown", async () => {
        setupFullDOM();
        let body: FormData | null = null;
        globalThis.fetch = (url: string, init?: RequestInit) => {
            if (url === "/api/music-cover/preprocess") {
                body = init?.body as FormData;
                return Promise.resolve(
                    new Response(JSON.stringify({ cover_feature_id: "cover-1", lyrics: "la" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();
        const input = doc.querySelector("#cover-audio-file");
        const file = new win.File([new Uint8Array([1])], "song.mp3", { type: "audio/mpeg" });
        Object.defineProperty(input, "files", { value: [file], configurable: true });
        input.dispatchEvent(new win.Event("change"));
        doc.querySelector("#cover-preprocess").dispatchEvent(new win.Event("click"));
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.ok(body);
        assert.equal(body.get("source_kind"), "upload");
        assert.equal(String(body.get("audio")), "[object Blob]");
        assert.equal(doc.querySelector("#cover-generate").disabled, false);
        input.dispatchEvent(new win.Event("change"));
        assert.equal(doc.querySelector("#cover-generate").disabled, true);
    });

    it("voice composer inserts pauses only between words", () => {
        setupFullDOM();
        init();
        const text = doc.querySelector("#voice-text");
        text.value = "hello world";
        text.selectionStart = 5;
        text.selectionEnd = 5;
        doc.querySelector("#voice-insert-pause").dispatchEvent(new win.Event("click"));
        assert.equal(text.value, "hello <#0.5#>  world");

        text.value = "edge";
        text.selectionStart = 0;
        text.selectionEnd = 0;
        doc.querySelector("#voice-insert-pause").dispatchEvent(new win.Event("click"));
        assert.equal(text.value, "edge");
    });

    it("voice composer inserts MiniMax interjection tags", () => {
        setupFullDOM();
        init();
        const text = doc.querySelector("#voice-text");
        const select = doc.querySelector("#voice-interjection");
        const button = doc.querySelector("#voice-insert-interjection");
        select.value = "laughs";
        text.value = "hello";
        text.selectionStart = 5;
        text.selectionEnd = 5;
        button.dispatchEvent(new win.Event("click"));
        assert.equal(text.value, "hello (laughs) ");
        assert.equal(text.value.includes("<laugh"), false);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Additional coverage: helper functions
// ═══════════════════════════════════════════════════════════════════════

describe("showError", () => {
    let doc: Document;

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
        showError("{\"base_resp\":{\"status_code\":1004,\"status_msg\":\"login fail\"}}");
        assert.equal(
            doc.querySelector("#error-toast-message").textContent,
            "Something went wrong. Try again! 🤷"
        );
    });
});

describe("setStreamingUI (via sendMessage)", () => {
    let doc: Document;

    it("sets typing indicator visible during streaming", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        const typing = doc.querySelector("#typing-indicator");
        assert.ok(!typing.hidden, "typing indicator should stay in DOM for status updates");
        assert.equal(typing.classList.contains("is-visible"), false);
        assert.equal(typing.getAttribute("aria-hidden"), "true");
    });

    it("shows typing indicator as a non-layout-toggle status while streaming", async () => {
        setupDOM();
        doc = globalThis.document;

        let releaseStream!: () => void;
        const pending = new Promise<void>((resolve) => {
            releaseStream = resolve;
        });
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    new ReadableStream({
                        async start(controller) {
                            controller.enqueue(new TextEncoder().encode(sseText("reply")));
                            await pending;
                            controller.enqueue(new TextEncoder().encode(sseDone()));
                            controller.close();
                        }
                    }),
                    { status: 200 }
                )
            );

        const sendPromise = sendMessage("test");
        await new Promise((resolve) => setTimeout(resolve, 0));

        const typing = doc.querySelector("#typing-indicator");
        assert.ok(!typing.hidden, "typing indicator should not use hidden layout toggling");
        assert.equal(typing.classList.contains("is-visible"), true);
        assert.equal(typing.getAttribute("aria-hidden"), "false");

        releaseStream();
        await sendPromise;
    });

    it("enables input after streaming finishes", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        const input = doc.querySelector("#chat-input");
        assert.ok(!input.disabled, "input should be enabled after streaming");
    });

    it("removes assistant streaming class after done", async () => {
        setupDOM();
        doc = globalThis.document;

        globalThis.fetch = () => Promise.resolve(createSSEResponse([sseText("reply"), sseDone()]));

        await sendMessage("test");

        assert.equal(doc.querySelectorAll(".assistant-text-region.is-streaming").length, 0);
    });
});

describe("openLightbox / closeLightbox", () => {
    let doc: Document;

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
    let doc: Document;

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
    let _doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        _doc = d;
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
    let _doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        _doc = d;
    });

    it("renders image result", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "data:image/png;base64,abc"
        });
        assert.ok(card.outerHTML.includes("img"));
    });

    it("renders multiple image results", () => {
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "/asset/one",
            urls: ["/asset/one", "/asset/two"]
        });
        assert.equal(card.querySelectorAll(".tool-result-image").length, 2);
        assert.ok(card.querySelector(".tool-result-image-grid"));
    });

    it("renders error result", () => {
        const card = renderToolResult("generate_image", {
            type: "error",
            content: "Something failed"
        });
        assert.ok(card.outerHTML.includes("Something failed"));
    });

    it("renders audio result", () => {
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "data:audio/mp3;base64,abc"
        });
        assert.ok(card.outerHTML.includes("audio"));
    });

    it("renders video result", () => {
        const card = renderToolResult("generate_video", {
            type: "video",
            content: "/asset/asset_video"
        });
        const video = card.querySelector("video.tool-result-video");
        assert.ok(video);
        assert.equal(video.getAttribute("src"), "/asset/asset_video");
    });

    it("renders sanitized input details and tweak button", () => {
        const longLyrics = `[Verse]\n${"la ".repeat(260)}`;
        const card = renderToolResult(
            "generate_image",
            { type: "image", content: "/asset/one" },
            {
                prompt: "neon fox",
                lyrics: longLyrics,
                n: 2,
                prompt_optimizer: true,
                image: "data:image/png;base64,raw",
                audio_base64: "raw",
                api_key: "secret"
            }
        );
        assert.equal(
            card.querySelector("details.tool-input-details")?.hasAttribute("open"),
            false
        );
        assert.ok(card.textContent?.includes("Input details"));
        assert.ok(card.textContent?.includes("neon fox"));
        assert.ok(card.textContent?.includes(JSON.stringify(longLyrics).slice(1, -1)));
        assert.equal(card.textContent?.includes("data:image"), false);
        assert.equal(card.textContent?.includes("secret"), false);
        assert.equal(card.textContent?.includes("audio_base64"), false);
        assert.ok(card.querySelector(".tool-input-json .json-key"));
        assert.ok(card.querySelector(".tool-input-json .json-string"));
        assert.equal(card.querySelectorAll(".tool-tweak-button").length, 1);
    });
});

describe("sendSteer", () => {
    it("sends steer request without X-Session-Id header", async () => {
        let request: RequestInit | undefined;
        globalThis.fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(new Response(null, { status: 200 }));
        };

        await sendSteer("steer message");
        assert.ok(request);
        assert.equal((request.headers as Record<string, string>)["X-Session-Id"], undefined);
    });

    it("throws on non-OK response", async () => {
        globalThis.fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await assert.rejects(() => sendSteer("steer"), /Steer failed/);
    });
});

describe("fetchHistory", () => {
    it("returns messages from API without request headers", async () => {
        let request: RequestInit | undefined;
        globalThis.fetch = (_url: string, init?: RequestInit) => {
            request = init;
            return Promise.resolve(
                new Response(JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            );
        };

        const msgs = await fetchHistory();
        assert.equal(request, undefined);
        assert.equal(msgs.length, 1);
        assert.equal(msgs[0].role, "user");
        assert.equal(msgs[0].content, "hi");
    });

    it("throws on non-OK response", async () => {
        globalThis.fetch = () => Promise.resolve(new Response(null, { status: 500 }));

        await assert.rejects(() => fetchHistory(), /Failed to load history/);
    });
});

describe("renderSteerMessage", () => {
    let _doc: Document;

    before(() => {
        const { doc: d } = setupDOM();
        _doc = d;
    });

    it("creates steer message element", () => {
        const el = renderSteerMessage("steer content");
        assert.ok(el.outerHTML.includes("steer content"));
        assert.ok(el.className.includes("message--steer"));
    });
});

// ── Init accessibility regressions ──────────────────────────────────

describe("init accessibility behavior", () => {
    it("initializes without browser-owned session cleanup", () => {
        const { doc } = setupDOM();
        init();

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

    it("shows avatar generation pending state and clears on success", async () => {
        const { doc } = setupDOM();
        let resolveGenerate: ((response: Response) => void) | undefined;
        const profile = {
            version: 1,
            username: "GamerKid",
            interests: "Minecraft",
            hates: "gore",
            favorites: "blue fire",
            avatar: { type: "asset", value: "" },
            updatedAt: 1
        };
        globalThis.fetch = (input: string | Request) => {
            const url = input.toString();
            if (url.includes("/api/profile/avatar/generate")) {
                return new Promise<Response>((resolve) => {
                    resolveGenerate = resolve;
                });
            }
            if (url.includes("/api/profile")) {
                return Promise.resolve(
                    new Response(JSON.stringify(profile), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            return Promise.resolve(
                new Response(JSON.stringify({ messages: [], sessions: [], items: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            );
        };

        init();
        (doc.querySelector("#profile-generate") as HTMLButtonElement).click();
        await Promise.resolve();

        const preview = doc.querySelector("#profile-avatar-preview") as HTMLButtonElement;
        const status = doc.querySelector("#profile-avatar-status") as HTMLElement;
        assert.equal(preview.classList.contains("is-pending"), true);
        assert.equal(preview.getAttribute("aria-busy"), "true");
        assert.equal(status.textContent, "Generating avatar.");

        resolveGenerate?.(
            new Response(
                JSON.stringify({
                    profile: {
                        ...profile,
                        avatar: {
                            type: "asset",
                            value: "asset_12345678-1234-1234-1234-123456789abc"
                        }
                    }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(preview.classList.contains("is-pending"), false);
        assert.equal(preview.getAttribute("aria-busy"), "false");
        assert.equal(status.textContent, "Avatar ready.");
    });

    it("repaints visible user avatars when profile avatar changes", async () => {
        const { doc } = setupDOM();
        const defaultProfile = {
            version: 1,
            username: "GamerKid",
            interests: "Minecraft",
            hates: "gore",
            favorites: "blue fire",
            avatar: { type: "asset", value: "" },
            updatedAt: 1
        };
        const savedProfile = {
            ...defaultProfile,
            avatar: { type: "asset", value: "asset_12345678-1234-1234-1234-123456789abc" },
            updatedAt: 2
        };
        globalThis.fetch = (input: string | Request, init?: RequestInit) => {
            const url = input.toString();
            if (url.includes("/api/profile") && init?.method === "PUT") {
                return Promise.resolve(
                    new Response(JSON.stringify(savedProfile), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url.includes("/api/profile")) {
                return Promise.resolve(
                    new Response(JSON.stringify(defaultProfile), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            return Promise.resolve(
                new Response(JSON.stringify({ messages: [], sessions: [], items: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            );
        };

        init();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const messageList = doc.querySelector("#message-list") as HTMLElement;
        messageList.appendChild(renderUserMessage("Existing message"));
        const originalAvatar = messageList.querySelector(
            ".message--user .message-avatar"
        ) as HTMLElement;
        assert.equal(originalAvatar.textContent, "🎮");
        assert.equal(originalAvatar.querySelector("img"), null);

        (doc.querySelector("#profile-avatar-asset") as HTMLInputElement).value =
            "asset_12345678-1234-1234-1234-123456789abc";
        (doc.querySelector("#profile-form") as HTMLFormElement).dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const repaintedAvatar = messageList.querySelector(
            ".message--user .message-avatar .profile-avatar-img"
        ) as HTMLImageElement | null;
        assert.equal(
            repaintedAvatar?.getAttribute("src"),
            "/asset/asset_12345678-1234-1234-1234-123456789abc"
        );
    });

    it("clears avatar generation pending state on error", async () => {
        const { doc } = setupDOM();
        let resolveGenerate: ((response: Response) => void) | undefined;
        globalThis.fetch = (input: string | Request) => {
            const url = input.toString();
            if (url.includes("/api/profile/avatar/generate")) {
                return new Promise<Response>((resolve) => {
                    resolveGenerate = resolve;
                });
            }
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        version: 1,
                        username: "",
                        interests: "",
                        hates: "",
                        favorites: "",
                        avatar: { type: "asset", value: "" },
                        updatedAt: 1
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                )
            );
        };

        init();
        (doc.querySelector("#profile-generate") as HTMLButtonElement).click();
        await Promise.resolve();

        const preview = doc.querySelector("#profile-avatar-preview") as HTMLButtonElement;
        const status = doc.querySelector("#profile-avatar-status") as HTMLElement;
        assert.equal(preview.classList.contains("is-pending"), true);

        resolveGenerate?.(new Response(JSON.stringify({ error: "fail" }), { status: 500 }));
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(preview.classList.contains("is-pending"), false);
        assert.equal(preview.getAttribute("aria-busy"), "false");
        assert.equal(status.textContent, "Avatar ready.");
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

    it("updates create tab ARIA selection", () => {
        const { doc } = setupDOM();
        init();

        const imageTab = doc.querySelector(".create-tab[data-tab=\"image\"]") as HTMLButtonElement;
        const musicTab = doc.querySelector(".create-tab[data-tab=\"music\"]") as HTMLButtonElement;
        const imagePanel = doc.querySelector(".create-panel[data-panel=\"image\"]") as HTMLElement;
        const musicPanel = doc.querySelector(".create-panel[data-panel=\"music\"]") as HTMLElement;

        musicTab.click();

        assert.equal(imageTab.getAttribute("aria-selected"), "false");
        assert.equal(musicTab.getAttribute("aria-selected"), "true");
        assert.equal(imageTab.tabIndex, -1);
        assert.equal(musicTab.tabIndex, 0);
        assert.equal(imagePanel.hidden, true);
        assert.equal(musicPanel.hidden, false);
    });

    it("supports keyboard navigation between create tabs", () => {
        const { doc, win } = setupDOM();
        init();

        const imageTab = doc.querySelector(".create-tab[data-tab=\"image\"]") as HTMLButtonElement;
        const musicTab = doc.querySelector(".create-tab[data-tab=\"music\"]") as HTMLButtonElement;
        const searchTab = doc.querySelector(
            ".create-tab[data-tab=\"search\"]"
        ) as HTMLButtonElement;

        imageTab.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, musicTab);
        assert.equal(musicTab.getAttribute("aria-selected"), "true");

        musicTab.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, imageTab);

        imageTab.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, searchTab);
        assert.equal(searchTab.getAttribute("aria-selected"), "true");

        searchTab.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, imageTab);
    });

    it("traps Tab focus inside profile modal", async () => {
        const { doc, win } = setupDOM();
        globalThis.fetch = (input: string | Request | URL) => {
            if (input.toString() === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "emoji", value: "🎮" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        init();

        const profileBtn = doc.querySelector("#profile-btn") as HTMLButtonElement;
        const closeBtn = doc.querySelector("#profile-close") as HTMLButtonElement;
        const last = doc.querySelector("#profile-generate") as HTMLButtonElement;
        const modal = doc.querySelector("#profile-modal") as HTMLElement;

        profileBtn.click();
        await Promise.resolve();
        closeBtn.focus();
        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
                cancelable: true
            })
        );
        assert.equal(doc.activeElement, last);

        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, closeBtn);
    });

    it("traps Tab focus inside create modal", () => {
        const { doc, win } = setupDOM();
        init();

        const createBtn = doc.querySelector("#create-btn") as HTMLButtonElement;
        const closeBtn = doc.querySelector("#create-close") as HTMLButtonElement;
        const promptOptimizer = doc.querySelector("#img-prompt-optimizer") as HTMLInputElement;
        const modal = doc.querySelector("#create-modal") as HTMLElement;

        createBtn.click();
        closeBtn.focus();
        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
                cancelable: true
            })
        );
        assert.equal(doc.activeElement, promptOptimizer);

        modal.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, closeBtn);
    });

    it("onboarding action buttons seed chat, open create, and dismiss", () => {
        const { doc } = setupDOM();
        init();

        const onboarding = doc.querySelector("#onboarding") as HTMLElement;
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;
        const createModal = doc.querySelector("#create-modal") as HTMLElement;

        (doc.querySelector(".onboarding-next") as HTMLButtonElement).click();
        assert.equal(
            doc.querySelector(".onboarding-slide[data-slide=\"1\"]")?.classList.contains("active"),
            true
        );

        (doc.querySelector("#onboarding-try-chat") as HTMLButtonElement).click();
        assert.equal(onboarding.hidden, true);
        assert.match(input.value, /top 3 gaming tips/);
        assert.equal(doc.activeElement, input);

        localStorage.removeItem("hg_onboarding_done");
        const second = setupDOM();
        init();
        (second.doc.querySelector("#onboarding-try-create") as HTMLButtonElement).click();
        assert.equal((second.doc.querySelector("#create-modal") as HTMLElement).hidden, false);
        assert.equal((second.doc.querySelector("#onboarding") as HTMLElement).hidden, true);
        assert.equal(createModal.hidden, true);
    });

    it("Escape closes profile and create modals", () => {
        const { doc, win } = setupDOM();
        init();

        const profileModal = doc.querySelector("#profile-modal") as HTMLElement;
        const createModal = doc.querySelector("#create-modal") as HTMLElement;
        (doc.querySelector("#profile-btn") as HTMLButtonElement).click();
        (doc.querySelector("#create-btn") as HTMLButtonElement).click();
        assert.equal(profileModal.hidden, false);
        assert.equal(createModal.hidden, false);

        doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        assert.equal(profileModal.hidden, true);
        assert.equal(createModal.hidden, true);
    });

    it("traps onboarding focus and restores focus on dismiss", () => {
        const { doc, win } = setupDOM();
        init();

        const onboarding = doc.querySelector("#onboarding") as HTMLElement;
        const first = doc.querySelector(".onboarding-next") as HTMLButtonElement;
        const last = doc.querySelector("#onboarding-done") as HTMLButtonElement;
        const input = doc.querySelector("#chat-input") as HTMLTextAreaElement;

        first.focus();
        onboarding.dispatchEvent(
            new win.KeyboardEvent("keydown", {
                key: "Tab",
                shiftKey: true,
                bubbles: true,
                cancelable: true
            })
        );
        assert.equal(doc.activeElement, last);

        last.click();
        assert.equal(onboarding.hidden, true);
        assert.equal(doc.activeElement, input);
    });

    it("traps lightbox focus and restores opener focus", () => {
        const { doc, win } = setupDOM();
        init();

        const opener = doc.querySelector("#create-btn") as HTMLButtonElement;
        const lightbox = doc.querySelector("#lightbox") as HTMLElement;
        const closeBtn = doc.querySelector(".lightbox-close") as HTMLButtonElement;

        opener.focus();
        openLightbox("/asset/img1");
        assert.equal(lightbox.hidden, false);
        assert.equal(doc.activeElement, closeBtn);

        lightbox.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
        );
        assert.equal(doc.activeElement, closeBtn);

        closeBtn.click();
        assert.equal(lightbox.hidden, true);
        assert.equal(doc.activeElement, opener);
    });

    it("blocks new session while streaming when confirmation is rejected", async () => {
        const { doc } = setupDOM();
        const sessionSelect = doc.createElement("select");
        sessionSelect.id = "session-select";
        const sessionNew = doc.createElement("button");
        sessionNew.id = "session-new";
        doc.body.append(sessionSelect, sessionNew);

        let newSessionPosts = 0;
        let confirmCalls = 0;
        let resolveChat!: (response: Response) => void;
        globalThis.confirm = () => {
            confirmCalls += 1;
            return false;
        };
        globalThis.fetch = (input: string | Request, init?: RequestInit) => {
            const url = input.toString();
            if (url === "/api/chat") {
                return new Promise<Response>((resolve) => {
                    resolveChat = resolve;
                });
            }
            if (url === "/api/sessions" && init?.method === "POST") newSessionPosts += 1;
            if (url === "/api/sessions") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            activeSessionId: "s1",
                            sessions: [{ id: "s1", name: "New Chat" }]
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            if (url === "/api/profile") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            version: 1,
                            username: "",
                            interests: "",
                            hates: "",
                            favorites: "",
                            avatar: { type: "asset", value: "" },
                            updatedAt: 0
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            if (url === "/api/history") {
                return Promise.resolve(
                    new Response(JSON.stringify({ messages: [] }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            if (url === "/api/draft/chat" || url === "/api/draft/create") {
                return Promise.resolve(
                    new Response(JSON.stringify({ draft: null }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                );
            }
            return Promise.resolve(
                new Response(JSON.stringify({}), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            );
        };

        init();
        const sendPromise = sendMessage("keep streaming");
        await Promise.resolve();
        sessionNew.click();

        assert.equal(confirmCalls, 1);
        assert.equal(newSessionPosts, 0);

        resolveChat(createSSEResponse([sseDone()]));
        await sendPromise;
    });
});

// ── HG-ISSUE-007/008/009: Asset URL handling, quota refresh, assets refresh ──

describe("renderToolResult asset URLs", () => {
    it("image result src omits session query", () => {
        setupDOM();
        const card = renderToolResult("generate_image", {
            type: "image",
            content: "/asset/abc123"
        });
        const img = card.querySelector("img");
        assert.ok(img, "should have img element");
        assert.equal(img?.src.endsWith("/asset/abc123"), true);
        assert.equal(img?.src.includes("?s="), false);
    });

    it("audio result src omits session query", () => {
        setupDOM();
        const card = renderToolResult("text_to_speech", {
            type: "audio",
            content: "/asset/def456"
        });
        const audio = card.querySelector("audio");
        assert.ok(audio, "should have audio element");
        assert.equal(audio?.src.endsWith("/asset/def456"), true);
        assert.equal(audio?.src.includes("?s="), false);
    });
});

describe("updateQuotaBadge", () => {
    it("fetches /api/quota and updates provider-shaped badge text", async () => {
        const { doc } = setupDOM();
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        general: { used: 10, total: 100 },
                        video: { used: 1, total: 5 }
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        await updateQuotaBadge();

        const generalItem = doc.querySelector(".quota-item[data-type=\"general\"]");
        assert.ok(generalItem, "general quota item exists");
        assert.equal(generalItem?.querySelector(".quota-used")?.textContent, "90");

        const label = doc.querySelector("#quota-badge")?.getAttribute("aria-label") ?? "";
        const videoItem = doc.querySelector(".quota-item[data-type=\"video\"]");
        assert.ok(videoItem, "video quota item exists");
        assert.equal(videoItem?.querySelector(".quota-used")?.textContent, "4");
        assert.match(label, /General: 90 of 100 remaining, ok/);
        assert.match(label, /Video: 4 of 5 remaining, ok/);
    });

    it("shows unknown for zero-total provider quota", async () => {
        const { doc } = setupDOM();
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        general: { used: 0, total: 0 },
                        video: { used: 0, total: 0 }
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        await updateQuotaBadge();

        assert.equal(
            doc.querySelector(".quota-item[data-type=\"general\"] .quota-used")?.textContent,
            "?"
        );
        assert.equal(
            doc.querySelector(".quota-item[data-type=\"video\"] .quota-used")?.textContent,
            "?"
        );
        const label = doc.querySelector("#quota-badge")?.getAttribute("aria-label") ?? "";
        assert.match(label, /General quota exact count unknown/);
        assert.match(label, /Video quota exact count unknown/);
        assert.equal(label.includes("unavailable"), false);
    });

    it("does not crash on fetch failure", async () => {
        setupDOM();
        globalThis.fetch = () => Promise.reject(new Error("network fail"));
        await updateQuotaBadge();
        assert.ok(true, "should not throw");
    });
});

describe("loadAssets", () => {
    it("fetches /assets without session header and uses asset API URLs", async () => {
        const { doc } = setupDOM();
        let requestOpts: RequestInit | undefined;

        globalThis.fetch = (url: string, opts?: RequestInit) => {
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
                                    params: {},
                                    url: "/asset/img-1",
                                    download_url: "/asset/img-1"
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
                                    params: { speed: 1.25 },
                                    url: "/asset/aud-1",
                                    download_url: "/asset/aud-1"
                                },
                                {
                                    id: "vid-1",
                                    session_id: "active-session",
                                    type: "video",
                                    filename: "vid-1.mp4",
                                    mime_type: "video/mp4",
                                    prompt: "clip",
                                    tool_name: "generate_video",
                                    size_bytes: 4096,
                                    created_at: Date.now(),
                                    params: { duration: 6, resolution: "768p" },
                                    url: "/asset/vid-1",
                                    download_url: "/asset/vid-1"
                                }
                            ]
                        }),
                        { headers: { "Content-Type": "application/json" } }
                    )
                );
            }
            return Promise.resolve(new Response(null, { status: 404 }));
        };

        loadAssets();

        // Wait for async fetch + render
        await new Promise((r) => setTimeout(r, 50));

        assert.equal(requestOpts, undefined);

        const cards = doc.querySelectorAll(".asset-card");
        assert.equal(cards.length, 3, "should render asset cards");

        const img = doc.querySelector(".asset-thumb");
        assert.ok(img, "should have image thumbnail");
        if (img?.tagName === "IMG") {
            assert.equal((img as HTMLImageElement).src.includes("?s="), false);
        }

        const audio = doc.querySelector("audio.asset-audio") as HTMLAudioElement | null;
        assert.ok(audio, "audio assets should use native controls");
        assert.equal(audio?.controls, true);
        assert.equal(audio?.preload, "metadata");
        assert.equal(audio?.src.includes("?s="), false);
        assert.equal(audio?.src.includes("/asset/aud-1"), true);
        assert.match(cards[1]?.textContent ?? "", /1\.25x/);

        const video = doc.querySelector("video.asset-video") as HTMLVideoElement | null;
        assert.ok(video, "video assets should use native controls");
        assert.equal(video?.controls, true);
        assert.equal(video?.preload, "metadata");
        assert.equal(video?.src.includes("/asset/vid-1"), true);

        const downloads = doc.querySelectorAll(".asset-download");
        assert.equal(downloads.length, 3, "every asset should have a download link");
        assert.equal((downloads[0] as HTMLAnchorElement).href.includes("/asset/img-1"), true);

        const referenceButtons = doc.querySelectorAll(".asset-use-reference");
        assert.equal(referenceButtons.length, 1, "PNG/JPG image assets can become references");

        // No 20-item cap — all assets rendered
        const grid = doc.querySelector("#assets-grid");
        assert.equal(grid?.children.length, 3, "no slice cap");
    });

    it("lets an existing image asset become the Create Image reference", async () => {
        const { doc } = setupDOM();
        let selected: { assetId?: string; assetUrl?: string; } | null = null;
        doc.addEventListener("hallucygenie:use-reference-asset", (event) => {
            selected = (event as CustomEvent).detail;
        });
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        assets: [
                            {
                                id: "asset_12345678-1234-1234-1234-123456789abc",
                                session_id: "active-session",
                                type: "image",
                                filename: "ref.png",
                                mime_type: "image/png",
                                prompt: "same fox",
                                tool_name: "generate_image",
                                size_bytes: 1024,
                                created_at: Date.now(),
                                params: {},
                                url: "/asset/asset_12345678-1234-1234-1234-123456789abc",
                                download_url: "/asset/asset_12345678-1234-1234-1234-123456789abc"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));
        (doc.querySelector(".asset-use-reference") as HTMLButtonElement).click();

        assert.deepEqual(selected, {
            assetId: "asset_12345678-1234-1234-1234-123456789abc",
            assetUrl: "/asset/asset_12345678-1234-1234-1234-123456789abc"
        });
    });

    it("renders tool name, model, and date on asset cards", async () => {
        const { doc } = setupDOM();
        const timestamp = new Date("2025-03-15").getTime();

        globalThis.fetch = () =>
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
                                params: { model: "MiniMax/Image-01" },
                                url: "/asset/img-1",
                                download_url: "/asset/img-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const header = doc.querySelector(".asset-header");
        assert.ok(header, "should have asset header with tool/model/date");

        const toolEl = doc.querySelector(".asset-tool");
        assert.ok(toolEl, "should have tool name element");
        assert.equal(toolEl?.textContent, "generate image");

        const modelEl = doc.querySelector(".asset-model");
        assert.ok(modelEl, "should have model name element");
        assert.equal(modelEl?.textContent, "Image-01");

        const dateEl = doc.querySelector(".asset-date");
        assert.ok(dateEl, "should have date element");
        assert.equal(dateEl?.textContent, "Mar 15");
    });

    it("renders generation params from API params", async () => {
        const { doc } = setupDOM();

        globalThis.fetch = () =>
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
                                params: {
                                    aspect_ratio: "16:9",
                                    model: "MiniMax/Image-01"
                                },
                                url: "/asset/img-1",
                                download_url: "/asset/img-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element");
        assert.equal(paramsEl?.textContent, "16:9");
    });

    it("renders music params including lyrics excerpt", async () => {
        const { doc } = setupDOM();

        globalThis.fetch = () =>
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
                                params: {
                                    lyrics: "This is a long lyrics preview"
                                },
                                url: "/asset/music-1",
                                download_url: "/asset/music-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element with lyrics excerpt");
        assert.equal(paramsEl?.textContent, "This is a long lyric…");
    });

    it("renders collapsible prompt for long prompts", async () => {
        const { doc } = setupDOM();
        const longPrompt = "A".repeat(50);

        globalThis.fetch = () =>
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
                                params: {},
                                url: "/asset/img-1",
                                download_url: "/asset/img-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const details = doc.querySelector(".asset-prompt-details");
        assert.ok(details, "should have collapsible prompt element for long prompts");

        const summary = doc.querySelector(".asset-prompt-summary");
        assert.ok(summary, "should have prompt summary");
        assert.equal(summary?.textContent, `${"A".repeat(30)}…`);

        const fullPrompt = doc.querySelector(".asset-prompt-full");
        assert.ok(fullPrompt, "should have full prompt content");
        assert.equal(fullPrompt?.textContent, longPrompt);
    });

    it("renders short prompt without collapse mechanism", async () => {
        const { doc } = setupDOM();

        globalThis.fetch = () =>
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
                                params: {},
                                url: "/asset/img-1",
                                download_url: "/asset/img-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const details = doc.querySelector(".asset-prompt-details");
        assert.equal(details, null, "short prompts should not have collapsible element");

        const meta = doc.querySelector(".asset-meta");
        assert.ok(meta, "short prompts should render in asset-meta");
        assert.equal(meta?.textContent, "short prompt");
    });

    it("handles voice params with speed", async () => {
        const { doc } = setupDOM();

        globalThis.fetch = () =>
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
                                params: {
                                    speed: "1.5",
                                    voice_id: "hunter"
                                },
                                url: "/asset/voice-1",
                                download_url: "/asset/voice-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));

        const paramsEl = doc.querySelector(".asset-params");
        assert.ok(paramsEl, "should have params element");
        assert.equal(paramsEl?.textContent, "1.5x · hunter…");
    });

    it("audio asset card click does not create hidden autoplay", async () => {
        const { doc } = setupDOM();
        let hiddenAudioCreated = false;
        globalThis.Audio = () => {
            hiddenAudioCreated = true;
            return { play: () => Promise.resolve() };
        };
        globalThis.fetch = () =>
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
                                params: {},
                                url: "/asset/aud-1",
                                download_url: "/asset/aud-1"
                            }
                        ]
                    }),
                    { headers: { "Content-Type": "application/json" } }
                )
            );

        loadAssets();
        await new Promise((r) => setTimeout(r, 50));
        doc.querySelector(".asset-card")?.dispatchEvent(new Event("click", { bubbles: true }));

        assert.equal(hiddenAudioCreated, false);
    });
});
