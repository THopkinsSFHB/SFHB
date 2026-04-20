const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

async function getAccessToken(config) {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.gmail.clientId,
      client_secret: config.gmail.clientSecret,
      refresh_token: config.gmail.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status})`);
  }

  const payload = await response.json();
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max((payload.expires_in || 3600) - 60, 60) * 1000,
  };
  return tokenCache.accessToken;
}

async function gmailRequest(config, pathname, options = {}) {
  const accessToken = await getAccessToken(config);
  const response = await fetch(`${GMAIL_API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail API request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function mapWithConcurrency(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function runWorker() {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );

  await Promise.all(workers);
  return results;
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function flattenHeaders(headers = []) {
  const result = {};
  for (const header of headers) {
    result[header.name.toLowerCase()] = header.value;
  }
  return result;
}

function extractPlainText(payload) {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

async function listInboxMessages(config) {
  const list = await gmailRequest(config, "/messages?q=is:unread&maxResults=25");
  const messages = list.messages || [];

  const hydrated = await mapWithConcurrency(
    messages,
    async (message) => {
      const detail = await gmailRequest(config, `/messages/${message.id}?format=full`);
      const headers = flattenHeaders(detail.payload.headers);

      return {
        id: detail.id,
        threadId: detail.threadId,
        from: headers.from || "Unknown sender",
        subject: headers.subject || "(No subject)",
        snippet: detail.snippet || "",
        body: extractPlainText(detail.payload) || detail.snippet || "",
        internalDate: detail.internalDate,
      };
    },
    3
  );

  return hydrated.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));
}

function buildReplyMessage(config, originalMessage, reply) {
  const lines = [
    `From: ${config.gmail.email}`,
    `To: ${originalMessage.from}`,
    `Subject: Re: ${originalMessage.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    `In-Reply-To: ${originalMessage.id}`,
    `References: ${originalMessage.id}`,
    "",
    reply.body.trim(),
  ];

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createDraftReply(config, originalMessage, reply) {
  const raw = buildReplyMessage(config, originalMessage, reply);

  const payload = await gmailRequest(config, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        threadId: originalMessage.threadId,
        raw,
      },
    }),
  });

  return {
    id: payload.id,
    messageId: payload.message ? payload.message.id : null,
    status: "draft_created",
  };
}

module.exports = {
  listInboxMessages,
  createDraftReply,
};
