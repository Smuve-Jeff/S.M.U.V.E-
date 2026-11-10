#!/usr/bin/env node
/**
 * Build the two-minute Studio tour as two real Image & Video Lab exports.
 *
 * Each segment is 12 views x 5 seconds = 60 seconds, the lab's maximum capture
 * window. Both use the lab's own Music Video mode, media ingest, Title Cards,
 * audio bed, and EXPORT VIDEO button. The final join is a local ffmpeg step.
 */
import { chromium } from "playwright";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const FRAMES = path.resolve("artifacts/studio-tour-frames");
const OUT = path.resolve("artifacts");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "user_tour_exec",
  email: "tour@smuve.test",
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
  ["00-masterclass.png", "00 · STUDIO MASTERCLASS", "Guided paths, deep links, auto-checks. The whole Studio."],
  ["01-quick-session.png", "01 · QUICK SESSION", "Tempo, transport, channels, and one-tap starters."],
  ["02-drum-machine.png", "02 · DRUM MACHINE", "Program kick, snare, hats. Swing it until it breathes."],
  ["03-piano-roll.png", "03 · PIANO ROLL", "Draw, shorten, move, and velocity-edit every note."],
  ["04-vocal-suite.png", "04 · VOCAL SUITE", "Tune, comp, and polish the take before the mix."],
  ["05-quick-recorder.png", "05 · QUICK RECORDER", "Capture the idea while it is still hot."],
  ["06-tuner.png", "06 · TUNER", "Check intonation before you print a bad note."],
  ["07-chords.png", "07 · CHORDS", "Load a progression, audition voicings, send it to Piano Roll."],
  ["08-sound-pads.png", "08 · SOUND PADS", "Finger-drum the idea in real time."],
  ["09-synthesizer.png", "09 · SYNTHESIZER", "Shape the tone at the source, not after."],
  ["10-ai-producer.png", "10 · AI PRODUCER", "Generate a starting point, then edit it like you mean it."],
  ["11-arrangement.png", "11 · ARRANGEMENT", "Turn loops into sections. Sections into a record."],
  ["12-session-view.png", "12 · SESSION VIEW", "Launch clips and scenes without stopping the room."],
  ["13-channel-rack.png", "13 · CHANNEL RACK", "Every instrument, pattern, and layer in one inventory."],
  ["14-score-view.png", "14 · SCORE VIEW", "Read the music, not just the grid."],
  ["15-mixer.png", "15 · MIXER", "Drums first, bass locked, melody around them. Leave headroom."],
  ["16-effects-rack.png", "16 · EFFECTS RACK", "Compression, EQ, and space, inserted where they belong."],
  ["17-dj-booth.png", "17 · DJ BOOTH", "Move the crowd between records."],
  ["18-mastering.png", "18 · MASTERING", "Loudness, tone, and translation before delivery."],
  ["19-performance.png", "19 · PERFORMANCE", "Trigger the set live, with the Studio behind you."],
  ["20-sound-browser.png", "20 · SOUND BROWSER", "Audition sounds in context, not in isolation."],
  ["21-sample-library.png", "21 · SAMPLE LIBRARY", "Keep the raw material organized."],
  ["22-sampler.png", "22 · SAMPLER", "Slice, map, and play the sample like an instrument."],
  ["23-export.png", "23 · EXPORT", "Save the project. Render WAV, stems, MIDI. Studio quality."],
].map(([frame, title, subtitle]) => ({ frame, title, subtitle }));

const SEGMENTS = [
  {
    id: 1,
    steps: STEPS,
    audio: "artifacts/studio-tour-narration-full.mp3",
  },
];
const STEP_SECONDS = 5;
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

