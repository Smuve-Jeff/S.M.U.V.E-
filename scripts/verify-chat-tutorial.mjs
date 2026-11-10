#!/usr/bin/env node
/** Verify the shipped S.M.U.V.E 2.0 Field Guide in Chromium. */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
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
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${SALT}`).toString("base64");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, colorScheme: "dark" });
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
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
  await page.goto(`${BASE}/hub`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-hub .hub-command-center").waitFor({
    state: "visible",
    timeout: 90_000,
  });
  await sleep(1600);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(250);
  return { context, page, errors };
}

async function openChat(page) {
  await page.getByRole("button", { name: "Toggle S.M.U.V.E advisor" }).click();
  await page.locator("app-chatbot .chatbot-container").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await sleep(500);
}

async function openGuide(page) {
  await page.locator(".chat-learn-launch").click();
  await page.locator("dialog.chat-learn-dialog[open]").waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await page.waitForFunction(
    () => {
      const video = document.querySelector(".chat-learn-video");
      return video && video.readyState >= 1;
    },
    { timeout: 30_000 },
  );
  await sleep(350);
}

try {
  // Desktop: metadata, chapter seek, mastery persistence, SHOW ME, Escape.
  const desktop = await newPage({ width: 1440, height: 900 });
  const page = desktop.page;
  await openChat(page);
  report.advisorFabHidden = (await page.locator("app-smuve-advisor").count()) === 0;
  await openGuide(page);

  report.meta = await page.evaluate(() => {
    const video = document.querySelector(".chat-learn-video");
    const dialog = document.querySelector(".chat-learn-dialog").getBoundingClientRect();
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      readyState: video.readyState,
      error: video.error ? video.error.code : null,
      src: video.currentSrc,
      chapters: document.querySelectorAll(".chat-learn-chapter").length,
      progress: document.querySelector(".chat-learn-progress")?.textContent?.trim(),
      dialog: { x: dialog.x, y: dialog.y, w: dialog.width, h: dialog.height },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  // Decode a real frame from the master, not just metadata.
  await page.locator(".chat-learn-video").evaluate(async (video) => {
    video.currentTime = 42;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
    video.pause();
  });
  const frame = await page.evaluate(() => {
    const video = document.querySelector(".chat-learn-video");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let luminance = 0;
    for (let i = 0; i < data.length; i += 4) {
      luminance += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return {
      url: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      averageLuma: Math.round(luminance / (data.length / 4)),
    };
  });
  writeFileSync(
    "artifacts/chat-tutorial/screens/11-chat-video-frame.png",
    Buffer.from(frame.url.split(",")[1], "base64"),
  );
  report.decodedFrame = {
    width: frame.width,
    height: frame.height,
    averageLuma: frame.averageLuma,
  };

  await page.locator(".chat-learn-chapter", { hasText: "Hear the manager" }).click();
  await sleep(1000);
  report.chapterSeek = await page.locator(".chat-learn-video").evaluate((video) => ({
    currentTime: video.currentTime,
    paused: video.paused,
    active: document.querySelector(".chat-learn-chapter.active")?.textContent?.trim(),
    detail: document.querySelector(".chat-learn-detail h3")?.textContent?.trim(),
  }));
  await page.locator(".chat-learn-video").evaluate((video) => video.pause());

  await page.locator(".chat-learn-master").click();
  await sleep(300);
  report.mastered = {
    progress: await page.locator(".chat-learn-progress").innerText(),
    pressed: await page.locator(".chat-learn-master").getAttribute("aria-pressed"),
  };
  await page.screenshot({
    path: "artifacts/chat-tutorial/screens/10-field-guide.png",
    animations: "disabled",
  });

  // Reload: mastery has to survive, and the guide has to reopen cleanly.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("app-hub .hub-command-center").waitFor({ timeout: 90_000 });
  await sleep(1400);
  await page.keyboard.press("Escape").catch(() => {});
  await openChat(page);
  await openGuide(page);
  report.persisted = {
    progress: await page.locator(".chat-learn-progress").innerText(),
    completedCards: await page.locator(".chat-learn-check.done").count(),
    duration: await page.locator(".chat-learn-video").evaluate((video) => video.duration),
  };

  // SHOW ME must close the modal and open/spotlight the real Voice Lab.
  await page.locator(".chat-learn-chapter", { hasText: "Hear the manager" }).click();
  await sleep(250);
  await page.locator(".chat-learn-show").click();
  await page.locator("dialog.chat-learn-dialog[open]").waitFor({ state: "detached", timeout: 5_000 });
  await sleep(900);
  report.showMeVoice = await page.evaluate(() => {
    const lab = document.querySelector('[aria-label="Voice Lab"]');
    const rect = lab?.getBoundingClientRect();
    return {
      dialogClosed: !document.querySelector("dialog.chat-learn-dialog[open]"),
      voiceLabPresent: !!lab,
      visible: !!rect && rect.height > 0 && rect.width > 0,
      spotlight: lab?.classList.contains("chat-learn-spotlight") ?? false,
    };
  });

  await page.locator(".chat-learn-launch").click();
  await page.locator("dialog.chat-learn-dialog[open]").waitFor({ timeout: 5_000 });
  await page.keyboard.press("Escape");
  await sleep(400);
  report.escapeCloses = (await page.locator("dialog.chat-learn-dialog[open]").count()) === 0;

  report.desktopConsoleErrors = desktop.errors;
  await desktop.context.close();

  // Mobile: full-screen dialog, no horizontal overflow, a second SHOW ME target.
  const mobile = await newPage({ width: 390, height: 844 });
  const mp = mobile.page;
  await openChat(mp);
  await openGuide(mp);
  await mp.screenshot({
    path: "artifacts/chat-tutorial/screens/12-mobile-field-guide.png",
    animations: "disabled",
  });
  report.mobile = await mp.evaluate(() => {
    const dialog = document.querySelector(".chat-learn-dialog").getBoundingClientRect();
    const video = document.querySelector(".chat-learn-video").getBoundingClientRect();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dialog: { x: dialog.x, y: dialog.y, w: dialog.width, h: dialog.height },
      video: { x: video.x, y: video.y, w: video.width, h: video.height },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      duration: document.querySelector(".chat-learn-video").duration,
    };
  });

  await mp.locator(".chat-learn-chapter", { hasText: "Give the manager hands" }).click();
  await sleep(300);
  await mp.locator(".chat-learn-show").click();
  await mp.locator("dialog.chat-learn-dialog[open]").waitFor({ state: "detached", timeout: 5_000 });
  await sleep(900);
  report.mobileShowMeControl = await mp.evaluate(() => {
    const button = document.querySelector('[data-chat-target="control"]');
    const rect = button?.getBoundingClientRect();
    return {
      present: !!button,
      visible: !!rect && rect.height > 0 && rect.width > 0,
      spotlight: button?.classList.contains("chat-learn-spotlight") ?? false,
    };
  });
  report.mobileConsoleErrors = mobile.errors;
  await mobile.context.close();
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
