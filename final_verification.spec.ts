
import { test, expect } from '@playwright/test';

test('Final verification of UI changes and functionality', async ({ page }) => {
  await page.goto('http://localhost:4200');

  // Close the chatbot overlay
  await page.click('button:has-text("[X]")');

  // Fill out the user profile and save
  await page.locator('input[type="text"]').first().fill('Jules');
  await page.click('button:has-text("Save Profile")');

  // Verify that the main application header is visible after saving the profile
  await expect(page.locator('header')).toBeVisible();

  // Navigate to the piano roll
  await page.click('button:has-text("[ DJ ]")');
  await page.click('button:has-text("[ PIANO ]")');

  // Verify the vintage theme of the piano roll
  const pianoRollContainer = page.locator('.piano-roll-container');
  await expect(pianoRollContainer).toBeVisible();
  await expect(pianoRollContainer).toHaveCSS('background-color', 'rgb(243, 234, 211)');

  // Select the "808s" instrument from the dropdown
  await page.selectOption('select', '808s');

  // Click a key on the piano roll to test audio
  await page.locator('.piano-key').first().click();

  // Take a screenshot to verify the final UI state
  await page.screenshot({ path: 'final_verification_screenshot.png' });
});
