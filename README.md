# Field Reply Assistant

A lightweight local MVP for drafting out-of-office client replies for a Google Workspace inbox.

## What it does

- Pulls recent unread messages from Gmail when Google credentials are configured
- Falls back to realistic sample emails when credentials are not configured yet
- Generates a unique, client-specific reply using the OpenAI Responses API
- Applies safety rules for field availability, alternate contact info, and promise avoidance
- Creates Gmail drafts for review before anything is sent

## Why this MVP starts in draft mode

For client-facing communication, draft-first is the safer rollout. It lets you:

- confirm the voice match
- catch edge cases before auto-send
- refine handoff rules for urgent or sensitive messages

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your OpenAI API key and Google Workspace credentials.
3. Start the app:

```powershell
& 'C:\Users\jeove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

4. Open [http://localhost:8787](http://localhost:8787).

## Easiest way to get the Google refresh token

After you add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`, run:

```powershell
& 'C:\Users\jeove\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/google-auth-helper.js
```

Then:

1. open the Google sign-in link shown in the terminal
2. approve access for your Google Workspace mailbox
3. wait for the browser page that says the connection is complete

The helper saves `GOOGLE_REFRESH_TOKEN` into `.env` automatically.

## Required environment variables

- `OPENAI_API_KEY`
- `GOOGLE_WORKSPACE_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

## Google Workspace notes

This MVP uses Gmail API endpoints directly.

- Create a Google Cloud project
- Enable the Gmail API
- Create OAuth client credentials
- Generate a refresh token for the mailbox
- Store the client ID, client secret, and refresh token in `.env`

Recommended Gmail scopes:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send` only if you later enable auto-send

## Suggested rollout

1. Run with sample messages and tune your tone instructions.
2. Connect Gmail and verify draft creation.
3. Review at least a week of generated drafts.
4. Only then consider limited auto-send for low-risk categories.

## Safety rules built into the prompt

- Do not invent approvals, timelines, or commitments
- Do not answer legal, billing-dispute, or hostile emails with a full resolution
- Offer alternate contact details only when available
- Acknowledge the client's specific situation before giving your availability message
- Keep the tone human and varied instead of sounding like a canned auto-reply

## Architecture

- `server.js`: local HTTP server and API routes
- `lib/config.js`: `.env` loading and runtime configuration
- `lib/gmail.js`: Gmail API integration and draft creation
- `lib/openai.js`: OpenAI Responses API wrapper
- `lib/reply-engine.js`: safety rules and prompt assembly
- `public/`: browser UI

## Current limitations

- No persistent database yet
- No training import from your sent mailbox yet
- No scheduled background polling yet
- No approval queue beyond the local browser session

Those are good next steps once the draft quality feels right.

## Deploy online with Render

This is the easiest way to make the app available on your phone from anywhere.

### Before you deploy

- Do not upload your local `.env` file
- Your secrets should be added in Render's environment variable settings instead

### Files already prepared

- `.gitignore` keeps `.env` out of git
- `render.yaml` includes a basic Render web service setup

### Render steps

1. Put this project in a GitHub repository.
2. In Render, choose **New +** then **Blueprint** or **Web Service**.
3. Connect the GitHub repo.
4. Render should detect the app and use:
   - build command: `npm install`
   - start command: `npm start`
5. Add these environment variables in Render:
   - `OPENAI_API_KEY`
   - `GOOGLE_WORKSPACE_EMAIL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
6. Confirm these app settings:
   - `OPENAI_MODE=live`
   - `OPENAI_MODEL=gpt-5-mini`
   - `AUTO_SEND_ENABLED=false`
7. Deploy the service.

When deployment finishes, Render gives you a public URL like:

`https://your-app-name.onrender.com`

Open that URL on your phone from any network.

### Important Google note

If your OAuth app is still in testing mode, your Render URL may need to be added to the allowed redirect settings only if you change the OAuth flow later. The current Gmail refresh-token setup is already done locally, so the deployed app can use the existing refresh token.
