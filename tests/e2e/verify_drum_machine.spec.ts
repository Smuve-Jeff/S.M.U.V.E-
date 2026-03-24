import { test, expect } from '@playwright/test';

test('Drum Machine component is rendered correctly', async ({ page }) => {
  await page.goto('http://localhost:4200/studio');

  // Navigate to drum-machine view
  const drumMachineBtn = page.locator('button:has-text("DRUM MACHINE")');
  await expect(drumMachineBtn).toBeVisible();
  await drumMachineBtn.click();

  // Verify Drum Machine elements
  await expect(
    page.locator('h2:has-text("NEURAL DRUM SYNTH v1")')
  ).toBeVisible();
  await expect(page.locator('.pad-button')).toHaveCount(8);

  // Take a screenshot
  await page.screenshot({ path: 'drum_machine_verification.png' });
});
