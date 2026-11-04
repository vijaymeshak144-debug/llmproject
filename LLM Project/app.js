const STORAGE_KEY = "ollama-chat-conversations-v1";
const LEGACY_STORAGE_KEY = "lumen-conversations-v1";
const $ = (selector) => document.querySelector(selector);
const elements = {
  chatForm: $("#chatForm"),
  closeSidebar: $("#closeSidebar"),
  connectionStatus: $("#connectionStatus"),
  conversation: $("#conversation"),
  historyEmpty: $("#historyEmpty"),
  historyList: $("#historyList"),
  messageInput: $("#messageInput"),
  messages: $("#messages"),
  modelPicker: $("#modelPicker"),
  newChat: $("#newChat"),
  openSidebar: $("#openSidebar"),
  sendButton: $("#sendButton"),
  shareChat: $("#shareChat"),
  sidebar: $("#sidebar"),
  statusLabel: $("#statusLabel"),
  toast: $("#toast"),
  welcome: $("#welcome"),
  mobileScrim: $("#mobileScrim"),
};

let conversations = loadConversations();
let activeConversationId = null;
let isSending = false;
let toastTimer;

function loadConversations() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = current ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved = JSON.parse(current || legacy || "[]");
    if (legacy && Array.isArray(saved)) localStorage.setItem(STORAGE_KEY, legacy);
    return Array.isArray(saved) ? saved.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)) : [];
  } catch (error) {
    console.error("Could not load saved conversations:", error);
    return [];
  }
}

function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    console.error("Could not save conversations:", error);
    showToast("Couldn't save this conversation in your browser.");
  }
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2300);
}

function setSidebarOpen(open) {
  elements.sidebar.classList.toggle("open", open);
  elements.mobileScrim.classList.toggle("visible", open);
}

function setOllamaStatus(config) {
  elements.connectionStatus.classList.remove("demo", "error");
  if (!config.connected) {
    elements.connectionStatus.classList.add("error");
    elements.statusLabel.textContent = "Ollama offline";
  } else if (config.installedModelCount === 0) {
    elements.connectionStatus.classList.add("demo");
    elements.statusLabel.textContent = "Model needed";
  } else {
    elements.statusLabel.textContent = "Ready";
  }
}

function setConnectionError() {
  elements.connectionStatus.classList.add("error");
  elements.statusLabel.textContent = "Unavailable";
}

async function initialize() {
  try {
    const response = await fetch("/api/models");
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const config = await response.json();
    const models = Array.isArray(config.models) ? config.models : [];
    elements.modelPicker.replaceChildren(...models.map((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      return option;
    }));
    setOllamaStatus(config);
  } catch (error) {
    console.error("Could not load model configuration:", error);
    elements.modelPicker.innerHTML = '<option value="">Unavailable</option>';
    setConnectionError();
  }
  renderHistory();
}

function getActiveConversation() {
  return conversations.find((chat) => chat.id === activeConversationId) || null;
}

function createConversation() {
  const chat = { id: newId(), title: "New conversation", messages: [], updatedAt: Date.now() };
  conversations.unshift(chat);
  activeConversationId = chat.id;
  saveConversations();
  renderHistory();
  renderConversation();
  elements.messageInput.focus();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = conversations.length > 0;
  for (const chat of conversations) {
    const button = document.createElement("button");
    button.className = `history-item${chat.id === activeConversationId ? " active" : ""}`;
    button.type = "button";
    button.title = chat.title;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M8 10h8M8 14h5m-8 6 1.5-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6l-4 3Z");
    icon.append(path);
    const title = document.createElement("span");
    title.textContent = chat.title;
    button.append(icon, title);
    button.addEventListener("click", () => {
      activeConversationId = chat.id;
      renderHistory();
      renderConversation();
      setSidebarOpen(false);
    });
    elements.historyList.append(button);
  }
}

