#!/usr/bin/env node
/**
 * Capture the real S.M.U.V.E 2.0 assistant drawer for the Field Guide tutorial.
 *
 * The transcript used here is produced by the shipped offline intent router
 * ("Start my journey" never calls the model). Everything else is a real
 * control state: the category drawers, Voice Lab, Mimic, Full Control, the
 * composer and the memory counter.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = path.resolve("artifacts/chat-tutorial/screens");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "user_chat_field_guide",
  email: "fieldguide@smuve.test",
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
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
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

const drawer = page.locator("#smuve-assistant-drawer");
const chat = page.locator("app-chatbot .chatbot-container");
const composer = page.locator('input[aria-label="Artist request"]');
const frames = [];

async function full(name) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    animations: "disabled",
  });
  frames.push(name);
  console.log(`frame · ${name}.png (full)`);
}

async function panel(name) {
  await drawer.screenshot({
    path: path.join(OUT, `${name}.png`),
    animations: "disabled",
  });
  frames.push(name);
  console.log(`frame · ${name}.png (drawer)`);
}

try {
  await page.goto(`${BASE}/hub`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-hub .hub-command-center").waitFor({
    state: "visible",
    timeout: 90_000,
  });
  await sleep(2200);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(400);

  await page.getByRole("button", { name: "Toggle S.M.U.V.E advisor" }).click();
  await chat.waitFor({ state: "visible", timeout: 30_000 });
  await sleep(1400);

  await full("01-open");
  await panel("02-context");

  // Command lanes: open Marketing first, then use Production for the
  // production lesson.
  await page.getByRole("button", { name: "Marketing", exact: true }).click();
  await sleep(500);
  await panel("03-commands");

  await page.getByRole("button", { name: "Production", exact: true }).click();
  await sleep(400);
  await page
    .getByRole("button", { name: "Start my journey", exact: true })
    .click();
  await page
    .locator(".messages-viewport")
    .getByText("THE ROADMAP", { exact: false })
    .waitFor({ timeout: 15_000 });
  await sleep(900);
  await composer.fill("92 BPM neo-soul beat in D minor.");
  await sleep(500);
  await panel("04-produce");

  await page.getByRole("button", { name: "Marketing", exact: true }).click();
  await sleep(400);
  await composer.fill("Six-week release, $500 budget.");
  await sleep(500);
  await panel("05-marketing");

  await page.getByRole("button", { name: "Business", exact: true }).click();
  await sleep(400);
  await composer.fill("Two collaborator splits, please.");
  await sleep(500);
  await panel("06-business");

  // Close the command drawer, clear the composer, then open the real Voice Lab.
  await page.getByRole("button", { name: "Business", exact: true }).click();
  await composer.fill("");
  await sleep(350);
  await page.getByRole("button", { name: "Open the Voice Lab" }).click();
  await page.locator('[aria-label="Voice Lab"]').waitFor({ timeout: 5_000 });
  await sleep(600);
  await panel("07-voice");

  await page.getByRole("button", { name: "Close the Voice Lab" }).click();
  await composer.fill("");
  await sleep(400);
  await page.getByRole("button", { name: "Mimic Mode OFF — enable it and I will read your own register and vocabulary out of the profile instead of guessing." }).click().catch(async () => {
    await page.locator('app-chatbot header button[title*="Mimic Mode"]').click();
  });
  await sleep(700);
  await page.locator('button[title*="S.M.U.V.E Full Control"]').click();
  await sleep(700);
  await panel("08-control");

  await composer.fill("Next move for this record.");
  await page.locator(".messages-viewport").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await sleep(500);
  await panel("09-memory");

  const result = await page.evaluate(() => {
    const d = document.querySelector("#smuve-assistant-drawer")?.getBoundingClientRect();
    const c = document.querySelector(".chatbot-container")?.getBoundingClientRect();
    const messages = document.querySelectorAll(".messages-viewport > div").length;
    const memory = document.querySelector(".chatbot-container")?.textContent || "";
    return {
      drawer: d ? { x: d.x, y: d.y, w: d.width, h: d.height } : null,
      chat: c ? { x: c.x, y: c.y, w: c.width, h: c.height } : null,
      messageRows: messages,
      memoryLabel: memory.match(/(\d+) in memory/)?.[1] ?? null,
      voiceLabOpen: !!document.querySelector('[aria-label="Voice Lab"]'),
      fullControl: !!document.querySelector('button[title*="Full Control: ACTIVE"]'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  writeFileSync(
    path.join(OUT, "capture.json"),
    JSON.stringify(
      { frames, result, consoleErrors, capturedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result, consoleErrors }, null, 2));
} finally {
  await browser.close();
}
