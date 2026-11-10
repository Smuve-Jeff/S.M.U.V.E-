#!/usr/bin/env node
/**
 * Record the Studio Masterclass First Loop walkthrough.
 *
 *   npx playwright install chromium
 *   node scripts/record-studio-masterclass-demo.mjs
 *
 * The script starts the Angular dev server on DEMO_PORT (default 4310), seeds a
 * local test session, stubs `/api/**`, and records:
 *
 *   shared lesson link -> Quick Session -> starter groove -> completion ->
 *   next lesson
 *
 * Output:
 *   artifacts/studio-masterclass-first-loop.webm
 *   artifacts/studio-masterclass-first-loop.mp4  (when ffmpeg exists)
 *
 * Set DEMO_BASE_URL to record against an already-running app instead of
 * starting a server. The account is a local test session; no credentials or
 * real API writes are used.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env.DEMO_PORT || 4310);
const BASE_URL =
  process.env.DEMO_BASE_URL?.replace(/\/$/, "") || `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.join(ROOT, "artifacts");
const WEBM = path.join(OUT_DIR, "studio-masterclass-first-loop.webm");
const MP4 = path.join(OUT_DIR, "studio-masterclass-first-loop.mp4");
const DEV_LOG = path.join(OUT_DIR, "studio-masterclass-dev.log");

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverIsUp(url, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/hub`, { redirect: "manual" });
      if (response.ok) return true;
    } catch {
      /* keep waiting */
    }
    await sleep(250);
  }
  return false;
}

async function waitForServer(url, timeoutMs = 120_000) {
  if (await serverIsUp(url, timeoutMs)) return;
  throw new Error(`Dev server did not become reachable at ${url}/hub`);
}

