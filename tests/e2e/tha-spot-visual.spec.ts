import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Tha Spot Visual Verification', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');
  await expect(page.getByRole('heading', { name: 'THA_SPOT', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HIGH-FIDELITY RERUNS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Modern browser spotlight' })).toBeVisible();
  await expect(page.getByLabel('Search cabinets').filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('game-card').first()).toBeVisible();
  await expect(page.getByTestId('genre-select')).toBeVisible();
});
