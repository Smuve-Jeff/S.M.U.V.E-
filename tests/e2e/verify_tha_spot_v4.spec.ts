import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Verify Tha Spot live intelligence experience', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');

  await page.getByRole('button', { name: /INTEL/i }).click();
  await expect(page.getByText('THA SPOT INTEL')).toBeVisible();
  await expect(page.getByText('STRATEGIC DIRECTIVES')).toBeVisible();
  await expect(page.getByText('ADVANTAGE METRICS')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Cross-platform moves/i })
  ).toBeVisible();
});
