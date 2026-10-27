import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Synthetic Playwright E2E for the clip-admission side of the
 * SampleStreamer playback-coupling work.
 *
 * Goal: verify that a long imported clip, when added to the arrangement via
 * the studio UI, ends up on a track with the clip-streamer admission fields
 * the playback side expects.
 *
 * This does not assert sample-accurate audio. It asserts that the arrangement
 * clip is created with the streamed-clip model (clipStreamer present, plus
 * clipOriginSeconds / clipLengthSeconds / clipSampleRate / clipChannels).
 */

function longWavFixture(): Buffer {
  const samples = 48000 * 12; // 12s @ 48k, crosses the 10s long-import threshold
  const rate = 48000;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test.describe('clip-streamer admission (synthetic long import)', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
  });

  test('a long import is added to the arrangement with the clip-streamer fields', async ({
    page,
  }) => {
    await page.goto('/studio-classic?view=arrangement');
    await page.waitForSelector('[data-studio-workspace]');
    await expect(page.locator('[data-studio-workspace]')).toHaveAttribute(
      'data-studio-workspace',
      'arrangement',
    );

    await page.evaluate(() => {
      const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
      studio.uiService.beginnerMode.set(false);
      studio.audioEngine.tempo.set(100);
      studio.showImportPanel.set(true);
    });

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import audio files' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'qa-long-loop.wav', mimeType: 'audio/wav', buffer: longWavFixture() });

    await expect(page.locator('.comp-import-editor')).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /add to project/i }).click();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const studio = (window as any).ng.getComponent(
              document.querySelector('app-studio'),
            );
            const lastTrack = studio.musicManager.tracks().at(-1);
            return Boolean(lastTrack?.clips?.[0]?.clipStreamer);
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    const clip = await page.evaluate<{
      clipStreamer: boolean;
      clipOriginSeconds: number;
      clipLengthSeconds: number;
      clipSampleRate: number;
      clipChannels: number;
    } | null>(() => {
      const studio = (window as any).ng.getComponent(document.querySelector('app-studio'));
      const tracks = studio.musicManager.tracks();
      const lastTrack = tracks[tracks.length - 1];
      if (!lastTrack) return null;
      const clip = lastTrack.clips?.[0] ?? null;
      if (!clip) return null;
      return {
        clipStreamer: Boolean(clip.clipStreamer),
        clipOriginSeconds: clip.clipOriginSeconds,
        clipLengthSeconds: clip.clipLengthSeconds,
        clipSampleRate: clip.clipSampleRate,
        clipChannels: clip.clipChannels,
      };
    });

    expect(clip).not.toBeNull();
    expect(clip!.clipStreamer).toBe(true);
    expect(clip!.clipOriginSeconds).toBe(0);
    expect(clip!.clipLengthSeconds).toBeGreaterThan(0);
    expect(clip!.clipSampleRate).toBeGreaterThan(0);
    expect(clip!.clipChannels).toBeGreaterThan(0);
  });
});
