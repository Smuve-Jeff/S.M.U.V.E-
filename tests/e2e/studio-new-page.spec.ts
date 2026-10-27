import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * Coverage for the studio page that now owns `/studio`.
 *
 * The page is a composition layer: it hosts the real arrangement, recorder,
 * mixer, inspector and export surfaces, so these specs drive the composition —
 * mode switching, the transport shell, the inspector's collapse, export
 * options — and the routing rules around it (deep-link mapping and forwarding
 * legacy views to the classic shell).
 */

const DESKTOP = { width: 1440, height: 900 };

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.setViewportSize(DESKTOP);
});

async function openStudio(page: Page, query = "") {
  await page.goto(`/studio${query}`);
  await expect(page.locator(".studio-top-bar")).toBeVisible();
}

function modeButton(page: Page, label: string) {
  return page.locator(".studio-mode-rail button").filter({ hasText: label });
}

test("renders the studio page shell with the arrangement workspace", async ({
  page,
}) => {
  await openStudio(page);

  await expect(page.locator(".studio-top-bar .brand")).toHaveText("S.M.U.V.E.");
  await expect(page.locator(".studio-mode-rail button")).toHaveCount(5);
  await expect(page.locator(".workspace-title h2")).toHaveText("Arrange");
  await expect(page.locator("app-arrangement-view")).toBeVisible();
  await expect(page.locator("app-inspector")).toBeVisible();
  await expect(page.locator(".studio-transport-bar")).toBeVisible();
});

test("switches every workspace mode from the rail", async ({ page }) => {
  await openStudio(page);

  await modeButton(page, "Create").click();
  await expect(page.locator(".workspace-title h2")).toHaveText("Create");
  await expect(page.locator("app-audio-recorder-view")).toBeVisible();

  await modeButton(page, "Keys").click();
  await expect(page.locator(".workspace-title h2")).toHaveText("Keys");
  await expect(page.locator("app-piano-roll")).toBeVisible();

  await modeButton(page, "Mix").click();
  await expect(page.locator(".workspace-title h2")).toHaveText("Mix");
  await expect(page.locator("app-mixer")).toBeVisible();

  await modeButton(page, "Export").click();
  await expect(page.locator(".workspace-title h2")).toHaveText("Export");
  await expect(page.locator(".export-card")).toBeVisible();

  await modeButton(page, "Arrange").click();
  await expect(page.locator("app-arrangement-view")).toBeVisible();
});

test("opens the deep-linked mode from the view query parameter", async ({
  page,
}) => {
  await page.goto("/studio?view=mixer");
  await expect(page.locator(".workspace-title h2")).toHaveText("Mix");

  await page.goto("/studio?view=arrangement");
  await expect(page.locator(".workspace-title h2")).toHaveText("Arrange");

  await page.goto("/studio?view=piano-roll");
  await expect(page.locator(".workspace-title h2")).toHaveText("Keys");
});

test("forwards a legacy view to the classic studio shell", async ({ page }) => {
  await page.goto("/studio?view=mastering");

  await expect(page).toHaveURL(/\/studio-classic\?view=mastering/);
  await expect(page.locator(".comp-shell")).toBeVisible();
});

test("exposes the live transport controls", async ({ page }) => {
  await openStudio(page);

  await expect(page.locator(".transport-left button")).toHaveCount(5);
  await expect(page.locator(".transport-center")).toContainText("Tempo:");

  // The loop state is engine state, so it must come back after re-toggling.
  const loop = page.locator(".loop-toggle");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "false");

  const metronome = page.locator(".metronome-toggle");
  await expect(metronome).toHaveAttribute("aria-pressed", "false");
  await metronome.click();
  await expect(metronome).toHaveAttribute("aria-pressed", "true");
  await metronome.click();
  await expect(metronome).toHaveAttribute("aria-pressed", "false");
});

test("exposes project history controls", async ({ page }) => {
  await openStudio(page);

  const history = page.locator(".transport-left .history-toggle");
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toHaveText("Undo");
  await expect(history.nth(1)).toHaveText("Redo");
});

test("collapses and restores the inspector", async ({ page }) => {
  await openStudio(page);

  const inspector = page.locator("app-inspector");
  await expect(inspector.locator(".insp-body")).toBeVisible();

  await inspector.locator(".insp-toggle").click();
  await expect(inspector.locator(".insp-body")).toHaveCount(0);

  await inspector.locator(".insp-toggle").click();
  await expect(inspector.locator(".insp-body")).toBeVisible();
});

test("exposes working export options", async ({ page }) => {
  await openStudio(page);
  await modeButton(page, "Export").click();

  const selects = page.locator(".export-card .export-field select");
  await expect(selects).toHaveCount(3);

  const mixdown = page.locator(".export-card .export-actions button").first();
  await expect(mixdown).toHaveText(/WAV 24-bit/);

  await selects.nth(0).selectOption("mp3");
  await expect(mixdown).toHaveText(/MP3 192k/);

  await selects.nth(1).selectOption("48000");
  await expect(selects.nth(1)).toHaveValue("48000");

  await selects.nth(2).selectOption("16");
  await expect(selects.nth(2)).toHaveValue("16");
});
