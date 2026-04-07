import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test('Drum Machine component is rendered correctly', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.goto('/studio');

  const drumMachineBtn = page.getByRole('button', { name: /^drum machine$/i });
  await expect(drumMachineBtn).toBeVisible();
  await drumMachineBtn.click();

  await expect(
    page.getByRole('heading', { name: /NEURAL DRUM SYNTH/i })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /AI GROOVE/i })).toBeVisible();
  await expect(page.locator('.drum-machine .pad-button')).toHaveCount(12);
});
