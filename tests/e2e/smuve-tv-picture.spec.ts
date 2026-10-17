import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
]) {
  test(`TV programme information stays off the picture at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedAuthenticatedSession(page);
    // Layout/transport coverage must not depend on third-party streams being up.
    await page.route(/\.m3u8(?:\?|$)/, (route) => route.abort());
    await page.goto('/tha-spot');
    await page.getByRole('button', { name: 'S.M.U.V.E TV', exact: true }).click();

    const picture = page.locator('.tv-player');
    const information = page.locator('.tv-lower-third');
    await expect(picture).toBeVisible();
    await expect(page.locator('.tv-player .tv-lower-third')).toHaveCount(0);
    await expect(information.locator('.tv-lt-title')).not.toBeEmpty();
    await expect(information.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /\d/);

    const assertPictureClear = async () => {
      const bounds = await picture.boundingBox();
      const metadata = await information.boundingBox();
      expect(bounds).not.toBeNull();
      expect(metadata).not.toBeNull();
      expect(bounds!.height).toBeGreaterThan(150);
      expect(Math.abs(bounds!.width / bounds!.height - 16 / 9)).toBeLessThan(0.02);
      expect(metadata!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
      expect(metadata!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(metadata!.x + metadata!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    };
    await assertPictureClear();

    const originalChannel = await picture.locator('.tv-bug-number').innerText();
    await page.getByRole('button', { name: 'Next station', exact: true }).click();
    await expect(picture.locator('.tv-bug-number')).not.toHaveText(originalChannel);
    await page.getByRole('button', { name: 'Previous station', exact: true }).click();
    await expect(picture.locator('.tv-bug-number')).toHaveText(originalChannel);
    await page.getByRole('button', { name: 'Pause the station', exact: true }).click();
    await expect(picture.locator('.tv-on-air')).toHaveText('PAUSED');
    await page.getByRole('button', { name: 'Play the station', exact: true }).click();
    await expect(picture.locator('.tv-on-air')).toHaveText('ON AIR');
    await assertPictureClear();

    if (viewport.width === 1440) {
      await page.getByRole('button', { name: 'Toggle fullscreen player', exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('tv-player');
      // Playwright's visibility check ignores occlusion by the fullscreen top
      // layer. Hit-test the picture to verify metadata cannot cover it there.
      await expect.poll(() => page.evaluate(() => {
        const fullscreen = document.fullscreenElement!;
        const metadata = document.querySelector('.tv-lower-third')!;
        const bounds = fullscreen.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.85);
        return !fullscreen.contains(metadata) && !!hit && fullscreen.contains(hit);
      })).toBe(true);
      await page.evaluate(() => document.exitFullscreen());
      await expect(information).toBeVisible();
      await assertPictureClear();
    }
  });
}