async function buildSegment(segment) {
  log(`Segment ${segment.id} · opening lab`);
  await page.goto(`${BASE}/image-video-lab`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator(".cinema-shell").waitFor({ timeout: 90_000 });
  await sleep(1200);

  await page.locator(".production-mode-card", { hasText: "Music Videos" }).click();
  await sleep(400);
  await page.locator(".delivery-preset-card", { hasText: "Music Video Master" }).click();
  await sleep(400);
  await page.getByLabel("Export resolution").selectOption("1080p");
  await page.getByLabel("Export frame rate").selectOption("30");
  await page.getByLabel("Video export capture window in seconds").selectOption("120");
  await page.getByLabel("Export codec").selectOption("webm");
  await page.getByLabel("Still image hold duration").selectOption("5");

  log(`Segment ${segment.id} · loading ${path.basename(segment.audio)}`);
  await page
    .getByLabel("Add a music or voice bed from this device")
    .setInputFiles(path.resolve(segment.audio));
  await sleep(1000);

  const mediaInput = page.getByLabel("Upload a video or image from this device");
  for (let i = 0; i < segment.steps.length; i += 1) {
    const step = segment.steps[i];
    await setInputValue(page, "input.monitor-scrub", i * STEP_SECONDS);
    await sleep(200);
    await mediaInput.setInputFiles(path.join(FRAMES, step.frame));
    await sleep(550);
    log(`Segment ${segment.id} · ingested ${step.frame} at ${i * STEP_SECONDS}s`);
  }

  await page.getByLabel("Title style").selectOption("lower-third");
  await page.getByLabel("Title position").selectOption("bottom");
  await setInputValue(page, 'input[aria-label="Title hold duration"]', 4);
  for (let i = 0; i < segment.steps.length; i += 1) {
    const step = segment.steps[i];
    await setInputValue(page, "input.monitor-scrub", i * STEP_SECONDS);
    await page.getByLabel("Title text").fill(step.title);
    await page.getByLabel("Title subtitle").fill(step.subtitle);
    await page.getByRole("button", { name: /CUT TITLE IN/i }).click();
    await sleep(180);
    log(`Segment ${segment.id} · title ${step.title}`);
  }

  // Force decode of every still before the recorder starts.
  for (let i = 0; i < segment.steps.length; i += 1) {
    await setInputValue(page, "input.monitor-scrub", i * STEP_SECONDS + 1);
    await sleep(260);
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
    path: path.join(OUT, `studio-tour-segment-${segment.id}-timeline.png`),
    animations: "disabled",
  });

  const summary = (await page.locator(".export-summary").first().textContent())?.trim();
  log(`Segment ${segment.id} · export target ${summary}`);

  const downloadPromise = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByRole("button", { name: /EXPORT VIDEO/i }).click();
  log(`Segment ${segment.id} · EXPORT VIDEO pressed`);
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const extension = path.extname(suggested) || ".webm";
  const destination = path.join(OUT, `studio-masterclass-full-tour${extension}`);
  await download.saveAs(destination);
  log(`Segment ${segment.id} · saved ${path.basename(destination)}`);

  await sleep(1000);
  await page.screenshot({
    path: path.join(OUT, `studio-tour-segment-${segment.id}-complete.png`),
    animations: "disabled",
  });

  return {
    id: segment.id,
    suggestedFilename: suggested,
    savedAs: path.basename(destination),
    bytes: statSync(destination).size,
    exportSummary: summary ?? null,
    steps: segment.steps.map((step, index) => ({
      ...step,
      atSeconds: index * STEP_SECONDS,
      durationSeconds: STEP_SECONDS,
    })),
    narration: path.basename(segment.audio),
  };
}

try {
  const results = [];
  for (const segment of SEGMENTS) {
    results.push(await buildSegment(segment));
  }
  const receipt = {
    exportedBy: "Image & Video Lab / EXPORT VIDEO",
    segments: results,
    totalSeconds: STEPS.length * STEP_SECONDS,
    consoleErrors,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(OUT, "studio-tour-export.json"),
    JSON.stringify(receipt, null, 2),
  );
  writeFileSync(
    path.join(OUT, "studio-tour-build.log"),
    LOG.join("\n") + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
