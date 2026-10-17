import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Verify Tha Spot live intelligence experience', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/tha-spot');

  await page.getByTestId('intel-toggle').click();
  await expect(page.getByText('STRATEGIC INTEL')).toBeVisible();
  await expect(page.getByText('OPERATIONAL DIRECTIVES')).toBeVisible();
  await expect(page.getByText('NEURAL SYNC')).toBeVisible();
});
