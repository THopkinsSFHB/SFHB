const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig, publicConfig } = require("./lib/config");
const { listInboxMessages, createDraftReply } = require("./lib/gmail");
const { generateReply } = require("./lib/reply-engine");
const { sampleMessages } = require("./lib/sample-data");

const config = loadConfig(path.join(__dirname, ".env"));
const publicDir = path.join(__dirname, "public");

function getNetworkUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }

  return urls;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/status") {
    sendJson(res, 200, {
      ...publicConfig(config),
      networkUrls: getNetworkUrls(config.port),
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/messages") {
    try {
      const messages = config.gmail.isConfigured
        ? await listInboxMessages(config)
        : sampleMessages;
      sendJson(res, 200, { source: config.gmail.isConfigured ? "gmail" : "sample", messages });
    } catch (error) {
      sendJson(res, 500, {
        error: "Unable to load inbox messages",
        details: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/replies/generate") {
    try {
      const body = await readBody(req);
      const reply = await generateReply(config, body.message, body.options || {});
      sendJson(res, 200, reply);
    } catch (error) {
      sendJson(res, 500, {
        error: "Unable to generate reply",
        details: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/replies/draft") {
    try {
      if (!config.gmail.isConfigured) {
        sendJson(res, 400, {
          error: "Gmail is not configured yet",
        });
        return;
      }

      const body = await readBody(req);
      const draft = await createDraftReply(config, body.message, body.reply);
      sendJson(res, 200, draft);
    } catch (error) {
      sendJson(res, 500, {
        error: "Unable to create Gmail draft",
        details: error.message,
      });
    }
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;

  if (urlPath.startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  sendFile(res, filePath);
});

server.listen(config.port, config.host, () => {
  console.log(`Field Reply Assistant running at http://localhost:${config.port}`);
  for (const url of getNetworkUrls(config.port)) {
    console.log(`Phone access: ${url}`);
  }
});
