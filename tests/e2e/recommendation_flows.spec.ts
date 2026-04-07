import { test, expect } from '@playwright/test';

test('recommendation actions persist across strategy, practice, and command surfaces', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/practice');

  await expect(page.getByTestId('practice-rec-upg-room-calibration')).toBeVisible();
  await page.getByTestId('practice-save-upg-room-calibration').click();
  await expect(page.getByTestId('practice-history-entry')).toContainText(
    'Room Calibration'
  );

  await page.getByTestId('practice-focus-upg-room-calibration').click();
  await expect(page).toHaveURL(/\/studio$/);

  await page.goto('/strategy');
  await expect(page.getByTestId('strategy-rec-upg-dsp-promotion')).toBeVisible();
  await page.getByTestId('strategy-dismiss-upg-dsp-promotion').click();
  await expect(
    page.getByTestId('strategy-rec-upg-dsp-promotion')
  ).toHaveCount(0);
  await expect(page.getByTestId('strategy-inbox-entry').first()).toBeVisible();

  await page.goto('/career');
  await expect(page.getByTestId('command-rec-upg-room-calibration')).toBeVisible();
  await page.getByTestId('command-acquire-upg-room-calibration').click();
  await expect(page.getByTestId('command-complete-upg-room-calibration')).toBeVisible();
  await expect(page.getByTestId('command-history-entry').first()).toContainText(
    'Room Calibration'
  );
});
