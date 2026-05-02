// HallucyGenie — Frontend Chat Logic
// Vanilla TypeScript, no framework, no OOP.
// SSE streaming, message rendering, tool cards, steering.

// ── Types ────────────────────────────────────────────────────────────

interface HistoryMessage {
    role: "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string | null;
    tool_calls_json?: string | null;
    thinking?: string | null;
}

interface HistoryToolCall {
    id: string;
    name: string;
}

interface ToolResult {
    type: "image" | "audio" | "text" | "error";
    content: string;
}

interface ToolStartEvent {
    id: string;
    name: string;
}

interface ToolResultEvent {
    id: string;
    name: string;
    result: ToolResult;
}

import { renderMarkdown } from "./markdown.ts";
export { renderMarkdown };

// ── Thinking Block Renderer ──────────────────────────────────────────
// Shows AI thinking in a collapsible, dimmed block.

export function renderThinkingBlock(text: string): string {
    const lines = text.trim().split("\n").length;
    const preview = text.trim().split("\n")[0]?.slice(0, 60) ?? "";
    return `<details class="thinking-block"><summary>💭 Thinking${lines > 1 ? ` (${lines} lines)` : ""}…</summary><div class="thinking-content">${renderMarkdown(text)}</div></details>`;
}

// ── API helpers ──────────────────────────────────────────────────────

const LEGACY_SESSION_KEY = "hallucygenie_session_id";
const RECENT_ERROR_KEY = "hallucygenie_recent_error";
const RECENT_ERROR_TTL_MS = 10 * 60 * 1000;
const USER_AVATAR = "🎮";

export function clearLegacySessionId(): void {
    localStorage.removeItem(LEGACY_SESSION_KEY);
}

export function createApiHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
    };
}

export async function fetchHistory(): Promise<HistoryMessage[]> {
    const resp = await fetch("/api/history");
    if (!resp.ok) {
        throw new Error(`Failed to load history: ${resp.status}`);
    }
    const data = await resp.json();
    return data.messages ?? [];
}

export async function sendSteer(message: string): Promise<void> {
    const resp = await fetch("/api/steer", {
        method: "POST",
        headers: createApiHeaders(),
        body: JSON.stringify({ message }),
    });
    if (!resp.ok) {
        throw new Error(`Steer failed: ${resp.status}`);
    }
}

// ── SSE Parsing ──────────────────────────────────────────────────────

export interface SSEEvent {
    event: string;
    data: string;
}

export function parseSSELine(line: string): { field: string; value: string } | null {
    if (line.startsWith("event:")) {
        return { field: "event", value: line.slice(6).trim() };
    }
    if (line.startsWith("data:")) {
        return { field: "data", value: line.slice(5).trim() };
    }
    return null;
}

export function* parseSSEChunk(chunk: string): Generator<SSEEvent> {
    const lines = chunk.split("\n");
    let currentEvent = "message";
    let currentData = "";

    for (const line of lines) {
        if (line === "") {
            // Empty line = dispatch event
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

    // Handle last event if no trailing newline
    if (currentData) {
        yield { event: currentEvent, data: currentData };
    }
}

// ── DOM Helpers ──────────────────────────────────────────────────────

export function $(selector: string): HTMLElement {
    return document.querySelector(selector) as HTMLElement;
}

export function createElement(
    tag: string,
    attrs?: Record<string, string>,
    children?: (string | Node)[],
): HTMLElement {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value);
        }
    }
    if (children) {
        for (const child of children) {
            if (typeof child === "string") {
                el.appendChild(document.createTextNode(child));
            } else {
                el.appendChild(child);
            }
        }
    }
    return el;
}

// ── Message Rendering ────────────────────────────────────────────────

export function renderUserMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--user" });
    const avatar = createElement("div", { class: "message-avatar" }, [USER_AVATAR]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" });
    contentEl.innerHTML = renderMarkdown(content);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return msg;
}

