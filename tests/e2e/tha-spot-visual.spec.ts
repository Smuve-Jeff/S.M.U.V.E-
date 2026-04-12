import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Tha Spot Visual Verification', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');
  await expect(page.getByText('THA SPOT // LIVE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game library' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tha Battlefield', exact: true })
  ).toBeVisible();
});
