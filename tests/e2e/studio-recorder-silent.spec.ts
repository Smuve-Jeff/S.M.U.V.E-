import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * The opposite subject to `studio-recorder-capture.spec.ts`: that spec proves a
 * take with signal is measured as healthy, this one proves a take with *no*
 * signal is flagged instead of banked as a success.
 *
 * Muting an interface, choosing the wrong input, or a hardware gain at zero all
 * produce a take that finishes cleanly — real WebM, correct duration, `saved on
 * device` — while containing nothing but noise floor. Chromium's default
 * synthetic input beeps periodically, which would make "is this take silent"
 * depend on where the 2.5-second window landed, so the fake device is fed a
 * digital-zero WAV instead.
 */

const SILENCE_FIXTURE = new URL(
  "../fixtures/silence.wav",
  import.meta.url,
).pathname;

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${SILENCE_FIXTURE}`,
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
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Ready to record",
    { timeout: 20_000 },
  );
}

async function recordSilentTake(page: Page) {
  const record = page.locator(".arv-record-btn");
  await record.click();
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Recording raw input",
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2_000);
  await record.click();
  await expect(page.locator(".arv-capture-state")).toContainText(
    "Ready to record",
    { timeout: 20_000 },
  );
}

/** Read the stored take straight out of the app's IndexedDB. */
async function storedLevel(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("SMUVE_OFFLINE_DB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const items = await new Promise<any[]>((resolve, reject) => {
        const request = db
          .transaction("audio_blobs", "readonly")
          .objectStore("audio_blobs")
          .getAll();
        request.onsuccess = () => resolve(request.result as any[]);
        request.onerror = () => reject(request.error);
      });
      return items[0]?.settings?.level ?? null;
    } finally {
      db.close();
    }
  });
}

test("a take with no signal is flagged, not banked silently", async ({
  page,
}) => {
  await openRecorder(page);
  await recordSilentTake(page);

  // The take still exists — this must flag a take, never discard one.
  await expect(page.locator(".arv-bank")).toContainText("1 take");
  const row = page.locator(".arv-row").first();
  await expect(row.locator(".arv-row-meta")).toContainText("saved on device");

  // ...and it says so, on the row and in words.
  const badge = row.locator(".arv-row-level");
  await expect(badge).toHaveText("SILENT");
  await expect(badge).toHaveClass(/is-silent/);
  await expect(badge).toHaveAttribute("title", "Take is silent");

  // Confirm the fixture really was silent, so this spec cannot pass because
  // the *earlier* measurement was wrong rather than because the take was.
  const peak = await page.evaluate(async () => {
    const src = document.querySelector<HTMLAudioElement>(".arv-row-audio")
      ?.getAttribute("src");
    if (!src) return -1;
    const response = await fetch(src);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(bytes);
      const samples = audio.getChannelData(0);
      let highest = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const magnitude = Math.abs(samples[i]);
        if (magnitude > highest) highest = magnitude;
      }
      return highest;
    } finally {
      await context.close();
    }
  });
  expect(peak).toBeLessThan(0.0005);

  // The verdict is written back onto the stored take, not just held in memory.
  await expect
    .poll(() => storedLevel(page), { timeout: 10_000 })
    .toBe("silent");
});

test("the silent flag survives a reload", async ({ page }) => {
  await openRecorder(page);
  await recordSilentTake(page);
  await expect(page.locator(".arv-row-level").first()).toHaveText("SILENT");
  await expect.poll(() => storedLevel(page), { timeout: 10_000 }).toBe("silent");

  // A reload re-reads the take from IndexedDB and has no memory of the
  // measurement — the badge can only be there because the level was stored.
  await openRecorder(page);
  const restored = page.locator(".arv-row").first();
  await expect(page.locator(".arv-bank")).toContainText("1 take");
  await expect(restored.locator(".arv-row-meta")).toContainText(
    "saved on device",
  );
  await expect(restored.locator(".arv-row-level")).toHaveText("SILENT");
});
