import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * The Masterclass has unit coverage for its data and overlay. This is the part
 * only a browser can prove: a shared lesson link opens the real Studio, the
 * lesson's action closes the overlay without the URL re-opening it, a starter
 * groove ticks the lesson in the real surface, and the celebration hands the
 * artist to the next lesson.
 *
 * The session is seeded exactly as AuthService persists it (sessionStorage),
 * and `/api/**` is stubbed so the walkthrough never writes a real account.
 */
test("signed-in artist finishes a First Loop lesson from a shared link and opens the next one", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));

  await seedAuthenticatedSession(page);
  await page.addInitScript(() => {
    // Start this walkthrough with a clean Masterclass, but keep auth intact.
    localStorage.removeItem("smuve.studio.guide.progress.v1");
    // Skip the one-time Music Map interruption.
    localStorage.setItem("smuve_music_map_seen", "1");
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }),
  );

  // 1. A shared lesson deep link opens the guide on the requested lesson.
  await page.goto("/studio?guide=first-loop&lesson=loop-sound");
  const guide = page.locator("app-studio-guide");
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await expect(
    guide.getByText("Hear your first sound", { exact: true }).first(),
  ).toBeVisible();

  // 2. The lesson action closes the guide and lands in the real surface.
  //    The view navigation must also clear ?guide, or the query subscription
  //    re-opens the overlay immediately after it closes.
  await guide
    .getByRole("button", { name: "Open Quick Session", exact: true })
    .click();
  await expect(guide).toHaveCount(0);
  await expect(page.locator(".qs-shell")).toBeVisible();
  await expect(page).toHaveURL(/view=quick-session/);
  await expect(page).not.toHaveURL(/guide=/);

  // 3. Open another shared First Loop lesson and perform its real action.
  //    Starter loading does not depend on a headless audio device, so the
  //    auto-check assertion is deterministic in CI.
  await page.goto("/studio?guide=first-loop&lesson=loop-groove");
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await expect(
    guide.getByText("Borrow a groove, then make it yours", { exact: true }).first(),
  ).toBeVisible();

  await guide
    .getByRole("button", { name: "Load a starter groove", exact: true })
    .click();
  await expect(guide).toHaveCount(0);

  const celebration = page.locator("app-guide-completion");
  await expect(celebration).toBeVisible({ timeout: 20_000 });
  await expect(celebration).toContainText("Borrow a groove, then make it yours");
  await expect(celebration).toContainText("Build the beat");

  // 4. The celebration opens the next lesson, not just a generic guide page.
  await celebration
    .getByRole("button", { name: "Next lesson", exact: true })
    .click();

  await expect(guide).toBeVisible();
  await expect(page).toHaveURL(/guide=first-loop/);
  await expect(page).toHaveURL(/lesson=loop-drums/);
  await expect(
    guide.getByText("Build the beat", { exact: true }).first(),
  ).toBeVisible();
  await expect(celebration).toHaveCount(0);

  expect(failures).toEqual([]);
});

test("celebration stays inside a phone viewport", async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await seedAuthenticatedSession(page);
  await page.addInitScript(() => {
    localStorage.removeItem("smuve.studio.guide.progress.v1");
    localStorage.setItem("smuve_music_map_seen", "1");
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }),
  );

  await page.goto("/studio?guide=first-loop&lesson=loop-groove");
  const guide = page.locator("app-studio-guide");
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await guide
    .getByRole("button", { name: "Load a starter groove", exact: true })
    .click();

  const celebration = page.locator("app-guide-completion");
  const toast = celebration.locator(".gc-toast");
  await expect(toast).toBeVisible({ timeout: 20_000 });

  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844.5);

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  for (const button of await celebration.getByRole("button").all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
  }

  await page.screenshot({
    path: "test-results/studio-guide-celebration-mobile.png",
    animations: "disabled",
  });
});