function startServer() {
  const log = fs.createWriteStream(DEV_LOG, { flags: "w" });
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

function stopServer(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function makeSession() {
  const user = {
    id: "user_e2e_exec",
    email: "e2e@smuve.test",
    artistName: "Executive Artist",
    role: "Artist",
    permissions: ["STANDARD"],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLogin: "2026-01-01T00:00:00.000Z",
    profileCompleteness: 100,
  };
  const salt = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
  return Buffer.from(`${JSON.stringify(user)}|${salt}`).toString("base64");
}

async function showCaption(page, step, text) {
  await page.evaluate(
    ({ stepText, copy }) => {
      let node = document.getElementById("demo-caption");
      if (!node) {
        node = document.createElement("div");
        node.id = "demo-caption";
        node.style.cssText =
          "position:fixed;left:24px;bottom:24px;z-index:2147483647;" +
          "max-width:560px;padding:14px 18px;border-radius:14px;" +
          "background:rgba(6,12,22,.94);border:1px solid rgba(126,224,221,.45);" +
          "color:#eaf0ff;font:600 15px/1.45 'Public Sans',system-ui,sans-serif;" +
          "box-shadow:0 16px 40px rgba(0,0,0,.5);pointer-events:none";
        document.body.appendChild(node);
      }
      node.innerHTML =
        `<span style="display:block;color:#7ee0dd;font-size:10px;` +
        `letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px">` +
        `STEP ${stepText} OF 5</span>${copy}`;
    },
    { stepText: step, copy: text },
  );
}

async function showTitle(page, kicker, title, subtitle) {
  await page.evaluate(
    ({ kickerText, titleText, subtitleText }) => {
      let node = document.getElementById("demo-title");
      if (!node) {
        node = document.createElement("div");
        node.id = "demo-title";
        node.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;display:grid;" +
          "place-items:center;padding:48px;text-align:center;" +
          "background:radial-gradient(circle at 50% 45%,#13273a 0%,#05090f 70%);" +
          "color:#fff;font-family:'Public Sans',system-ui,sans-serif;" +
          "pointer-events:none";
        document.body.appendChild(node);
      }
      node.innerHTML =
        `<div><p style="margin:0 0 12px;color:#7ee0dd;font-size:11px;` +
        `font-weight:800;letter-spacing:.2em;text-transform:uppercase">` +
        `${kickerText}</p><h1 style="margin:0 auto;max-width:820px;` +
        `font-size:52px;line-height:1.05;letter-spacing:-.04em">${titleText}</h1>` +
        `<p style="margin:18px auto 0;max-width:620px;color:#aab4ca;` +
        `font-size:18px;line-height:1.5">${subtitleText}</p></div>`;
      node.style.display = "grid";
    },
    { kickerText: kicker, titleText: title, subtitleText: subtitle },
  );
}

async function hideTitle(page) {
  await page.evaluate(() => {
    const node = document.getElementById("demo-title");
    if (node) node.style.display = "none";
  });
}

async function main() {
  const existingServer = await serverIsUp(BASE_URL);
  const server = existingServer ? null : startServer();
  let browser;

  try {
    if (!existingServer) await waitForServer(BASE_URL);

    browser = await chromium.launch({
      headless: process.env.DEMO_HEADLESS !== "0",
      slowMo: 160,
    });
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: OUT_DIR,
        size: { width: 1280, height: 720 },
      },
    });
    const page = await context.newPage();
    const video = page.video();

    await page.addInitScript(
      ({ session }) => {
        try {
          sessionStorage.setItem("smuve_auth_session", session);
          localStorage.removeItem("smuve.studio.guide.progress.v1");
          localStorage.setItem("smuve_music_map_seen", "1");
        } catch {
          /* storage can be unavailable on an opaque document */
        }
      },
      { session: makeSession() },
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }),
    );

    const guide = page.locator("app-studio-guide");
    const celebration = page.locator("app-guide-completion");

    // 1. Shared deep link.
    await page.goto("/studio?guide=first-loop&lesson=loop-sound", {
      waitUntil: "domcontentloaded",
    });
    await guide.waitFor({ state: "visible", timeout: 45_000 });
    await showTitle(
      page,
      "S.M.U.V.E. Studio Masterclass",
      "First Loop, end to end",
      "A shared lesson link, one real starter groove, and the next step.",
    );
    await sleep(2_400);
    await hideTitle(page);
    await showCaption(
      page,
      1,
      "The shared link opens the First Loop on the exact lesson.",
    );
    await sleep(1_800);

    // 2. Open Quick Session.
    await guide
      .getByRole("button", { name: "Open Quick Session", exact: true })
      .click();
    await page.locator(".qs-shell").waitFor({ state: "visible" });
    await showCaption(
      page,
      2,
      "One tap moves the artist into Quick Session, ready to play.",
    );
    await sleep(2_200);

    // 3. Starter groove and auto-check.
    await page.goto("/studio?guide=first-loop&lesson=loop-groove", {
      waitUntil: "domcontentloaded",
    });
    await guide.waitFor({ state: "visible", timeout: 45_000 });
    await showCaption(
      page,
      3,
      "A finished groove loads in one tap — the lesson checks itself off.",
    );
    await sleep(1_800);
    await guide
      .getByRole("button", { name: "Load a starter groove", exact: true })
      .click();
    await celebration.waitFor({ state: "visible", timeout: 30_000 });
    await showCaption(
      page,
      4,
      "Lesson complete. The next step is offered, not forced.",
    );
    await sleep(2_600);

    // 4. Next lesson.
    await celebration
      .getByRole("button", { name: "Next lesson", exact: true })
      .click();
    await page.waitForURL(/lesson=loop-drums/, { timeout: 30_000 });
    await guide.waitFor({ state: "visible", timeout: 30_000 });
    await showCaption(
      page,
      5,
      "Build the beat opens directly in the guide. The path continues.",
    );
    await sleep(2_400);
    await showTitle(
      page,
      "First Loop",
      "Start with a groove.",
      "Then make it yours. The next lesson is already waiting.",
    );
    await sleep(2_400);

    await context.close();
    const rawPath = await video.path();
    fs.copyFileSync(rawPath, WEBM);
    console.log(`Video: ${WEBM}`);

    const ffmpegCheck = spawnSync("ffmpeg", ["-version"], {
      stdio: "ignore",
    });
    if (ffmpegCheck.status === 0) {
      const converted = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          WEBM,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-crf",
          "20",
          "-movflags",
          "+faststart",
          MP4,
        ],
        { stdio: "inherit" },
      );
      if (converted.status === 0 && fs.existsSync(MP4)) {
        console.log(`MP4:   ${MP4}`);
      } else {
        console.warn("ffmpeg conversion failed; upload the WebM as-is.");
      }
    } else {
      console.log("ffmpeg not found; upload the WebM as-is.");
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) stopServer(server);
  }
}

main().catch((error) => {
  console.error(`Demo recording failed: ${error?.message || error}`);
  if (String(error?.message || "").includes("shared libraries")) {
    console.error(
      "Install Chromium system dependencies, then retry: sudo npx playwright install-deps chromium",
    );
  } else if (
    String(error?.message || "").includes("Executable doesn't exist")
  ) {
    console.error(
      "Install the browser, then retry: npx playwright install chromium",
    );
  }
  process.exitCode = 1;
});
