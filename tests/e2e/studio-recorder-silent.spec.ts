import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
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
async function storedLevel(page: Page, id?: string): Promise<string | null> {
  return page.evaluate(async (wanted) => {
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
      const item = wanted
        ? items.find((entry) => entry.id === wanted)
        : items[0];
      return item?.settings?.level ?? null;
    } finally {
      db.close();
    }
  }, id);
}

/** The WAV the fake device plays, as bytes the page can store as a Blob. */
const SILENCE_BASE64 = readFileSync(
  new URL("../fixtures/silence.wav", import.meta.url),
).toString("base64");

/**
 * Write takes straight into the recording bank, the way an older build left
 * them: one with no measured level at all, and one whose verdict is already
 * stored. Both blobs are silent, so re-measuring the second would flip it.
 */
async function seedStoredTakes(page: Page) {
  await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("SMUVE_OFFLINE_DB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("audio_blobs", "readwrite");
        const store = tx.objectStore("audio_blobs");
        store.put({
          id: "rec_legacy",
          blob: new Blob([bytes], { type: "audio/wav" }),
          name: "Legacy take",
          timestamp: now - 60_000,
          settings: { durationSec: 3 },
        });
        store.put({
          id: "rec_pinned",
          blob: new Blob([bytes], { type: "audio/wav" }),
          name: "Pinned quiet take",
          timestamp: now - 120_000,
          settings: { durationSec: 3, level: "low" },
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, SILENCE_BASE64);
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

test("measures a take stored before the level existed", async ({ page }) => {
  // First visit creates the database the app owns; the takes are written into
  // it afterwards so the schema is the app's, not the spec's.
  await openRecorder(page);
  await seedStoredTakes(page);
  await openRecorder(page);

  await expect(page.locator(".arv-bank")).toContainText("2 takes");

  // An older take gets a verdict without being re-recorded...
  const legacy = page.locator(".arv-row", { hasText: "Legacy take" });
  await expect(legacy.locator(".arv-row-level")).toHaveText("SILENT", {
    timeout: 20_000,
  });
  await expect
    .poll(() => storedLevel(page, "rec_legacy"), { timeout: 10_000 })
    .toBe("silent");

  // ...and a verdict that was already stored is trusted, not re-derived: this
  // blob is silent, so re-measuring it would have said SILENT, not LOW.
  const pinned = page.locator(".arv-row", { hasText: "Pinned quiet take" });
  await expect(pinned.locator(".arv-row-level")).toHaveText("LOW");
  expect(await storedLevel(page, "rec_pinned")).toBe("low");
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
