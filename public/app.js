function getOrCreateSessionId() {
  const KEY = "hallucygenie_session_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
function createApiHeaders(sessionId) {
  return {
    "Content-Type": "application/json",
    "X-Session-Id": sessionId
  };
}
async function fetchHistory(sessionId) {
  const resp = await fetch("/api/history", {
    headers: createApiHeaders(sessionId)
  });
  if (!resp.ok) {
    throw new Error(`Failed to load history: ${resp.status}`);
  }
  const data = await resp.json();
  return data.messages ?? [];
}
async function sendSteer(sessionId, message) {
  const resp = await fetch("/api/steer", {
    method: "POST",
    headers: createApiHeaders(sessionId),
    body: JSON.stringify({ message })
  });
  if (!resp.ok) {
    throw new Error(`Steer failed: ${resp.status}`);
  }
}
function parseSSELine(line) {
  if (line.startsWith("event:")) {
    return { field: "event", value: line.slice(6).trim() };
  }
  if (line.startsWith("data:")) {
    return { field: "data", value: line.slice(5).trim() };
  }
  return null;
}
function* parseSSEChunk(chunk) {
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
function $(selector) {
  return document.querySelector(selector);
}
function createElement(tag, attrs, children) {
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
function renderUserMessage(content) {
  const msg = createElement("div", { class: "message message--user" });
  const avatar = createElement("div", { class: "message-avatar" }, ["\u{1F464}"]);
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" }, [content]);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return msg;
}
function renderAssistantMessage() {
  const msg = createElement("div", { class: "message message--assistant" });
  const avatar = createElement("div", { class: "message-avatar" }, ["\u{1F9DE}"]);
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" }, [""]);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return { container: msg, contentEl };
}
function renderSteerMessage(content) {
  const msg = createElement("div", { class: "message message--steer message--user" });
  const avatar = createElement("div", { class: "message-avatar" }, ["\u{1F4A1}"]);
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" }, [content]);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return msg;
}
const TOOL_EMOJIS = {
  generate_image: "\u{1F3A8}",
  text_to_speech: "\u{1F399}\uFE0F",
  generate_music: "\u{1F3B5}"
};
function getToolEmoji(name) {
  return TOOL_EMOJIS[name] ?? "\u{1F527}";
}
function renderToolCardLoading(name) {
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
function renderToolResult(toolName, result) {
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
    img.addEventListener("click", () => openLightbox(result.content));
    body.appendChild(img);
  } else if (result.type === "audio") {
    const audio = createElement("audio", {
      class: "tool-result-audio",
      controls: "",
      src: result.content
    });
    body.appendChild(audio);
  } else if (result.type === "error") {
    body.textContent = `\u{1F615} ${result.content}`;
    card.style.borderColor = "var(--color-error)";
  }
  return card;
}
function openLightbox(src) {
  const lightbox = $("#lightbox");
  const img = $("#lightbox-img");
  img.src = src;
  lightbox.hidden = false;
}
function closeLightbox() {
  const lightbox = $("#lightbox");
  lightbox.hidden = true;
  const img = $("#lightbox-img");
  img.src = "";
}
let toastTimeout = null;
function showError(message, duration = 4e3) {
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
let isStreaming = false;
let currentAssistantEl = null;
let currentAssistantContent = null;
let activeToolCards = /* @__PURE__ */ new Map();
async function streamChat(sessionId, messages, onEvent) {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: createApiHeaders(sessionId),
    body: JSON.stringify({ messages })
  });
  if (resp.status === 400) {
    const parsed = await resp.json().catch(() => null);
    showError(parsed?.error ?? "Session expired \u2014 please reload the page \u{1F504}");
    return;
  }
  if (!resp.ok) {
    const parsed = await resp.json().catch(() => null);
    const msg = parsed?.error ?? `Something went wrong (${resp.status}). Try again! \u{1F937}`;
    showError(msg);
    return;
  }
  if (!resp.body) {
    showError("No response from server \u{1F634}");
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const events = [...parseSSEChunk(part + "\n\n")];
      for (const event of events) {
        onEvent?.(event);
        handleSSEEvent(event);
      }
    }
  }
  if (buffer.trim()) {
    const events = [...parseSSEChunk(buffer)];
    for (const event of events) {
      onEvent?.(event);
      handleSSEEvent(event);
    }
  }
}
function handleSSEEvent(event) {
  const { event: eventType, data } = event;
  if (data === "[DONE]") {
    finishStreaming();
    return;
  }
  if (eventType === "error") {
    try {
      const parsed = JSON.parse(data);
      showError(parsed.error ?? "Something went wrong \u{1F615}");
    } catch {
      showError("Something went wrong \u{1F615}");
    }
    finishStreaming();
    return;
  }
  if (eventType === "tool_start") {
    try {
      const parsed = JSON.parse(data);
      const card = renderToolCardLoading(parsed.name);
      if (currentAssistantContent) {
        currentAssistantContent.appendChild(card);
      }
      activeToolCards.set(parsed.id, card);
      scrollToBottom();
    } catch {
    }
    return;
  }
  if (eventType === "tool_result") {
    try {
      const parsed = JSON.parse(data);
      const loadingCard = activeToolCards.get(parsed.id);
      if (loadingCard && currentAssistantContent) {
        const resultCard = renderToolResult(parsed.name, parsed.result);
        loadingCard.replaceWith(resultCard);
        activeToolCards.delete(parsed.id);
      }
      scrollToBottom();
    } catch {
    }
    return;
  }
  if (eventType === "message") {
    try {
      const parsed = JSON.parse(data);
      if (parsed.choices?.[0]?.delta?.content) {
        appendText(parsed.choices[0].delta.content);
      } else if (parsed.delta) {
        appendText(parsed.delta);
      }
    } catch {
    }
  }
}
function appendText(text) {
  if (!currentAssistantContent) return;
  currentAssistantContent.textContent += text;
  scrollToBottom();
}
function scrollToBottom() {
  const list = $("#message-list");
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}
function finishStreaming() {
  isStreaming = false;
  currentAssistantEl = null;
  currentAssistantContent = null;
  activeToolCards.clear();
  setStreamingUI(false);
}
function setStreamingUI(streaming) {
  const input = $("#chat-input");
  const sendBtn = $("#send-button");
  const typingIndicator = $("#typing-indicator");
  const steerHint = $("#steer-hint");
  if (streaming) {
    input.disabled = false;
    input.placeholder = "\u{1F4A1} Type to steer the response...";
    sendBtn.disabled = true;
    typingIndicator.hidden = false;
    steerHint.hidden = false;
  } else {
    input.disabled = false;
    input.placeholder = "Type a message...";
    sendBtn.disabled = true;
    typingIndicator.hidden = true;
    steerHint.hidden = true;
    input.focus();
  }
}
async function sendMessage(content) {
  if (!content.trim()) return;
  if (isStreaming) {
    await sendSteerMessage(content);
    return;
  }
  const sessionId = getOrCreateSessionId();
  const messageList = $("#message-list");
  const userMsg = renderUserMessage(content);
  messageList.appendChild(userMsg);
  scrollToBottom();
  const { container: assistantEl, contentEl: assistantContent } = renderAssistantMessage();
  messageList.appendChild(assistantEl);
  currentAssistantEl = assistantEl;
  currentAssistantContent = assistantContent;
  const input = $("#chat-input");
  input.value = "";
  autoResizeInput();
  isStreaming = true;
  setStreamingUI(true);
  try {
    await streamChat(sessionId, [{ role: "user", content }]);
  } catch (err) {
    showError("Connection lost. Check your internet? \u{1F4E1}");
    finishStreaming();
  }
}
async function sendSteerMessage(content) {
  if (!content.trim() || !isStreaming) return;
  const sessionId = getOrCreateSessionId();
  const messageList = $("#message-list");
  const steerMsg = renderSteerMessage(content);
  messageList.appendChild(steerMsg);
  scrollToBottom();
  const input = $("#chat-input");
  input.value = "";
  autoResizeInput();
  try {
    await sendSteer(sessionId, content);
  } catch {
    showError("Couldn't steer \u2014 try again \u{1F4AB}");
  }
}
async function loadHistory() {
  const sessionId = getOrCreateSessionId();
  const messageList = $("#message-list");
  try {
    const messages = await fetchHistory(sessionId);
    if (messages.length > 0) {
      const welcome = messageList.querySelector(".message--welcome");
      if (welcome) welcome.remove();
    }
    for (const msg of messages) {
      if (msg.role === "user") {
        messageList.appendChild(renderUserMessage(msg.content));
      } else if (msg.role === "assistant") {
        const { container } = renderAssistantMessage();
        const contentEl = container.querySelector(".message-content");
        contentEl.textContent = msg.content;
        messageList.appendChild(container);
      }
    }
    scrollToBottom();
  } catch {
  }
}
function autoResizeInput() {
  const input = $("#chat-input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
}
function handleInputChange() {
  const input = $("#chat-input");
  const sendBtn = $("#send-button");
  sendBtn.disabled = !input.value.trim();
  autoResizeInput();
}
function init() {
  const form = $("#chat-form");
  const input = $("#chat-input");
  const sendBtn = $("#send-button");
  const lightbox = $("#lightbox");
  const lightboxClose = lightbox.querySelector(".lightbox-close");
  const lightboxBackdrop = lightbox.querySelector(".lightbox-backdrop");
  const steerClose = $("#steer-close");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim()) {
      sendMessage(input.value);
    }
  });
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) {
        sendMessage(input.value);
      }
    }
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightboxBackdrop.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
  steerClose.addEventListener("click", () => {
    $("#steer-hint").hidden = true;
  });
  loadHistory();
  input.focus();
}
if (typeof document !== "undefined" && document.readyState !== "loading") {
  init();
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
export {
  $,
  autoResizeInput,
  closeLightbox,
  createApiHeaders,
  createElement,
  fetchHistory,
  getOrCreateSessionId,
  getToolEmoji,
  handleInputChange,
  init,
  loadHistory,
  openLightbox,
  parseSSEChunk,
  parseSSELine,
  renderAssistantMessage,
  renderSteerMessage,
  renderToolCardLoading,
  renderToolResult,
  renderUserMessage,
  sendMessage,
  sendSteer,
  sendSteerMessage,
  showError,
  streamChat
};