function renderConversation() {
  const chat = getActiveConversation();
  const hasMessages = Boolean(chat?.messages.length);
  elements.welcome.hidden = hasMessages;
  elements.messages.replaceChildren();
  if (!chat) return;
  chat.messages.forEach((message, index) => {
    elements.messages.append(renderMessage(message, index));
  });
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatMessage(text) {
  const escaped = escapeHtml(text);
  const blocks = escaped.split(/```([\s\S]*?)```/g);
  return blocks.map((block, index) => {
    if (index % 2 === 1) return `<pre><code>${block.trim()}</code></pre>`;
    return block.split(/(`[^`\n]+`)/g).map((part) =>
      part.startsWith("`") && part.endsWith("`")
        ? `<code>${part.slice(1, -1)}</code>`
        : `<p>${part.replace(/\n/g, "<br>")}</p>`
    ).join("");
  }).join("");
}

function addBrandMark(container) {
  const mark = document.createElement("span");
  mark.className = "brand-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.innerHTML = "<span></span><span></span><span></span>";
  container.append(mark);
}

function renderMessage(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  if (message.role === "user") {
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content;
    article.append(content);
    return article;
  }

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  addBrandMark(avatar);
  const column = document.createElement("div");
  column.className = "message-column";
  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = formatMessage(message.content);
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>Copy';
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      showToast("Copied to clipboard");
    } catch (error) {
      console.error("Could not copy message:", error);
      showToast("Couldn't copy this message.");
    }
  });
  actions.append(copy);
  if (index === getActiveConversation()?.messages.length - 1) {
    const regenerate = document.createElement("button");
    regenerate.type = "button";
    regenerate.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg>Retry';
    regenerate.addEventListener("click", retryLastReply);
    actions.append(regenerate);
  }
  column.append(content, actions);
  article.append(avatar, column);
  return article;
}

function renderTyping() {
  const article = document.createElement("article");
  article.className = "message assistant";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  addBrandMark(avatar);
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "The local model is generating a reply. This may take a few minutes on this computer.");
  indicator.innerHTML = '<span></span><span></span><span></span><small class="thinking-label">Running locally — replies may take a few minutes</small>';
  article.append(avatar, indicator);
  elements.messages.append(article);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function makeChatPrompt(messages) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  return `Answer the latest user message clearly and directly. Use the conversation for context. If unsure, say so. /no_think\n\n${transcript}\n\nAssistant:`;
}

function titleFromMessage(message) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 34 ? `${clean.slice(0, 34).trimEnd()}…` : clean;
}

function setSending(sending) {
  isSending = sending;
  elements.sendButton.disabled = sending || !elements.messageInput.value.trim();
  elements.messageInput.disabled = sending;
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content || isSending) return;

  let chat = getActiveConversation();
  if (!chat) {
    chat = { id: newId(), title: titleFromMessage(content), messages: [], updatedAt: Date.now() };
    conversations.unshift(chat);
    activeConversationId = chat.id;
  }
  if (chat.messages.length === 0) chat.title = titleFromMessage(content);
  chat.messages.push({ role: "user", content });
  chat.updatedAt = Date.now();
  saveConversations();
  renderHistory();
  renderConversation();
  elements.messageInput.value = "";
  resizeInput();
  setSending(true);
  renderTyping();

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: elements.modelPicker.value, prompt: makeChatPrompt(chat.messages) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    chat.messages.push({ role: "assistant", content: result.response });
  } catch (error) {
    console.error("Ollama generation failed:", error);
    chat.messages.push({ role: "assistant", content: `I couldn't get a response just now. ${error.message}` });
    setConnectionError();
  } finally {
    chat.updatedAt = Date.now();
    saveConversations();
    setSending(false);
    renderHistory();
    renderConversation();
    elements.messageInput.focus();
  }
}

async function retryLastReply() {
  const chat = getActiveConversation();
  if (!chat || isSending || chat.messages.at(-1)?.role !== "assistant") return;
  chat.messages.pop();
  renderConversation();
  setSending(true);
  renderTyping();
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: elements.modelPicker.value, prompt: makeChatPrompt(chat.messages) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    chat.messages.push({ role: "assistant", content: result.response });
  } catch (error) {
    console.error("Retry failed:", error);
    chat.messages.push({ role: "assistant", content: `I couldn't get a response just now. ${error.message}` });
    setConnectionError();
  } finally {
    chat.updatedAt = Date.now();
    saveConversations();
    setSending(false);
    renderHistory();
    renderConversation();
  }
}

function resizeInput() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 180)}px`;
  elements.sendButton.disabled = isSending || !elements.messageInput.value.trim();
}

elements.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.messageInput.value);
});
elements.messageInput.addEventListener("input", resizeInput);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});
elements.newChat.addEventListener("click", () => {
  activeConversationId = null;
  renderHistory();
  renderConversation();
  setSidebarOpen(false);
  elements.messageInput.focus();
});
elements.openSidebar.addEventListener("click", () => setSidebarOpen(true));
elements.closeSidebar.addEventListener("click", () => setSidebarOpen(false));
elements.mobileScrim.addEventListener("click", () => setSidebarOpen(false));
elements.shareChat.addEventListener("click", async () => {
  const chat = getActiveConversation();
  if (!chat?.messages.length) {
    showToast("Start a conversation to copy it.");
    return;
  }
  const transcript = chat.messages.map((message) => `${message.role === "user" ? "You" : "Assistant"}: ${message.content}`).join("\n\n");
  try {
    await navigator.clipboard.writeText(transcript);
    showToast("Conversation copied");
  } catch (error) {
    console.error("Could not copy conversation:", error);
    showToast("Couldn't copy this conversation.");
  }
});
document.querySelectorAll(".suggestion-card").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt);
  });
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    activeConversationId = null;
    renderHistory();
    renderConversation();
    elements.messageInput.focus();
  }
  if (event.key === "Escape") setSidebarOpen(false);
});

initialize();
renderConversation();
