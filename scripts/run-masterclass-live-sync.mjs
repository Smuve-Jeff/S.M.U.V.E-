#!/usr/bin/env node
/**
 * Run the credential-gated Masterclass live-sync suite without production
 * credentials.
 *
 *   npm run test:e2e:live-sync
 *
 * The runner generates a one-run artist, starts the loopback-only API harness,
 * starts Angular on a private port, and exposes both through one same-origin
 * proxy. The app therefore talks to `/api` on its own origin, exactly as the
 * deployed bundle does. Everything is torn down afterward; no account, token
 * or profile is written outside process memory.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.LIVE_SYNC_API_PORT || 4100);
const APP_PORT = Number(process.env.LIVE_SYNC_APP_PORT || 4310);
const PROXY_PORT = Number(process.env.LIVE_SYNC_PROXY_PORT || 4300);

const EMAIL = `live-sync-${Date.now()}@local.test`;
const PASSWORD = randomBytes(24).toString("base64url");

const children = [];
let proxy = null;
let isShuttingDown = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function prefixOutput(child, label) {
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (line) process.stderr.write(`[${label}] ${line}\n`);
      }
    });
  }
}

function startChild(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  prefixOutput(child, label);

  child.on("error", (error) => {
    process.stderr.write(`[${label}] failed to start: ${error.message}\n`);
  });
  return child;
}

async function waitFor(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || response.status === 304) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`);
}

function createProxy() {
  proxy = http.createServer((req, res) => {
    const rawUrl = req.url || "/";
    const targetPort =
      rawUrl === "/api" || rawUrl.startsWith("/api/") ? API_PORT : APP_PORT;
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: rawUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${targetPort}`,
        },
      },
      (upstreamResponse) => {
        res.writeHead(
          upstreamResponse.statusCode || 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(res);
      },
    );

    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      res.end(
        JSON.stringify({
          error: `local live-sync proxy: ${error.message}`,
        }),
      );
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });

  return new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(PROXY_PORT, "127.0.0.1", () => {
      proxy.off("error", reject);
      resolve();
    });
  });
}

function runPlaywright() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(ROOT, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "tests/e2e/studio-guide-live-sync.spec.ts",
        "--project=chromium",
        "--workers=1",
        "--reporter=line",
      ],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${PROXY_PORT}`,
          // Prevent Playwright from starting a second, proxy-less app server.
          FREEBUFF_MANAGED_PREVIEW: "1",
          E2E_STUDIO_EMAIL: EMAIL,
          E2E_STUDIO_PASSWORD: PASSWORD,
          PW_TEST_HTML_REPORT_OPEN: "never",
        },
        stdio: "inherit",
      },
    );

    children.push(child);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function stopChild(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  const stopped = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (proxy) {
    await new Promise((resolve) => proxy.close(() => resolve()));
    proxy = null;
  }
  await Promise.all(
    children.map((child) =>
      // Both children handle an interrupt; Angular's dev server shuts its
      // esbuild service down cleanly on this path, while SIGTERM leaves a
      // noisy esbuild deadlock report.
      stopChild(child, "SIGINT"),
    ),
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  });
}

async function main() {
  console.log(
    "live-sync: starting a loopback-only API and app; no production account is used.",
  );

  startChild("api", [path.join(ROOT, "scripts", "live-sync-api.mjs")], {
    LIVE_SYNC_API_PORT: String(API_PORT),
    LIVE_SYNC_ARTIST_EMAIL: EMAIL,
    LIVE_SYNC_ARTIST_PASSWORD: PASSWORD,
  });

  startChild("app", [path.join(ROOT, "scripts", "dev-server.mjs")], {
    PORT: String(APP_PORT),
    NG_CLI_ANALYTICS: "false",
    BROWSERSLIST_IGNORE_OLD_DATA: "true",
  });

  await createProxy();
  await waitFor(`http://127.0.0.1:${PROXY_PORT}/api/health`);
  await waitFor(`http://127.0.0.1:${PROXY_PORT}/login`);

  const exitCode = await runPlaywright();
  process.exitCode = exitCode;
}

main()
  .catch((error) => {
    console.error(
      `live-sync: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(shutdown);
