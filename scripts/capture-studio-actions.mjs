#!/usr/bin/env node
/**
 * Record a real-time 120-second Studio action tour.
 *
 * Each of the 24 Masterclass stops gets a live interaction with the component,
 * not a static screenshot. Playwright records the 1920x1080 page; the last 120
 * seconds are trimmed to the tour window and handed to the Image & Video Lab.
 *
 *   node scripts/capture-studio-actions.mjs --dry
 *   node scripts/capture-studio-actions.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const DRY = process.env.DRY === "1" || process.argv.includes("--dry");
const ONLY = process.env.ONLY_SURFACE || "";
const SINGLE_SECONDS = Number(process.env.SINGLE_SECONDS || 20);
const SLOT_MS = DRY ? 3000 : 5000;
const OUT = path.resolve("artifacts");
const VIDEO_DIR = path.join(OUT, "studio-action-video");
const CHECK_DIR = path.join(OUT, "studio-action-check");
const CLIP_DIR = path.join(OUT, "studio-lessons", "clips");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "/tmp/smuve-media/node_modules/ffmpeg-static/ffmpeg";
mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(CHECK_DIR, { recursive: true });
mkdirSync(CLIP_DIR, { recursive: true });

const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
const USER = {
  id: "user_action_tour",
  email: "action-tour@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString("base64");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logLines = [];
const log = (line) => {
  logLines.push(line);
  console.log(line);
};
const failures = [];

const STOPS = [
  "00 · STUDIO MASTERCLASS",
  "01 · QUICK SESSION",
  "02 · DRUM MACHINE",
  "03 · PIANO ROLL",
  "04 · VOCAL SUITE",
  "05 · QUICK RECORDER",
  "06 · TUNER",
  "07 · CHORDS",
  "08 · SOUND PADS",
  "09 · SYNTHESIZER",
  "10 · AI PRODUCER",
  "11 · ARRANGEMENT",
  "12 · SESSION VIEW",
  "13 · CHANNEL RACK",
  "14 · SCORE VIEW",
  "15 · MIXER",
  "16 · EFFECTS RACK",
  "17 · DJ BOOTH",
  "18 · MASTERING",
  "19 · PERFORMANCE",
  "20 · SOUND BROWSER",
  "21 · SAMPLE LIBRARY",
  "22 · SAMPLER",
  "23 · EXPORT",
];

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
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  ...(DRY
    ? {}
    : {
        recordVideo: {
          dir: VIDEO_DIR,
          size: { width: 1920, height: 1080 },
        },
      }),
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve_onboarding_complete", "1");
    localStorage.setItem("smuve.studio.guide.progress.v1", "[]");
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

const page = await context.newPage();
page.setDefaultTimeout(4000);
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`PAGEERROR ${error.message}`));

async function attempt(stop, name, fn) {
  try {
    await fn();
    log(`${stop} · ${name} · ok`);
    return true;
  } catch (error) {
    const detail = String(error?.message || error).split("\n")[0];
    failures.push({ stop, action: name, error: detail });
    log(`${stop} · ${name} · FAILED · ${detail}`);
    return false;
  }
}

async function rail(label) {
  const button = page.getByRole("button", { name: `Switch to ${label} view` }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await sleep(450);
}

async function clickRole(name, options = {}) {
  await page.getByRole("button", { name, ...options }).first().click();
}

async function clickLabel(name) {
  await page.getByLabel(name, { exact: true }).first().click();
}

async function setRange(label, value) {
  const locator = page.getByLabel(label, { exact: true });
  await locator.evaluate((el, next) => {
    el.value = String(next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function openGuide() {
  const guide = page.getByRole("button", {
    name: "Open the Studio Masterclass tutorial",
    exact: true,
  });
  await guide.scrollIntoViewIfNeeded();
  await guide.click();
  await page.locator("app-studio-guide").waitFor({ state: "visible", timeout: 15_000 });
  await sleep(350);
}

async function closeGuide() {
  const close = page.getByLabel("Close the Studio Masterclass");
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await sleep(350);
}

async function prepare() {
  log("setup · loading a real starter session");
  await page.goto(`${BASE}/studio?guide=first-loop&lesson=loop-groove`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-studio-guide").waitFor({ state: "visible", timeout: 90_000 });
  await page.getByRole("button", { name: "Load a starter groove", exact: true }).click();
  await page.locator("app-guide-completion").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Keep working", exact: true }).click();
  await sleep(700);
  const pro = page.getByRole("button", { name: /SHOW PRO MODE/i });
  if (await pro.isVisible().catch(() => false)) {
    await pro.click();
    await sleep(500);
  }
  const close = page.getByLabel("Close the Studio Masterclass");
  if (await close.isVisible().catch(() => false)) await close.click();
  await sleep(400);
}

async function actionQuickSession() {
  await attempt("Quick Session", "loop toggle", () =>
    clickRole(/Turn (ON|OFF) loop region/i),
  );
  await attempt("Quick Session", "transport play", () =>
    page.locator(".ctb-play").first().click(),
  );
}

async function actionDrumMachine() {
  await attempt("Drum Machine", "House style", () =>
    clickRole("Switch to House style"),
  );
  await attempt("Drum Machine", "kick pad", () =>
    page.locator(".dm-pad").first().click(),
  );
  await attempt("Drum Machine", "randomize beat", () =>
    clickRole(/Randomize/i),
  );
}

async function actionPianoRoll() {
  await attempt("Piano Roll", "draw tool", () => clickLabel("Draw tool"));
  await attempt("Piano Roll", "key audition", () =>
    page.locator(".pr-key").nth(21).click(),
  );
  await attempt("Piano Roll", "draw note", async () => {
    await page.mouse.click(900, 720);
    await sleep(250);
  });
}

async function actionVocalSuite() {
  await attempt("Vocal Suite", "record stage", () => clickLabel("Step 2: record"));
  await attempt("Vocal Suite", "pipeline mode", () => clickLabel("Pipeline mode"));
}

async function actionRecorder() {
  await attempt("Quick Recorder", "refresh input", () =>
    clickLabel("Refresh input devices"),
  );
  await attempt("Quick Recorder", "measure latency", () =>
    clickRole("MEASURE", { exact: true }),
  );
}

async function actionTuner() {
  await attempt("Tuner", "start tuner", () => clickRole("Start the tuner"));
}

async function actionChords() {
  await attempt("Chords", "dominant seventh", () =>
    clickRole("7", { exact: true }),
  );
  await attempt("Chords", "add progression", () =>
    clickRole("+ Add", { exact: true }),
  );
}

async function actionSoundPads() {
  await attempt("Sound Pads", "kick pad", async () => {
    await page.mouse.click(488, 620);
    await sleep(220);
  });
  await attempt("Sound Pads", "snare pad", async () => {
    await page.mouse.click(882, 620);
    await sleep(220);
  });
}

async function actionSynth() {
  await attempt("Synthesizer", "bass preset", () =>
    clickLabel("Load BASS preset"),
  );
  await attempt("Synthesizer", "saw waveform", () =>
    clickLabel("Select sawtooth waveform"),
  );
}

async function actionAiProducer() {
  await attempt("AI Producer", "prompt", () =>
    page
      .locator('.comp-view input[type="text"]')
      .first()
      .fill("midnight rooftop, heavy 808, ominous strings"),
  );
  await attempt("AI Producer", "hip hop style", () =>
    page.locator(".comp-view select").first().selectOption({ index: 1 }),
  );
}

async function actionArrangement() {
  await attempt("Arrangement", "draw mode", () => clickLabel("Draw edit mode"));
  await attempt("Arrangement", "place clip", async () => {
    await page.mouse.click(900, 560);
    await sleep(200);
  });
  await attempt("Arrangement", "song mode", () =>
    clickLabel("Toggle playback mode"),
  );
}

async function actionSession() {
  await attempt("Session View", "launch scene", () =>
    clickLabel("Launch scene Pattern 1"),
  );
}

async function actionChannelRack() {
  await attempt("Channel Rack", "mute channel", () =>
    clickLabel("Mute Neon Stab"),
  );
  await attempt("Channel Rack", "add channel", () =>
    clickLabel("Add a new channel"),
  );
}

async function actionScore() {
  await attempt("Score View", "select note", async () => {
    await page.mouse.click(400, 640);
    await sleep(220);
  });
}

async function actionMixer() {
  await attempt("Mixer", "rough balance", () =>
    clickRole(/Rough Balance/i),
  );
  await attempt("Mixer", "fader drag", async () => {
    const cap = page.locator(".mix-fader-cap").first();
    const box = await cap.boundingBox();
    if (!box) throw new Error("no fader cap");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 36, { steps: 8 });
    await page.mouse.up();
  });
}

async function actionEffects() {
  await attempt("Effects Rack", "dynamics insert", () =>
    page
      .locator(".comp-view button")
      .filter({ hasText: "DYNAMICS PROCESSOR" })
      .first()
      .click({ force: true }),
  );
  await attempt("Effects Rack", "turn knob", () =>
    page.locator(".knob-wrapper").first().click({ force: true }),
  );
}

async function actionDj() {
  await attempt("DJ Booth", "hamster toggle", () =>
    clickRole(/HAMSTER OFF/i),
  );
  await attempt("DJ Booth", "deck knob", () =>
    page.locator(".vknob").first().click(),
  );
}

async function actionMastering() {
  await attempt("Mastering", "Spotify target", () =>
    page.getByRole("button", { name: /Spotify -14 LUFS/ }).click(),
  );
}

async function actionPerformance() {
  await attempt("Performance", "kick pad", () =>
    page.locator(".performance-pad").first().click(),
  );
  await attempt("Performance", "snare pad", () =>
    page.locator(".performance-pad").nth(1).click(),
  );
}

async function actionSoundBrowser() {
  await attempt("Sound Browser", "search dark", () =>
    page.getByLabel("Search sound presets").fill("dark"),
  );
}

async function actionSampleLibrary() {
  await attempt("Sample Library", "drums filter", () =>
    page.getByRole("button", { name: /Drums 11/ }).click(),
  );
}

async function actionSampler() {
  await attempt("Sampler", "import sample", async () => {
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
    await page.getByRole("button", { name: /Import Sample/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path.resolve("artifacts/sampler-demo.wav"));
    await sleep(1400);
  });
  await attempt("Sampler", "slice into pads", () =>
    page.getByRole("button", { name: /Slice ×8/ }).click(),
  );
}

async function actionExport() {
  await attempt("Export", "24-bit wav", () =>
    page.locator(".comp-view select").nth(0).selectOption({ label: "WAV 24-bit" }),
  );
  await attempt("Export", "48 khz", () =>
    page.locator(".comp-view select").nth(1).selectOption({ label: "48 kHz" }),
  );
}

const ACTIONS = [
  ["Quick Session", actionQuickSession],
  ["Drum Machine", actionDrumMachine],
  ["Piano Roll", actionPianoRoll],
  ["Vocal Suite", actionVocalSuite],
  ["Quick Recorder", actionRecorder],
  ["Tuner", actionTuner],
  ["Chords", actionChords],
  ["Sound Pads", actionSoundPads],
  ["Synthesizer", actionSynth],
  ["AI Producer", actionAiProducer],
  ["Arrangement", actionArrangement],
  ["Session View", actionSession],
  ["Channel Rack", actionChannelRack],
  ["Score View", actionScore],
  ["Mixer", actionMixer],
  ["Effects Rack", actionEffects],
  ["DJ Booth", actionDj],
  ["Mastering", actionMastering],
  ["Performance", actionPerformance],
  ["Sound Browser", actionSoundBrowser],
  ["Sample Library", actionSampleLibrary],
  ["Sampler", actionSampler],
  ["Export", actionExport],
];

async function dismissCompletionToast() {
  const keep = page.getByRole("button", { name: "Keep working", exact: true });
  if (await keep.isVisible().catch(() => false)) {
    await keep.click();
    await sleep(160);
  }
}

async function runStop(stop, action) {
  const started = Date.now();
  await dismissCompletionToast();
  if (action) {
    await action();
  } else {
    await openGuide();
    log(`${stop} · guide opened`);
  }
  await dismissCompletionToast();
  if (DRY) {
    await page.screenshot({
      path: path.join(CHECK_DIR, `${stop.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`),
      animations: "disabled",
    });
  }
  const remaining = SLOT_MS - (Date.now() - started);
  if (remaining > 0) await sleep(remaining);
}

let rawVideoPath = null;
let video = null;
try {
  await prepare();
  video = DRY ? null : page.video();

  if (ONLY) {
    if (ONLY === "Masterclass") {
      await openGuide();
      log("Masterclass · guide opened");
      const end = Date.now() + SINGLE_SECONDS * 1000;
      while (Date.now() < end) {
        for (const tab of ["Full Song", "Studio Atlas", "Beginner"]) {
          const tabButton = page
            .getByRole("button", { name: new RegExp(tab, "i") })
            .first();
          if (await tabButton.isVisible().catch(() => false)) {
            await tabButton.click().catch(() => {});
            await sleep(900);
          }
        }
      }
    } else {
      await attempt(ONLY, "open surface", () => rail(ONLY));
      const action = ACTIONS.find(([name]) => name === ONLY)?.[1];
      const end = Date.now() + SINGLE_SECONDS * 1000;
      while (Date.now() < end) {
        await dismissCompletionToast();
        if (action) await action();
        await sleep(1200);
      }
    }
    await sleep(400);
    log(`single clip ${ONLY} · ${SINGLE_SECONDS}s`);
  } else {
    await runStop(STOPS[0], null);
    await attempt("Studio", "close guide", closeGuide);

    for (let index = 1; index < STOPS.length; index += 1) {
      const label = STOPS[index].replace(/^\d+ · /, "");
      await attempt(label, "open surface", () => rail(label));
      await runStop(STOPS[index], ACTIONS[index - 1][1]);
      log(`${STOPS[index]} · ${SLOT_MS / 1000}s`);
    }

    await sleep(900);
    log(`recorded ${DRY ? "dry run" : "video"}`);
  }
} finally {
  await context.close();
  await browser.close();
}

if (video) {
  rawVideoPath = await video.path();
  log(`video finalized ${rawVideoPath}`);
}

if (ONLY) {
  const slug = ONLY.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const clip = path.join(CLIP_DIR, `${slug}.webm`);
  const trim = spawnSync(
    FFMPEG,
    [
      "-y",
      "-sseof",
      `-${SINGLE_SECONDS}`,
      "-i",
      rawVideoPath,
      "-t",
      String(SINGLE_SECONDS),
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "28",
      "-row-mt",
      "1",
      "-cpu-used",
      "8",
      "-deadline",
      "realtime",
      clip,
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  );
  if (trim.status !== 0) {
    console.error(trim.stderr);
    process.exit(1);
  }
  const probe = spawnSync(FFMPEG, ["-i", clip], { encoding: "utf8" });
  const duration = /Duration: ([0-9:.]+)/.exec(probe.stderr || "");
  writeFileSync(
    path.join(CLIP_DIR, `${slug}.json`),
    JSON.stringify(
      {
        label: ONLY,
        slug,
        clip: path.basename(clip),
        duration: duration?.[1] ?? null,
        failures,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(`CLIP_SAVED ${clip} ${duration?.[1] ?? ""}`);
  process.exit(0);
}

if (DRY) {
  writeFileSync(
    path.join(OUT, "studio-action-dry-run.json"),
    JSON.stringify({ stops: STOPS.length, failures, consoleErrors }, null, 2),
  );
  console.log(`DRY RUN: ${failures.length} failed actions`);
  process.exit(failures.length > 0 ? 2 : 0);
}

const ffmpeg = FFMPEG;
const trimmed = path.join(OUT, "studio-actions-120.webm");
const trim = spawnSync(
  ffmpeg,
  [
    "-y",
    "-sseof",
    "-120",
    "-i",
    rawVideoPath,
    "-t",
    "120",
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "30",
    "-row-mt",
    "1",
    "-cpu-used",
    "8",
    "-deadline",
    "realtime",
    trimmed,
  ],
  { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
);
if (trim.status !== 0) {
  console.error(trim.stderr);
  process.exit(1);
}
const probe = spawnSync(ffmpeg, ["-i", trimmed], { encoding: "utf8" });
const duration = /Duration: ([0-9:.]+)/.exec(probe.stderr || "");
const receipt = {
  recordedAt: new Date().toISOString(),
  rawVideoPath,
  trimmedVideo: path.basename(trimmed),
  duration: duration?.[1] ?? null,
  stops: STOPS.map((stop, index) => ({
    title: stop,
    atSeconds: index * 5,
    durationSeconds: 5,
  })),
  failures,
  consoleErrors,
};
writeFileSync(
  path.join(OUT, "studio-action-receipt.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt, null, 2));