export function renderAssistantMessage(): { container: HTMLElement; contentEl: HTMLElement } {
    const msg = createElement("div", { class: "message message--assistant" });
    const avatar = createElement("div", { class: "message-avatar" }, ["🧞"]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" }, [""]);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return { container: msg, contentEl };
}

export function renderSteerMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--steer message--user" });
    const avatar = createElement("div", { class: "message-avatar" }, ["💡"]);
    const bubble = createElement("div", { class: "message-bubble" });
    const contentEl = createElement("div", { class: "message-content" });
    contentEl.innerHTML = renderMarkdown(content);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return msg;
}

// ── Tool Card Rendering ──────────────────────────────────────────────

const TOOL_EMOJIS: Record<string, string> = {
    generate_image: "🎨",
    text_to_speech: "🎙️",
    generate_music: "🎵",
};

export function getToolEmoji(name: string): string {
    return TOOL_EMOJIS[name] ?? "🔧";
}

export function renderToolCardLoading(name: string): HTMLElement {
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

export function renderToolResult(toolName: string, result: ToolResult): HTMLElement {
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
        img.addEventListener("click", () => openLightbox(result.content));
        body.appendChild(img);
    } else if (result.type === "audio") {
        const audio = createElement("audio", {
            class: "tool-result-audio",
            controls: "",
            src: result.content,
        });
        body.appendChild(audio);
    } else {
        // text or other — render as formatted text
        body.innerHTML = renderMarkdown(result.content);
    }
    if (result.type === "error") {
        body.textContent = `😕 ${result.content}`;
        card.style.borderColor = "var(--color-error)";
    }

    return card;
}

// ── Lightbox ─────────────────────────────────────────────────────────

export function openLightbox(src: string): void {
    const lightbox = $("#lightbox");
    const img = $("#lightbox-img") as HTMLImageElement;
    img.src = src;
    lightbox.hidden = false;
}

export function closeLightbox(): void {
    const lightbox = $("#lightbox");
    lightbox.hidden = true;
    const img = $("#lightbox-img") as HTMLImageElement;
    img.src = "";
}

// ── Asset Gallery ─────────────────────────────────────────────────────

interface Asset {
    id: string;
    session_id: string;
    type: "image" | "audio" | "music";
    filename: string;
    mime_type: string;
    prompt: string | null;
    tool_name: string;
    size_bytes: number;
    created_at: number;
}

const ASSET_PROMPT_PREVIEW_CHARS = 30;

function assetUrl(id: string): string {
    return `/asset/${id}`;
}

function assetPreviewText(asset: Asset): string {
    const text = asset.prompt?.trim() || asset.tool_name;
    if (text.length <= ASSET_PROMPT_PREVIEW_CHARS) return text;
    return `${text.slice(0, ASSET_PROMPT_PREVIEW_CHARS)}…`;
}

function assetTypeLabel(type: Asset["type"]): string {
    if (type === "image") return "Image";
    if (type === "music") return "Music";
    return "Voice";
}

function renderAssetPreview(asset: Asset, url: string): HTMLElement {
    if (asset.type !== "image") {
        const audio = document.createElement("audio");
        audio.className = "asset-audio";
        audio.src = url;
        audio.controls = true;
        audio.preload = "metadata";
        return audio;
    }

    const button = document.createElement("button");
    button.className = "asset-preview-button";
    button.type = "button";
    button.setAttribute("aria-label", "Preview image");
    button.addEventListener("click", () => openLightbox(url));

    const img = document.createElement("img");
    img.className = "asset-thumb";
    img.src = url;
    img.alt = asset.prompt ?? "Generated image";
    img.loading = "lazy";
    button.appendChild(img);
    return button;
}

