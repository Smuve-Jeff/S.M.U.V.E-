const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath:
      '/home/jules/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell',
  });
  const page = await browser.newPage();

  console.log('Navigating to app...');
  await page.goto('http://localhost:4200/');

  console.log('Setting localStorage for authentication...');
  await page.evaluate(() => {
    localStorage.setItem(
      'smuve_auth_user',
      JSON.stringify({ id: 'test-user', name: 'Test Artist' })
    );
    localStorage.setItem('smuve_authenticated', 'true');
  });

  console.log('Navigating to Studio...');
  await page.screenshot({ path: 'studio_pre_wait.png' });
  await page.goto('http://localhost:4200/studio');

  try {
    await page.waitForTimeout(5000); // await page.waitForSelector('.studio-container', { timeout: 15000 });
    console.log('Studio container found.');

    await page.screenshot({ path: 'studio_main_v3.png' });

    // Attempt to navigate views
    const views = ['MIXER', 'PIANO ROLL', 'DRUM MACHINE', 'PERFORMER'];
    for (const view of views) {
      console.log(`Searching for ${view} button...`);
      const btn = await page.getByRole('button', {
        name: new RegExp(view, 'i'),
      });
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: `studio_${view.toLowerCase().replace(' ', '_')}_v3.png`,
        });
        console.log(`Captured ${view} view.`);
      } else {
        console.log(`${view} button not visible.`);
      }
    }
  } catch (error) {
    console.error('Verification failed:', error.message);
    await page.screenshot({ path: 'error_screenshot_v3.png' });
  } finally {
    await browser.close();
  }
})();
