import { test, expect } from '@playwright/test';

test.describe('Piano Roll Refinement Verification', () => {
  test('should render the refined Bento layout and Analog Engine v4.2 aesthetics', async ({ page }) => {
    // Set viewport to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate to studio (mocking the path if possible, or assuming it serves)
    // Since I cannot easily start the server and wait for it in this environment without blocking,
    // I will assume the server is running or I will just write the test for future use.
    // However, I SHOULD try to run it if possible.

    await page.goto('http://localhost:4200/studio?view=piano-roll');

    // Check for bento grid structure
    const bentoGrid = page.locator('.bento-grid-pr');
    await expect(bentoGrid).toBeVisible();

    // Check for wood frames
    const woodFrame = page.locator('.wood-frame.top');
    await expect(woodFrame).toBeVisible();

    // Check for glassmorphism
    const header = page.locator('.header-module');
    await expect(header).toHaveClass(/glass-v42/);

    // Check for neon text
    const title = page.locator('.glimmer-text');
    await expect(title).toBeVisible();

    // Check for scanlines
    const scanlines = page.locator('.scanline-overlay');
    await expect(scanlines).toBeVisible();

    await page.screenshot({ path: 'screenshots/piano-roll-desktop.png' });
  });

  test('should adapt to mobile bento layout', async ({ page }) => {
    // Set viewport to Android-like mobile
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('http://localhost:4200/studio?view=piano-roll');

    // Sidebar should be hidden by default on mobile
    const sidebar = page.locator('.sidebar-left');
    await expect(sidebar).not.toBeVisible();

    // Header should be visible
    const header = page.locator('.header-module');
    await expect(header).toBeVisible();

    // Click more_vert to show sidebar
    await page.click('button:has-text("more_vert")');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveClass(/mobile-visible/);

    await page.screenshot({ path: 'screenshots/piano-roll-mobile.png' });
  });
});
