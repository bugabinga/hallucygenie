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

type CreateToolName =
    | "generate_image"
    | "generate_music"
    | "generate_music_cover"
    | "text_to_speech"
    | "generate_lyrics"
    | "analyze_image"
    | "web_search";

interface ToolStartEvent {
    id: string;
    name: string;
}

interface ToolResultEvent {
    id: string;
    name: string;
    result: ToolResult;
}

interface SessionRow {
    id: string;
    name: string;
    name_source: "default" | "manual" | "auto";
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}

interface CreateDraft {
    selectedTab: string;
    image: {
        prompt: string;
        aspect_ratio: string;
        n: string;
        seed: string;
        width: string;
        height: string;
        prompt_optimizer: boolean;
    };
    music: {
        prompt: string;
        lyrics: string;
        cover_source_kind: string;
        cover_audio_url: string;
        cover_style: string;
        cover_feature_id: string;
        cover_lyrics: string;
    };
    voice: { text: string; speed: string; voice_id: string; volume: string; pitch: string };
    analyze: { image_url: string; prompt: string };
    search: { query: string };
}

interface CreateHistoryItem {
    id: string;
    kind: string;
    tool_name: string;
    input: Record<string, unknown>;
    status: "submitted" | "succeeded" | "failed";
    asset_id: string | null;
}

export interface UserProfile {
    version: 1;
    username: string;
    interests: string;
    hates: string;
    favorites: string;
    avatar: { type: "asset"; value: string };
    updatedAt: number;
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

export const DEFAULT_USER_AVATAR = "🎮";

let currentProfile: UserProfile = {
    version: 1,
    username: "",
    interests: "",
    hates: "",
    favorites: "",
    avatar: { type: "asset", value: "" },
    updatedAt: 0,
};

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

export async function fetchProfile(): Promise<UserProfile> {
    const resp = await fetch("/api/profile");
    if (!resp.ok) throw new Error(`Failed to load profile: ${resp.status}`);
    return (await resp.json()) as UserProfile;
}

export async function putProfile(profile: UserProfile): Promise<UserProfile> {
    const resp = await fetch("/api/profile", {
        method: "PUT",
        headers: createApiHeaders(),
        body: JSON.stringify(profile),
    });
    if (!resp.ok) throw new Error(`Failed to save profile: ${resp.status}`);
    return (await resp.json()) as UserProfile;
}

export async function deleteProfile(): Promise<UserProfile> {
    const resp = await fetch("/api/profile", { method: "DELETE", headers: createApiHeaders() });
    if (!resp.ok) throw new Error(`Failed to reset profile: ${resp.status}`);
    return (await resp.json()) as UserProfile;
}

async function uploadProfileAvatar(file: File, profile: UserProfile): Promise<UserProfile> {
    const body = new FormData();
    body.set("avatar", file);
    body.set("profile", JSON.stringify(profile));
    const resp = await fetch("/api/profile/avatar", { method: "POST", body });
    if (!resp.ok) throw new Error(`Failed to upload avatar: ${resp.status}`);
    return ((await resp.json()) as { profile: UserProfile }).profile;
}

async function uploadAnalyzeImage(file: File): Promise<{ assetId: string; assetUrl: string }> {
    const body = new FormData();
    body.set("image", file);
    const resp = await fetch("/api/analyze-image", { method: "POST", body });
    if (!resp.ok) throw new Error(`Failed to upload image: ${resp.status}`);
    return (await resp.json()) as { assetId: string; assetUrl: string };
}

async function generateProfileAvatar(profile: UserProfile): Promise<UserProfile> {
    const resp = await fetch("/api/profile/avatar/generate", {
        method: "POST",
        headers: createApiHeaders(),
        body: JSON.stringify(profile),
    });
    if (!resp.ok) throw new Error(`Failed to generate avatar: ${resp.status}`);
    return ((await resp.json()) as { profile: UserProfile }).profile;
}

async function fetchSessions(): Promise<{ activeSessionId: string; sessions: SessionRow[] }> {
    const resp = await fetch("/api/sessions");
    if (!resp.ok) throw new Error(`Failed to load sessions: ${resp.status}`);
    return (await resp.json()) as { activeSessionId: string; sessions: SessionRow[] };
}

async function createNewSession(): Promise<SessionRow> {
    const resp = await fetch("/api/sessions", { method: "POST", headers: createApiHeaders() });
    if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`);
    return ((await resp.json()) as { session: SessionRow }).session;
}

async function activateSession(id: string): Promise<void> {
    const resp = await fetch(`/api/sessions/${encodeURIComponent(id)}/activate`, {
        method: "POST",
        headers: createApiHeaders(),
    });
    if (!resp.ok) throw new Error(`Failed to activate session: ${resp.status}`);
}

function draftApiEnabled(): boolean {
    return typeof document !== "undefined" && Boolean(document.querySelector("#session-select"));
}

async function getDraft(kind: "chat" | "create"): Promise<unknown | null> {
    if (!draftApiEnabled()) return null;
    try {
        const resp = await fetch(`/api/draft/${kind}`);
        if (!resp.ok) return null;
        return ((await resp.json()) as { draft: unknown | null }).draft;
    } catch {
        return null;
    }
}

async function putDraft(kind: "chat" | "create", value: unknown): Promise<void> {
    if (!draftApiEnabled()) return;
    try {
        await fetch(`/api/draft/${kind}`, {
            method: "PUT",
            headers: createApiHeaders(),
            body: JSON.stringify(value),
        });
    } catch {
        return;
    }
}

async function clearDraft(kind: "chat" | "create"): Promise<void> {
    if (!draftApiEnabled()) return;
    try {
        await fetch(`/api/draft/${kind}`, { method: "DELETE", headers: createApiHeaders() });
    } catch {
        return;
    }
}

async function fetchCreateHistory(kind: string): Promise<CreateHistoryItem[]> {
    const resp = await fetch(`/api/create-history?kind=${encodeURIComponent(kind)}&limit=5`);
    if (!resp.ok) return [];
    return ((await resp.json()) as { items: CreateHistoryItem[] }).items;
}

async function deleteCreateHistoryItem(id: string): Promise<void> {
    await fetch(`/api/create-history/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: createApiHeaders(),
    });
}

function normalizeAvatarAsset(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (!/^asset_[0-9a-f-]+$/i.test(trimmed)) throw new Error("Avatar asset id is invalid");
    return trimmed;
}

export function normalizedProfileFromForm(form: {
    username: string;
    interests: string;
    hates: string;
    favorites: string;
    avatarAsset?: string;
}): UserProfile {
    return {
        version: 1,
        username: Array.from(form.username.trim()).slice(0, 40).join(""),
        interests: Array.from(form.interests.trim()).slice(0, 300).join(""),
        hates: Array.from(form.hates.trim()).slice(0, 300).join(""),
        favorites: Array.from(form.favorites.trim()).slice(0, 300).join(""),
        avatar: { type: "asset", value: normalizeAvatarAsset(form.avatarAsset ?? "") },
        updatedAt: Date.now(),
    };
}

function setCurrentProfile(profile: UserProfile): void {
    currentProfile = profile;
    const btn = document.querySelector<HTMLElement>("#profile-btn");
    if (btn) {
        const label = profile.avatar.value ? "🖼️" : DEFAULT_USER_AVATAR;
        btn.dataset.avatar = label;
        btn.textContent = `${label} Profile`;
    }
    repaintCurrentUserAvatars();
}

