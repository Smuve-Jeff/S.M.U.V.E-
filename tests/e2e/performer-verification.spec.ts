import { expect, test } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Performance module exposes its core live-production controls', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio?view=performer');

  const performer = page.locator('.performer-shell');
  await expect(performer).toBeVisible();
  await expect(page.locator('.spectrum-strip')).toBeVisible();
  await expect(page.locator('.kb-key.is-white').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /smart\s+chords/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^arp$/i })).toBeVisible();
  await expect(page.locator('app-knob[label="CUT"]')).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
