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

/**
 * Phone coverage for the composed page.
 *
 * The page draws its own chrome, so it carries the phone contract itself:
 * `100dvh` sizing with the transport inside the visual viewport, slide-over
 * panels that dock *between* the two bars, the 44/48px touch floors, and one
 * tap outside a panel to dismiss it. None of the classic-shell phone specs can
 * see any of it.
 */
const PHONE = { width: 390, height: 844 };

test.describe("phone layout", () => {
  test.use({ hasTouch: true, viewport: PHONE });

  // The file-level hook pins a desktop viewport for the composition specs, so
  // these tests have to re-pin it after it runs.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test("keeps the transport on screen without shifting or overflowing", async ({
    page,
  }) => {
    await openStudio(page);

    // Focusing a control in the swipeable top-bar row used to let the browser
    // pan the whole shell sideways (both bars and the canvas moved with it).
    await page.getByRole("button", { name: "Project", exact: true }).click();
    // Top-left of the scrim — over the backdrop, not over the bottom sheet.
    await page.locator(".panel-scrim").click({ position: { x: 20, y: 20 } });

    const layout = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".studio-shell")!;
      const bar = document
        .querySelector<HTMLElement>(".studio-transport-bar")!
        .getBoundingClientRect();
      const top = document
        .querySelector<HTMLElement>(".studio-top-bar")!
        .getBoundingClientRect();
      return {
        shellScrollLeft: shell.scrollLeft,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        barTop: bar.top,
        barLeft: bar.left,
        barBottom: bar.bottom,
        topLeft: top.left,
        viewportHeight: window.innerHeight,
      };
    });

    const overflow =
      Math.max(layout.documentWidth, layout.bodyWidth) - layout.viewportWidth;
    expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(1);
    expect(layout.shellScrollLeft, "the chrome must not pan sideways").toBe(0);
    expect(Math.round(layout.barLeft)).toBe(0);
    expect(Math.round(layout.topLeft)).toBe(0);
    // With `100vh` instead of `100dvh` these sat below the fold.
    expect(layout.barBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.barTop).toBeGreaterThan(0);
  });

  test("meets the touch floors on its own chrome", async ({ page }) => {
    await openStudio(page);

    for (const selector of [
      ".studio-mode-rail button",
      ".top-bar-actions button",
      ".transport-left button",
    ]) {
      const smallest = await page.locator(selector).evaluateAll((elements) =>
        Math.min(
          ...elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return Math.min(rect.width, rect.height);
          }),
        ),
      );
      expect(
        smallest,
        `${selector} must be at least 44px`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test("a tapped scrim dismisses the panel, and Escape does too", async ({
    page,
  }) => {
    await openStudio(page);

    await page.getByRole("button", { name: "Tools" }).click();
    const drawer = page.locator(".advanced-tools-drawer");
    await expect(drawer).toBeVisible();

    // Top-left of the scrim: on a phone the panel is a bottom sheet, so this
    // point is over the scrim rather than over the sheet.
    await page.locator(".panel-scrim").click({ position: { x: 20, y: 20 } });
    await expect(drawer).toHaveCount(0);

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.locator(".project-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".project-panel")).toHaveCount(0);
  });

  test("opens one panel at a time", async ({ page }) => {
    await openStudio(page);

    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.locator(".advanced-tools-drawer")).toBeVisible();

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.locator(".project-panel")).toBeVisible();
    await expect(page.locator(".advanced-tools-drawer")).toHaveCount(0);
  });

  test("the assistant opens from the bar and docks like the other panels", async ({
    page,
  }) => {
    await openStudio(page);

    const shell = page.locator("app-ai-assistant .ai-shell");
    await expect(shell).not.toBeInViewport();

    await page.getByRole("button", { name: "Assistant" }).click();
    await expect(shell).toBeInViewport();

    const geometry = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const topBar = box(".studio-top-bar");
      const bar = box(".studio-transport-bar");
      const panel = box("app-ai-assistant .ai-shell");
      return {
        topBarBottom: topBar.bottom,
        barTop: bar.top,
        panelTop: panel.top,
        panelBottom: panel.bottom,
      };
    });

    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.topBarBottom - 1);
    expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.barTop + 1);

    await page.locator(".panel-scrim").click({ position: { x: 20, y: 20 } });
    await expect(shell).not.toBeInViewport();
  });
});

/**
 * The panels and the scrim dock by arithmetic against the bar-height tokens, so
 * the contract can only be trusted against the bars the browser really renders.
 * Every viewport has its own bar heights — a landscape phone's are their own
 * size entirely — and a token that is a pixel short tucks a sheet's last row
 * under the transport, where the transport outranks it.
 */
