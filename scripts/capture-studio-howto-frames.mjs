#!/usr/bin/env node
/**
 * Capture the real Studio surfaces for the Studio Masterclass how-to video.
 *
 * These are not mock frames: Playwright seeds a real signed-in session, opens
 * the shared Masterclass deep link, performs the starter-groove action, then
 * switches through the actual Studio rail to Drum Machine, Piano Roll, Mixer
 * and Export. The Image & Video Lab later ingests these frames and exports the
 * finished guide from its own timeline.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const OUT = path.resolve("artifacts/howto-frames");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "user_howto_exec",
  email: "howto@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString(
  "base64",
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await context.addInitScript(
  ({ session, salt }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve.studio.guide.progress.v1", "[]");
    // Keep the recording clean; the app's toast/banner stack is not the lesson.
    localStorage.setItem("smuve_onboarding_complete", "1");
    sessionStorage.setItem("smuve_onboarding_complete", "1");
    window.__SMUVE_HOWTO_SALT__ = salt;
  },
  { session: SESSION, salt: AUTH_SALT },
);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`PAGEERROR ${error.message}`));
await page.route("**/api/**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: null }),
  }),
);

async function shot(name) {
  await sleep(1200);
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    animations: "disabled",
  });
  console.log(`frame · ${name}.png`);
}

async function gotoStudio(query) {
  await page.goto(`${BASE}/studio${query}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-studio").waitFor({ state: "visible", timeout: 90_000 });
  await sleep(2500);
}

async function switchView(label, shell) {
  await page.getByRole("button", { name: `Switch to ${label} view` }).click();
  await page.locator(shell).waitFor({ state: "visible", timeout: 30_000 });
  await sleep(2200);
}

try {
  // 1. The shared Masterclass deep link: the actual lesson, not a marketing page.
  await gotoStudio("?guide=first-loop&lesson=loop-sound");
  await page.locator("app-studio-guide").waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page.getByText("Hear your first sound", { exact: true }).first().waitFor();
  await shot("01-masterclass");

  // 2. The lesson action opens the real workspace.
  await page
    .getByRole("button", { name: "Open Quick Session", exact: true })
    .click();
  await page.locator(".qs-shell").waitFor({ state: "visible", timeout: 30_000 });
  await sleep(2000);
  await shot("02-quick-session");

  // 3. The auto-checked starter groove: load it through the real Masterclass.
  await gotoStudio("?guide=first-loop&lesson=loop-groove");
  await page.locator("app-studio-guide").waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page
    .getByRole("button", { name: "Load a starter groove", exact: true })
    .click();
  await page.locator("app-guide-completion").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await sleep(1200);
  await shot("03-starter-loaded");

  // Keep the loaded project; close the celebration, then drive the real rail.
  await page
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await sleep(700);
  // The beginner wizard mounts over Quick Session on a first project. Leave it
  // in the frame only for the completion step; the production walkthrough must
  // show the actual surface controls underneath.
  const proMode = page.getByRole("button", {
    name: /SHOW PRO MODE/i,
  });
  if (await proMode.isVisible().catch(() => false)) {
    await proMode.click();
    await sleep(900);
  }
  await page.locator(".comp-canvas").waitFor({ state: "visible", timeout: 30_000 });
  await sleep(900);

  await switchView("Drum Machine", ".dm-shell");
  await shot("04-drum-machine");

  await switchView("Piano Roll", ".pr-shell");
  await shot("05-piano-roll");

  await switchView("Mixer", ".mix-shell");
  await shot("06-mixer");

  await switchView("Export", ".export-surface-shell");
  await shot("07-export");

  const summary = {
    frames: [
      "01-masterclass.png",
      "02-quick-session.png",
      "03-starter-loaded.png",
      "04-drum-machine.png",
      "05-piano-roll.png",
      "06-mixer.png",
      "07-export.png",
    ],
    url: page.url(),
    consoleErrors,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(OUT, "capture.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