function renderAssetCard(asset: Asset): HTMLElement {
    const url = assetUrl(asset.id);
    const card = document.createElement("div");
    card.className = "asset-card";
    card.dataset.type = asset.type;
    card.dataset.id = asset.id;
    card.title = asset.prompt ?? asset.tool_name;

    const badge = document.createElement("div");
    badge.className = "asset-badge";
    badge.textContent = assetTypeLabel(asset.type);
    card.appendChild(badge);

    card.appendChild(renderAssetPreview(asset, url));

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    meta.textContent = assetPreviewText(asset);
    card.appendChild(meta);

    const download = document.createElement("a");
    download.className = "asset-download";
    download.href = url;
    download.download = asset.filename;
    download.textContent = "Download";
    card.appendChild(download);

    return card;
}

export function loadAssets(): void {
    const grid = $("#assets-grid") as HTMLElement;
    const empty = $("#assets-empty") as HTMLElement;
    grid.innerHTML = "";
    empty.hidden = true;

    fetch("/assets")
        .then((r) => r.json() as Promise<{ assets: Asset[] }>)
        .then(({ assets }) => {
            if (!assets.length) {
                empty.hidden = false;
                return;
            }
            for (const asset of assets) grid.appendChild(renderAssetCard(asset));
        })
        .catch(() => {
            empty.hidden = false;
            empty.textContent = "Failed to load assets 😕";
        });
}

// ── Error Toast ──────────────────────────────────────────────────────

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

function safeErrorMessage(message: string): string {
    if (/\{.*(?:base_resp|status_code|status_msg|error).*\}/is.test(message)) {
        return "Something went wrong. Try again! 🤷";
    }
    if (/stack trace|authorization:|bearer\s+[a-z0-9._-]+/i.test(message)) {
        return "Something went wrong. Try again! 🤷";
    }
    return message;
}

function saveRecentError(message: string): void {
    localStorage.setItem(RECENT_ERROR_KEY, JSON.stringify({ message, createdAt: Date.now() }));
}

function clearRecentError(): void {
    localStorage.removeItem(RECENT_ERROR_KEY);
}

export function restoreRecentError(now = Date.now()): string | null {
    try {
        const raw = localStorage.getItem(RECENT_ERROR_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { message?: unknown; createdAt?: unknown };
        if (typeof parsed.message !== "string" || typeof parsed.createdAt !== "number") {
            clearRecentError();
            return null;
        }
        if (now - parsed.createdAt > RECENT_ERROR_TTL_MS) {
            clearRecentError();
            return null;
        }
        return parsed.message;
    } catch {
        clearRecentError();
        return null;
    }
}

export function showError(message: string, duration = 4000): void {
    const safeMessage = safeErrorMessage(message);
    const toast = $("#error-toast");
    const msgEl = $("#error-toast-message");
    msgEl.textContent = safeMessage;
    toast.hidden = false;
    saveRecentError(safeMessage);

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.hidden = true;
        toastTimeout = null;
    }, duration);
}

// ── Chat State ───────────────────────────────────────────────────────

let isStreaming = false;
let currentAssistantEl: HTMLElement | null = null;
let currentAssistantContent: HTMLElement | null = null;
let activeToolCards = new Map<string, HTMLElement>();
let rawTextBuffer = ""; // raw text for markdown re-rendering
let thinkingBuffer = ""; // accumulated thinking text from thinking events

// ── SSE Stream Processing ────────────────────────────────────────────

export async function streamChat(
    messages: Array<{ role: string; content: string }>,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    const resp = await fetch("/api/chat", {
        method: "POST",
        headers: createApiHeaders(),
        body: JSON.stringify({ messages }),
    });

    if (resp.status === 400) {
        const parsed = await resp.json().catch(() => null);
        showError(parsed?.error ?? "Session expired — please reload the page 🔄");
        return;
    }

    if (!resp.ok) {
        const parsed = await resp.json().catch(() => null);
        const msg = parsed?.error ?? `Something went wrong (${resp.status}). Try again! 🤷`;
        showError(msg);
        return;
    }

    if (!resp.body) {
        showError("No response from server 😴");
        return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events from buffer
        // SSE events end with \n\n
        const parts = buffer.split("\n\n");
        // Keep the last (potentially incomplete) part in the buffer
        buffer = parts.pop() ?? "";

        for (const part of parts) {
            const events = [...parseSSEChunk(part + "\n\n")];
            for (const event of events) {
                onEvent?.(event);
                handleSSEEvent(event);
            }
        }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
        const events = [...parseSSEChunk(buffer)];
        for (const event of events) {
            onEvent?.(event);
            handleSSEEvent(event);
        }
    }
}

