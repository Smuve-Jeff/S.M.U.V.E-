import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * The recorder is the one Studio surface whose whole job is a browser API, and
 * until now every microphone spec faked `getUserMedia` — which proves the
 * error paths and nothing about capture itself. Chromium ships a synthetic
 * audio input (`--use-fake-device-for-media-stream`) that produces real PCM, so
 * a take can be recorded through the actual pipeline: `getUserMedia` →
 * `MediaRecorder` → IndexedDB → Recording Bank.
 *
 * `--use-fake-ui-for-media-stream` answers the permission prompt, and the
 * context also grants `microphone`, so the specs are about capture rather than
 * about the prompt. (`studio-new-page.spec.ts` owns the permission copy.)
 */
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

test.setTimeout(180_000);

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function openRecorder(page: Page) {
  await page.goto("/studio?view=create");
  await expect(page.locator(".arv-record-btn")).toBeVisible();
  // The synthetic input is enumerated as soon as the view asks.
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Ready to record",
    { timeout: 20_000 },
  );
}

/**
 * Record for `seconds`, returning the elapsed clock the button showed and the
 * channel readout captured while the stream was live.
 */
async function recordTake(
  page: Page,
  seconds: number,
): Promise<{ elapsed: string; channels: string }> {
  const record = page.locator(".arv-record-btn");
  await record.click();
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Recording raw input",
    { timeout: 20_000 },
  );
  await expect(page.locator(".arv-record-time")).toBeVisible();
  await page.waitForTimeout(seconds * 1000);
  const elapsed = (await page.locator(".arv-record-time").innerText()).trim();
  const channels = (await page.locator(".arv-transport-meta").innerText()).trim();
  await record.click();
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Ready to record",
    { timeout: 20_000 },
  );
  return { elapsed, channels };
}

test("captures a take from the microphone and saves it", async ({ page }) => {
  await openRecorder(page);

  // Nothing is armed yet, so the channel count cannot be known — and the readout
  // used to stay "N/A" forever because it was a `computed` over a plain field.
  await expect(page.locator(".arv-transport-meta")).toContainText(
    "CHANNELS N/A",
  );

  const { elapsed, channels } = await recordTake(page, 2.5);
  expect(elapsed, "the recording clock advanced past zero").not.toBe("00:00");
  expect(channels, "the live stream reported its channel count").toMatch(
    /CH · (MONO|STEREO)/,
  );

  const bank = page.locator(".arv-bank");
  await expect(bank).toContainText("1 take");
  const meta = bank.locator(".arv-row-meta").first();
  await expect(meta).toContainText("saved on device");
  // Length is derived from the take itself, not left at 0:00.
  await expect(meta).toContainText(/00:0[2-9]/);

  // Real media, not an empty blob: the row's player points at an object URL
  // created from the captured bytes.
  const audioSrc = await bank.locator(".arv-row-audio").first().getAttribute("src");
  expect(audioSrc).toMatch(/^blob:/);
});

test("a captured take survives a reload with its length", async ({ page }) => {
  await openRecorder(page);
  await recordTake(page, 2.5);

  const bank = page.locator(".arv-bank");
  await expect(bank).toContainText("1 take");
  const before = await bank.locator(".arv-row-meta").first().innerText();

  await page.reload();
  await expect(page.locator(".arv-record-btn")).toBeVisible();
  const restored = page.locator(".arv-bank");
  await expect(restored).toContainText("1 take", { timeout: 20_000 });
  await expect(restored.locator(".arv-row-meta").first()).toHaveText(before);
  // Restored takes used to read 0:00 because only the blob was stored.
  await expect(restored.locator(".arv-row-meta").first()).not.toContainText(
    "00:00",
  );
});
