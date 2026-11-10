#!/usr/bin/env node
/**
 * Mint a YouTube OAuth refresh token for the Masterclass recorder.
 *
 * Create an OAuth client in Google Cloud (Desktop app is the least friction),
 * enable the YouTube Data API v3, then run:
 *
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node scripts/youtube-oauth.mjs
 *
 * The helper opens Google's consent screen, listens on the loopback redirect,
 * exchanges the one-time code, and prints:
 *
 *   YOUTUBE_REFRESH_TOKEN=...
 *
 * It never writes the token to disk. Store it in your secret manager or an
 * untracked .env file, never in the repository.
 *
 * Remote/headless machines:
 *   node scripts/youtube-oauth.mjs --print-url
 *   # open the URL elsewhere, then copy the callback URL or code
 *   node scripts/youtube-oauth.mjs --manual
 *
 * Optional:
 *   YOUTUBE_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback
 *   YOUTUBE_OAUTH_NO_OPEN=1        # print the URL instead of opening a browser
 *   YOUTUBE_OAUTH_MANUAL=1         # same as --manual
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";
import readline from "node:readline/promises";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";

const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.YOUTUBE_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
const printOnly = process.argv.includes("--print-url");
const manual =
  process.argv.includes("--manual") || process.env.YOUTUBE_OAUTH_MANUAL === "1";
const noOpen =
  process.argv.includes("--no-open") ||
  process.env.YOUTUBE_OAUTH_NO_OPEN === "1";
const state = crypto.randomBytes(24).toString("hex");

function fail(message) {
  console.error(`\nYouTube OAuth: ${message}\n`);
  process.exitCode = 1;
}

function redirectUrl() {
  try {
    return new URL(redirectUri);
  } catch {
    throw new Error(`YOUTUBE_REDIRECT_URI is not a valid URL: ${redirectUri}`);
  }
}

function authorizationUrl() {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url;
}

function openBrowser(url) {
  if (
    noOpen ||
    (process.platform !== "win32" &&
      !process.env.DISPLAY &&
      !process.env.WAYLAND_DISPLAY)
  ) {
    console.log("Open this URL in a browser:\n");
    console.log(url);
    return;
  }

  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(`Opened the authorization page with ${command}.`);
  } catch {
    console.log("Could not open a browser automatically. Open this URL:\n");
    console.log(url);
  }
}

async function exchangeCode(code) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.error_description ||
        result.error ||
        `Google token exchange failed (${response.status}).`,
    );
  }
  if (!result.refresh_token) {
    throw new Error(
      "Google returned no refresh token. Revoke this app's access in your Google Account and run the helper again with prompt=consent.",
    );
  }
  return result.refresh_token;
}

function printToken(refreshToken) {
  console.log("\nAuthorized. Add this to the recording environment:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
  console.log(
    "\nStore it in a secret manager or an untracked .env file. Never commit it.\n",
  );
}

function resultPage(title, message) {
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#05090f;color:#eaf0ff;font:16px/1.5 system-ui,sans-serif">
<main style="max-width:560px;padding:32px;border:1px solid #1e3a4a;border-radius:18px;background:#08111d">
<p style="margin:0 0 8px;color:#7ee0dd;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">S.M.U.V.E. Prime / YouTube OAuth</p>
<h1 style="margin:0 0 12px;font-size:28px">${title}</h1>
<p style="margin:0;color:#aab4ca">${message}</p>
</main></body></html>`;
}

function finishResponse(response, status, title, message) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(resultPage(title, message));
}

function parseCodeInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const returnedState = url.searchParams.get("state");
    if (returnedState && returnedState !== state) {
      throw new Error("The callback state does not match this authorization.");
    }
    return url.searchParams.get("code");
  } catch (error) {
    if (error instanceof TypeError) return trimmed;
    throw error;
  }
}

async function manualFlow() {
  const url = authorizationUrl();
  console.log(
    "Open this URL, approve the YouTube upload scope, then copy the full callback URL (or its code parameter):\n",
  );
  console.log(url.toString());
  console.log(
    `\nThe redirect is ${redirectUri}. If no local callback server is listening, the browser can show a connection error; the address bar still contains the code.`,
  );

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let answer;
  try {
    answer = await prompt.question("\nCallback URL or code: ");
  } finally {
    prompt.close();
  }

  const code = parseCodeInput(answer);
  if (!code) throw new Error("No authorization code was provided.");
  const refreshToken = await exchangeCode(code);
  printToken(refreshToken);
}

function startServer() {
  const redirect = redirectUrl();
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    redirect.hostname,
  );
  if (redirect.protocol !== "http:" || !loopback) {
    throw new Error(
      "The built-in callback server only listens on a loopback HTTP redirect. Use --manual with a registered redirect URI, or set YOUTUBE_REDIRECT_URI to a loopback URL.",
    );
  }

  const port = Number(redirect.port || 80);
  const callbackPath = redirect.pathname || "/oauth2callback";
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", redirect.origin);
    if (requestUrl.pathname !== callbackPath) {
      finishResponse(
        response,
        404,
        "Not found",
        "This is not the OAuth callback route.",
      );
      return;
    }

    const error = requestUrl.searchParams.get("error");
    if (error) {
      finishResponse(
        response,
        400,
        "Authorization declined",
        "Google did not grant the upload scope. Close this page and try again.",
      );
      server.close();
      process.exitCode = 1;
      return;
    }

    if (requestUrl.searchParams.get("state") !== state) {
      finishResponse(
        response,
        400,
        "State mismatch",
        "This authorization response does not belong to the running helper. Close this page and try again.",
      );
      return;
    }

    const code = requestUrl.searchParams.get("code");
    if (!code) {
      finishResponse(
        response,
        400,
        "No authorization code",
        "Google did not return a code. Close this page and try again.",
      );
      return;
    }

    try {
      const refreshToken = await exchangeCode(code);
      finishResponse(
        response,
        200,
        "Refresh token minted",
        "You can close this tab and return to the terminal. The token was printed there; it was not written to disk.",
      );
      printToken(refreshToken);
      server.close();
    } catch (error) {
      finishResponse(
        response,
        500,
        "Token exchange failed",
        "Return to the terminal for the error. No token was written to disk.",
      );
      console.error(`\nYouTube OAuth: ${error.message}\n`);
      server.close();
      process.exitCode = 1;
    }
  });

  server.on("error", (error) => {
    fail(`Could not listen on ${redirectUri}: ${error.message}`);
  });

  server.listen(port, redirect.hostname, () => {
    console.log(`Waiting for Google's callback on ${redirectUri} ...\n`);
    openBrowser(authorizationUrl().toString());
  });
}

async function main() {
  if (!clientId) {
    fail(
      "set YOUTUBE_CLIENT_ID to the OAuth client ID from Google Cloud. Create a Desktop app client and enable the YouTube Data API v3.",
    );
    return;
  }

  if (printOnly) {
    console.log(authorizationUrl().toString());
    console.log(
      `\nRedirect URI: ${redirectUri}\nScope: ${SCOPE}\nOpen the URL in a browser, then run this helper with --manual and paste the callback URL or code.`,
    );
    return;
  }

  if (!manual && !clientSecret) {
    fail(
      "set YOUTUBE_CLIENT_SECRET for the token exchange (or use --print-url to inspect the consent URL).",
    );
    return;
  }

  try {
    if (manual) await manualFlow();
    else startServer();
  } catch (error) {
    fail(error.message);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
