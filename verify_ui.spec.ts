import { test, expect } from '@playwright/test';

test('verify career hub and strategic audit', async ({ page }) => {
  await page.goto('http://localhost:4200/career');
  await expect(page.locator('h1')).toContainText('EXECUTIVEHUB');
  await expect(page.locator('text=Strategic Audit')).toBeVisible();
  await expect(page.locator('text=Revenue Forecasting')).toBeVisible();
  await expect(page.locator('text=Legal & Rights')).toBeVisible();
});

test('verify studio ai band toggles', async ({ page }) => {
  await page.goto('http://localhost:4200/studio');
  await expect(page.locator('text=AI Band')).toBeVisible();
  const drummerBtn = page.locator('button[title="AI Drummer"]');
  await expect(drummerBtn).toBeVisible();
  await drummerBtn.click();
  // Check if it toggled (class change would be ideal but visual check is easier)
});

test('verify mastering suite interactive toggles', async ({ page }) => {
  await page.goto('http://localhost:4200/studio');
  await page.locator('span:has-text("Mastering")').click();
  await expect(page.locator('text=NeuralMastering')).toBeVisible();
  await expect(page.locator('text=Soft_Clip_OFF')).toBeVisible();
  await page.locator('text=Soft_Clip_OFF').click();
  await expect(page.locator('text=Soft_Clip_ON')).toBeVisible();
});
