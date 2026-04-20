const { createResponse } = require("./openai");

function formatAlternateContact(alternateContact) {
  const parts = [];

  if (alternateContact.name) {
    parts.push(alternateContact.name);
  }
  if (alternateContact.email) {
    parts.push(alternateContact.email);
  }
  if (alternateContact.phone) {
    parts.push(alternateContact.phone);
  }

  return parts.join(" | ");
}

function parseSenderName(fromLine = "") {
  return fromLine.split("<")[0].trim() || "Client";
}

function parseFirstName(fromLine = "") {
  return parseSenderName(fromLine).split(" ")[0] || "there";
}

function extractTopic(message) {
  const body = `${message.subject}\n${message.body}`.toLowerCase();
  if (/drainage|water|rain|flood|leak/.test(body)) {
    return "site drainage concern";
  }
  if (/walkthrough|punch|trim|touch-up|correction/.test(body)) {
    return "walkthrough and finish-item update";
  }
  if (/cabinet|finish|selection|stain|design/.test(body)) {
    return "selection confirmation";
  }
  if (/schedule|friday|tomorrow|today|inspection/.test(body)) {
    return "schedule coordination";
  }
  return "project update";
}

function buildMockReply(config, message, options = {}) {
  const contactLine = formatAlternateContact(config.alternateContact);
  const firstName = parseFirstName(message.from);
  const topic = extractTopic(message);
  const flags = inferFlags(message);
  const quick = options.mode === "quick";

  let middle;
  if (flags.sensitive) {
    middle =
      "I want to make sure this gets the right attention, so I am keeping this brief until I can review it more carefully.";
  } else if (flags.urgent) {
    middle =
      "I saw your note and wanted to acknowledge it quickly. I am away from my desk on site today, but I will make sure this gets reviewed and routed appropriately.";
  } else if (topic === "walkthrough and finish-item update") {
    middle =
      "I appreciate you flagging the walkthrough timing and the finish items. I am in the field right now, but I will review the current status before I respond with anything more specific.";
  } else if (topic === "selection confirmation") {
    middle =
      "Thanks for checking before sending anything final. I am tied up in the field at the moment, and I would rather confirm details carefully than guess from my phone.";
  } else {
    middle =
      "Thanks for reaching out. I am in the field right now, so I wanted to send a quick note back while I am between site stops.";
  }

  const supportLine = contactLine
    ? `If something needs faster coordination before I am back at my desk, you can also reach ${contactLine}.`
    : "I appreciate your patience while I am working in the field.";

  const body = quick
    ? [
        `Hi ${firstName},`,
        "",
        middle,
        supportLine,
        "",
        "Best,",
        config.gmail.email || "Taylor Hopkins",
      ].join("\n")
    : [
        `Hi ${firstName},`,
        "",
        `Thanks for reaching out about this. ${middle}`,
        "",
        config.fieldStatusMessage,
        "",
        supportLine,
        "",
        "Best,",
        config.gmail.email || "Taylor Hopkins",
      ].join("\n");

  return {
    subject: `Re: ${message.subject}`,
    body,
    source: "mock",
    mode: options.mode || "standard",
    flags,
  };
}

function buildFallbackReply(config, message, options = {}) {
  const contactLine = formatAlternateContact(config.alternateContact);
  const firstName = parseFirstName(message.from);
  const urgency = /drainage|leak|urgent|asap|today|delay/i.test(message.body)
    ? "I will review this as soon as I am back from the field, and if the situation needs faster coordination I will make sure it gets routed appropriately."
    : "I will review the details and follow up once I am back at my desk and able to look at it closely.";
  const quickReplyLine = options.mode === "quick"
    ? "I wanted to acknowledge this right away while I am out on site."
    : "";

  const body = [
    `Hi ${firstName},`,
    "",
    quickReplyLine,
    quickReplyLine ? "" : null,
    `Thanks for reaching out about "${message.subject}". ${config.fieldStatusMessage}`,
    "",
    urgency,
    contactLine
      ? `If you need someone in the meantime, you can also reach ${contactLine}.`
      : "I appreciate your patience while I am away from my desk.",
    "",
    "Best,",
    config.gmail.email || "Your Name",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Re: ${message.subject}`,
    body,
    source: "fallback",
    flags: inferFlags(message),
  };
}

function inferFlags(message) {
  const text = `${message.subject}\n${message.body}`.toLowerCase();
  return {
    urgent: /urgent|asap|today|immediately|leak|drainage/.test(text),
    sensitive: /legal|attorney|invoice dispute|refund|angry|threat/.test(text),
    needsHumanReview: /legal|attorney|invoice dispute|refund|angry|threat/.test(text),
  };
}

function buildInstructions(config, message, options = {}) {
  const alternateContact = formatAlternateContact(config.alternateContact);
  const quickModeInstruction =
    options.mode === "quick"
      ? "- This is quick reply mode, so keep it tighter, faster, and easier to review from a phone\n- Aim for 60-110 words unless the email clearly needs a little more context"
      : "- Aim for a complete but concise reply that still feels personal";
  const signatureName = config.senderName || config.gmail.email || "Taylor Hopkins";

  return `
You draft email replies for ${config.companyName}.

Write as the mailbox owner in a way that feels personal and human, not like a canned autoresponder.

Voice requirements:
- ${config.voiceStyleNotes}
- Acknowledge the sender's specific request in the first 1-2 sentences
- Sound like a real person handling construction, inspections, scheduling, and client coordination
- Vary sentence structure so repeated replies do not sound identical

Operational context:
- ${config.fieldStatusMessage}
- Do not claim a timeline, approval, or commitment unless it was already stated by the sender
- Do not invent project status, inspection results, trade completion, scheduling confirmations, approvals, or next steps that are not explicitly known
- If the sender is asking for a status update and you do not have verified facts, say you will review and follow up instead of guessing
- If the email appears urgent, acknowledge urgency without overpromising
- If the message is legal, hostile, or dispute-oriented, keep the reply brief and route to human follow-up
- If alternate contact details exist, use them only when helpful: ${alternateContact || "No alternate contact configured"}
- ${quickModeInstruction}

Output rules:
- Return plain text only
- Keep it under ${options.mode === "quick" ? "120" : "180"} words
- Include a greeting and sign-off
- Do not use placeholders
- Do not mention AI, automation, or that this was generated
- Sign as exactly:
${signatureName}
${config.companyName}

Sender email:
${message.from}

Subject:
${message.subject}

Email body:
${message.body}
  `.trim();
}

async function generateReply(config, message, options = {}) {
  if (!message || !message.subject || !message.body) {
    throw new Error("A message with subject and body is required");
  }

  const flags = inferFlags(message);
  if (options.forceMock || config.openai.mode === "mock") {
    return buildMockReply(config, message, options);
  }

  if (!config.openai.isConfigured) {
    return buildMockReply(config, message, options);
  }

  try {
    const body = await createResponse(config, {
      instructions: buildInstructions(config, message, options),
      input: "Draft the reply now.",
    });

    return {
      subject: `Re: ${message.subject}`,
      body: body.trim(),
      source: "openai",
      mode: options.mode || "standard",
      flags,
    };
  } catch (error) {
    if (/insufficient_quota|quota|429/i.test(error.message)) {
      return {
        ...buildMockReply(config, message, options),
        source: "mock",
        note: "OpenAI quota unavailable, using local demo reply.",
      };
    }

    throw error;
  }
}

module.exports = {
  generateReply,
};