for (const viewport of [
  { name: "small phone", width: 360, height: 640 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape phone", width: 844, height: 390 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`panels dock between the bars on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openStudio(page);

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.locator(".project-panel")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const topBar = box(".studio-top-bar");
      const bar = box(".studio-transport-bar");
      const panel = box(".project-panel");
      const scrim = box(".panel-scrim");
      return {
        topBarBottom: topBar.bottom,
        barTop: bar.top,
        panelTop: panel.top,
        panelBottom: panel.bottom,
        scrimTop: scrim.top,
        scrimBottom: scrim.bottom,
      };
    });

    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.topBarBottom - 1);
    expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.barTop + 1);
    expect(geometry.scrimTop).toBeGreaterThanOrEqual(geometry.topBarBottom - 1);
    expect(geometry.scrimBottom).toBeLessThanOrEqual(geometry.barTop + 1);

    // The panel must own the tier *above* the scrim it draws, or the sheet
    // paints behind its own backdrop and reads as greyed-out and disabled.
    const panelIsOnTop = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".project-panel")!;
      const rect = panel.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + 40,
      );
      return !!hit && panel.contains(hit);
    });
    expect(panelIsOnTop, "the sheet must not be painted behind its scrim").toBe(
      true,
    );
  });
}

/**
 * Force the failure the classic shell's sweep spec uses: the storage write
 * throws, so the only copy of the project is the one in memory. Restored before
 * the helper returns, so the page can save again afterwards.
 */
async function forceSaveFailure(page: Page, name = "Banner Session") {
  return page.evaluate(async (projectName) => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    const workspace = studio.projectWorkspace;
    const storage = workspace.storage;
    const original = storage.saveItem.bind(storage);
    workspace.updateMetadata({ name: projectName });
    storage.saveItem = async () => {
      throw new Error("QA simulated disk full");
    };
    try {
      await studio.save();
      return {
        error: workspace.persistenceError(),
        dirty: workspace.isDirty(),
      };
    } finally {
      storage.saveItem = original;
    }
  }, name);
}

test("surfaces a failed save with retry and a real backup download", async ({
  page,
}) => {
  await openStudio(page);
  const failure = await forceSaveFailure(page);
  expect(failure.error).toBe("QA simulated disk full");
  expect(failure.dirty).toBe(true);

  const banner = page
    .getByRole("alert")
    .filter({ hasText: "QA simulated disk full" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(
    banner.getByRole("button", { name: "Export backup" }),
  ).toBeVisible();

  // One announcement channel: the transport's status region, not the banner.
  const status = page.locator(".project-state");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveText("Save failed");

  // The escape hatch has to work precisely when persistence does not.
  const downloadPromise = page.waitForEvent("download");
  await banner.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Banner_Session_v\d+\.smuve$/);

  await banner.getByRole("button", { name: "Retry save" }).click();
  await expect(banner).toHaveCount(0);
  await expect(status).not.toHaveText("Save failed");
});

test("the save banner clears the transport on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openStudio(page);
  await forceSaveFailure(page);

  const banner = page.locator(".save-warning");
  await expect(banner).toBeVisible();

  const geometry = await page.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    const warning = box(".save-warning");
    const transport = box(".studio-transport-bar");
    return {
      warningTop: warning.top,
      warningBottom: warning.bottom,
      transportTop: transport.top,
      viewportHeight: window.innerHeight,
    };
  });

  // Above the transport, never under it: Play/Record stay reachable while the
  // project cannot be saved, which is exactly when the user needs them.
  expect(geometry.warningBottom).toBeLessThanOrEqual(geometry.transportTop + 1);
  expect(geometry.warningTop).toBeGreaterThan(0);
  expect(geometry.warningBottom).toBeLessThanOrEqual(geometry.viewportHeight);
});

test("imports a .smuve bundle and refuses one it cannot read", async ({
  page,
}) => {
  await openStudio(page);

  // Snapshot a distinctly-named session, then rename it: the import has to be
  // what puts the original name back.
  const bundle = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    studio.projectWorkspace.updateMetadata({ name: "Import Target" });
    return JSON.stringify(studio.projectWorkspace.createSnapshot());
  });
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    studio.projectWorkspace.updateMetadata({ name: "Scratch Session" });
  });

  await page.getByRole("button", { name: "Project", exact: true }).click();
  const projectName = page.locator(".studio-top-bar .project-name");
  await expect(projectName).toHaveText("Scratch Session");

  await page.locator(".import-input").setInputFiles({
    name: "Import_Target_v1.smuve",
    mimeType: "application/json",
    buffer: Buffer.from(bundle),
  });

  // An unsaved session is only replaced after an explicit confirmation.
  await page.getByRole("button", { name: "Replace project" }).click();
  await expect(projectName).toHaveText("Import Target");
  await expect(page.locator(".project-feedback")).toContainText(
    "Imported Import Target",
  );

  // A bundle whose shape the service does not recognise is refused, and the
  // imported session stays exactly as it was.
  await page.locator(".import-input").setInputFiles({
    name: "broken.smuve",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ metadata: {}, tracks: [] })),
  });
  await expect(page.locator(".studio-top-bar .project-name")).toHaveText(
    "Import Target",
  );
  await expect(page.locator(".project-feedback.error")).toBeVisible();
});

