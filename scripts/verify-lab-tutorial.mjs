#!/usr/bin/env node
/** Verify the shipped Cinema Academy player and lessons in Chromium. */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4312";
const SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
  await page.goto(`${BASE}/image-video-lab`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-image-video-lab .cinema-shell").waitFor({
    state: "visible",
    timeout: 90_000,
  });
  await sleep(1800);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  return { context, page, errors };
}

async function openAcademy(page) {
  await page.locator(".learn-launch").click();
  await page.locator(".learn-overlay").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(
    () => {
      const v = document.querySelector(".learn-video");
      return v && v.readyState >= 1;
    },
    { timeout: 30_000 },
  );
}

try {
  // Desktop: metadata, chapter seek, mastery persistence, SHOW ME, Esc.
  const desktop = await newPage({ width: 1440, height: 900 });
  const page = desktop.page;
  await openAcademy(page);
  report.meta = await page.evaluate(() => {
    const v = document.querySelector(".learn-video");
    const layer = document.querySelector(".learn-overlay").getBoundingClientRect();
    const shell = document.querySelector(".learn-shell").getBoundingClientRect();
    return {
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
      readyState: v.readyState,
      networkState: v.networkState,
      error: v.error ? v.error.code : null,
      src: v.currentSrc,
      chapters: document.querySelectorAll(".learn-chapter").length,
      activeChapter: document.querySelector(".learn-chapter.active")?.textContent?.trim(),
      layer: { x: layer.x, y: layer.y, w: layer.width, h: layer.height },
      shell: { x: shell.x, y: shell.y, w: shell.width, h: shell.height },
    };
  });

  await page
    .locator(".learn-chapter", { hasText: "Cut on the master timeline" })
    .click();
  await sleep(1200);
  report.chapterSeek = await page.evaluate(() => {
    const v = document.querySelector(".learn-video");
    return { currentTime: v.currentTime, paused: v.paused, active: document.querySelector(".learn-chapter.active")?.textContent?.trim() };
  });
  await page.locator(".learn-video").evaluate((v) => v.pause());

  // Decode a real video frame rather than trusting metadata alone.
  await page.locator(".learn-video").evaluate(async (v) => {
    v.currentTime = 34.2;
    await new Promise((resolve) => v.addEventListener("seeked", resolve, { once: true }));
  });
  const frame = await page.evaluate(() => {
    const v = document.querySelector(".learn-video");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let luminance = 0;
    for (let i = 0; i < data.length; i += 4) luminance += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return {
      url: c.toDataURL("image/png"),
      width: c.width,
      height: c.height,
      averageLuma: Math.round(luminance / (data.length / 4)),
    };
  });
  writeFileSync(
    "artifacts/lab-tutorial/screens/13-video-frame.png",
    Buffer.from(frame.url.split(",")[1], "base64"),
  );
  report.decodedFrame = { width: frame.width, height: frame.height, averageLuma: frame.averageLuma };

  await page.locator(".learn-master").click();
  await page.waitForTimeout(350);
  report.completed = await page.locator(".learn-progress-label").innerText();
  report.masterAria = await page.locator(".learn-master").getAttribute("aria-pressed");
  await page.screenshot({
    path: "artifacts/lab-tutorial/screens/11-final-overlay.png",
    animations: "disabled",
  });

  // Reopen after a full reload: the mastered count must survive.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("app-image-video-lab .cinema-shell").waitFor({ timeout: 90_000 });
  await sleep(1800);
  await page.keyboard.press("Escape").catch(() => {});
  await openAcademy(page);
  report.persisted = {
    progress: await page.locator(".learn-progress-label").innerText(),
    active: await page.locator(".learn-chapter.active").innerText(),
    currentTime: await page.locator(".learn-video").evaluate((v) => v.currentTime),
  };

  // SHOW ME must close the overlay and spotlight the real export control.
  await page.locator(".learn-chapter", { hasText: "Export a master you can trust" }).click();
  await sleep(300);
  await page.locator(".learn-show").click();
  await page.locator(".learn-overlay").waitFor({ state: "detached", timeout: 5_000 });
  await sleep(900);
  report.showMe = await page.evaluate(() => {
    const el = document.querySelector(".export-window");
    return {
      overlayClosed: !document.querySelector(".learn-overlay"),
      spotlight: el?.classList.contains("learn-spotlight") ?? false,
      rect: el ? { y: el.getBoundingClientRect().y, h: el.getBoundingClientRect().height } : null,
    };
  });

  await page.locator(".learn-launch").click();
  await page.locator(".learn-overlay").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  report.escapeCloses = (await page.locator(".learn-overlay").count()) === 0;

  report.desktopConsoleErrors = desktop.errors;
  await desktop.context.close();

  // Mobile: overlay fits, and SHOW ME unfolds a folded FX section.
  const mobile = await newPage({ width: 390, height: 844 });
  const mp = mobile.page;
  await openAcademy(mp);
  await mp.screenshot({
    path: "artifacts/lab-tutorial/screens/12-mobile-overlay.png",
    animations: "disabled",
  });
  report.mobile = await mp.evaluate(() => {
    const shell = document.querySelector(".learn-shell").getBoundingClientRect();
    const video = document.querySelector(".learn-video").getBoundingClientRect();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      shell: { x: shell.x, y: shell.y, w: shell.width, h: shell.height },
      video: { x: video.x, y: video.y, w: video.width, h: video.height },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      duration: document.querySelector(".learn-video").duration,
    };
  });
  await mp.locator(".learn-chapter", { hasText: "Shape the look, then keyframe it" }).click();
  await sleep(300);
  await mp.locator(".learn-show").click();
  await mp.locator(".learn-overlay").waitFor({ state: "detached", timeout: 5_000 });
  await sleep(1000);
  report.mobileShowMeFx = await mp.evaluate(() => {
    const el = document.querySelector(".fx-rack");
    const rect = el?.getBoundingClientRect();
    return {
      present: !!el,
      visible: !!rect && rect.height > 0 && rect.width > 0,
      spotlight: el?.classList.contains("learn-spotlight") ?? false,
      y: rect?.y ?? null,
      h: rect?.height ?? null,
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