function ensureAssistantContent(): HTMLElement {
    if (currentAssistantContent) return currentAssistantContent;
    const messageList = $("#message-list");
    const { container, contentEl } = renderAssistantMessage();
    messageList.appendChild(container);
    currentAssistantEl = container;
    currentAssistantContent = contentEl;
    return contentEl;
}

function handleSSEEvent(event: SSEEvent): void {
    const { event: eventType, data } = event;

    // Done signal
    if (data === "[DONE]") {
        clearRecentError();
        finishStreaming();
        return;
    }

    // Thinking event
    if (eventType === "thinking") {
        try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
                appendThinking(parsed.content);
            }
        } catch {
            // Ignore parse errors
        }
        return;
    }

    // Error event
    if (eventType === "error") {
        try {
            const parsed = JSON.parse(data);
            showError(parsed.error ?? "Something went wrong 😕");
        } catch {
            showError("Something went wrong 😕");
        }
        finishStreaming();
        return;
    }

    // Tool start
    if (eventType === "tool_start") {
        try {
            const parsed: ToolStartEvent = JSON.parse(data);
            const card = renderToolCardLoading(parsed.name);
            ensureAssistantContent().appendChild(card);
            activeToolCards.set(parsed.id, card);
            scrollToBottom();
        } catch {
            // Ignore parse errors
        }
        return;
    }

    // Tool result
    if (eventType === "tool_result") {
        try {
            const parsed: ToolResultEvent = JSON.parse(data);
            const loadingCard = activeToolCards.get(parsed.id);
            const resultCard = renderToolResult(parsed.name, parsed.result);
            if (loadingCard?.isConnected) {
                // Replace loading card with result
                loadingCard.replaceWith(resultCard);
            } else {
                // Fallback: render orphan result instead of silently dropping it.
                ensureAssistantContent().appendChild(resultCard);
            }
            activeToolCards.delete(parsed.id);
            scrollToBottom();
            // Refresh quota badge and assets tab after tool execution
            updateQuotaBadge();
            if (($("#create-modal") as HTMLElement)?.dataset.tabOpen === "assets") loadAssets();
        } catch {
            // Ignore parse errors
        }
        return;
    }

    // Text content (default event type "message")
    if (eventType === "message") {
        try {
            const parsed = JSON.parse(data);
            // Handle OpenAI-style format: {"choices": [{"delta": {"content": "..."}}]}
            if (parsed.choices?.[0]?.delta?.content) {
                appendText(parsed.choices[0].delta.content);
            } else if (parsed.delta) {
                // Direct delta format
                appendText(parsed.delta);
            }
        } catch {
            // Ignore parse errors
        }
    }
}

function getOrCreateContentRegion(
    className: string,
    position: "start" | "end",
): HTMLElement | null {
    if (!currentAssistantContent) return null;
    let region = currentAssistantContent.querySelector<HTMLElement>(`.${className}`);
    if (region) return region;

    region = createElement("div", { class: className });
    if (position === "start") {
        currentAssistantContent.insertBefore(region, currentAssistantContent.firstChild);
    } else {
        currentAssistantContent.appendChild(region);
    }
    return region;
}

function appendText(text: string): void {
    if (!currentAssistantContent) return;

    rawTextBuffer += text;
    const textRegion = getOrCreateContentRegion("assistant-text-region", "end");
    if (!textRegion) return;

    textRegion.classList.add("is-streaming");
    const chunk = createElement("span", { class: "stream-chunk" });
    chunk.textContent = text;
    textRegion.appendChild(chunk);
    scrollToBottom();
}

