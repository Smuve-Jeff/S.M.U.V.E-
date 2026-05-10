import { test, expect } from '@playwright/test';

test('Studio Mobile Layout Verification', async ({ page }) => {
  // Mock login and navigate to studio
  await page.goto('http://localhost:3000/studio');

  // Set viewport to a typical Android device (Moto G Power 5G approx)
  await page.setViewportSize({ width: 412, height: 915 });

  // Verify Deck A/B toggles exist
  const deckAToggle = page.locator('button:has-text("Deck A")');
  const deckBToggle = page.locator('button:has-text("Deck B")');
  await expect(deckAToggle).toBeVisible();
  await expect(deckBToggle).toBeVisible();

  // Screenshot Deck A
  await deckAToggle.click();
  await page.screenshot({ path: 'mobile_studio_deck_a.png' });

  // Screenshot Deck B
  await deckBToggle.click();
  await page.screenshot({ path: 'mobile_studio_deck_b.png' });

  // Navigate to Mixer
  await page.click('button:has-text("Mixer")');
  await page.screenshot({ path: 'mobile_studio_mixer.png' });

  // Navigate to Song (Arrangement)
  await page.click('button:has-text("Song")');
  await page.screenshot({ path: 'mobile_studio_arrangement.png' });
});

test('Studio Desktop Layout Verification', async ({ page }) => {
  await page.goto('http://localhost:3000/studio');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'desktop_studio_full.png' });
});
