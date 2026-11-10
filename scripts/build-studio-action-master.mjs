#!/usr/bin/env node
/**
 * Cut the recorded Studio action take and the 24-voice Prime narration into
 * one 120-second master inside the Image & Video Lab.
 *
 * The lab ingests the already-recorded 1920x1080 action WebM as footage,
 * measures its duration, and burns the 24 lower-third lesson titles. Export is
 * the lab's own 120-second WebM capture; the delivery MP4 is a local tail-pad.
 */
import { chromium } from "playwright";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const OUT = path.resolve("artifacts");
const VIDEO = path.resolve("artifacts/studio-actions-120.webm");
const AUDIO = path.resolve("artifacts/studio-masterclass-prime-narration-120.mp3");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "user_action_master",
  email: "action-master@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString("base64");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS = [
  ["00 · STUDIO MASTERCLASS", "Every surface, one live pass. Follow the path."],
  ["01 · QUICK SESSION", "Tempo, transport, channels, and one-tap starters."],
  ["02 · DRUM MACHINE", "Program kick, snare, hats. Swing it until it breathes."],
  ["03 · PIANO ROLL", "Draw, shorten, move, and velocity-edit every note."],
  ["04 · VOCAL SUITE", "Tune, comp, and polish the take before the mix."],
  ["05 · QUICK RECORDER", "Capture the idea while it is still hot."],
  ["06 · TUNER", "Check intonation before you print a bad note."],
  ["07 · CHORDS", "Load a progression, audition voicings, send it to Piano Roll."],
  ["08 · SOUND PADS", "Finger-drum the idea in real time."],
  ["09 · SYNTHESIZER", "Shape the tone at the source, not after."],
  ["10 · AI PRODUCER", "Generate a starting point, then edit it like you mean it."],
  ["11 · ARRANGEMENT", "Turn loops into sections. Sections into a record."],
  ["12 · SESSION VIEW", "Launch clips and scenes without stopping the room."],
  ["13 · CHANNEL RACK", "Every instrument, pattern, and layer in one inventory."],
  ["14 · SCORE VIEW", "Read the music, not just the grid."],
  ["15 · MIXER", "Drums first, bass locked, melody around them. Leave headroom."],
  ["16 · EFFECTS RACK", "Compression, EQ, and space, inserted where they belong."],
  ["17 · DJ BOOTH", "Move the crowd between records."],
  ["18 · MASTERING", "Loudness, tone, and translation before delivery."],
  ["19 · PERFORMANCE", "Trigger the set live, with the Studio behind you."],
  ["20 · SOUND BROWSER", "Audition sounds in context, not in isolation."],
  ["21 · SAMPLE LIBRARY", "Keep the raw material organized."],
  ["22 · SAMPLER", "Slice, map, and play the sample like an instrument."],
  ["23 · EXPORT", "Save the project. Render WAV, stems, MIDI. Studio quality."],
].map(([title, subtitle]) => ({ title, subtitle }));