function appendThinking(text: string): void {
    if (!currentAssistantContent) return;

    thinkingBuffer += text;
    const thinkingRegion = getOrCreateContentRegion("assistant-thinking-region", "start");
    if (!thinkingRegion) return;

    thinkingRegion.innerHTML = renderThinkingBlock(thinkingBuffer);
    scrollToBottom();
}

function scrollToBottom(): void {
    const list = $("#message-list");
    requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
    });
}

function finishStreaming(): void {
    currentAssistantContent
        ?.querySelectorAll<HTMLElement>(".assistant-text-region.is-streaming")
        .forEach((el) => {
            el.innerHTML = renderMarkdown(rawTextBuffer);
            el.classList.remove("is-streaming");
        });
    document
        .querySelectorAll(".message--steer")
        .forEach((el) => el.classList.remove("message--steer"));
    isStreaming = false;
    currentAssistantEl = null;
    currentAssistantContent = null;
    activeToolCards.clear();
    rawTextBuffer = "";
    thinkingBuffer = "";
    setStreamingUI(false);
}

// ── UI State ─────────────────────────────────────────────────────────

function setStreamingUI(streaming: boolean): void {
    const input = $("#chat-input") as HTMLTextAreaElement;
    const sendBtn = $("#send-button") as HTMLButtonElement;
    const typingIndicator = $("#typing-indicator");
    const steerHint = $("#steer-hint");

    if (streaming) {
        input.disabled = false; // Allow typing during streaming for steering
        input.placeholder = "💡 Type to steer the response...";
        sendBtn.disabled = true;
        typingIndicator.hidden = false;
        steerHint.hidden = true;
    } else {
        input.disabled = false;
        input.placeholder = "Type a message...";
        sendBtn.disabled = true; // Will be enabled by input handler
        typingIndicator.hidden = true;
        steerHint.hidden = true;
        input.focus();
    }
}

// ── Send Message ─────────────────────────────────────────────────────

export async function sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    // If streaming, treat as steer message
    if (isStreaming) {
        await sendSteerMessage(content);
        return;
    }

    const messageList = $("#message-list");

    // Render user message
    const userMsg = renderUserMessage(content);
    messageList.appendChild(userMsg);
    scrollToBottom();

    // Prepare assistant message container
    const { container: assistantEl, contentEl: assistantContent } = renderAssistantMessage();
    messageList.appendChild(assistantEl);
    currentAssistantEl = assistantEl;
    currentAssistantContent = assistantContent;

    // Clear input
    const input = $("#chat-input") as HTMLTextAreaElement;
    input.value = "";
    autoResizeInput();

    // Start streaming
    isStreaming = true;
    setStreamingUI(true);

    try {
        await streamChat([{ role: "user", content }]);
    } catch (err) {
        showError("Connection lost. Check your internet? 📡");
        finishStreaming();
    }
}

// ── Steer Message ────────────────────────────────────────────────────

export async function sendSteerMessage(content: string): Promise<void> {
    if (!content.trim() || !isStreaming) return;

    const messageList = $("#message-list");

    // Render steer message (visually distinct)
    const steerMsg = renderSteerMessage(content);
    messageList.appendChild(steerMsg);
    scrollToBottom();

    // Clear input
    const input = $("#chat-input") as HTMLTextAreaElement;
    input.value = "";
    autoResizeInput();

    // Send steer to server
    try {
        await sendSteer(content);
    } catch {
        showError("Couldn't steer — try again 💫");
    }
}

// ── History Loading ──────────────────────────────────────────────────

function parseHistoryToolCalls(value?: string | null): HistoryToolCall[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value) as HistoryToolCall[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (call) => typeof call.id === "string" && typeof call.name === "string",
        );
    } catch {
        return [];
    }
}

