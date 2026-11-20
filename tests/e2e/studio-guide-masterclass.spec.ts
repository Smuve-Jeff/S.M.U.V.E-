import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * Seed a real session and open the routed Masterclass, waiting out the route
 * enter animation so every geometry read comes from the settled frame.
 */
async function openFullPageMasterclass(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await seedAuthenticatedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem("smuve_music_map_seen", "1");
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }),
  );

  await page.goto("/masterclass");
  const shell = page.locator(".sg-shell.is-page");
  await expect(shell).toBeVisible({ timeout: 30_000 });

  // The routed component enters with a 320ms `translateY(12px)` animation.
  await expect
    .poll(
      async () => {
        const box = await shell.boundingBox();
        return box ? Math.max(box.x, box.y) : 999;
      },
      { message: "the Masterclass settles at the top-left of the viewport" },
    )
    .toBeLessThanOrEqual(0.5);
}

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
    .first()
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
    guide
      .getByText("Borrow a groove, then make it yours", { exact: true })
      .first(),
  ).toBeVisible();

  await guide
    .getByRole("button", { name: "Load a starter groove", exact: true })
    .click();
  await expect(guide).toHaveCount(0);

  const celebration = page.locator("app-guide-completion");
  await expect(celebration).toBeVisible({ timeout: 20_000 });
  await expect(celebration).toContainText(
    "Borrow a groove, then make it yours",
  );
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

/**
 * `/masterclass` is a full-page workspace, not a page inside the Hub frame.
 * Rendered under the app top bar and the mobile dock, an Android phone spent
 * roughly 150px — a quarter of a landscape screen — before the guide's own
 * header even started. These assertions are geometric, so a palette or copy
 * change cannot make a broken frame pass.
 */
test.describe("full-page Masterclass", () => {
  test.use({ hasTouch: true });

  for (const viewport of [
    { name: "Android portrait", width: 412, height: 915 },
    { name: "Android landscape", width: 915, height: 412 },
  ]) {
    test(`owns the whole ${viewport.name} viewport`, async ({ page }) => {
      await openFullPageMasterclass(page, viewport);

      // The Hub chrome is not merely hidden behind the guide: it is absent
      // from the DOM, so it cannot steal height or intercept a corner control.
      await expect(page.locator(".app-top-bar")).toHaveCount(0);
      await expect(page.locator(".sidebar")).toHaveCount(0);
      await expect(page.locator(".mobile-footer-container")).toHaveCount(0);

      const layout = await page.evaluate(() => {
        const shellRect = document
          .querySelector(".sg-shell")!
          .getBoundingClientRect();
        const pageRect = document
          .querySelector(".masterclass-page")!
          .getBoundingClientRect();
        const bodyRect = document
          .querySelector(".sg-scroll")!
          .getBoundingClientRect();
        return {
          shell: {
            x: shellRect.x,
            y: shellRect.y,
            width: shellRect.width,
            height: shellRect.height,
          },
          pageHeight: pageRect.height,
          bodyHeight: bodyRect.height,
          viewportW: innerWidth,
          viewportH: innerHeight,
          scrollW: document.documentElement.scrollWidth,
          bodyOverflowY: getComputedStyle(document.querySelector(".sg-scroll")!)
            .overflowY,
        };
      });

      // Full-bleed at both orientations: no frame above, below or beside.
      expect(layout.shell.x).toBeLessThanOrEqual(0.5);
      expect(layout.shell.y).toBeLessThanOrEqual(0.5);
      expect(layout.shell.width).toBeGreaterThanOrEqual(layout.viewportW - 1);
      expect(layout.shell.height).toBeGreaterThanOrEqual(layout.viewportH - 1);
      expect(layout.pageHeight).toBeGreaterThanOrEqual(layout.viewportH - 1);

      // A 412px-wide phone must not gain a sideways scroll from the header,
      // the tab strip or the lesson cards.
      expect(layout.scrollW).toBeLessThanOrEqual(layout.viewportW + 1);

      // The guide keeps its own navigation pinned and scrolls only its body,
      // which has to remain the majority of a 412px-tall landscape screen.
      expect(layout.bodyOverflowY).toBe("auto");
      expect(layout.bodyHeight).toBeGreaterThan(layout.viewportH * 0.6);
      await expect(page.locator(".sg-header h1")).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".sg-tabs")).toBeInViewport({ ratio: 1 });

      // The page carries its own way back, and no floating shell pill may sit
      // over the lesson actions in the bottom-right corner.
      await expect(
        page.getByRole("button", { name: "Back to the Studio" }),
      ).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".universal-home-link")).toHaveCount(0);
    });
  }
});

