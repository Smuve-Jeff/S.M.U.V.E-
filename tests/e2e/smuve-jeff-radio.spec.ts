import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Smuve Jeff Radio loads a full-length YouTube source', async ({ page }) => {
  await seedAuthenticatedSession(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/tha-spot');
  await page.getByRole('button', { name: 'S.M.U.V.E TV' }).click();
  await expect(page.getByRole('region', { name: 'S.M.U.V.E TV' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SMUVE JEFF RADIO' })).toBeVisible();

  const startRadio = page.getByRole('button', { name: 'START RADIO' });
  await expect(startRadio).toBeEnabled({ timeout: 15_000 });
  await startRadio.click();
  await expect(page.locator('audio.tv-music-player')).toHaveAttribute('src', /.+/);
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible({ timeout: 10_000 });

  const fullRecord = page.getByRole('button', { name: /Play or close the complete record/i });
  await expect(fullRecord).toBeVisible({ timeout: 10_000 });
  await fullRecord.click();
  await expect(page.locator('.tv-music-full-host iframe')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.tv-music-full-host iframe')).toHaveAttribute('src', /youtube-nocookie\.com|youtube\.com/);

  expect(pageErrors).toEqual([]);
});
