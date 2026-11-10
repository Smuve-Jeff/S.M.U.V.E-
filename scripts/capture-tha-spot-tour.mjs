#!/usr/bin/env node
/**
 * Record a real, scripted tour of Tha Spot for the feature video.
 *
 *   node scripts/capture-tha-spot-tour.mjs
 *
 * Produces artifacts/tha-spot-video/raw/*.webm, stills, and marks.json.
 * The marks are measured from page creation so the video builder can cut
 * each stop without guessing at timings.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4310";
const OUT = path.resolve("artifacts/tha-spot-video");
const RAW = path.join(OUT, "raw");
const STILLS = path.join(OUT, "stills");
mkdirSync(RAW, { recursive: true });
mkdirSync(STILLS, { recursive: true });

const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
const USER = {
  id: "user_spot_tour",
  email: "spot-tour@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString("base64");

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  recordVideo: { dir: RAW, size: { width: 1280, height: 720 } },
});
await context.addInitScript(
  ({ session }) => {
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve_onboarding_complete", "1");
    localStorage.setItem("tha_spot_favorites", JSON.stringify([]));
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
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 180)}`);
});

const t0 = Date.now();
const marks = [];
const exitTv = async () => {
  if (!(await page.locator("app-smuve-tv").count())) return;
  const exit = page.locator("app-smuve-tv").getByText("EXIT", { exact: false }).first();
  if (await exit.count()) await exit.click().catch(() => {});
  await page.waitForTimeout(1200);
};
const ensureHub = async () => {
  if (await page.locator(".rival-hub.active").count()) return;
  await page.locator(".rival-hub-toggle").click().catch(() => {});
  await page.waitForTimeout(800);
};
const at = () => (Date.now() - t0) / 1000;
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/tha-spot`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".browse-view, .spot-header", { timeout: 30000 }).catch(() => {});
await sleep(2500);
await page.screenshot({ path: path.join(STILLS, "00-loaded.png") });

async function clickText(scope, text, timeout = 5000) {
  const spot = page.locator(scope).getByText(text, { exact: false }).first();
  await spot.click({ timeout });
}

async function segment(id, label, actionMs, fn) {
  const start = at();
  try {
    await fn();
  } catch (e) {
    console.log(`SEG ${id}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
    await page.screenshot({ path: path.join(STILLS, `${id}-error.png`) }).catch(() => {});
  }
  await sleep(actionMs);
  const end = at();
  marks.push({ id, label, start, end });
  await page.screenshot({ path: path.join(STILLS, `${id}.png`) }).catch(() => {});
  console.log(`${id.padEnd(10)} ${start.toFixed(2)}s -> ${end.toFixed(2)}s`);
}

// 1 — command deck: header controls + mode switch.
await segment("command", "THE COMMAND DECK", 11000, async () => {
  await page.locator(".header-center input").first().hover().catch(() => {});
  await page.locator(".mode-btn", { hasText: "S.M.U.V.E TV" }).first().click();
  await sleep(2400);
  await exitTv();
  await sleep(800);
});

// 2 — the floor: cinematic hero + stats.
await segment("floor", "THE FLOOR", 11000, async () => {
  await exitTv();
  await page.locator(".spot-main-content").evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1800);
});

// 3 — filters + recommendation rails.
await segment("filters", "FILTER THE NOISE", 11000, async () => {
  const row = page.locator(".catalog-filters-row");
  await row.scrollIntoViewIfNeeded();
  await row.locator("select").nth(1).selectOption({ index: 2 }).catch(() => {});
  await sleep(1500);
  await row.locator("select").nth(2).selectOption({ index: 1 }).catch(() => {});
  await sleep(1500);
  await row.locator(".clear-btn").click().catch(() => {});
  await page.locator(".recommendation-rails").scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1200);
});

// 4 — search + instant filter state.
await segment("search", "SEARCH & DESTROY", 10000, async () => {
  await page.locator(".spot-main-content").evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  const input = page.locator(".header-center input").first();
  await input.click();
  await input.fill("racing");
  await sleep(2600);
  await input.fill("");
  await sleep(900);
});

// 5 — room district.
await segment("room", "ROOM DISTRICTS", 10000, async () => {
  await page.locator(".hero-btn-primary").first().click();
  await sleep(2600);
});

// 6 — cabinet briefing.
await segment("mission", "MISSION BRIEFING", 10000, async () => {
  await page.locator(".catalog-grid .game-card, .browse-view .game-card").first().click();
  await page.waitForSelector(".launch-mission-page.active", { timeout: 5000 }).catch(() => {});
  await sleep(2200);
});

// 7 — launch contract / external-domain guard.
await segment("launch", "LAUNCH CONTRACT", 10000, async () => {
  await page.locator(".launch-btn-ultra").first().click();
  await sleep(2200);
  await page.locator(".matchmaking-overlay button", { hasText: "CANCEL" }).last().click({ timeout: 1500 }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(600);
});

// 8 — rails, badges, and the rotation.
await segment("rotation", "YOUR ROTATION", 8000, async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".launch-mission-page button").last().click({ timeout: 1500 }).catch(() => {});
  await sleep(500);
  await page.locator(".spot-main-content").evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(600);
  await page.locator(".recommendation-rails").scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1200);
  await page.locator(".recommendation-rails .game-card").nth(2).hover().catch(() => {});
  await sleep(1200);
});

// 9 — one-tap lobby straight from a multiplayer card.
await segment("lobbies", "INSTANT LOBBIES", 9000, async () => {
  const quick = page.locator(".card-quick-lobby").first();
  await quick.scrollIntoViewIfNeeded().catch(() => {});
  await quick.dispatchEvent("click").catch(() => quick.click({ force: true }).catch(() => {}));
  await sleep(2400);
});

// 8 — squad / co-op matchmaking.
await segment("squad", "SQUAD UP", 11000, async () => {
  const abort = page.locator("button", { hasText: "ABORT" }).first();
  if (await abort.count()) await abort.click().catch(() => {});
  const close = page.locator(".console-actions .icon-btn").last();
  if (await close.count()) await close.click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(400);
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(".mission-close, [aria-label=\"Close mission\"]").first().click().catch(() => {});
  await sleep(900);
  await ensureHub();
  await clickText(".hub-tabs", "SQUAD");
  await sleep(2200);
});

// 9 — network: friends + DMs.
await segment("network", "THE NETWORK", 10000, async () => {
  await ensureHub();
  await clickText(".hub-tabs", "NET");
  await sleep(2200);
  await clickText(".hub-tabs", "DM");
  await sleep(1800);
});

// 10 — rival hub.
await segment("hub", "THE RIVAL HUB", 11000, async () => {
  await ensureHub();
  await clickText(".hub-tabs", "ROOM");
  await sleep(2600);
});

// 11 — daily ops contracts.
await segment("ops", "DAILY OPS", 11000, async () => {
  await ensureHub();
  await page.locator('.hub-tabs button[title="Daily Ops"]').click();
  await sleep(2400);
});

// 12 — strategic intel.
await segment("intel", "STRATEGIC INTEL", 10000, async () => {
  await page.locator('[aria-label="Open strategic intel"]').first().click();
  await sleep(2600);
});

// 12 — go live console.
await segment("live", "GO LIVE", 11000, async () => {
  await page.locator('[aria-label="Open strategic intel"]').first().click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(700);
  await ensureHub();
  await clickText(".hub-tabs", "LIVE");
  await sleep(2400);
});

// 13 — S.M.U.V.E TV broadcast.
await segment("tv", "S.M.U.V.E TV", 12000, async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await exitTv();
  await page.locator(".mode-btn", { hasText: "S.M.U.V.E TV" }).first().click();
  await sleep(3000);
});

// 14 — Smuve Jeff Radio, the TV guide's fixed route into the catalogue.
await segment("radio", "S.M.U.V.E. JEFF RADIO", 13000, async () => {
  await page.locator(".tv-featured").first().click();
  await sleep(3600);
});

await sleep(800);
const video = page.video();
await context.close();
const rawPath = await video.path();
const tourPath = path.join(OUT, "tour.webm");
copyFileSync(rawPath, tourPath);
await browser.close();

const payload = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  tourPath,
  duration: at(),
  marks,
  errors: errors.slice(0, 40),
};
writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(payload, null, 2));
console.log(`\nvideo: ${tourPath}`);
console.log(`marks: ${marks.length} stops, ${at().toFixed(1)}s capture, ${errors.length} console errors`);
for (const e of payload.errors.slice(0, 8)) console.log("  " + e);