test("starts a fresh session behind consent, keeping the old one as a local set", async ({
  page,
}) => {
  await openStudio(page);

  const studio = () =>
    page.evaluate(() => {
      const cmp = (window as any).ng.getComponent(
        document.querySelector("app-studio-page"),
      );
      return {
        canUndo: cmp.history.canUndo() as boolean,
        tracks: (cmp.musicManager.tracks() as { name: string }[]).map(
          (track) => track.name,
        ),
      };
    });

  // A named session that differs from the default pair — exactly the work a
  // "new project" action can destroy.
  await page.evaluate(() => {
    const cmp = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    cmp.musicManager.newProject(false);
    cmp.musicManager.addTrack("Keeper Lead", "grand-piano");
    cmp.projectWorkspace.updateMetadata({ name: "Doomed Session" });
  });

  const projectName = page.locator(".studio-top-bar .project-name");
  const before = await studio();
  expect(before.tracks).toEqual(["Piano", "Drums", "Keeper Lead"]);

  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(projectName).toHaveText("Doomed Session");

  // Nothing is replaced while the confirmation is open — cancelling is a no-op.
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(projectName).toHaveText("Doomed Session");
  expect((await studio()).tracks).toEqual(before.tracks);

  // Confirming replaces the session with the default pair.
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Start fresh" }).click();
  await expect(projectName).toHaveText("Untitled Project");
  const after = await studio();
  expect(after.tracks).toEqual(["Piano", "Drums"]);
  await expect(page.locator("app-arrangement-view")).toBeVisible();

  // Undo must not step back into the session that was just replaced.
  expect(after.canUndo).toBe(false);

  // And the replaced work is still reachable: it was written to Local Sets
  // before the session was cleared.
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(
    page.locator(".project-row").filter({ hasText: "Doomed Session" }),
  ).toBeVisible();
});

test("guides a fresh session that has lanes but nothing on the timeline", async ({
  page,
}) => {
  await openStudio(page);
  const hint = page.locator(".session-hint");

  // A fresh project ships two default lanes, so the arrangement view's own
  // zero-track empty state never fires. This is the moment after "New project".
  await page.evaluate(() => {
    const cmp = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    cmp.musicManager.newProject(false);
  });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Nothing on the timeline yet");

  // The primary action is real, not decorative: it opens AI Produce.
  await hint.getByRole("button", { name: "Generate with AI" }).click();
  await expect(page.locator("app-ai-produce")).toBeVisible();
  await page.locator(".overlay-head .panel-close").click();
  await expect(page.locator("app-ai-produce")).toHaveCount(0);
  await expect(hint).toBeVisible();

  // A clip is the cue's own exit condition: it must not need dismissing.
  await page.evaluate(() => {
    const cmp = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    const track = cmp.musicManager.tracks()[0];
    cmp.musicManager.addClipToTrack(track.id, { start: 0, length: 4 });
  });
  await expect(hint).toHaveCount(0);

  // A new session is a new canvas, so the dismissal is not permanent...
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Start fresh" }).click();
  await expect(hint).toBeVisible();

  // ...and dismissing it sticks.
  await hint.getByRole("button", { name: "Dismiss" }).click();
  await expect(hint).toHaveCount(0);
});

test("keeps the fresh-session nudge inside the canvas on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  await page.evaluate(() => {
    const cmp = (window as any).ng.getComponent(
      document.querySelector("app-studio-page"),
    );
    cmp.musicManager.newProject(false);
  });

  const hint = page.locator(".session-hint");
  await expect(hint).toBeVisible();

  const box = (await hint.boundingBox())!;
  const transport = (await page.locator(".studio-transport-bar").boundingBox())!;
  // Inside the viewport on both edges...
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  // ...and clear of the transport, so Play/Record stay tappable.
  expect(box.y + box.height).toBeLessThanOrEqual(transport.y);

  // Stacked, both actions keep the phone touch floor.
  for (const name of ["Generate with AI", "Dismiss"]) {
    const target = await hint.getByRole("button", { name }).boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
  }
});
