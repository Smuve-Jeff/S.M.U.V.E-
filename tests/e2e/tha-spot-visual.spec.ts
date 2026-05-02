import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Tha Spot Visual Verification', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');
  await expect(page.getByText('THA SPOT // LIVE')).toBeVisible();
  await expect(page.getByText('Arena spotlight')).toBeVisible();
  await expect(
    page
      .getByTestId('library-panel')
      .getByRole('heading', { name: 'Game library' })
  ).toBeVisible();
  await expect(page.getByLabel('Search cabinets')).toBeVisible();
  await expect(page.getByTestId('arena-spotlight-title')).toBeVisible();
});
