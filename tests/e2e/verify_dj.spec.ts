import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('verify dj turntable interface', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/studio');

  await expect(page.getByText('DECK A', { exact: true })).toBeVisible();
  await expect(page.getByText('DECK B', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /MASTER SYNC/i })
  ).toBeVisible();
  await expect(page.locator('.dj-waveform-bar canvas')).toHaveCount(2);
  await expect(page.getByText('Turntable A')).toBeVisible();
  await expect(page.getByText('Turntable B')).toBeVisible();
});
