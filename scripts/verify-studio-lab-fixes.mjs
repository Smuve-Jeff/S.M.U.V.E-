#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4311";
const AUTH_SALT = process.env.AUTH_SALT || "SMUVE_SALT_V4_SECURE_HASH";
const USER = {
  id: "user_fix_verify",
  email: "verify@smuve.test",
  artistName: "Verification Artist",
  role: "Artist",
  permissions: ["STANDARD"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  profileCompleteness: 100,
};
const SESSION = Buffer.from(`${JSON.stringify(USER)}|${AUTH_SALT}`).toString("base64");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
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
await context.route("**/api/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"data":null}' }),
);
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));

await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.locator(".cinema-shell, .comp-shell").first().waitFor({ timeout: 90_000 });
await sleep(1500);

const rail = await page.locator(".comp-rail-scroll .comp-rail-item").evaluateAll((els) =>
  els.slice(0, 6).map((el) => {
    const label = el.querySelector(".comp-rail-label");
    return {
      label: el.textContent?.trim(),
      title: el.getAttribute("title"),
      width: el.getBoundingClientRect().width,
      labelDisplay: label ? getComputedStyle(label).display : null,
    };
  }),
);

await page.getByLabel("Open the Studio Masterclass tutorial").click();
await page.locator(".sg-shell").waitFor({ timeout: 30_000 });
await sleep(1500);
const tabs = await page.locator(".sg-tab").evaluateAll((els) =>
  els.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent?.trim(),
      left: Math.round(r.left),
      right: Math.round(r.right),
      overflow: getComputedStyle(el).overflow,
      clipped: el.scrollHeight > el.clientHeight + 1,
    };
  }),
);
const overlap = tabs.some((tab, i) => i > 0 && tab.left < tabs[i - 1].right - 1);
const tabClipped = tabs.some((tab) => tab.clipped);
const instructor = await page.locator(".sg-instructor").innerText().catch(() => null);
await page.screenshot({ path: "artifacts/studio-guide-1280-fixed.png", animations: "disabled" });

await page.goto(`${BASE}/image-video-lab`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.locator(".cinema-shell").waitFor({ timeout: 90_000 });
await sleep(1200);
const captureOptions = await page
  .getByLabel("Video export capture window in seconds")
  .locator("option")
  .allTextContents();
const codecOptions = await page.getByLabel("Export codec").locator("option").allTextContents();
const stillOptions = await page
  .getByLabel("Still image hold duration")
  .locator("option")
  .allTextContents();
await page.screenshot({ path: "artifacts/image-video-lab-fixed-controls.png", animations: "disabled" });

const railCollapsed = rail.length > 0 && rail.every((item) => item.width <= 60);
const railLabelsVisible = rail.some((item) => item.labelDisplay !== "none");
const report = {
  rail,
  railCollapsed,
  railLabelsVisible,
  tabs,
  tabOverlap: overlap,
  tabClipped,
  instructor,
  captureOptions,
  codecOptions,
  stillOptions,
  errors,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (
  overlap ||
  tabClipped ||
  !instructor?.toUpperCase().includes("S.M.U.V.E. PRIME") ||
  (railCollapsed && railLabelsVisible) ||
  !captureOptions.includes("120s") ||
  !codecOptions.includes("WebM")
) {
  process.exit(1);
}
