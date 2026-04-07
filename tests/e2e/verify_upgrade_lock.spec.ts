import { test, expect } from '@playwright/test';

test('verify studio route loads the production workspace', async ({ page }) => {
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByText(/STUDIO PRO/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /drum machine/i })
  ).toBeVisible();
});