function repaintCurrentUserAvatars(): void {
    document
        .querySelectorAll<HTMLElement>(".message--user:not(.message--steer) .message-avatar")
        .forEach((avatar) => {
            avatar.replaceWith(renderProfileAvatar());
        });
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

export function renderProfileAvatar(profile = currentProfile): HTMLElement {
    const avatar = createElement("div", { class: "message-avatar" });
    if (/^asset_[0-9a-f-]+$/i.test(profile.avatar.value)) {
        const img = createElement("img", {
            class: "profile-avatar-img",
            src: `/asset/${profile.avatar.value}`,
            alt: "",
            loading: "lazy",
        }) as HTMLImageElement;
        img.addEventListener("error", () => {
            avatar.textContent = DEFAULT_USER_AVATAR;
        });
        avatar.appendChild(img);
        return avatar;
    }
    avatar.textContent = DEFAULT_USER_AVATAR;
    return avatar;
}

export function renderUserMessage(content: string): HTMLElement {
    const msg = createElement("div", { class: "message message--user" });
    const avatar = renderProfileAvatar();
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
    generate_music_cover: "🎵",
    generate_lyrics: "📝",
    analyze_image: "🔎",
    web_search: "🔍",
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

let lightboxReturnFocus: HTMLElement | null = null;

function focusableIn(root: HTMLElement): HTMLElement[] {
    return Array.from(
        root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
    ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
}

function trapFocus(root: HTMLElement, e: KeyboardEvent): void {
    if (e.key !== "Tab" || root.hidden) return;
    const focusable = focusableIn(root);
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

export function openLightbox(src: string): void {
    const lightbox = $("#lightbox");
    const img = $("#lightbox-img") as HTMLImageElement;
    lightboxReturnFocus = document.activeElement as HTMLElement | null;
    img.src = src;
    lightbox.hidden = false;
    lightbox.querySelector<HTMLElement>(".lightbox-close")?.focus();
}

export function closeLightbox(): void {
    const lightbox = $("#lightbox");
    lightbox.hidden = true;
    const img = $("#lightbox-img") as HTMLImageElement;
    img.src = "";
    lightboxReturnFocus?.focus();
    lightboxReturnFocus = null;
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
    params: Record<string, unknown>;
    url: string;
    download_url: string;
}

const ASSET_PROMPT_PREVIEW_CHARS = 30;

function formatAssetDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getModelName(params: Record<string, unknown>): string {
    const model = params["model"];
    if (typeof model === "string" && model) {
        // Strip MiniMax prefix if present
        return model.replace(/^MiniMax\//i, "");
    }
    return "";
}

function renderAssetParams(params: Record<string, unknown>): string {
    const parts: string[] = [];

    const aspectRatio = params["aspect_ratio"];
    if (typeof aspectRatio === "string" && aspectRatio) {
        parts.push(aspectRatio);
    }

    const speed = params["speed"];
    if (typeof speed === "string" && speed) {
        parts.push(`${speed}x`);
    } else if (typeof speed === "number" && speed !== 1) {
        parts.push(`${speed}x`);
    }

    const lyrics = params["lyrics"];
    if (typeof lyrics === "string" && lyrics) {
        parts.push(lyrics.slice(0, 20) + (lyrics.length > 20 ? "…" : ""));
    }

    const voiceId = params["voice_id"];
    if (typeof voiceId === "string" && voiceId) {
        parts.push(voiceId.slice(0, 8) + "…");
    }

    return parts.join(" · ");
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
    const card = document.createElement("div");
    card.className = "asset-card";
    card.dataset.type = asset.type;
    card.dataset.id = asset.id;

    const badge = document.createElement("div");
    badge.className = "asset-badge";
    badge.textContent = assetTypeLabel(asset.type);
    card.appendChild(badge);

    card.appendChild(renderAssetPreview(asset, asset.url));

    const modelName = getModelName(asset.params);

    // Tool/model/date header
    const header = document.createElement("div");
    header.className = "asset-header";
    const toolSpan = document.createElement("span");
    toolSpan.className = "asset-tool";
    toolSpan.textContent = asset.tool_name.replace(/_/g, " ");
    header.appendChild(toolSpan);
    if (modelName) {
        const modelSpan = document.createElement("span");
        modelSpan.className = "asset-model";
        modelSpan.textContent = modelName;
        header.appendChild(modelSpan);
    }
    const dateSpan = document.createElement("span");
    dateSpan.className = "asset-date";
    dateSpan.textContent = formatAssetDate(asset.created_at);
    header.appendChild(dateSpan);
    card.appendChild(header);

    // Prompt (collapsible if long)
    const prompt = asset.prompt?.trim();
    if (prompt && prompt.length > ASSET_PROMPT_PREVIEW_CHARS) {
        const details = document.createElement("details");
        details.className = "asset-prompt-details";
        const summary = document.createElement("summary");
        summary.className = "asset-prompt-summary";
        summary.textContent = prompt.slice(0, ASSET_PROMPT_PREVIEW_CHARS) + "…";
        const fullPrompt = document.createElement("div");
        fullPrompt.className = "asset-prompt-full";
        fullPrompt.textContent = prompt;
        details.appendChild(summary);
        details.appendChild(fullPrompt);
        card.appendChild(details);
    } else if (prompt) {
        const meta = document.createElement("div");
        meta.className = "asset-meta";
        meta.textContent = prompt;
        card.appendChild(meta);
    }

    // Params
    const paramsStr = renderAssetParams(asset.params);
    if (paramsStr) {
        const paramsEl = document.createElement("div");
        paramsEl.className = "asset-params";
        paramsEl.textContent = paramsStr;
        card.appendChild(paramsEl);
    }

    const download = document.createElement("a");
    download.className = "asset-download";
    download.href = asset.download_url;
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

export function showError(message: string, duration = 4000): void {
    const safeMessage = safeErrorMessage(message);
    const toast = $("#error-toast");
    const msgEl = $("#error-toast-message");
    msgEl.textContent = safeMessage;
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
let renderedStreamTextLength = 0;
let rawTextBuffer = ""; // raw text for markdown re-rendering
let thinkingBuffer = ""; // accumulated thinking text from thinking events
let lyricsWriteResolve: ((value: string) => void) | null = null; // set when "Write lyrics" is active
let capturedLyricsText: string | null = null; // lyrics result from generate_lyrics tool
let streamHadError = false;
let streamHadToolResult = false;
let clearDraftAfterDone: "chat" | "create" | null = null;
let refreshSessionsAfterDone: (() => void) | null = null;

// ── SSE Stream Processing ────────────────────────────────────────────

async function streamSseRequest(
    path: string,
    body: unknown,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    const resp = await fetch(path, {
        method: "POST",
        headers: createApiHeaders(),
        body: JSON.stringify(body),
    });

    if (resp.status === 400) {
        const parsed = await resp.json().catch(() => null);
        streamHadError = true;
        showError(parsed?.error ?? "Session expired — please reload the page 🔄");
        finishStreaming();
        return;
    }

    if (!resp.ok) {
        const parsed = await resp.json().catch(() => null);
        const msg = parsed?.error ?? `Something went wrong (${resp.status}). Try again! 🤷`;
        streamHadError = true;
        showError(msg);
        finishStreaming();
        return;
    }

    if (!resp.body) {
        streamHadError = true;
        showError("No response from server 😴");
        finishStreaming();
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

    if (isStreaming) finishStreaming();
}

export async function streamChat(
    messages: Array<{ role: string; content: string }>,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    await streamSseRequest("/api/chat", { messages }, onEvent);
}

async function streamCreateTool(
    toolName: CreateToolName,
    input: Record<string, unknown>,
    onEvent?: (event: SSEEvent) => void,
): Promise<void> {
    await streamSseRequest("/api/create-tool", { tool_name: toolName, input }, onEvent);
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

    if (eventType === "assistant_turn_start") {
        if (currentAssistantContent && currentAssistantContent.childNodes.length > 0) {
            currentAssistantEl = null;
            currentAssistantContent = null;
            activeToolCards.clear();
            rawTextBuffer = "";
            renderedStreamTextLength = 0;
            thinkingBuffer = "";
        }
        return;
    }

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
        streamHadError = true;
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
            // Capture lyrics text for "Write lyrics for me" button flow
            if (
                parsed.name === "generate_lyrics" &&
                parsed.result.type === "text" &&
                lyricsWriteResolve
            ) {
                capturedLyricsText = parsed.result.content;
            }
            const loadingCard = activeToolCards.get(parsed.id);
            const resultCard = renderToolResult(parsed.name, parsed.result);
            const shouldFollowToolResize = isMessageListNearBottom();
            if (loadingCard?.isConnected) {
                // Replace loading card with result
                loadingCard.replaceWith(resultCard);
            } else {
                // Fallback: render orphan result instead of silently dropping it.
                ensureAssistantContent().appendChild(resultCard);
            }
            activeToolCards.delete(parsed.id);
            keepToolResultInView(resultCard, shouldFollowToolResize);
            if (parsed.result.type === "error") streamHadError = true;
            // Refresh quota badge and assets tab after tool execution
            streamHadToolResult = true;
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

function renderedTextNodes(root: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const collectTextNodes = (node: Node): void => {
        if (node.nodeType === 3) {
            if (node.textContent?.trim()) textNodes.push(node as Text);
            return;
        }
        node.childNodes.forEach(collectTextNodes);
    };
    collectTextNodes(root);
    return textNodes;
}

function renderedTextLength(textNodes: Text[]): number {
    return textNodes.reduce((total, node) => total + (node.textContent?.length ?? 0), 0);
}

function animateRenderedTextTail(textNodes: Text[], charCount: number): void {
    if (charCount <= 0) return;

    let remaining = charCount;
    for (let i = textNodes.length - 1; i >= 0 && remaining > 0; i--) {
        const node = textNodes[i]!;
        const text = node.textContent ?? "";
        const take = Math.min(remaining, text.length);
        const start = text.length - take;
        const before = text.slice(0, start);
        const animated = text.slice(start);
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        const span = createElement("span", { class: "stream-chunk" });
        span.textContent = animated;
        fragment.appendChild(span);
        node.parentNode?.replaceChild(fragment, node);
        remaining -= take;
    }
}

function appendText(text: string): void {
    if (!currentAssistantContent) return;

    rawTextBuffer += text;
    const textRegion = getOrCreateContentRegion("assistant-text-region", "end");
    if (!textRegion) return;

    textRegion.classList.add("is-streaming");
    textRegion.innerHTML = renderMarkdown(rawTextBuffer);
    const textNodes = renderedTextNodes(textRegion);
    const visibleTextLength = renderedTextLength(textNodes);
    animateRenderedTextTail(textNodes, visibleTextLength - renderedStreamTextLength);
    renderedStreamTextLength = visibleTextLength;
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

function isMessageListNearBottom(threshold = 80): boolean {
    const list = $("#message-list");
    return list.scrollHeight - list.clientHeight - list.scrollTop <= threshold;
}

function keepToolResultInView(card: HTMLElement, shouldFollow: boolean): void {
    if (!shouldFollow) return;
    scrollToBottom();
    card.querySelectorAll<HTMLImageElement>("img.tool-result-image").forEach((img) => {
        img.addEventListener("load", scrollToBottom, { once: true });
        img.addEventListener("error", scrollToBottom, { once: true });
    });
    card.querySelectorAll<HTMLAudioElement>("audio.tool-result-audio").forEach((audio) => {
        audio.addEventListener("loadedmetadata", scrollToBottom, { once: true });
        audio.addEventListener("loadeddata", scrollToBottom, { once: true });
    });
}

function unwrapStreamChunks(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>(".stream-chunk").forEach((el) => {
        el.replaceWith(document.createTextNode(el.textContent ?? ""));
    });
}

function finishStreaming(): void {
    // If "Write lyrics for me" was active, populate the textarea and skip chat display
    if (lyricsWriteResolve && capturedLyricsText !== null) {
        lyricsWriteResolve(capturedLyricsText);
    }
    capturedLyricsText = null;
    currentAssistantContent
        ?.querySelectorAll<HTMLElement>(".assistant-text-region.is-streaming")
        .forEach((el) => {
            el.innerHTML = renderMarkdown(rawTextBuffer);
            el.classList.remove("is-streaming");
        });
    document.querySelectorAll<HTMLElement>(".assistant-text-region.is-streaming").forEach((el) => {
        unwrapStreamChunks(el);
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
    renderedStreamTextLength = 0;
    thinkingBuffer = "";
    const shouldClearDraft =
        clearDraftAfterDone === "chat" || (clearDraftAfterDone === "create" && streamHadToolResult);
    if (clearDraftAfterDone && shouldClearDraft && !streamHadError)
        void clearDraft(clearDraftAfterDone);
    if (!streamHadError) refreshSessionsAfterDone?.();
    if (streamHadToolResult) void updateQuotaBadge();
    clearDraftAfterDone = null;
    streamHadError = false;
    streamHadToolResult = false;
    setStreamingUI(false);
}

// Exported so init() can set/unset lyricsWriteResolve
function setLyricsWriteResolve(fn: ((value: string) => void) | null): void {
    lyricsWriteResolve = fn;
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
        typingIndicator.classList.add("is-visible");
        typingIndicator.setAttribute("aria-hidden", "false");
        steerHint.hidden = true;
    } else {
        input.disabled = false;
        input.placeholder = "Type a message...";
        sendBtn.disabled = true; // Will be enabled by input handler
        typingIndicator.classList.remove("is-visible");
        typingIndicator.setAttribute("aria-hidden", "true");
        steerHint.hidden = true;
        input.focus();
    }
}

// ── Send Message ─────────────────────────────────────────────────────

export async function sendMessage(
    content: string,
    draftKind: "chat" | "create" = "chat",
): Promise<void> {
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
    clearDraftAfterDone = draftKind;

    // Start streaming
    isStreaming = true;
    setStreamingUI(true);

    try {
        await streamChat([{ role: "user", content }]);
    } catch (err) {
        streamHadError = true;
        showError("Connection lost. Check your internet? 📡");
        finishStreaming();
    }
}

export async function sendCreateTool(
    toolName: CreateToolName,
    input: Record<string, unknown>,
    visibleLabel: string,
    clearDraftOnSuccess = true,
): Promise<void> {
    if (isStreaming) return;

    const messageList = $("#message-list");
    messageList.appendChild(renderUserMessage(visibleLabel));
    scrollToBottom();

    const { container: assistantEl, contentEl: assistantContent } = renderAssistantMessage();
    messageList.appendChild(assistantEl);
    currentAssistantEl = assistantEl;
    currentAssistantContent = assistantContent;

    clearDraftAfterDone = clearDraftOnSuccess ? "create" : null;
    isStreaming = true;
    setStreamingUI(true);

    try {
        await streamCreateTool(toolName, input);
    } catch {
        streamHadError = true;
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

function debounce(fn: () => void, ms: number): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

const IMAGE_SIZE_PRESETS: Record<string, number> = {
    small: 1024,
    medium: 1536,
    large: 2048,
};

function multipleOf8(value: number): number {
    return Math.max(512, Math.min(2048, Math.round(value / 8) * 8));
}

export function imageDimensionsForPreset(
    aspectRatio: string,
    preset: string,
): { width: number; height: number } | null {
    const longEdge = IMAGE_SIZE_PRESETS[preset];
    if (!longEdge) return null;
    const match = aspectRatio.match(/^(\d+):(\d+)$/);
    if (!match) throw new Error(`Bad aspect ratio: ${aspectRatio}`);
    const ratioWidth = Number(match[1]);
    const ratioHeight = Number(match[2]);
    if (ratioWidth >= ratioHeight) {
        return { width: longEdge, height: multipleOf8((longEdge * ratioHeight) / ratioWidth) };
    }
    return { width: multipleOf8((longEdge * ratioWidth) / ratioHeight), height: longEdge };
}

export function imageSurpriseCode(random = Math.random): string {
    return String(Math.floor(random() * 2_147_483_647) + 1);
}

function sizePresetFromDimensions(width: string, height: string): string {
    const longEdge = Math.max(Number(width), Number(height));
    const match = Object.entries(IMAGE_SIZE_PRESETS).find(([, value]) => value === longEdge);
    return match?.[0] ?? "";
}

function clearChatUi(): void {
    const list = $("#message-list");
    list.innerHTML = `
        <div class="message message--assistant message--welcome">
            <div class="message-avatar" aria-hidden="true">🧞</div>
            <div class="message-bubble"><div class="message-content">Hey! 👋 I'm HallucyGenie. Ask me anything — I can chat, make images 🔥, do voices 🎙️, and create music 🎵</div></div>
        </div>`;
}

function defaultCreateDraft(): CreateDraft {
    return {
        selectedTab: "image",
        image: {
            prompt: "",
            aspect_ratio: "16:9",
            n: "",
            seed: "",
            width: "",
            height: "",
            prompt_optimizer: false,
        },
        music: {
            prompt: "",
            lyrics: "",
            cover_source_kind: "direct",
            cover_audio_url: "",
            cover_style: "",
            cover_feature_id: "",
            cover_lyrics: "",
        },
        voice: {
            text: "",
            speed: "1.0",
            voice_id: "English_expressive_narrator",
            volume: "",
            pitch: "",
        },
        analyze: { image_url: "", prompt: "What do you see?" },
        search: { query: "" },
    };
}

function createDraftFromDom(): CreateDraft {
    return {
        selectedTab: ($("#create-modal") as HTMLElement).dataset.tabOpen || "image",
        image: {
            prompt: ($("#img-prompt") as HTMLTextAreaElement).value,
            aspect_ratio: ($("#img-ratio") as HTMLSelectElement).value,
            n: ($("#img-count") as HTMLSelectElement).value,
            seed: ($("#img-seed") as HTMLInputElement).value,
            width: ($("#img-width") as HTMLInputElement).value,
            height: ($("#img-height") as HTMLInputElement).value,
            prompt_optimizer: ($("#img-prompt-optimizer") as HTMLInputElement).checked,
        },
        music: {
            prompt: ($("#music-prompt") as HTMLTextAreaElement).value,
            lyrics: ($("#music-lyrics") as HTMLTextAreaElement).value,
            cover_source_kind: ($("#cover-source-kind") as HTMLSelectElement).value,
            cover_audio_url: ($("#cover-audio-url") as HTMLInputElement).value,
            cover_style: ($("#cover-style") as HTMLTextAreaElement).value,
            cover_feature_id: ($("#cover-feature-id") as HTMLInputElement).value,
            cover_lyrics: ($("#cover-lyrics") as HTMLTextAreaElement).value,
        },
        voice: {
            text: ($("#voice-text") as HTMLTextAreaElement).value,
            speed: ($("#voice-speed") as HTMLSelectElement).value,
            voice_id:
                (document.querySelector("#voice-id") as HTMLSelectElement | null)?.value ??
                "English_expressive_narrator",
            volume:
                (document.querySelector("#voice-volume") as HTMLInputElement | null)?.value ?? "",
            pitch: (document.querySelector("#voice-pitch") as HTMLInputElement | null)?.value ?? "",
        },
        analyze: {
            image_url: ($("#analyze-url") as HTMLInputElement).value,
            prompt: ($("#analyze-prompt") as HTMLTextAreaElement).value,
        },
        search: { query: ($("#search-query") as HTMLTextAreaElement).value },
    };
}

function applyCreateDraft(draft: CreateDraft): void {
    ($("#img-prompt") as HTMLTextAreaElement).value = draft.image.prompt;
    ($("#img-ratio") as HTMLSelectElement).value = draft.image.aspect_ratio;
    ($("#img-count") as HTMLSelectElement).value = draft.image.n ?? "";
    ($("#img-seed") as HTMLInputElement).value = draft.image.seed ?? "";
    ($("#img-width") as HTMLInputElement).value = draft.image.width ?? "";
    ($("#img-height") as HTMLInputElement).value = draft.image.height ?? "";
    const imageSize = document.querySelector("#img-size") as HTMLSelectElement | null;
    if (imageSize)
        imageSize.value = sizePresetFromDimensions(draft.image.width, draft.image.height);
    const imageSeedStatus = document.querySelector("#img-seed-status") as HTMLElement | null;
    if (imageSeedStatus) {
        imageSeedStatus.textContent = draft.image.seed
            ? `Surprise code: ${draft.image.seed}`
            : "Optional: same code can make a similar picture again.";
    }
    ($("#img-prompt-optimizer") as HTMLInputElement).checked = Boolean(
        draft.image.prompt_optimizer,
    );
    ($("#music-prompt") as HTMLTextAreaElement).value = draft.music.prompt;
    ($("#music-lyrics") as HTMLTextAreaElement).value = draft.music.lyrics;
    ($("#cover-source-kind") as HTMLSelectElement).value =
        draft.music.cover_source_kind ?? "direct";
    ($("#cover-audio-url") as HTMLInputElement).value = draft.music.cover_audio_url ?? "";
    ($("#cover-style") as HTMLTextAreaElement).value = draft.music.cover_style ?? "";
    ($("#cover-feature-id") as HTMLInputElement).value = draft.music.cover_feature_id ?? "";
    ($("#cover-lyrics") as HTMLTextAreaElement).value = draft.music.cover_lyrics ?? "";
    ($("#voice-text") as HTMLTextAreaElement).value = draft.voice.text;
    ($("#voice-speed") as HTMLSelectElement).value = draft.voice.speed;
    const voiceId = document.querySelector("#voice-id") as HTMLSelectElement | null;
    const voiceVolume = document.querySelector("#voice-volume") as HTMLInputElement | null;
    const voicePitch = document.querySelector("#voice-pitch") as HTMLInputElement | null;
    if (voiceId) voiceId.value = draft.voice.voice_id ?? "English_expressive_narrator";
    if (voiceVolume) voiceVolume.value = draft.voice.volume || "1";
    if (voicePitch) voicePitch.value = draft.voice.pitch || "0";
    ($("#analyze-url") as HTMLInputElement).value = draft.analyze?.image_url ?? "";
    ($("#analyze-prompt") as HTMLTextAreaElement).value =
        draft.analyze?.prompt ?? "What do you see?";
    ($("#search-query") as HTMLTextAreaElement).value = draft.search.query;
}

function isCreateDraft(value: unknown): value is CreateDraft {
    return Boolean(
        value && typeof value === "object" && "image" in value && "selectedTab" in value,
    );
}

// ── Quota Badge ──────────────────────────────────────────────────

interface QuotaData {
    chat: { used: number; total: number } | null;
    speech: { used: number; total: number } | null;
    image: { used: number; total: number } | null;
    music: { used: number; total: number } | null;
    lyrics: { used: number; total: number } | null;
}

const QUOTA_LABELS: Record<keyof QuotaData, string> = {
    chat: "Chat",
    speech: "Voice",
    image: "Images",
    music: "Music",
    lyrics: "Lyrics",
};

export async function updateQuotaBadge(): Promise<void> {
    const badge = $("#quota-badge") as HTMLElement | null;
    if (!badge) return;
    const labels: string[] = [];
    try {
        const resp = await fetch("/api/quota");
        if (!resp.ok) {
            badge.setAttribute("aria-label", "Quota unavailable");
            return;
        }
        const data: QuotaData = await resp.json();
        const items = badge.querySelectorAll<HTMLSpanElement>(".quota-item[data-type]");
        for (const item of items) {
            const type = item.dataset.type as keyof QuotaData;
            const q = data[type];
            const label = item.title || QUOTA_LABELS[type] || type;
            if (!q || q.total === 0) {
                item.querySelector(".quota-used")!.textContent = "—";
                item.className = "quota-item";
                labels.push(`${label} quota unavailable`);
                continue;
            }
            const remaining = q.total - q.used;
            const pct = q.used / q.total;
            const state = pct >= 0.95 ? "critical" : pct >= 0.8 ? "warning" : "ok";
            item.querySelector(".quota-used")!.textContent = `${remaining}`;
            item.className =
                pct >= 0.95 ? "quota-item critical" : pct >= 0.8 ? "quota-item warn" : "quota-item";
            labels.push(`${label}: ${remaining} of ${q.total} remaining, ${state}`);
        }
        badge.setAttribute("aria-label", labels.join(". "));
    } catch {
        badge.setAttribute("aria-label", "Quota unavailable");
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
    const connectionStatus = $("#connection-status") as HTMLElement;
    const sessionSelect = document.querySelector<HTMLSelectElement>("#session-select");
    const sessionNew = document.querySelector<HTMLButtonElement>("#session-new");

    async function refreshSessions(): Promise<void> {
        const data = await fetchSessions();
        if (!sessionSelect) return;
        sessionSelect.innerHTML = "";
        for (const session of data.sessions) {
            const option = document.createElement("option");
            option.value = session.id;
            option.textContent = session.name;
            option.selected = session.id === data.activeSessionId;
            sessionSelect.appendChild(option);
        }
    }

    async function reloadActiveSessionUi(): Promise<void> {
        clearChatUi();
        await loadHistory();
        await restoreDrafts();
        loadAssets();
        await loadCurrentRecent();
    }

    async function switchSession(id: string): Promise<void> {
        if (isStreaming && !confirm("A response is still running. Switch chats anyway?")) return;
        await activateSession(id);
        await refreshSessions();
        await reloadActiveSessionUi();
    }

    refreshSessionsAfterDone = () => void refreshSessions().catch(() => undefined);

    sessionSelect?.addEventListener("change", () => {
        void switchSession(sessionSelect.value).catch(() => showError("Failed to switch chat 😕"));
    });
    sessionNew?.addEventListener("click", () => {
        if (isStreaming && !confirm("A response is still running. Start a new chat anyway?"))
            return;
        void createNewSession()
            .then(refreshSessions)
            .then(reloadActiveSessionUi)
            .catch(() => showError("Failed to create chat 😕"));
    });

    connectionStatus.setAttribute(
        "aria-label",
        `Connection status: ${connectionStatus.title || "Connected"}`,
    );

    const profileBtn = $("#profile-btn") as HTMLButtonElement;
    const profileModal = $("#profile-modal");
    const profileClose = $("#profile-close") as HTMLButtonElement;
    const profileBackdrop = profileModal.querySelector(".profile-backdrop") as HTMLElement;
    const profileForm = $("#profile-form") as HTMLFormElement;
    const profileReset = $("#profile-reset") as HTMLButtonElement;
    const profileUsername = $("#profile-username") as HTMLInputElement;
    const profileInterests = $("#profile-interests") as HTMLTextAreaElement;
    const profileHates = $("#profile-hates") as HTMLTextAreaElement;
    const profileFavorites = $("#profile-favorites") as HTMLTextAreaElement;
    const profileAvatarAsset = $("#profile-avatar-asset") as HTMLInputElement;
    const profileAvatarUpload = $("#profile-avatar-upload") as HTMLInputElement;
    const profileAvatarPreview = $("#profile-avatar-preview") as HTMLButtonElement;
    const profileAvatarImg = $("#profile-avatar-img") as HTMLImageElement;
    const profileAvatarFallback = $("#profile-avatar-fallback") as HTMLElement;
    const profileAvatarStatus = $("#profile-avatar-status") as HTMLElement;
    const profileGenerate = $("#profile-generate") as HTMLButtonElement;
    let profileModalReturnFocus: HTMLElement | null = null;

    function setProfileAvatarPending(pending: boolean): void {
        profileAvatarPreview.classList.toggle("is-pending", pending);
        profileAvatarPreview.setAttribute("aria-busy", pending ? "true" : "false");
        profileAvatarPreview.setAttribute(
            "aria-label",
            pending ? "Generating avatar. Please wait." : "Current avatar. Click to upload image",
        );
        profileAvatarStatus.textContent = pending ? "Generating avatar." : "Avatar ready.";
    }

    function updateProfileAvatarPreview(profile: UserProfile): void {
        if (profile.avatar.value) {
            profileAvatarImg.src = `/asset/${profile.avatar.value}`;
            profileAvatarImg.hidden = false;
            profileAvatarFallback.hidden = true;
            return;
        }
        profileAvatarImg.hidden = true;
        profileAvatarImg.removeAttribute("src");
        profileAvatarFallback.hidden = false;
        profileAvatarFallback.textContent = DEFAULT_USER_AVATAR;
    }

    function profileFromCurrentForm(): UserProfile {
        return normalizedProfileFromForm({
            username: profileUsername.value,
            interests: profileInterests.value,
            hates: profileHates.value,
            favorites: profileFavorites.value,
            avatarAsset: profileAvatarAsset.value,
        });
    }

    function fillProfileForm(profile: UserProfile): void {
        profileUsername.value = profile.username;
        profileInterests.value = profile.interests;
        profileHates.value = profile.hates;
        profileFavorites.value = profile.favorites;
        profileAvatarAsset.value = profile.avatar.value;
        updateProfileAvatarPreview(profile);
    }

    async function loadProfileIntoForm(): Promise<void> {
        const profile = await fetchProfile();
        setCurrentProfile(profile);
        fillProfileForm(profile);
    }

    function getProfileModalFocusable(): HTMLElement[] {
        return Array.from(
            profileModal.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
        ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
    }

    function openProfileModal(): void {
        profileModalReturnFocus = document.activeElement as HTMLElement | null;
        profileModal.hidden = false;
        profileClose.focus();
        void loadProfileIntoForm().catch(() => showError("Failed to load profile 😕"));
    }

    function closeProfileModal(): void {
        profileModal.hidden = true;
        profileModalReturnFocus?.focus();
        profileModalReturnFocus = null;
    }

    function trapProfileModalFocus(e: KeyboardEvent): void {
        if (e.key !== "Tab" || profileModal.hidden) return;
        const focusable = getProfileModalFocusable();
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

    profileBtn.addEventListener("click", openProfileModal);
    profileClose.addEventListener("click", closeProfileModal);
    profileBackdrop.addEventListener("click", closeProfileModal);
    profileModal.addEventListener("keydown", trapProfileModalFocus);
    profileAvatarPreview.addEventListener("click", () => profileAvatarUpload.click());
    profileAvatarUpload.addEventListener("change", () => {
        const file = profileAvatarUpload.files?.[0];
        if (!file) return;
        let profile: UserProfile;
        try {
            profile = profileFromCurrentForm();
        } catch (err) {
            showError(err instanceof Error ? err.message : "Invalid profile");
            return;
        }
        profileAvatarUpload.disabled = true;
        setProfileAvatarPending(true);
        void uploadProfileAvatar(file, profile)
            .then((saved) => {
                setCurrentProfile(saved);
                fillProfileForm(saved);
            })
            .catch(() => showError("Failed to upload avatar 😕"))
            .finally(() => {
                profileAvatarUpload.disabled = false;
                profileAvatarUpload.value = "";
                setProfileAvatarPending(false);
            });
    });
    profileGenerate.addEventListener("click", () => {
        let profile: UserProfile;
        try {
            profile = profileFromCurrentForm();
        } catch (err) {
            showError(err instanceof Error ? err.message : "Invalid profile");
            return;
        }
        profileGenerate.disabled = true;
        profileGenerate.textContent = "Generating... ✨";
        setProfileAvatarPending(true);
        void generateProfileAvatar(profile)
            .then((saved) => {
                setCurrentProfile(saved);
                fillProfileForm(saved);
            })
            .catch(() => showError("Failed to generate avatar 😕"))
            .finally(() => {
                profileGenerate.disabled = false;
                profileGenerate.textContent = "Generate avatar 🎨";
                setProfileAvatarPending(false);
            });
    });
    profileForm.addEventListener("submit", (e) => {
        e.preventDefault();
        let profile: UserProfile;
        try {
            profile = profileFromCurrentForm();
        } catch (err) {
            showError(err instanceof Error ? err.message : "Invalid profile");
            return;
        }
        void putProfile(profile)
            .then((saved) => {
                setCurrentProfile(saved);
                fillProfileForm(saved);
                closeProfileModal();
            })
            .catch(() => showError("Failed to save profile 😕"));
    });
    profileReset.addEventListener("click", () => {
        void deleteProfile()
            .then((profile) => {
                setCurrentProfile(profile);
                fillProfileForm(profile);
                closeProfileModal();
            })
            .catch(() => showError("Failed to reset profile 😕"));
    });

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
    lightbox.addEventListener("keydown", (e) => trapFocus(lightbox, e));
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeLightbox();
            if (!profileModal.hidden) closeProfileModal();
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

    function getOnboardingFocusable(): HTMLElement[] {
        return focusableIn(onboarding);
    }

    function focusCurrentOnboardingButton(): void {
        slides[currentSlide]?.querySelector<HTMLElement>("button")?.focus();
    }

    function trapOnboardingFocus(e: KeyboardEvent): void {
        trapFocus(onboarding, e);
    }

    function dismissOnboarding(): void {
        onboarding.hidden = true;
        localStorage.setItem(ONBOARDING_KEY, "1");
        input.focus();
    }

    onboarding.addEventListener("keydown", trapOnboardingFocus);

    // Show onboarding on first visit
    if (!localStorage.getItem(ONBOARDING_KEY)) {
        onboarding.hidden = false;
        showSlide(0);
        requestAnimationFrame(focusCurrentOnboardingButton);
    }

    // Next buttons (slides 0 and 1 → next slide)
    onboarding.querySelectorAll<HTMLButtonElement>(".onboarding-next").forEach((btn) => {
        btn.addEventListener("click", () => {
            showSlide(currentSlide + 1);
            focusCurrentOnboardingButton();
        });
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

    // ── Load profile, then history so user bubbles use saved avatar ──
    void fetchProfile()
        .then(setCurrentProfile)
        .catch(() => undefined)
        .finally(() => void loadHistory());

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
        void putDraft("create", createDraftFromDom());
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
    function setCreateTab(tabName: string): void {
        tabs.forEach((t) => {
            const selected = t.dataset.tab === tabName;
            t.classList.toggle("active", selected);
            t.setAttribute("aria-selected", String(selected));
            t.tabIndex = selected ? 0 : -1;
        });
        panels.forEach((p) => {
            p.hidden = p.dataset.panel !== tabName;
        });
        createModal.dataset.tabOpen = tabName;
        if (tabName === "assets") loadAssets();
        void loadCurrentRecent();
    }

    function moveCreateTab(from: HTMLButtonElement, delta: number): void {
        const index = Array.from(tabs).indexOf(from);
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        next?.focus();
        setCreateTab(next?.dataset.tab ?? "image");
        void putDraft("create", createDraftFromDom());
    }

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            setCreateTab(tab.dataset.tab ?? "image");
            void putDraft("create", createDraftFromDom());
        });
        tab.addEventListener("keydown", (event) => {
            if (event.key === "ArrowRight") {
                event.preventDefault();
                moveCreateTab(tab, 1);
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveCreateTab(tab, -1);
                return;
            }
            if (event.key === "Home") {
                event.preventDefault();
                tabs[0]?.focus();
                setCreateTab(tabs[0]?.dataset.tab ?? "image");
                void putDraft("create", createDraftFromDom());
                return;
            }
            if (event.key === "End") {
                event.preventDefault();
                tabs[tabs.length - 1]?.focus();
                setCreateTab(tabs[tabs.length - 1]?.dataset.tab ?? "image");
                void putDraft("create", createDraftFromDom());
            }
        });
    });

    // Form submissions — send as prompt to chat
    const createImgForm = $("#create-image-form") as HTMLFormElement;
    const createMusicForm = $("#create-music-form") as HTMLFormElement;
    const createVoiceForm = $("#create-voice-form") as HTMLFormElement;
    const createAnalyzeForm = $("#create-analyze-form") as HTMLFormElement;
    const createSearchForm = $("#create-search-form") as HTMLFormElement;
    const imgPromptInput = $("#img-prompt") as HTMLTextAreaElement;
    const imgRatioInput = $("#img-ratio") as HTMLSelectElement;
    const imgCountInput = $("#img-count") as HTMLSelectElement;
    const imgSizeInput = $("#img-size") as HTMLSelectElement;
    const imgSeedInput = $("#img-seed") as HTMLInputElement;
    const imgSeedRandom = $("#img-seed-random") as HTMLButtonElement;
    const imgSeedStatus = $("#img-seed-status") as HTMLElement;
    const imgWidthInput = $("#img-width") as HTMLInputElement;
    const imgHeightInput = $("#img-height") as HTMLInputElement;
    const imgPromptOptimizerInput = $("#img-prompt-optimizer") as HTMLInputElement;
    const musicPromptInput = $("#music-prompt") as HTMLTextAreaElement;
    const musicLyricsInput = $("#music-lyrics") as HTMLTextAreaElement;
    const coverSourceKind = $("#cover-source-kind") as HTMLSelectElement;
    const coverAudioUrl = $("#cover-audio-url") as HTMLInputElement;
    const coverAudioFile = $("#cover-audio-file") as HTMLInputElement;
    const coverStyle = $("#cover-style") as HTMLTextAreaElement;
    const coverPreprocess = $("#cover-preprocess") as HTMLButtonElement;
    const coverFeatureId = $("#cover-feature-id") as HTMLInputElement;
    const coverStatus = $("#cover-status") as HTMLElement;
    const coverLyrics = $("#cover-lyrics") as HTMLTextAreaElement;
    const coverGenerate = $("#cover-generate") as HTMLButtonElement;
    const voiceTextInput = $("#voice-text") as HTMLTextAreaElement;
    const voiceSpeedInput = $("#voice-speed") as HTMLSelectElement;
    const voiceIdInput = document.querySelector<HTMLSelectElement>("#voice-id");
    const voiceVolumeInput = document.querySelector<HTMLInputElement>("#voice-volume");
    const voicePitchInput = document.querySelector<HTMLInputElement>("#voice-pitch");
    const analyzeFileInput = document.querySelector<HTMLInputElement>("#analyze-file");
    const analyzeDropzone = document.querySelector<HTMLButtonElement>("#analyze-dropzone");
    const analyzeFileStatus = document.querySelector<HTMLElement>("#analyze-file-status");
    const analyzeFilePreview = document.querySelector<HTMLElement>("#analyze-file-preview");
    const analyzeUrlInput = $("#analyze-url") as HTMLInputElement;
    const analyzePromptInput = $("#analyze-prompt") as HTMLTextAreaElement;
    const searchQueryInput = $("#search-query") as HTMLTextAreaElement;
    let analyzeAssetUrl = "";
    const persistCreateDraft = debounce(() => void putDraft("create", createDraftFromDom()), 200);
    const persistChatDraft = debounce(() => void putDraft("chat", { text: input.value }), 200);

    void fetch("/api/music-cover/status")
        .then((resp) => resp.json())
        .then((data: { youtubeEnabled?: boolean }) => {
            const youtube = coverSourceKind.querySelector(
                'option[value="youtube"]',
            ) as HTMLOptionElement | null;
            if (youtube && !data.youtubeEnabled) {
                youtube.disabled = true;
                youtube.textContent = "YouTube link (extractor off)";
            }
        })
        .catch(() => undefined);

    function fillFormFromHistory(item: CreateHistoryItem): void {
        const inputData = item.input;
        if (item.kind === "image") {
            imgPromptInput.value = String(inputData.prompt ?? "");
            imgRatioInput.value = String(inputData.aspect_ratio ?? "16:9");
            imgCountInput.value = String(inputData.n ?? "");
            imgSeedInput.value = String(inputData.seed ?? "");
            imgWidthInput.value = String(inputData.width ?? "");
            imgHeightInput.value = String(inputData.height ?? "");
            imgSizeInput.value = sizePresetFromDimensions(
                imgWidthInput.value,
                imgHeightInput.value,
            );
            imgSeedStatus.textContent = imgSeedInput.value
                ? `Surprise code: ${imgSeedInput.value}`
                : "Optional: same code can make a similar picture again.";
            imgPromptOptimizerInput.checked = inputData.prompt_optimizer === true;
            setCreateTab("image");
        } else if (item.kind === "music") {
            musicPromptInput.value = String(inputData.prompt ?? "");
            musicLyricsInput.value = String(inputData.lyrics ?? "");
            setCreateTab("music");
        } else if (item.kind === "voice") {
            voiceTextInput.value = String(inputData.text ?? "");
            voiceSpeedInput.value = String(inputData.speed ?? "1.0");
            if (voiceIdInput)
                voiceIdInput.value = String(inputData.voice_id ?? "English_expressive_narrator");
            if (voiceVolumeInput) voiceVolumeInput.value = String(inputData.volume ?? "");
            if (voicePitchInput) voicePitchInput.value = String(inputData.pitch ?? "");
            setCreateTab("voice");
        } else if (item.kind === "analyze") {
            analyzeUrlInput.value = String(inputData.image_url ?? "");
            analyzePromptInput.value = String(inputData.prompt ?? "What do you see?");
            setCreateTab("analyze");
        } else if (item.kind === "search") {
            searchQueryInput.value = String(inputData.query ?? inputData.prompt ?? "");
            setCreateTab("search");
        }
        void putDraft("create", createDraftFromDom());
    }

    async function loadRecent(kind: string): Promise<void> {
        const container = createModal.querySelector<HTMLElement>(
            `.create-recent[data-kind="${kind}"]`,
        );
        if (!container) return;
        const items = await fetchCreateHistory(kind);
        container.innerHTML = "";
        if (items.length === 0) return;
        const label = document.createElement("span");
        label.className = "recent-label";
        label.textContent = "Recent ▾";
        container.appendChild(label);
        for (const item of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "recent-button";
            button.textContent = String(
                item.input.prompt ?? item.input.text ?? item.input.query ?? item.tool_name,
            ).slice(0, 24);
            button.addEventListener("click", () => fillFormFromHistory(item));
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "recent-remove";
            remove.setAttribute("aria-label", "Remove recent item");
            remove.textContent = "×";
            remove.addEventListener("click", () => {
                void deleteCreateHistoryItem(item.id).then(() => loadRecent(kind));
            });
            container.appendChild(button);
            container.appendChild(remove);
        }
    }

    async function loadCurrentRecent(): Promise<void> {
        const kind = createModal.dataset.tabOpen || "image";
        if (kind === "assets") return;
        await loadRecent(kind);
    }

    function rejectBadAnalyzeFile(file: File): string | null {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            return "Use a PNG, JPG, or WebP image.";
        }
        if (file.size > 20 * 1024 * 1024) return "Image is too big. Max is 20 MB.";
        return null;
    }

    async function selectAnalyzeFile(file: File): Promise<void> {
        if (!analyzeFileInput || !analyzeDropzone || !analyzeFileStatus || !analyzeFilePreview)
            return;
        const error = rejectBadAnalyzeFile(file);
        if (error) {
            showError(error);
            analyzeFileStatus.textContent = error;
            analyzeFileInput.value = "";
            return;
        }
        analyzeFileInput.disabled = true;
        analyzeDropzone.disabled = true;
        analyzeFileStatus.textContent = `Uploading ${file.name}...`;
        try {
            const uploaded = await uploadAnalyzeImage(file);
            analyzeAssetUrl = uploaded.assetUrl;
            analyzeFileStatus.textContent = `Selected ${file.name}`;
            analyzeFilePreview.innerHTML = "";
            const preview = document.createElement("img");
            preview.src = uploaded.assetUrl;
            preview.alt = `Selected image: ${file.name}`;
            analyzeFilePreview.appendChild(preview);
            analyzeFilePreview.hidden = false;
        } catch {
            analyzeAssetUrl = "";
            analyzeFilePreview.hidden = true;
            analyzeFilePreview.innerHTML = "";
            analyzeFileStatus.textContent = "Upload failed.";
            showError("Failed to upload image 😕");
        } finally {
            analyzeFileInput.disabled = false;
            analyzeDropzone.disabled = false;
            analyzeFileInput.value = "";
        }
    }

    function applyImageSizePreset(): void {
        const dimensions = imageDimensionsForPreset(imgRatioInput.value, imgSizeInput.value);
        imgWidthInput.value = dimensions ? String(dimensions.width) : "";
        imgHeightInput.value = dimensions ? String(dimensions.height) : "";
    }

    function rollImageSeed(): void {
        imgSeedInput.value = imageSurpriseCode();
        imgSeedStatus.textContent = `Surprise code: ${imgSeedInput.value}`;
        void putDraft("create", createDraftFromDom());
    }

    async function restoreDrafts(): Promise<void> {
        const chatDraft = await getDraft("chat");
        if (chatDraft && typeof chatDraft === "object" && "text" in chatDraft) {
            input.value = String((chatDraft as { text: unknown }).text ?? "");
        } else {
            input.value = "";
        }
        handleInputChange();
        const createDraft = await getDraft("create");
        if (isCreateDraft(createDraft)) {
            applyCreateDraft(createDraft);
            setCreateTab(createDraft.selectedTab || "image");
        } else {
            applyCreateDraft(defaultCreateDraft());
            setCreateTab("image");
        }
    }

    imgRatioInput.addEventListener("change", () => {
        applyImageSizePreset();
        persistCreateDraft();
    });
    imgSizeInput.addEventListener("change", () => {
        applyImageSizePreset();
        persistCreateDraft();
    });
    imgSeedRandom.addEventListener("click", rollImageSeed);

    [
        imgPromptInput,
        imgCountInput,
        imgSizeInput,
        imgSeedInput,
        imgWidthInput,
        imgHeightInput,
        imgPromptOptimizerInput,
        musicPromptInput,
        musicLyricsInput,
        voiceTextInput,
        voiceSpeedInput,
        voiceIdInput,
        voiceVolumeInput,
        voicePitchInput,
        analyzeUrlInput,
        analyzePromptInput,
        searchQueryInput,
    ]
        .filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            Boolean(el),
        )
        .forEach((el) => {
            el.addEventListener("input", persistCreateDraft);
            el.addEventListener("change", persistCreateDraft);
        });
    input.addEventListener("input", persistChatDraft);
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            void putDraft("chat", { text: input.value });
            void putDraft("create", createDraftFromDom());
        }
    });
    window.addEventListener("pagehide", () => {
        void putDraft("chat", { text: input.value });
        void putDraft("create", createDraftFromDom());
    });

    void refreshSessions().catch(() => undefined);
    void restoreDrafts().catch(() => undefined);

    if (analyzeDropzone && analyzeFileInput && analyzeFileStatus && analyzeFilePreview) {
        analyzeDropzone.addEventListener("click", () => analyzeFileInput.click());
        analyzeFileInput.addEventListener("change", () => {
            const file = analyzeFileInput.files?.[0];
            if (file) void selectAnalyzeFile(file);
        });
        analyzeDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            analyzeDropzone.classList.add("is-dragging");
        });
        analyzeDropzone.addEventListener("dragleave", () => {
            analyzeDropzone.classList.remove("is-dragging");
        });
        analyzeDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            analyzeDropzone.classList.remove("is-dragging");
            const file = e.dataTransfer?.files?.[0];
            if (file) void selectAnalyzeFile(file);
        });
        analyzeUrlInput.addEventListener("input", () => {
            if (!analyzeUrlInput.value.trim()) return;
            analyzeAssetUrl = "";
            analyzeFilePreview.hidden = true;
            analyzeFilePreview.innerHTML = "";
            analyzeFileStatus.textContent = "Using image URL fallback.";
        });
    }

    createImgForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = imgPromptInput.value.trim();
        const input: Record<string, unknown> = {
            prompt,
            aspect_ratio: imgRatioInput.value,
            prompt_optimizer: imgPromptOptimizerInput.checked,
        };
        if (imgCountInput.value.trim()) input.n = Number(imgCountInput.value.trim());
        if (imgSeedInput.value.trim()) input.seed = Number(imgSeedInput.value.trim());
        if (imgWidthInput.value.trim() && imgHeightInput.value.trim()) {
            input.width = Number(imgWidthInput.value.trim());
            input.height = Number(imgHeightInput.value.trim());
        }
        if (prompt) {
            closeCreateModal();
            void sendCreateTool("generate_image", input, `Create image: ${prompt}`);
        }
    });

    createMusicForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const prompt = musicPromptInput.value.trim();
        const lyrics = musicLyricsInput.value.trim();
        if (prompt) {
            closeCreateModal();
            void sendCreateTool("generate_music", { prompt, lyrics }, `Create music: ${prompt}`);
        }
    });

    // "Write lyrics for me" button — calls generate_lyrics and fills the textarea
    const writeLyricsBtn = document.querySelector<HTMLButtonElement>("#write-lyrics-btn");
    writeLyricsBtn?.addEventListener("click", () => {
        const prompt = musicPromptInput.value.trim();
        if (!prompt) {
            showError("Describe the music first so I can write matching lyrics! ✍️");
            musicPromptInput.focus();
            return;
        }
        writeLyricsBtn.disabled = true;
        writeLyricsBtn.textContent = "Writing... ✨";
        setLyricsWriteResolve((lyricsText: string) => {
            musicLyricsInput.value = lyricsText;
            void putDraft("create", createDraftFromDom());
        });
        sendCreateTool("generate_lyrics", { prompt }, `Write lyrics: ${prompt}`, false).finally(
            () => {
                writeLyricsBtn.disabled = false;
                writeLyricsBtn.textContent = "Write lyrics for me ✨";
                setLyricsWriteResolve(null);
            },
        );
    });

    coverPreprocess.addEventListener("click", async () => {
        const form = new FormData();
        form.set("source_kind", coverSourceKind.value);
        if (coverSourceKind.value === "upload") {
            const file = coverAudioFile.files?.[0];
            if (!file) {
                showError("Choose an audio file first 🎵");
                coverAudioFile.focus();
                return;
            }
            form.set("audio", file);
        } else {
            const url = coverAudioUrl.value.trim();
            if (!url) {
                showError("Paste an audio or YouTube URL first 🎵");
                coverAudioUrl.focus();
                return;
            }
            form.set("audio_url", url);
        }
        coverPreprocess.disabled = true;
        coverStatus.textContent = "Preparing cover...";
        try {
            const resp = await fetch("/api/music-cover/preprocess", { method: "POST", body: form });
            const data = (await resp.json()) as {
                cover_feature_id?: string;
                lyrics?: string;
                error?: string;
            };
            if (!resp.ok) throw new Error(data.error ?? "cover prepare failed");
            coverFeatureId.value = data.cover_feature_id ?? "";
            coverLyrics.value = data.lyrics ?? "";
            coverStatus.textContent = "Ready. Edit lyrics/style, then generate.";
            void putDraft("create", createDraftFromDom());
        } catch (err) {
            coverStatus.textContent = "Prepare failed.";
            showError(String(err instanceof Error ? err.message : err));
        } finally {
            coverPreprocess.disabled = false;
        }
    });

    coverGenerate.addEventListener("click", () => {
        const prompt = coverStyle.value.trim();
        const lyrics = coverLyrics.value.trim();
        const featureId = coverFeatureId.value.trim();
        if (!featureId) {
            showError("Prepare the cover source first 🎵");
            coverPreprocess.focus();
            return;
        }
        if (!prompt) {
            showError("Describe the new style first 🎵");
            coverStyle.focus();
            return;
        }
        if (!lyrics) {
            showError("Cover lyrics are required 🎵");
            coverLyrics.focus();
            return;
        }
        closeCreateModal();
        void sendCreateTool(
            "generate_music_cover",
            { prompt, lyrics, cover_feature_id: featureId },
            `Create cover: ${prompt}`,
        );
    });

    createVoiceForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = voiceTextInput.value.trim();
        const input: Record<string, unknown> = {
            text,
            speed: Number(voiceSpeedInput.value),
        };
        if (voiceIdInput?.value.trim()) input.voice_id = voiceIdInput.value.trim();
        if (voiceVolumeInput?.value.trim()) input.volume = Number(voiceVolumeInput.value.trim());
        if (voicePitchInput?.value.trim()) input.pitch = Number(voicePitchInput.value.trim());
        if (text) {
            closeCreateModal();
            void sendCreateTool("text_to_speech", input, `Create voice: ${text}`);
        }
    });

    createAnalyzeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const imageUrl = analyzeAssetUrl || analyzeUrlInput.value.trim();
        const prompt = analyzePromptInput.value.trim() || "What do you see?";
        if (!imageUrl) {
            showError("Choose an image file or paste an image URL first 🔎");
            analyzeDropzone?.focus();
            return;
        }
        closeCreateModal();
        void sendCreateTool(
            "analyze_image",
            { image_url: imageUrl, prompt },
            `Analyze image: ${prompt}`,
        );
    });

    createSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const query = searchQueryInput.value.trim();
        if (query) {
            closeCreateModal();
            void sendCreateTool("web_search", { query }, `Search web: ${query}`);
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
