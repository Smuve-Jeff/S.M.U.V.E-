import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('recommendation actions persist across strategy, practice, and command surfaces', async ({
  page,
}) => {
  await seedAuthenticatedSession(page);

  await page.goto('/practice');

  await expect(
    page.getByTestId('practice-rec-upg-ovr-mastering')
  ).toBeVisible();
  await page.getByTestId('practice-save-upg-ovr-mastering').click();
  await expect(page.getByTestId('practice-history-entry')).toContainText(
    'S.M.U.V.E.-MODE MASTERING ENGINE'
  );

  await page.getByTestId('practice-focus-upg-ovr-mastering').click();
  await expect(page).toHaveURL(/\/mastering$/);

  await page.goto('/strategy');
  await expect(
    page.getByTestId('strategy-recommendation-upg-legal-executioner')
  ).toBeVisible();
  await page.getByTestId('strategy-dismiss-upg-legal-executioner').click();
  await expect(
    page.getByTestId('strategy-recommendation-upg-legal-executioner')
  ).toHaveCount(0);
  await expect(page.getByTestId('strategy-inbox-entry').first()).toBeVisible();

  await page.goto('/command-center');
  await expect(
    page.getByTestId('command-rec-upg-ovr-mastering')
  ).toBeVisible();
  await page.getByTestId('command-acquire-upg-ovr-mastering').click();
  await expect(page.getByTestId('command-history-entry').first()).toContainText(
    'S.M.U.V.E.-MODE MASTERING ENGINE'
  );
  await expect(page.getByTestId('command-history-entry').first()).toContainText(
    'acquired'
  );
  await page.reload();
  await expect(page.getByTestId('command-history-entry').first()).toContainText('acquired');
  await page.goto('/strategy');
  await expect(page.getByTestId('strategy-recommendation-upg-legal-executioner')).toHaveCount(0);
});
