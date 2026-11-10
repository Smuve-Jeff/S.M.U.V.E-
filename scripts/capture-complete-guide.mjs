#!/usr/bin/env node
/**
 * Capture the real application surfaces used by the complete guide.
 *
 * The build is served at BASE_URL (default http://127.0.0.1:3000). The script
 * injects the same local test session used by the other tutorial captures, so
 * it never needs a live account or backend. API requests are answered with a
 * harmless empty envelope, and the screenshots are taken at 1280x720.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = path.resolve("artifacts/complete-app-guide/screens");
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
mkdirSync(OUT, { recursive: true });

// Headless Chromium needs a real fontconfig file or Skia aborts while shaping
// the first glyph. Point fontconfig at the fonts available in this workspace.
const FONT_DIRS = [
  "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf",
  "/usr/share/fonts/truetype/dejavu",
  "/usr/share/fonts",
];
const fontDir = FONT_DIRS.find((dir) => existsSync(dir));
if (!fontDir) throw new Error("No font directory available for capture");
const fontConfig = path.join(tmpdir(), "smuve-complete-guide-fonts.conf");
const fontCache = path.join(tmpdir(), "smuve-complete-guide-font-cache");
mkdirSync(fontCache, { recursive: true });
writeFileSync(
  fontConfig,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${fontCache}</cachedir>
  <config></config>
</fontconfig>
`
);
process.env.FONTCONFIG_FILE = fontConfig;
process.env.FONTCONFIG_PATH = path.dirname(fontConfig);

const USER = {
  id: "user_complete_app_guide",
  email: "completeguide@smuve.test",
  artistName: "Executive Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString(
  "base64"
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SHOTS = [
  { name: "01-shell", route: "/hub", settle: 2800 },
  { name: "02-hub", route: "/hub", settle: 2800, scroll: 560 },
  { name: "03-studio", route: "/studio", settle: 4200 },
  { name: "04-performance", route: "/performance", settle: 3600 },
  { name: "05-composer", route: "/composer", settle: 3600 },
  { name: "06-lab", route: "/image-video-lab", settle: 4200 },
  { name: "07-spot", route: "/tha-spot", settle: 4200 },
  { name: "08-career", route: "/career", settle: 3600 },
  { name: "09-release", route: "/release-pipeline", settle: 3600 },
  { name: "10-command", route: "/command-center", settle: 3600 },
  { name: "11-community", route: "/remix-arena", settle: 3600 },
  { name: "12-system", route: "/settings", settle: 3200 },
  { name: "13-workflow", route: "/projects", settle: 3200 },
];

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
  colorScheme: "dark",
});
await context.addInitScript(
  ({ session }) => {
    // OAuth helper pages call window.close; keep the capture tab alive.
    window.close = () => undefined;
    sessionStorage.setItem("smuve_auth_session", session);
    localStorage.setItem("smuve_onboarding_complete", "1");
    localStorage.setItem("smuve_music_map_seen", "1");
    localStorage.setItem("smuve.complete-app-guide.progress.v1", "[]");
  },
  { session: SESSION }
);
await context.route("**/api/**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: null }),
  })
);
await context.route("**/socket.io/**", (route) => route.abort());

const page = await context.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(`PAGEERROR ${error.message}`));

const receipts = [];
for (const shot of SHOTS) {
  try {
    await page.goto(`${BASE}${shot.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.locator(".app-content").waitFor({
      state: "visible",
      timeout: 40_000,
    });
    await sleep(shot.settle);
    if (shot.scroll) {
      await page.evaluate((top) => {
        const candidates = [
          document.querySelector(".route-anim-host"),
          document.querySelector(".content-scroll-container"),
        ].filter((element) => element);
        const target =
          candidates.find(
            (element) => element.scrollHeight > element.clientHeight + 40
          ) || candidates[0];
        target?.scrollTo({ top, behavior: "instant" });
      }, shot.scroll);
      await sleep(900);
    }
    const file = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    const size = (await import("node:fs")).statSync(file).size;
    receipts.push({ ...shot, file, bytes: size });
    console.log(`capture · ${shot.name} · ${Math.round(size / 1024)} KB`);
  } catch (error) {
    failures.push(`${shot.name}: ${error.message}`);
    console.error(`capture failed · ${shot.name}: ${error.message}`);
  }
}

writeFileSync(
  path.join(OUT, "captures.json"),
  JSON.stringify({ base: BASE, shots: receipts, failures }, null, 2)
);
await browser.close();
if (receipts.length === 0) {
  console.error("No surfaces captured.");
  process.exit(1);
}
console.log(`\ncaptured ${receipts.length}/${SHOTS.length} surfaces`);
if (failures.length) console.log(`warnings:\n${failures.join("\n")}`);
