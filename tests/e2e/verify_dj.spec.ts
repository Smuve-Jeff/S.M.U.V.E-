import { test, expect } from '@playwright/test';

test('verify dj turntable interface', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem('smuve_auth_session', JSON.stringify({ token: 'mock-token' }));
    localStorage.setItem('smuve_user_profile', JSON.stringify({ id: 'user123', name: 'Pro DJ', level: 50 }));
  });

  await page.goto('http://localhost:3000/#/studio');

  // Wait for the studio navigation buttons
  // In the studio module, there's usually a sidebar or a header with view modes
  const djBoothBtn = page.getByRole('button', { name: /DJ Booth/i });
  await djBoothBtn.waitFor({ state: 'visible', timeout: 5000 });
  await djBoothBtn.click();

  // Wait for the stack waveform canvas we just added
  const canvas = page.locator('canvas#stackedWaveform');
  await canvas.waitFor({ state: 'visible', timeout: 5000 });

  await page.screenshot({ path: 'dj_booth_final.png', fullPage: true });

  await expect(page.getByText('DECK A', { exact: true })).toBeVisible();
  await expect(page.getByText('DECK B', { exact: true })).toBeVisible();
  await expect(page.getByText('VOCALS')).toHaveCount(2); // Stem controls for both decks
  await expect(page.getByText('S.M.U.V.E. PRO ENGINE')).toBeVisible();
});
