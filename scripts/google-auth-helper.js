const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ENV_PATH = path.join(process.cwd(), ".env");
const REDIRECT_URI = "http://127.0.0.1:8765/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
];

function readEnvFile(filePath) {
  const values = {};

  if (!fs.existsSync(filePath)) {
    return values;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    values[key] = value;
  }

  return values;
}

function updateEnvValue(filePath, key, value) {
  const exists = fs.existsSync(filePath);
  const lines = exists ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  let updated = false;

  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, `${nextLines.join("\n").trim()}\n`, "utf8");
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function exchangeCode({ clientId, clientSecret, code, codeVerifier }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function main() {
  const env = readEnvFile(ENV_PATH);
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
    process.exit(1);
  }

  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("");
  console.log("Open this link in your browser and sign in to your Google Workspace account:");
  console.log(authUrl.toString());
  console.log("");
  console.log("After you approve access, this window will finish the setup automatically.");
  console.log("");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Google returned an error: ${error}`);
      console.error(`Google returned an error: ${error}`);
      server.close(() => process.exit(1));
      return;
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Missing authorization code.");
      console.error("Missing authorization code.");
      server.close(() => process.exit(1));
      return;
    }

    try {
      const tokenPayload = await exchangeCode({
        clientId,
        clientSecret,
        code,
        codeVerifier,
      });

      if (!tokenPayload.refresh_token) {
        throw new Error(
          "Google did not return a refresh token. Try again and make sure you approve the consent screen."
        );
      }

      updateEnvValue(ENV_PATH, "GOOGLE_REFRESH_TOKEN", tokenPayload.refresh_token);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 32px;">
            <h1>Google connection complete</h1>
            <p>Your refresh token was saved into the <code>.env</code> file.</p>
            <p>You can close this browser tab and return to the terminal.</p>
          </body>
        </html>
      `);

      console.log("Refresh token saved to .env as GOOGLE_REFRESH_TOKEN");
      console.log("You can now restart the app.");
      server.close(() => process.exit(0));
    } catch (tokenError) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Token exchange failed: ${tokenError.message}`);
      console.error(tokenError.message);
      server.close(() => process.exit(1));
    }
  });

  server.listen(8765, "127.0.0.1", () => {
    console.log("Waiting for Google sign-in on http://127.0.0.1:8765/oauth2callback");
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
