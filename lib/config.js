const fs = require("fs");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function loadConfig(envPath) {
  parseEnvFile(envPath);

  const config = {
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST || "0.0.0.0",
    companyName: process.env.COMPANY_NAME || "Your Company",
    senderName: process.env.SENDER_NAME || "",
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      mode: process.env.OPENAI_MODE || "live",
      isConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
    gmail: {
      email: process.env.GOOGLE_WORKSPACE_EMAIL || "",
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
      isConfigured: Boolean(
        process.env.GOOGLE_WORKSPACE_EMAIL &&
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN
      ),
    },
    automation: {
      autoSendEnabled: readBoolean(process.env.AUTO_SEND_ENABLED),
      oooModeEnabled: readBoolean(process.env.OOO_MODE_ENABLED, true),
    },
    fieldStatusMessage:
      process.env.FIELD_STATUS_MESSAGE ||
      "I am currently in the field and may have limited access to email.",
    voiceStyleNotes:
      process.env.VOICE_STYLE_NOTES ||
      "Professional, calm, warm, concise, and specific to the client's situation.",
    alternateContact: {
      name: process.env.ALT_CONTACT_NAME || "",
      email: process.env.ALT_CONTACT_EMAIL || "",
      phone: process.env.ALT_CONTACT_PHONE || "",
    },
  };

  return config;
}

function publicConfig(config) {
  return {
    port: config.port,
    host: config.host,
    companyName: config.companyName,
    senderName: config.senderName,
    openaiConfigured: config.openai.isConfigured,
    gmailConfigured: config.gmail.isConfigured,
    autoSendEnabled: config.automation.autoSendEnabled,
    oooModeEnabled: config.automation.oooModeEnabled,
    fieldStatusMessage: config.fieldStatusMessage,
    voiceStyleNotes: config.voiceStyleNotes,
    alternateContact: config.alternateContact,
    mailbox: config.gmail.email,
    model: config.openai.model,
    openaiMode: config.openai.mode,
  };
}

module.exports = {
  loadConfig,
  publicConfig,
};
