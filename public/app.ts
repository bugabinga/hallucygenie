// HallucyGenie — Frontend Chat Logic
// Vanilla TypeScript, no framework, no OOP.
// Session UUID, SSE streaming, message rendering, tool cards, steering.

// ── Types ────────────────────────────────────────────────────────────

interface HistoryMessage {
    role: "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
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

// ── Session UUID ─────────────────────────────────────────────────────

export function getOrCreateSessionId(): string {
    const KEY = "hallucygenie_session_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
    }
    return id;
}

// ── API helpers ──────────────────────────────────────────────────────

export function createApiHeaders(sessionId: string): Record<string, string> {
    return {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
    };
}

export async function fetchHistory(sessionId: string): Promise<HistoryMessage[]> {
    const resp = await fetch("/api/history", {
        headers: createApiHeaders(sessionId),
    });
    if (!resp.ok) {
        throw new Error(`Failed to load history: ${resp.status}`);
    }
    const data = await resp.json();
    return data.messages ?? [];
}

export async function sendSteer(sessionId: string, message: string): Promise<void> {
    const resp = await fetch("/api/steer", {
        method: "POST",
        headers: createApiHeaders(sessionId),
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
    const avatar = createElement("div", { class: "message-avatar" }, ["👤"]);
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

export function loadAssets(): void {
    const grid = $("#assets-grid") as HTMLElement;
    const empty = $("#assets-empty") as HTMLElement;
    grid.innerHTML = "";
    empty.hidden = true;

    const sessionId = getOrCreateSessionId();
    fetch(`/assets`, { headers: { "X-Session-Id": sessionId } })
        .then((r) => r.json() as Promise<{ assets: Asset[] }>)
        .then(({ assets }) => {
            if (!assets.length) {
                empty.hidden = false;
                return;
            }
            for (const asset of assets.slice(0, 20)) {
                const card = document.createElement("div");
                card.className = "asset-card";
                (card as any).dataset.type = asset.type;
                (card as any).dataset.id = asset.id;
                card.title = asset.prompt ?? asset.tool_name;
                if (asset.type === "image") {
                    const img = document.createElement("img");
                    img.className = "asset-thumb";
                    img.src = `/asset/${asset.id}`;
                    img.alt = asset.prompt ?? "Generated image";
                    img.loading = "lazy";
                    card.appendChild(img);
                } else {
                    const icon = document.createElement("span");
                    icon.className = "asset-thumb";
                    icon.textContent = asset.type === "music" ? "🎵" : "🎤";
                    card.appendChild(icon);
                }
                const meta = document.createElement("div");
                meta.className = "asset-meta";
                meta.textContent = asset.prompt
                    ? asset.prompt.slice(0, 30) + (asset.prompt.length > 30 ? "…" : "")
                    : asset.tool_name;
                card.appendChild(meta);
                card.addEventListener("click", () => {
                    if (asset.type === "image") {
                        openLightbox(`/asset/${asset.id}`);
                    } else {
                        new Audio(`/asset/${asset.id}`)
                            .play()
                            .catch(() => showError("Could not play audio"));
                    }
                });
                grid.appendChild(card);
            }
        })
        .catch(() => {
            empty.hidden = false;
            (empty as HTMLElement).textContent = "Failed to load assets 😕";
        });
}

// ── Error Toast ──────────────────────────────────────────────────────

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showError(message: string, duration = 4000): void {
    const toast = $("#error-toast");
    const msgEl = $("#error-toast-message");
    msgEl.textContent = message;
    toast.hidden = false;

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
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    const resp = await fetch("/api/chat", {
        method: "POST",
        headers: createApiHeaders(sessionId),
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

function handleSSEEvent(event: SSEEvent): void {
    const { event: eventType, data } = event;

    // Done signal
    if (data === "[DONE]") {
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
            if (currentAssistantContent) {
                currentAssistantContent.appendChild(card);
            }
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
            if (loadingCard && currentAssistantContent) {
                // Replace loading card with result
                const resultCard = renderToolResult(parsed.name, parsed.result);
                loadingCard.replaceWith(resultCard);
                activeToolCards.delete(parsed.id);
            }
            scrollToBottom();
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

function appendText(text: string): void {
    if (!currentAssistantContent) return;

    rawTextBuffer += text;

    // Re-render the content with markdown
    let html = "";
    if (thinkingBuffer) {
        html += renderThinkingBlock(thinkingBuffer);
    }
    if (rawTextBuffer) {
        html += renderMarkdown(rawTextBuffer);
    }
    currentAssistantContent.innerHTML = html;
    scrollToBottom();
}

function appendThinking(text: string): void {
    if (!currentAssistantContent) return;

    thinkingBuffer += text;

    // Re-render the content
    let html = "";
    if (thinkingBuffer) {
        html += renderThinkingBlock(thinkingBuffer);
    }
    if (rawTextBuffer) {
        html += renderMarkdown(rawTextBuffer);
    }
    currentAssistantContent.innerHTML = html;
    scrollToBottom();
}

function scrollToBottom(): void {
    const list = $("#message-list");
    requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
    });
}

function finishStreaming(): void {
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
        steerHint.hidden = false;
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

    const sessionId = getOrCreateSessionId();
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
        await streamChat(sessionId, [{ role: "user", content }]);
    } catch (err) {
        showError("Connection lost. Check your internet? 📡");
        finishStreaming();
    }
}

// ── Steer Message ────────────────────────────────────────────────────

export async function sendSteerMessage(content: string): Promise<void> {
    if (!content.trim() || !isStreaming) return;

    const sessionId = getOrCreateSessionId();
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
        await sendSteer(sessionId, content);
    } catch {
        showError("Couldn't steer — try again 💫");
    }
}

// ── History Loading ──────────────────────────────────────────────────

export async function loadHistory(): Promise<void> {
    const sessionId = getOrCreateSessionId();
    const messageList = $("#message-list");

    try {
        const messages = await fetchHistory(sessionId);

        // Remove welcome message if we have history
        if (messages.length > 0) {
            const welcome = messageList.querySelector(".message--welcome");
            if (welcome) welcome.remove();
        }

        for (const msg of messages) {
            if (msg.role === "user") {
                messageList.appendChild(renderUserMessage(msg.content));
            } else if (msg.role === "assistant") {
                const { container } = renderAssistantMessage();
                const contentEl = container.querySelector(".message-content") as HTMLElement;
                contentEl.innerHTML = renderMarkdown(msg.content);
                messageList.appendChild(container);
            }
            // Tool messages in history are simplified for now
        }

        scrollToBottom();
    } catch {
        // First visit or server down — show welcome message
    }
}

// ── Input Handling ───────────────────────────────────────────────────

export function autoResizeInput(): void {
    const input = $("#chat-input") as HTMLTextAreaElement;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
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

async function updateQuotaBadge(): Promise<void> {
    const badge = $("#quota-badge") as HTMLButtonElement | null;
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
    const form = $("#chat-form") as HTMLFormElement;
    const input = $("#chat-input") as HTMLTextAreaElement;
    const sendBtn = $("#send-button") as HTMLButtonElement;
    const lightbox = $("#lightbox");
    const lightboxClose = lightbox.querySelector(".lightbox-close") as HTMLElement;
    const lightboxBackdrop = lightbox.querySelector(".lightbox-backdrop") as HTMLElement;
    const steerClose = $("#steer-close") as HTMLElement;

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
        if (e.key === "Escape") closeLightbox();
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
        createModal.hidden = false;
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

    createBtn.addEventListener("click", () => {
        createModal.hidden = false;
    });
    createClose.addEventListener("click", () => {
        createModal.hidden = true;
    });
    createBackdrop.addEventListener("click", () => {
        createModal.hidden = true;
    });

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
    const musicInstrumentalInput = $("#music-instrumental") as HTMLInputElement;
    const voiceTextInput = $("#voice-text") as HTMLTextAreaElement;
    const voiceSpeedInput = $("#voice-speed") as HTMLSelectElement;
    const searchQueryInput = $("#search-query") as HTMLTextAreaElement;

    createImgForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = imgPromptInput.value.trim();
        const ratio = imgRatioInput.value;
        if (prompt) {
            createModal.hidden = true;
            sendMessage(`Generate an image: ${prompt} (aspect ratio ${ratio})`);
        }
    });

    createMusicForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = musicPromptInput.value.trim();
        const lyrics = musicLyricsInput.value.trim();
        const instrumental = musicInstrumentalInput.checked;
        if (prompt) {
            createModal.hidden = true;
            let msg = `Generate music: ${prompt}`;
            if (lyrics) msg += `. Lyrics: ${lyrics}`;
            if (instrumental) msg += " (instrumental only)";
            sendMessage(msg);
        }
    });

    createVoiceForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = voiceTextInput.value.trim();
        const speed = voiceSpeedInput.value;
        if (text) {
            createModal.hidden = true;
            sendMessage(`Read this out loud: ${text} (speed: ${speed}x)`);
        }
    });

    createSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const query = searchQueryInput.value.trim();
        if (query) {
            createModal.hidden = true;
            sendMessage(`Search the web for: ${query}`);
        }
    });

    // Focus input
    input.focus();
}

// ── Bootstrap ────────────────────────────────────────────────────────

if (typeof document !== "undefined" && document.readyState !== "loading") {
    init();
} else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
}
