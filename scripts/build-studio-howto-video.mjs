#!/usr/bin/env node
/**
 * Build the Studio Masterclass how-to video inside the Image & Video Lab.
 *
 * This drives the shipped UI: Music Video mode, the real media ingest input,
 * the real Title Cards panel, the real audio-bed input, and the real EXPORT
 * VIDEO button. The lab records its own master canvas and hands the file to the
 * browser's download shelf, so the deliverable is an in-app export rather than
 * an external screen capture.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const FRAMES = path.resolve("artifacts/howto-frames");
const OUT = path.resolve("artifacts");
const NARRATION = path.resolve(
  "artifacts/studio-masterclass-howto-narration-final.mp3",
);
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

const STEPS = [
  {
    frame: "01-masterclass.png",
    title: "01 · STUDIO MASTERCLASS",
    subtitle: "Open the exact lesson from a shared link. No maze.",
  },
  {
    frame: "02-quick-session.png",
    title: "02 · QUICK SESSION",
    subtitle: "Set the tempo. Press play. The cockpit goes live.",
  },
  {
    frame: "03-starter-loaded.png",
    title: "03 · STARTER GROOVE",
    subtitle: "Load the loop. Auto-check confirms the lesson.",
  },
  {
    frame: "04-drum-machine.png",
    title: "04 · DRUM MACHINE",
    subtitle: "Program kick, snare, hats. Swing it until it breathes.",
  },
  {
    frame: "05-piano-roll.png",
    title: "05 · PIANO ROLL",
    subtitle: "Draw, shorten, move and velocity-edit every note.",
  },
  {
    frame: "06-mixer.png",
    title: "06 · MIXER",
    subtitle: "Drums first, bass locked, melody around them. Leave headroom.",
  },
  {
    frame: "07-export.png",
    title: "07 · EXPORT",
    subtitle: "Save the project. Render WAV, stems and MIDI.",
  },
];
const STEP_SECONDS = 8;
const OUTRO_AT = STEPS.length * STEP_SECONDS; // 56s
const LOG = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line) => {
  LOG.push(line);
  console.log(line);
};

function setInputValue(page, selector, value) {
  return page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`missing ${selector}`);
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value },
  );
}

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
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  acceptDownloads: true,
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve_onboarding_complete", "1");
  },
  { session: SESSION },
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

try {
  log("Opening Image & Video Lab");
  await page.goto(`${BASE}/image-video-lab`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-image-video-lab").waitFor({
    state: "visible",
    timeout: 90_000,
  });
  await page.locator(".cinema-shell").waitFor({ timeout: 60_000 });
  await sleep(1500);

  // Music Video mode gives the guide a 16:9 master and an 8s still duration.
  await page
    .locator(".production-mode-card", { hasText: "Music Videos" })
    .click();
  await sleep(500);
  await page
    .locator(".delivery-preset-card", { hasText: "Music Video Master" })
    .click();
  await sleep(500);

  // 1080p is the delivery raster for the guide; 60s is the lab's maximum window.
  await page.getByLabel("Export resolution").selectOption("1080p");
  await page.getByLabel("Export frame rate").selectOption("30");
  await page
    .getByLabel("Video export capture window in seconds")
    .selectOption("60");

  // Load the rotated narration as the real audio bed.
  log("Loading narration bed");
  await page
    .getByLabel("Add a music or voice bed from this device")
    .setInputFiles(NARRATION);
  await sleep(1500);

  // Build the picture: one real Studio frame every 8 seconds.
  const mediaInput = page.getByLabel("Upload a video or image from this device");
  for (let index = 0; index < STEPS.length; index += 1) {
    const at = index * STEP_SECONDS;
    await setInputValue(page, "input.monitor-scrub", at);
    await sleep(250);
    const framePath = path.join(FRAMES, STEPS[index].frame);
    if (!statSync(framePath).isFile()) {
      throw new Error(`missing frame ${framePath}`);
    }
    await mediaInput.setInputFiles(framePath);
    await sleep(700);
    log(`ingested ${STEPS[index].frame} at ${at}s`);
  }

  // Title cards are real overlay clips, cut at each step's in-point.
  await page.getByLabel("Title style").selectOption("lower-third");
  await page.getByLabel("Title position").selectOption("bottom");
  await setInputValue(page, 'input[aria-label="Title hold duration"]', 7);
  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    await setInputValue(page, "input.monitor-scrub", index * STEP_SECONDS);
    await page.getByLabel("Title text").fill(step.title);
    await page.getByLabel("Title subtitle").fill(step.subtitle);
    await page.getByRole("button", { name: /CUT TITLE IN/i }).click();
    await sleep(250);
    log(`title cut · ${step.title}`);
  }

  // Full-screen outro card, cut on the same overlays lane.
  await setInputValue(page, "input.monitor-scrub", OUTRO_AT);
  await page.getByLabel("Title text").fill("STUDIO QUALITY.");
  await page
    .getByLabel("Title subtitle")
    .fill("Learn it. Break it. Rebuild it. — S.M.U.V.E. Prime");
  await page.getByLabel("Title style").selectOption("title-card");
  await page.getByLabel("Title position").selectOption("center");
  await setInputValue(page, 'input[aria-label="Title hold duration"]', 4);
  await page.getByRole("button", { name: /CUT TITLE IN/i }).click();
  await sleep(400);
  log("title cut · outro");

  // Force every frame to decode once before the recorder opens.
  for (let index = 0; index < STEPS.length; index += 1) {
    await setInputValue(page, "input.monitor-scrub", index * STEP_SECONDS + 1);
    await sleep(350);
  }
  await setInputValue(page, "input.monitor-scrub", 0);
  await page
    .getByLabel("Audio overlay level")
    .evaluate((el) => {
      el.value = "100";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    })
    .catch(() => {});
  await sleep(1200);

  await page.screenshot({
    path: path.join(OUT, "studio-masterclass-howto-lab-timeline.png"),
    animations: "disabled",
  });

  const exportSummary = await page
    .locator(".export-summary")
    .first()
    .textContent();
  log(`Export target · ${exportSummary?.trim()}`);

  // Export through the shipped control. The file lands via the download shelf.
  const downloadPromise = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByRole("button", { name: /EXPORT VIDEO/i }).click();
  log("EXPORT VIDEO pressed · recording 60s master");
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const extension = path.extname(suggested) || ".webm";
  const destination = path.join(
    OUT,
    `studio-masterclass-howto-lab-export${extension}`,
  );
  await download.saveAs(destination);
  log(`download saved · ${path.basename(destination)}`);

  await sleep(1500);
  await page.screenshot({
    path: path.join(OUT, "studio-masterclass-howto-lab-complete.png"),
    animations: "disabled",
  });

  const receipt = {
    exportedBy: "Image & Video Lab / EXPORT VIDEO",
    suggestedFilename: suggested,
    savedAs: path.basename(destination),
    bytes: statSync(destination).size,
    exportSummary: exportSummary?.trim() ?? null,
    steps: STEPS.map((step, index) => ({
      ...step,
      atSeconds: index * STEP_SECONDS,
      durationSeconds: STEP_SECONDS,
    })),
    outroAtSeconds: OUTRO_AT,
    narration: path.basename(NARRATION),
    consoleErrors,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(OUT, "studio-masterclass-howto-lab-export.json"),
    JSON.stringify(receipt, null, 2),
  );
  writeFileSync(
    path.join(OUT, "studio-masterclass-howto-build.log"),
    LOG.join("\n") + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