const STEP_SECONDS = 5;
const TITLE_OFFSET = 0.8;
const TITLE_HOLD = 3.4;
const LOG = [];
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
page.setDefaultTimeout(12_000);
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
  log("lab · opening Image & Video Lab");
  await page.goto(`${BASE}/image-video-lab`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator(".cinema-shell").waitFor({ timeout: 90_000 });
  await sleep(1200);

  await page.locator(".production-mode-card", { hasText: "Music Videos" }).click();
  await sleep(350);
  await page.locator(".delivery-preset-card", { hasText: "Music Video Master" }).click();
  await sleep(350);
  await page.getByLabel("Export resolution").selectOption("1080p");
  await page.getByLabel("Export frame rate").selectOption("30");
  await page
    .getByLabel("Video export capture window in seconds")
    .selectOption("120");
  await page.getByLabel("Export codec").selectOption("webm");
  await page.getByLabel("Still image hold duration").selectOption("6");

  log("lab · loading 24-voice narration");
  await page
    .getByLabel("Add a music or voice bed from this device")
    .setInputFiles(AUDIO);
  await sleep(1200);

  log("lab · ingesting the 120-second action take");
  await setInputValue(page, "input.monitor-scrub", 0);
  await sleep(250);
  await page
    .getByLabel("Upload a video or image from this device")
    .setInputFiles(VIDEO);
  await sleep(6000);

  const clipText =
    (await page.locator(".selected-clip-toolbar").first().textContent())?.trim() ||
    "";
  log(`lab · selected clip: ${clipText || "not selected"}`);
  const durations = [...clipText.matchAll(/(\d+(?:\.\d+)?)s/g)].map((m) =>
    Number(m[1]),
  );
  const measured = durations.length ? Math.max(...durations) : 0;
  if (measured < 110) {
    throw new Error(
      `The lab did not measure the 120s action take (clip toolbar: ${clipText}).`,
    );
  }

  // Prove the end of the take is present before burning the title cards.
  await setInputValue(page, "input.monitor-scrub", 115);
  await sleep(700);
  await page.screenshot({
    path: path.join(OUT, "lab-action-115.png"),
    animations: "disabled",
  });
  await setInputValue(page, "input.monitor-scrub", 0);
  await sleep(350);

  await page.getByLabel("Title style").selectOption("lower-third");
  await page.getByLabel("Title position").selectOption("bottom");
  await setInputValue(
    page,
    'input[aria-label="Title hold duration"]',
    TITLE_HOLD,
  );

  for (let i = 0; i < STEPS.length; i += 1) {
    const step = STEPS[i];
    await setInputValue(
      page,
      "input.monitor-scrub",
      (i * STEP_SECONDS + TITLE_OFFSET).toFixed(2),
    );
    await page.getByLabel("Title text").fill(step.title);
    await page.getByLabel("Title subtitle").fill(step.subtitle);
    await page.getByRole("button", { name: /CUT TITLE IN/i }).click();
    await sleep(220);
    log(`lab · title ${step.title} at ${(i * STEP_SECONDS + TITLE_OFFSET).toFixed(2)}s`);
  }

  // Force the decoder through every stop before the real-time recorder starts.
  for (let i = 0; i < STEPS.length; i += 1) {
    await setInputValue(page, "input.monitor-scrub", i * STEP_SECONDS + 2);
    await sleep(220);
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

  const summary = (await page.locator(".export-summary").first().textContent())?.trim();
  log(`lab · export target ${summary || "unknown"}`);
  await page.screenshot({
    path: path.join(OUT, "lab-action-timeline.png"),
    animations: "disabled",
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
  await page.getByRole("button", { name: /EXPORT VIDEO/i }).click();
  log("lab · EXPORT VIDEO pressed");
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const destination = path.join(OUT, "studio-masterclass-action-tour.webm");
  await download.saveAs(destination);
  log(`lab · saved ${path.basename(destination)}`);

  const receipt = {
    exportedBy: "Image & Video Lab / EXPORT VIDEO",
    sourceVideo: path.basename(VIDEO),
    narration: path.basename(AUDIO),
    suggestedFilename: suggested,
    savedAs: path.basename(destination),
    bytes: statSync(destination).size,
    measuredSourceSeconds: measured,
    totalSeconds: STEPS.length * STEP_SECONDS,
    steps: STEPS.map((step, index) => ({
      ...step,
      atSeconds: index * STEP_SECONDS,
      titleAtSeconds: index * STEP_SECONDS + TITLE_OFFSET,
      durationSeconds: STEP_SECONDS,
    })),
    exportSummary: summary ?? null,
    consoleErrors,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(OUT, "studio-masterclass-action-export.json"),
    JSON.stringify(receipt, null, 2),
  );
  writeFileSync(
    path.join(OUT, "studio-masterclass-action-build.log"),
    LOG.join("\n") + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
