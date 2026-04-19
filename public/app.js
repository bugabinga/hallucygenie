"use strict";
(() => {
  // public/app.ts
  function renderMarkdown(text) {
    const codeStore = [];
    let html = text.replace(/```([\s\S]*?)```/g, (_m, content) => {
      const lines2 = content.split("\n");
      const lang = lines2[0]?.trim() || "";
      const code = lang ? lines2.slice(1).join("\n") : content;
      const idx = codeStore.length;
      codeStore.push(`<pre><code${lang ? ` class="lang-${lang}"` : ""}>${escapeHtml(code.trimEnd())}</code></pre>`);
      return `\0CODE${idx}\0`;
    });
    html = html.replace(/`([^`]+)`/g, (_m, code) => {
      const idx = codeStore.length;
      codeStore.push(`<code>${escapeHtml(code)}</code>`);
      return `\0CODE${idx}\0`;
    });
    html = escapeHtml(html);
    const lines = html.split("\n");
    const result = [];
    let inList = false;
    let listType = "";
    let inBlockquote = false;
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.includes("\0CODE")) {
        if (inList) {
          result.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
        }
        if (inBlockquote) {
          result.push("</blockquote>");
          inBlockquote = false;
        }
        if (inTable) {
          result.push("</tbody></table>");
          inTable = false;
        }
        result.push(line);
        continue;
      }
      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
        if (inList) {
          result.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
        }
        result.push("<hr>");
        continue;
      }
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (inList) {
          result.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
        }
        const level = headingMatch[1].length;
        result.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
        continue;
      }
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const nextLine = lines[i + 1]?.trim() ?? "";
        const isSep = /^\|[\s\-:]+\|/.test(nextLine);
        if (!inTable) {
          if (inList) {
            result.push(listType === "ul" ? "</ul>" : "</ol>");
            inList = false;
          }
          result.push("<table><thead>");
          inTable = true;
          const cells = parseTableRow(line);
          result.push("<tr>" + cells.map((c) => `<th>${inlineMarkdown(c)}</th>`).join("") + "</tr>");
          if (isSep) {
            result.push("</thead><tbody>");
            i++;
          } else {
            result.push("</thead><tbody>");
          }
          continue;
        } else {
          if (/^\|[\s\-:]+\|/.test(line.trim())) continue;
          const cells = parseTableRow(line);
          result.push("<tr>" + cells.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("") + "</tr>");
          continue;
        }
      } else if (inTable) {
        result.push("</tbody></table>");
        inTable = false;
      }
      const bqMatch = line.match(/^&gt;\s?(.*)$/);
      if (bqMatch) {
        if (inList) {
          result.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
        }
        if (!inBlockquote) {
          result.push("<blockquote>");
          inBlockquote = true;
        }
        result.push(`<p>${inlineMarkdown(bqMatch[1])}</p>`);
        continue;
      } else if (inBlockquote) {
        result.push("</blockquote>");
        inBlockquote = false;
      }
      const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ulMatch) {
        if (inList && listType !== "ul") {
          result.push("</ol>");
          inList = false;
        }
        if (!inList) {
          result.push("<ul>");
          inList = true;
          listType = "ul";
        }
        result.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
        continue;
      }
      const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
      if (olMatch) {
        if (inList && listType !== "ol") {
          result.push("</ul>");
          inList = false;
        }
        if (!inList) {
          result.push("<ol>");
          inList = true;
          listType = "ol";
        }
        result.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
        continue;
      }
      if (inList) {
        result.push(listType === "ul" ? "</ul>" : "</ol>");
        inList = false;
      }
      if (line.trim() === "") {
        result.push("");
        continue;
      }
      result.push(`<p>${inlineMarkdown(line)}</p>`);
    }
    if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
    if (inBlockquote) result.push("</blockquote>");
    if (inTable) result.push("</tbody></table>");
    html = result.join("\n");
    html = html.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => codeStore[parseInt(idx)]);
    html = html.replace(/<p>\s*<\/p>/g, "");
    return html;
  }
  function inlineMarkdown(text) {
    let html = text;
    html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
    html = html.replace(/\[ \]/g, '<input type="checkbox" disabled class="task-checkbox">');
    html = html.replace(/\[x\]/gi, '<input type="checkbox" checked disabled class="task-checkbox task-checked">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(
      /(?<!["'\(=\/>])(https?:\/\/[\w\-._~:/?#@!$&'()*+,;=%]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    return html;
  }
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function parseTableRow(row) {
    return row.trim().split("|").slice(1, -1).map((c) => c.trim());
  }
  function renderThinkingBlock(text) {
    const lines = text.trim().split("\n").length;
    const preview = text.trim().split("\n")[0]?.slice(0, 60) ?? "";
    return `<details class="thinking-block"><summary>\u{1F4AD} Thinking${lines > 1 ? ` (${lines} lines)` : ""}\u2026</summary><div class="thinking-content">${renderMarkdown(text)}</div></details>`;
  }
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
    const contentEl = createElement("div", { class: "message-content" });
    contentEl.innerHTML = renderMarkdown(content);
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
    const contentEl = createElement("div", { class: "message-content" });
    contentEl.innerHTML = renderMarkdown(content);
    bubble.appendChild(contentEl);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    return msg;
  }
  var TOOL_EMOJIS = {
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
  function loadAssets() {
    const grid = $("#assets-grid");
    const empty = $("#assets-empty");
    grid.innerHTML = "";
    empty.hidden = true;
    const sessionId = getOrCreateSessionId();
    fetch(`/assets`, { headers: { "X-Session-Id": sessionId } }).then((r) => r.json()).then(({ assets }) => {
      if (!assets.length) {
        empty.hidden = false;
        return;
      }
      for (const asset of assets.slice(0, 20)) {
        const card = document.createElement("div");
        card.className = "asset-card";
        card.dataset.type = asset.type;
        card.dataset.id = asset.id;
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
          icon.textContent = asset.type === "music" ? "\u{1F3B5}" : "\u{1F3A4}";
          card.appendChild(icon);
        }
        const meta = document.createElement("div");
        meta.className = "asset-meta";
        meta.textContent = asset.prompt ? asset.prompt.slice(0, 30) + (asset.prompt.length > 30 ? "\u2026" : "") : asset.tool_name;
        card.appendChild(meta);
        card.addEventListener("click", () => {
          if (asset.type === "image") {
            openLightbox(`/asset/${asset.id}`);
          } else {
            new Audio(`/asset/${asset.id}`).play().catch(() => showError("Could not play audio"));
          }
        });
        grid.appendChild(card);
      }
    }).catch(() => {
      empty.hidden = false;
      empty.textContent = "Failed to load assets \u{1F615}";
    });
  }
  var toastTimeout = null;
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
  var isStreaming = false;
  var currentAssistantEl = null;
  var currentAssistantContent = null;
  var activeToolCards = /* @__PURE__ */ new Map();
  var rawTextBuffer = "";
  var thinkingBuffer = "";
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
    if (eventType === "thinking") {
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          appendThinking(parsed.content);
        }
      } catch {
      }
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
    rawTextBuffer += text;
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
  function appendThinking(text) {
    if (!currentAssistantContent) return;
    thinkingBuffer += text;
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
    rawTextBuffer = "";
    thinkingBuffer = "";
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
          contentEl.innerHTML = renderMarkdown(msg.content);
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
  async function updateQuotaBadge() {
    const badge = $("#quota-badge");
    if (!badge) return;
    try {
      const resp = await fetch("/api/quota");
      if (!resp.ok) return;
      const data = await resp.json();
      const items = badge.querySelectorAll(".quota-item[data-type]");
      for (const item of items) {
        const type = item.dataset.type;
        const q = data[type];
        if (!q || q.total === 0) {
          item.querySelector(".quota-used").textContent = "\u2014";
          item.className = "quota-item";
          continue;
        }
        const pct = q.used / q.total;
        item.querySelector(".quota-used").textContent = `${q.total - q.used}`;
        item.className = pct >= 0.95 ? "quota-item critical" : pct >= 0.8 ? "quota-item warn" : "quota-item";
      }
    } catch {
    }
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
    updateQuotaBadge();
    setInterval(updateQuotaBadge, 6e4);
    const createBtn = $("#create-btn");
    const createModal = $("#create-modal");
    const createClose = $("#create-close");
    const createBackdrop = createModal.querySelector(".create-backdrop");
    createBtn.addEventListener("click", () => {
      createModal.hidden = false;
    });
    createClose.addEventListener("click", () => {
      createModal.hidden = true;
    });
    createBackdrop.addEventListener("click", () => {
      createModal.hidden = true;
    });
    const tabs = createModal.querySelectorAll(".create-tab");
    const panels = createModal.querySelectorAll(".create-panel");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        panels.forEach((p) => {
          p.hidden = true;
        });
        tab.classList.add("active");
        const panel = createModal.querySelector(`[data-panel="${tab.dataset.tab}"]`);
        if (panel) {
          panel.hidden = false;
          if (tab.dataset.tab === "assets") loadAssets();
        }
      });
    });
    const createImgForm = $("#create-image-form");
    const createMusicForm = $("#create-music-form");
    const createVoiceForm = $("#create-voice-form");
    const createSearchForm = $("#create-search-form");
    const imgPromptInput = $("#img-prompt");
    const imgRatioInput = $("#img-ratio");
    const musicPromptInput = $("#music-prompt");
    const musicLyricsInput = $("#music-lyrics");
    const musicInstrumentalInput = $("#music-instrumental");
    const voiceTextInput = $("#voice-text");
    const voiceSpeedInput = $("#voice-speed");
    const searchQueryInput = $("#search-query");
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
    input.focus();
  }
  if (typeof document !== "undefined" && document.readyState !== "loading") {
    init();
  } else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