function inferHistoryToolResult(toolName: string, content: string): ToolResult {
    if (content.startsWith("Error: ")) return { type: "error", content: content.slice(7) };

    if (toolName === "generate_image" && /^(?:\/asset\/|https?:\/\/|data:image\/)/i.test(content)) {
        return { type: "image", content };
    }

    if (
        (toolName === "text_to_speech" || toolName === "generate_music") &&
        /^(?:\/asset\/|https?:\/\/|data:audio\/)/i.test(content)
    ) {
        return { type: "audio", content };
    }

    return { type: "text", content };
}

function renderHistoryAssistantMessage(
    msg: HistoryMessage,
    toolRows: Map<string, HistoryMessage>,
): HTMLElement {
    const { container, contentEl } = renderAssistantMessage();

    if (msg.thinking?.trim()) {
        const thinkingRegion = createElement("div", { class: "assistant-thinking-region" });
        thinkingRegion.innerHTML = renderThinkingBlock(msg.thinking);
        contentEl.appendChild(thinkingRegion);
    }

    if (msg.content.trim()) {
        const textRegion = createElement("div", { class: "assistant-text-region" });
        textRegion.innerHTML = renderMarkdown(msg.content);
        contentEl.appendChild(textRegion);
    }

    for (const call of parseHistoryToolCalls(msg.tool_calls_json)) {
        const toolRow = toolRows.get(call.id);
        if (!toolRow) continue;
        contentEl.appendChild(
            renderToolResult(call.name, inferHistoryToolResult(call.name, toolRow.content)),
        );
    }

    return container;
}

export async function loadHistory(): Promise<void> {
    const messageList = $("#message-list");

    try {
        const messages = await fetchHistory();

        // Remove welcome message if we have history
        if (messages.length > 0) {
            const welcome = messageList.querySelector(".message--welcome");
            if (welcome) welcome.remove();
        }

        const toolRows = new Map<string, HistoryMessage>();
        for (const msg of messages) {
            if (msg.role === "tool" && msg.tool_call_id) toolRows.set(msg.tool_call_id, msg);
        }

        for (const msg of messages) {
            if (msg.role === "user") {
                messageList.appendChild(renderUserMessage(msg.content));
            } else if (msg.role === "assistant") {
                messageList.appendChild(renderHistoryAssistantMessage(msg, toolRows));
            }
        }

        scrollToBottom();
    } catch {
        // First visit or server down — show welcome message
    }
}

// ── Input Handling ───────────────────────────────────────────────────

export function autoResizeInput(): void {
    const input = $("#chat-input") as HTMLTextAreaElement;
    const maxHeight = 120;
    input.style.height = "auto";
    const clamped = input.scrollHeight > maxHeight;
    input.style.height = Math.min(input.scrollHeight, maxHeight) + "px";
    input.classList.toggle("is-overflowing", clamped);
    input.setAttribute("aria-multiline", "true");
}

export function handleInputChange(): void {
    const input = $("#chat-input") as HTMLTextAreaElement;
    const sendBtn = $("#send-button") as HTMLButtonElement;
    sendBtn.disabled = !input.value.trim();
    autoResizeInput();
}

// ── Quota Badge ──────────────────────────────────────────────────

interface QuotaData {
    chat: { used: number; total: number } | null;
    speech: { used: number; total: number } | null;
    image: { used: number; total: number } | null;
    music: { used: number; total: number } | null;
}

export async function updateQuotaBadge(): Promise<void> {
    const badge = $("#quota-badge") as HTMLElement | null;
    if (!badge) return;
    try {
        const resp = await fetch("/api/quota");
        if (!resp.ok) return;
        const data: QuotaData = await resp.json();
        const items = badge.querySelectorAll<HTMLSpanElement>(".quota-item[data-type]");
        for (const item of items) {
            const type = item.dataset.type as keyof QuotaData;
            const q = data[type];
            if (!q || q.total === 0) {
                item.querySelector(".quota-used")!.textContent = "—";
                item.className = "quota-item";
                continue;
            }
            const pct = q.used / q.total;
            item.querySelector(".quota-used")!.textContent = `${q.total - q.used}`;
            item.className =
                pct >= 0.95 ? "quota-item critical" : pct >= 0.8 ? "quota-item warn" : "quota-item";
        }
    } catch {
        // Non-critical — ignore
    }
}

