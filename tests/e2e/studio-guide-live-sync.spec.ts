import { test, expect, type Page } from "@playwright/test";

/**
 * Live account round trip. This spec never runs implicitly: it needs a
 * dedicated test artist with no 2FA and a reachable API at the preview origin.
 *
 *   E2E_STUDIO_EMAIL=artist@example.com \
 *   E2E_STUDIO_PASSWORD='...' \
 *   PLAYWRIGHT_BASE_URL=https://your-preview.example \
 *   npx playwright test tests/e2e/studio-guide-live-sync.spec.ts
 *
 * The test resets the First Loop path on that account, finishes one lesson,
 * then signs in again in a clean browser context. Because the second context
 * has its own empty storage, the completed lesson can only arrive through the
 * profile save and the real cloud read.
 */
const EMAIL = process.env.E2E_STUDIO_EMAIL?.trim();
const PASSWORD = process.env.E2E_STUDIO_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4200";

test.skip(
  !EMAIL || !PASSWORD,
  "Set E2E_STUDIO_EMAIL and E2E_STUDIO_PASSWORD for a dedicated test artist without 2FA.",
);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page
    .getByRole("button", { name: "Authorize Access", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

test("real login restores Masterclass progress in a second browser context", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const email = EMAIL as string;
  const password = PASSWORD as string;

  const firstContext = await browser.newContext({ baseURL: BASE_URL });
  const firstPage = await firstContext.newPage();
  try {
    await signIn(firstPage, email, password);
    await firstPage.goto("/studio?guide=first-loop");

    const guide = firstPage.locator("app-studio-guide");
    await expect(guide).toBeVisible({ timeout: 30_000 });

    // Make the test independent of whatever this account already finished.
    await guide
      .getByRole("button", { name: "Reset path", exact: true })
      .click();
    await expect(guide.locator(".sg-sync")).toHaveClass(/is-synced/, {
      timeout: 30_000,
    });

    await guide
      .getByRole("button", { name: "Load a starter groove", exact: true })
      .click();
    const celebration = firstPage.locator("app-guide-completion");
    await expect(celebration).toBeVisible({ timeout: 20_000 });
    await expect(celebration).toContainText(
      "Borrow a groove, then make it yours",
    );
    await celebration
      .getByRole("button", { name: "Keep working", exact: true })
      .click();

    // Re-open without a reload so the live sync service can finish its write.
    await firstPage
      .getByRole("button", {
        name: "Open the Studio Masterclass tutorial",
        exact: true,
      })
      .click();
    await expect(guide).toBeVisible();
    await expect(guide.locator(".sg-sync")).toHaveClass(/is-synced/, {
      timeout: 30_000,
    });

    const completedLesson = guide
      .locator("article.sg-lesson")
      .filter({ hasText: "Borrow a groove, then make it yours" });
    await expect(completedLesson).toHaveClass(/is-done/);
  } finally {
    await firstContext.close();
  }

  // A brand-new context has empty localStorage. Anything it sees must come
  // from the account profile, which is the cross-device contract.
  const secondContext = await browser.newContext({ baseURL: BASE_URL });
  const secondPage = await secondContext.newPage();
  try {
    await signIn(secondPage, email, password);
    await secondPage.goto("/studio?guide=first-loop");

    const restoredGuide = secondPage.locator("app-studio-guide");
    await expect(restoredGuide).toBeVisible({ timeout: 30_000 });

    const restoredLesson = restoredGuide
      .locator("article.sg-lesson")
      .filter({ hasText: "Borrow a groove, then make it yours" });
    await expect(restoredLesson).toHaveClass(/is-done/, { timeout: 30_000 });
  } finally {
    await secondContext.close();
  }
});
