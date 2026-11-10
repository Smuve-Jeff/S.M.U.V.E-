#!/usr/bin/env node
/**
 * Capture the full Studio tour for the two-minute how-to.
 *
 * The Masterclass loads a real starter groove, then the script walks the actual
 * Studio rail view by view. These frames become the visuals the Image & Video
 * Lab cuts into two 60-second masters.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const OUT = path.resolve("artifacts/studio-tour-frames");
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

const SURFACES = [
  ["Drum Machine", "drum-machine"],
  ["Piano Roll", "piano-roll"],
  ["Vocal Suite", "vocal-suite"],
  ["Quick Recorder", "quick-recorder"],
  ["Tuner", "tuner"],
  ["Chords", "chords"],
  ["Sound Pads", "sound-pads"],
  ["Synthesizer", "synthesizer"],
  ["AI Producer", "ai-producer"],
  ["Arrangement", "arrangement"],
  ["Session View", "session-view"],
  ["Channel Rack", "channel-rack"],
  ["Score View", "score-view"],
  ["Mixer", "mixer"],
  ["Effects Rack", "effects-rack"],
  ["DJ Booth", "dj-booth"],
  ["Mastering", "mastering"],
  ["Performance", "performance"],
  ["Sound Browser", "sound-browser"],
  ["Sample Library", "sample-library"],
  ["Sampler", "sampler"],
  ["Export", "export"],
];

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
  ({ session }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve_onboarding_complete", "1");
    localStorage.setItem("smuve.studio.guide.progress.v1", "[]");
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

const shot = async (index, name) => {
  await sleep(1400);
  const file = `${String(index).padStart(2, "0")}-${name}.png`;
  await page.screenshot({
    path: path.join(OUT, file),
    animations: "disabled",
  });
  console.log(`frame · ${file}`);
  return file;
};

try {
  await page.goto(`${BASE}/studio?guide=first-loop&lesson=loop-sound`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-studio-guide").waitFor({ state: "visible", timeout: 90_000 });
  await page.getByText("Hear your first sound", { exact: true }).first().waitFor();
  await sleep(1200);
  const frames = [];
  frames.push(await shot(0, "masterclass"));

  // Load the starter through the real lesson action, then leave the beginner overlay.
  await page.goto(`${BASE}/studio?guide=first-loop&lesson=loop-groove`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("app-studio-guide").waitFor({ state: "visible", timeout: 90_000 });
  await page
    .getByRole("button", { name: "Load a starter groove", exact: true })
    .click();
  await page.locator("app-guide-completion").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Keep working", exact: true }).click();
  await sleep(700);
  const proMode = page.getByRole("button", { name: /SHOW PRO MODE/i });
  if (await proMode.isVisible().catch(() => false)) {
    await proMode.click();
    await sleep(900);
  }
  await page.locator(".comp-canvas").waitFor({ state: "visible", timeout: 30_000 });
  await sleep(900);
  frames.push(await shot(1, "quick-session"));

  for (let i = 0; i < SURFACES.length; i += 1) {
    const [label, slug] = SURFACES[i];
    const button = page.getByRole("button", {
      name: `Switch to ${label} view`,
    });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.locator(".comp-canvas").waitFor({ state: "visible", timeout: 30_000 });
    frames.push(await shot(i + 2, slug));
  }

  const manifest = {
    frames,
    surfaces: ["Studio Masterclass", "Quick Session", ...SURFACES.map(([label]) => label)],
    consoleErrors,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT, "capture.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser.close();
}
