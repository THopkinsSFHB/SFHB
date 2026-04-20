const state = {
  config: null,
  messages: [],
  selectedMessage: null,
  generatedReply: null,
  mobileTab: "inbox",
};

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.details || payload.error || "Request failed");
  }
  return payload;
}

function renderStatus() {
  const node = document.getElementById("status-summary");
  if (!state.config) {
    node.textContent = "Loading configuration...";
    return;
  }

  const parts = [
    state.config.gmailConfigured ? "Gmail connected" : "Sample inbox mode",
    state.config.openaiMode === "mock"
      ? "Demo reply mode"
      : state.config.openaiConfigured
      ? `OpenAI ready (${state.config.model})`
      : "OpenAI not configured",
    state.config.autoSendEnabled ? "Auto-send enabled" : "Draft-only mode",
  ];

  node.textContent = parts.join(" | ");

  const phoneNode = document.getElementById("phone-url");
  if (state.config.networkUrls && state.config.networkUrls.length) {
    phoneNode.textContent = `On your phone, open: ${state.config.networkUrls[0]}`;
  } else {
    phoneNode.textContent = "";
  }
}

function renderMessages() {
  const container = document.getElementById("message-list");
  container.innerHTML = "";

  if (!state.messages.length) {
    container.innerHTML = '<p class="empty-state">No messages available.</p>';
    return;
  }

  for (const message of state.messages) {
    const button = document.createElement("button");
    button.className = "message-card";
    const flags = inferMessageFlags(message);
    if (state.selectedMessage && state.selectedMessage.id === message.id) {
      button.classList.add("selected");
    }

    button.innerHTML = `
      <span class="message-flags">${renderFlagMarkup(flags)}</span>
      <span class="message-from">${escapeHtml(message.from)}</span>
      <strong>${escapeHtml(message.subject)}</strong>
      <span class="message-snippet">${escapeHtml(message.snippet || "")}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedMessage = message;
      state.generatedReply = null;
      renderMessages();
      renderDetail();
    });
    container.appendChild(button);
  }
}

function renderMobileTab() {
  const inboxPanel = document.getElementById("inbox-panel");
  const detailPanel = document.getElementById("detail-panel");
  const inboxButton = document.getElementById("tab-inbox");
  const draftButton = document.getElementById("tab-draft");

  const viewingDraft = state.mobileTab === "draft";
  inboxPanel.classList.toggle("mobile-hidden", viewingDraft);
  detailPanel.classList.toggle("mobile-hidden", !viewingDraft);
  inboxButton.classList.toggle("active", !viewingDraft);
  draftButton.classList.toggle("active", viewingDraft);
}

function renderDetail() {
  const container = document.getElementById("message-detail");
  const message = state.selectedMessage;

  if (!message) {
    container.className = "empty-state";
    container.textContent = "Select a message to review and draft a reply.";
    return;
  }

  container.className = "";

  const flags = state.generatedReply
    ? renderFlagMarkup(state.generatedReply.flags)
    : "";

  container.innerHTML = `
    <div class="detail-header">
      <div>
          <p class="label">Incoming Email</p>
          <h2>${escapeHtml(message.subject)}</h2>
        <p class="meta">${escapeHtml(message.from)}</p>
      </div>
        <div class="actions">
          <button id="mode-button" class="button">${state.generatedReply?.mode === "quick" ? "Quick Reply" : "Standard Reply"}</button>
          <button id="generate-button" class="button button-primary">Generate Reply</button>
          <button id="smart-draft-button" class="button button-accent">Generate + Save</button>
          <button id="draft-button" class="button" ${state.generatedReply ? "" : "disabled"}>Create Gmail Draft</button>
        </div>
      </div>

    <article class="message-body">${escapeHtml(message.body)}</article>

    <section class="reply-panel">
      <div class="reply-header">
        <div>
          <p class="label">Draft Reply</p>
          ${flags}
        </div>
      </div>
      <textarea id="reply-body" placeholder="Generate a reply to begin.">${escapeHtml(
        state.generatedReply ? state.generatedReply.body : ""
      )}</textarea>
      <p id="reply-meta" class="meta">${
        state.generatedReply
          ? `${state.generatedReply.note ? `${escapeHtml(state.generatedReply.note)} ` : ""}Generated via ${escapeHtml(
              state.generatedReply.source
            )} in ${escapeHtml(state.generatedReply.mode || "standard")} mode`
          : "No draft generated yet."
      }</p>
    </section>
  `;

  document.getElementById("generate-button").addEventListener("click", handleGenerateReply);
  document.getElementById("smart-draft-button").addEventListener("click", handleGenerateAndDraft);
  document.getElementById("draft-button").addEventListener("click", handleCreateDraft);
  document.getElementById("mode-button").addEventListener("click", toggleReplyMode);
}

async function loadStatus() {
  state.config = await request("/api/status");
  renderStatus();
}

async function loadMessages() {
  const payload = await request("/api/messages");
  state.messages = payload.messages;
  state.selectedMessage = payload.messages[0] || null;
  state.generatedReply = null;
  renderMessages();
  renderDetail();
  renderMobileTab();
}

async function handleGenerateReply() {
  await generateReplyOnly();
}

async function generateReplyOnly() {
  const replyMeta = document.getElementById("reply-meta");
  replyMeta.textContent = "Generating...";

  try {
    state.generatedReply = await request("/api/replies/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: state.selectedMessage,
        options: {
          mode: state.generatedReply?.mode === "quick" ? "quick" : "standard",
          forceMock: state.config.openaiMode === "mock",
        },
      }),
    });
    state.mobileTab = "draft";
    renderDetail();
    renderMobileTab();
  } catch (error) {
    replyMeta.textContent = error.message;
  }
}

async function handleCreateDraft() {
  const replyBody = document.getElementById("reply-body").value;
  const replyMeta = document.getElementById("reply-meta");
  replyMeta.textContent = "Creating Gmail draft...";

  try {
    const payload = await request("/api/replies/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: state.selectedMessage,
        reply: {
          ...state.generatedReply,
          body: replyBody,
        },
      }),
    });
    replyMeta.textContent = `Draft created: ${payload.id}`;
  } catch (error) {
    replyMeta.textContent = error.message;
  }
}

async function handleGenerateAndDraft() {
  const replyMeta = document.getElementById("reply-meta");
  replyMeta.textContent = "Generating and saving draft...";

  try {
    await generateReplyOnly();
    await handleCreateDraft();
  } catch (error) {
    replyMeta.textContent = error.message;
  }
}

function toggleReplyMode() {
  const currentMode = state.generatedReply?.mode === "quick" ? "quick" : "standard";
  state.generatedReply = {
    ...(state.generatedReply || {}),
    mode: currentMode === "quick" ? "standard" : "quick",
  };
  renderDetail();
}

function inferMessageFlags(message) {
  const text = `${message.subject}\n${message.snippet || ""}\n${message.body || ""}`.toLowerCase();
  return {
    urgent: /urgent|asap|today|immediately|leak|drainage|delay|inspection/.test(text),
    sensitive: /legal|attorney|invoice dispute|refund|angry|threat/.test(text),
    needsHumanReview: /legal|attorney|invoice dispute|refund|angry|threat/.test(text),
  };
}

function renderFlagMarkup(flags = {}) {
  return [
    flags.urgent ? "Urgent" : null,
    flags.sensitive ? "Sensitive" : null,
    flags.needsHumanReview ? "Review" : null,
  ]
    .filter(Boolean)
    .map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.getElementById("refresh-button").addEventListener("click", async () => {
  await loadMessages();
});

document.getElementById("tab-inbox").addEventListener("click", () => {
  state.mobileTab = "inbox";
  renderMobileTab();
});

document.getElementById("tab-draft").addEventListener("click", () => {
  state.mobileTab = "draft";
  renderMobileTab();
});

Promise.all([loadStatus(), loadMessages()]).catch((error) => {
  document.getElementById("status-summary").textContent = error.message;
});
