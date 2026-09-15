import { test, expect, type Page } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * The CinemaEngine camera has one failure mode unit tests cannot catch: every
 * piece of wiring can be correct while the program monitor still shows a black
 * rectangle, because the canvas compositing, the sink's decode state and the
 * backing-store size are all real-browser behaviour.
 *
 * These specs drive Chromium's fake capture device and read the monitor's actual
 * pixels, so "the chip says LIVE" is never taken as proof that anything painted.
 *
 * `channel: 'chromium'` is load-bearing. Playwright's default headless launch is
 * the headless *shell*, which ships no media-capture implementation at all: every
 * `getUserMedia` call there fails with `NotSupportedError` no matter what the app
 * does. Running the specs on that binary measures the harness, not the camera —
 * and its `NotSupportedError` is what the module now reports as
 * "CAPTURE UNSUPPORTED" rather than "NO CAMERA".
 */

// The permission prompt is deliberately left in place (no
// `--use-fake-ui-for-media-stream`) so each spec decides whether access was
// granted, refused, or blocked by the embedding frame.
test.use({
  channel: 'chromium',
  launchOptions: { args: ['--use-fake-device-for-media-stream'] },
});

test.setTimeout(180_000);

/**
 * Share of sampled monitor pixels brighter than the backing store's `#020617`
 * fill. A painted camera feed lights up most of the frame; the failure overlays
 * are the same near-black with a few lines of text, so they stay low.
 */
const readViewfinderSignal = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !canvas.width || !canvas.height) return -1;

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let lit = 0;
    let total = 0;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        total += 1;
        if (data[i] > 24 || data[i + 1] > 32 || data[i + 2] > 48) lit += 1;
      }
    }

    return total === 0 ? -1 : lit / total;
  });

test.describe('granted camera access', () => {
  test.use({ permissions: ['camera'] });

  test('paints the live feed onto the program monitor', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/image-video-lab');

    const chip = page.locator('.camera-status-chip');
    await expect(chip).toHaveText('CAMERA OFF', { timeout: 60_000 });

    await page.getByRole('button', { name: /start camera/i }).click();

    await expect(chip).toHaveText('LIVE', { timeout: 30_000 });
    // Nothing may claim a failure while the module reports a live feed.
    await expect(page.locator('.camera-error')).toHaveCount(0);
    await expect(page.locator('.camera-warning')).toHaveCount(0);

    await expect
      .poll(() => readViewfinderSignal(page), {
        timeout: 30_000,
        message: 'the program monitor never painted camera frames',
      })
      .toBeGreaterThan(0.15);
  });

  test('keeps painting after a delivery preset changes the monitor resolution', async ({
    page,
  }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/image-video-lab');
    await page.getByRole('button', { name: /start camera/i }).click();
    await expect(page.locator('.camera-status-chip')).toHaveText('LIVE', {
      timeout: 30_000,
    });

    // Presets change the aspect ratio, which resizes the backing store and
    // resets the 2D context — the case where a feed silently stops compositing.
    const vertical = page.getByRole('button', { name: /9:16|vertical|reels/i });
    if ((await vertical.count()) > 0) {
      await vertical.first().click();
    }

    await expect
      .poll(() => readViewfinderSignal(page), {
        timeout: 30_000,
        message: 'the monitor went dark after a preset change',
      })
      .toBeGreaterThan(0.15);
  });
});

test.describe('denied camera access', () => {
  test.use({ permissions: [] });

  test('names the block on the monitor and offers a retry', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/image-video-lab');
    await page.getByRole('button', { name: /start camera/i }).click();

    // A denial must be recoverable in place, not a dead end that needs a reload.
    await expect(page.locator('.camera-status-chip')).toHaveText(
      'ACCESS DENIED',
      { timeout: 30_000 }
    );
    // Offered in both places an operator might be looking: the sidebar panel
    // and the program monitor showing the black frame.
    await expect(page.locator('.camera-action.retry')).toBeVisible();
    await expect(page.locator('.camera-retry-chip')).toBeVisible();
    await expect(page.locator('.camera-error')).toContainText(
      /permission denied|blocked/i
    );
  });
});

test.describe('capture refused by the embedding frame', () => {
  /**
   * A preview shell embeds the app in a cross-origin frame, where `camera` is
   * refused before any prompt can appear. Simulated by pinning the Permissions
   * Policy the service consults, so the spec does not depend on serving two
   * origins.
   */
  test.use({ permissions: ['camera'] });

  test('explains the frame block and offers a way out in its own tab', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'permissionsPolicy', {
        configurable: true,
        value: { allowsFeature: (feature: string) => feature !== 'camera' },
      });
    });
    await seedAuthenticatedSession(page);
    await page.goto('/image-video-lab');

    await page.getByRole('button', { name: /start camera/i }).click();

    await expect(page.locator('.camera-status-chip')).toHaveText(
      'EMBED BLOCKS CAPTURE',
      { timeout: 30_000 }
    );
    // The only useful action in this state is to leave the frame.
    await expect(
      page.getByRole('button', { name: /open in new tab/i }).first()
    ).toBeVisible();
    // A retry cannot change the frame's policy, so it must not be offered.
    await expect(
      page.getByRole('button', { name: /retry capture/i })
    ).toHaveCount(0);
  });
});
