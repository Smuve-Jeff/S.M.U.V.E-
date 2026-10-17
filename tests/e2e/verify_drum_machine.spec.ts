import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Drum Machine component is rendered correctly', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio?view=drum-machine');

  await expect(
    page.getByRole('heading', { name: /Rhythm Unit.*Drum Machine/i })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /AI: Evolve current rhythm/i })).toBeVisible();
  await expect(page.locator('.dm-pads [role="gridcell"]')).toHaveCount(8);
});
