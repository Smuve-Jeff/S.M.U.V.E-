#!/usr/bin/env node
/**
 * Capture the real Image & Video Lab surfaces for the Cinema Academy tutorial.
 *
 * The shots are not mockups: a signed-in Chromium session opens the shipped
 * route, scrolls the live console, opens the actual camera surface, and grabs
 * the lesson overlay. The companion build script turns these into chapters.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4312";
const OUT = path.resolve("artifacts/lab-tutorial/screens");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "user_cinema_academy",
  email: "academy@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString("base64");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_onboarding_complete", "1");
    localStorage.setItem("smuve_music_map_seen", "1");
  },
  { session: SESSION },
);
await context.route("**/api/**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: null }),
  }),
);
await context.route("**/socket.io/**", (route) => route.abort());

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`PAGEERROR ${error.message}`));

const captured = [];
async function shot(name, selector) {
  if (selector) {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(700);
  }
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    animations: "disabled",
  });
  captured.push(name);
  console.log(`frame · ${name}.png`);
}

try {
  await page.goto(`${BASE}/image-video-lab`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-image-video-lab .cinema-shell").waitFor({
    state: "visible",
    timeout: 90_000,
  });
  await sleep(2600);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);

  await shot("01-overview", ".cinema-shell header");

  await page
    .locator(".production-mode-card", { hasText: "MUSIC VIDEOS" })
    .click();
  await sleep(900);
  await shot("02-modes", ".production-upgrade-bar");

  await shot(
    "03-ingest",
    'input[aria-label="Upload a video or image from this device"]',
  );

  await shot("04-timeline", ".timeline-section");

  await shot("05-titles", "#title-editor-title");

  await shot(
    "05b-audio",
    'input[aria-label="Add a music or voice bed from this device"]',
  );

  const fxHeading = page.getByRole("heading", { name: "FX Matrix", exact: true });
  await fxHeading.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(700);
  await shot("06-fx", ".fx-rack");

  await page.getByRole("tab", { name: "CAMERA", exact: true }).click();
  await sleep(1600);
  await shot("07-camera", ".monitor-section");

  await page.getByRole("tab", { name: "PROGRAM", exact: true }).click();
  await sleep(1000);
  await shot("08-projects", ".project-console");

  await page.locator(".learn-launch").scrollIntoViewIfNeeded().catch(() => {});
  await sleep(500);
  await shot("09-export", ".header-actions");

  // Prove the overlay sits in the viewport, then capture it for the guide.
  await page.locator(".learn-launch").click();
  await page.locator(".learn-overlay").waitFor({ timeout: 10_000 });
  await sleep(500);
  const overlay = await page.evaluate(() => {
    const shell = document.querySelector(".learn-shell")?.getBoundingClientRect();
    const layer = document.querySelector(".learn-overlay")?.getBoundingClientRect();
    return {
      shell: shell ? { x: shell.x, y: shell.y, w: shell.width, h: shell.height } : null,
      layer: layer ? { x: layer.x, y: layer.y, w: layer.width, h: layer.height } : null,
      lessons: document.querySelectorAll(".learn-chapter").length,
      visible: !!shell && shell.y >= 0 && shell.y < window.innerHeight,
    };
  });
  await page.screenshot({
    path: path.join(OUT, "10-learn-overlay.png"),
    animations: "disabled",
  });
  console.log(JSON.stringify({ overlay, consoleErrors }, null, 2));

  writeFileSync(
    path.join(OUT, "capture.json"),
    JSON.stringify(
      { frames: captured, overlay, consoleErrors, capturedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
