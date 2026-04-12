import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('recommendation actions persist across strategy, practice, and command surfaces', async ({
  page,
}) => {
  await seedAuthenticatedSession(page);

  await page.goto('/practice');

  await expect(
    page.getByTestId('practice-rec-upg-room-calibration')
  ).toBeVisible();
  await page.getByTestId('practice-save-upg-room-calibration').click();
  await expect(page.getByTestId('practice-history-entry')).toContainText(
    'Room Calibration'
  );

  await page.getByTestId('practice-focus-upg-room-calibration').click();
  await expect(page).toHaveURL(/\/studio$/);

  await page.goto('/strategy');
  await page.getByRole('button', { name: /^outreach$/i }).click();
  await expect(
    page.getByTestId('strategy-recommendation-upg-dsp-promotion')
  ).toBeVisible();
  await page.getByTestId('strategy-dismiss-upg-dsp-promotion').click();
  await expect(
    page.getByTestId('strategy-recommendation-upg-dsp-promotion')
  ).toHaveCount(0);
  await expect(page.getByTestId('strategy-inbox-entry').first()).toBeVisible();

  await page.goto('/career');
  await expect(
    page.getByTestId('command-rec-upg-room-calibration')
  ).toBeVisible();
  await page.getByTestId('command-acquire-upg-room-calibration').click();
  await expect(page.getByTestId('command-history-entry').first()).toContainText(
    'Room Calibration'
  );
  await expect(page.getByTestId('command-history-entry').first()).toContainText(
    'acquired'
  );
});