/**
 * Desktop Chrome has the opposite risk: a full-window shell with no measure
 * stretches lesson copy across the whole monitor. The page keeps the header,
 * progress rail, tab strip and lesson body on one centred column — 1280px once
 * the window is wide enough, and the window minus 24px gutters below that —
 * while the shell itself stays edge to edge.
 */
test.describe("full-page Masterclass · desktop Chrome", () => {
  for (const viewport of [
    { name: "wide desktop", width: 1440, height: 900, measure: 1280 },
    { name: "narrow desktop", width: 800, height: 600, measure: 752 },
  ]) {
    test(`centres a ${viewport.measure}px reading measure at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await openFullPageMasterclass(page, viewport);

      // Full-page workspaces drop the Hub frame, desktop included.
      await expect(page.locator(".app-top-bar")).toHaveCount(0);
      await expect(page.locator(".mobile-footer-container")).toHaveCount(0);

      const layout = await page.evaluate(() => {
        /** Width of the column inside its gutter, measured from the box edge. */
        const readColumn = (selector: string, edge: "padding" | "margin") => {
          const element = document.querySelector(selector)!;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          // Padding sits inside the border box; margins already sit outside
          // the rect and must not be subtracted twice.
          const leftInset =
            edge === "padding" ? parseFloat(style.paddingLeft) : 0;
          const rightInset =
            edge === "padding" ? parseFloat(style.paddingRight) : 0;
          return {
            selector,
            width: rect.width - leftInset - rightInset,
            left: rect.left + leftInset,
            rightGap: innerWidth - (rect.right - rightInset),
          };
        };

        const shell = document
          .querySelector(".sg-shell")!
          .getBoundingClientRect();
        return {
          shell: {
            x: shell.x,
            y: shell.y,
            width: shell.width,
            height: shell.height,
          },
          columns: [
            readColumn(".sg-header", "padding"),
            readColumn(".sg-progress", "margin"),
            readColumn(".sg-tabs", "padding"),
            readColumn(".sg-scroll", "padding"),
          ],
          viewportW: innerWidth,
          viewportH: innerHeight,
          scrollW: document.documentElement.scrollWidth,
        };
      });

      // The shell is the window; the measure lives inside it.
      expect(layout.shell.x).toBeLessThanOrEqual(0.5);
      expect(layout.shell.y).toBeLessThanOrEqual(0.5);
      expect(layout.shell.width).toBeGreaterThanOrEqual(layout.viewportW - 1);
      expect(layout.shell.height).toBeGreaterThanOrEqual(layout.viewportH - 1);
      expect(layout.scrollW).toBeLessThanOrEqual(layout.viewportW + 1);

      // Every reading surface shares the one column and the same gutter, so
      // the header cannot float wider than the lesson it introduces.
      const gutter = (layout.viewportW - viewport.measure) / 2;
      for (const column of layout.columns) {
        expect(column.width, `${column.selector} measure`).toBeCloseTo(
          viewport.measure,
          0,
        );
        expect(column.left, `${column.selector} left gutter`).toBeCloseTo(
          gutter,
          0,
        );
        expect(column.rightGap, `${column.selector} right gutter`).toBeCloseTo(
          gutter,
          0,
        );
      }
    });
  }
});