// ── Event Binding ────────────────────────────────────────────────────

export function init(): void {
    clearLegacySessionId();
    const restoredError = restoreRecentError();
    if (restoredError) showError(restoredError);

    const form = $("#chat-form") as HTMLFormElement;
    const input = $("#chat-input") as HTMLTextAreaElement;
    const sendBtn = $("#send-button") as HTMLButtonElement;
    const lightbox = $("#lightbox");
    const lightboxClose = lightbox.querySelector(".lightbox-close") as HTMLElement;
    const lightboxBackdrop = lightbox.querySelector(".lightbox-backdrop") as HTMLElement;
    const steerClose = $("#steer-close") as HTMLElement;
    const connectionStatus = $("#connection-status") as HTMLElement;

    connectionStatus.setAttribute(
        "aria-label",
        `Connection status: ${connectionStatus.title || "Connected"}`,
    );

    // Form submit (handles both send and steer)
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (input.value.trim()) {
            sendMessage(input.value);
        }
    });

    // Input changes
    input.addEventListener("input", handleInputChange);

    // Enter to send (Shift+Enter for newline)
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim()) {
                sendMessage(input.value);
            }
        }
    });

    // Lightbox close
    lightboxClose.addEventListener("click", closeLightbox);
    lightboxBackdrop.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeLightbox();
            if (!createModal.hidden) closeCreateModal();
        }
    });

    // Steer close
    steerClose.addEventListener("click", () => {
        $("#steer-hint").hidden = true;
    });

    // ── Onboarding ──────────────────────────────────────────────────
    const ONBOARDING_KEY = "hg_onboarding_done";
    const onboarding = $("#onboarding");
    const slides = onboarding.querySelectorAll<HTMLElement>(".onboarding-slide");
    const dots = onboarding.querySelectorAll<HTMLElement>(".onboarding-dots .dot");
    let currentSlide = 0;

    function showSlide(idx: number): void {
        slides.forEach((s, i) => {
            s.classList.toggle("active", i === idx);
        });
        dots.forEach((d, i) => {
            d.classList.toggle("active", i === idx);
        });
        currentSlide = idx;
    }

    function dismissOnboarding(): void {
        onboarding.hidden = true;
        localStorage.setItem(ONBOARDING_KEY, "1");
    }

    // Show onboarding on first visit
    if (!localStorage.getItem(ONBOARDING_KEY)) {
        onboarding.hidden = false;
        showSlide(0);
    }

    // Next buttons (slides 0 and 1 → next slide)
    onboarding.querySelectorAll<HTMLButtonElement>(".onboarding-next").forEach((btn) => {
        btn.addEventListener("click", () => showSlide(currentSlide + 1));
    });

    // Slide 2: Try chat button
    $("#onboarding-try-chat").addEventListener("click", () => {
        dismissOnboarding();
        const input = $("#chat-input") as HTMLTextAreaElement;
        input.value = "What are the top 3 gaming tips for a beginner?";
        input.dispatchEvent(new Event("input"));
        input.focus();
    });

    // Slide 3: Try create button
    $("#onboarding-try-create").addEventListener("click", () => {
        dismissOnboarding();
        openCreateModal();
    });

    // Done button
    $("#onboarding-done").addEventListener("click", dismissOnboarding);

    // ── Load history ────────────────────────────────────────────────
    loadHistory();

    // Fetch and display quota badge (once on init — no polling interval)
    updateQuotaBadge();

    // Create modal
    const createBtn = $("#create-btn") as HTMLButtonElement;
    const createModal = $("#create-modal");
    const createClose = $("#create-close") as HTMLButtonElement;
    const createBackdrop = createModal.querySelector(".create-backdrop") as HTMLElement;
    let createModalReturnFocus: HTMLElement | null = null;

    function getCreateModalFocusable(): HTMLElement[] {
        return Array.from(
            createModal.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
        ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
    }

    function openCreateModal(): void {
        createModalReturnFocus = document.activeElement as HTMLElement | null;
        createModal.hidden = false;
        createClose.focus();
    }

    function closeCreateModal(): void {
        createModal.hidden = true;
        createModalReturnFocus?.focus();
        createModalReturnFocus = null;
    }

    function trapCreateModalFocus(e: KeyboardEvent): void {
        if (e.key !== "Tab" || createModal.hidden) return;
        const focusable = getCreateModalFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    createBtn.addEventListener("click", openCreateModal);
    createClose.addEventListener("click", closeCreateModal);
    createBackdrop.addEventListener("click", closeCreateModal);
    createModal.addEventListener("keydown", trapCreateModalFocus);

    // Tab switching
    const tabs = createModal.querySelectorAll<HTMLButtonElement>(".create-tab");
    const panels = createModal.querySelectorAll<HTMLElement>(".create-panel");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            panels.forEach((p) => {
                p.hidden = true;
            });
            tab.classList.add("active");
            const panel = createModal.querySelector<HTMLElement>(
                `[data-panel="${tab.dataset.tab}"]`,
            );
            if (panel) {
                panel.hidden = false;
                createModal.dataset.tabOpen = tab.dataset.tab ?? "";
                if (tab.dataset.tab === "assets") loadAssets();
            }
        });
    });

    // Form submissions — send as prompt to chat
    const createImgForm = $("#create-image-form") as HTMLFormElement;
    const createMusicForm = $("#create-music-form") as HTMLFormElement;
    const createVoiceForm = $("#create-voice-form") as HTMLFormElement;
    const createSearchForm = $("#create-search-form") as HTMLFormElement;
    const imgPromptInput = $("#img-prompt") as HTMLTextAreaElement;
    const imgRatioInput = $("#img-ratio") as HTMLSelectElement;
    const musicPromptInput = $("#music-prompt") as HTMLTextAreaElement;
    const musicLyricsInput = $("#music-lyrics") as HTMLTextAreaElement;
    const voiceTextInput = $("#voice-text") as HTMLTextAreaElement;
    const voiceSpeedInput = $("#voice-speed") as HTMLSelectElement;
    const searchQueryInput = $("#search-query") as HTMLTextAreaElement;

    createImgForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = imgPromptInput.value.trim();
        const ratio = imgRatioInput.value;
        if (prompt) {
            closeCreateModal();
            sendMessage(
                `Use generate_image with prompt: ${prompt}\nTool params: aspect_ratio=${ratio}`,
            );
        }
    });

    createMusicForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = musicPromptInput.value.trim();
        const lyrics = musicLyricsInput.value.trim();
        if (prompt) {
            closeCreateModal();
            let msg = `Use generate_music with prompt: ${prompt}`;
            if (lyrics) msg += `\nTool params: lyrics=${lyrics}`;
            sendMessage(msg);
        }
    });

    createVoiceForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = voiceTextInput.value.trim();
        const speed = voiceSpeedInput.value;
        if (text) {
            closeCreateModal();
            sendMessage(`Use text_to_speech with text: ${text}\nTool params: speed=${speed}`);
        }
    });

    createSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const query = searchQueryInput.value.trim();
        if (query) {
            closeCreateModal();
            sendMessage(`Search the web for: ${query}`);
        }
    });

    // Focus input
    input.focus();
    document.documentElement.dataset.hgReady = "1";
}

// ── Bootstrap ────────────────────────────────────────────────────────

if (typeof document !== "undefined" && document.readyState !== "loading") {
    init();
} else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
}
