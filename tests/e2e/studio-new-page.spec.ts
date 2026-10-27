import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";
import { STUDIO_SURFACES } from "../../src/app/studio/studio-surfaces";

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

/**
 * The composed page hosts ten of the Studio's surfaces and routes the rest to
 * the classic shell. What it must never do is leave one with no way in — the
 * hand-written tool list it used to carry covered five and orphaned twelve.
 */
test("lists every studio surface and reaches each one", async ({ page }) => {
  await openStudio(page);
  const drawer = page.locator(".advanced-tools-drawer");
  const rows = drawer.locator("button[data-surface]");

  await page.getByRole("button", { name: "Tools" }).click();
  await expect(rows).toHaveCount(STUDIO_SURFACES.length);

  // Every row names its destination in its accessible label, and the ones that
  // leave the page say so.
  for (const surface of STUDIO_SURFACES) {
    const row = drawer.locator(`button[data-surface="${surface.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute(
      "aria-label",
      surface.id === "arrangement" ||
        surface.id === "piano-roll" ||
        surface.id === "mixer" ||
        surface.id === "audio-recorder" ||
        surface.id === "effects-rack" ||
        ["synthesizer", "plugins", "sampler", "sound-browser", "ai-produce"].includes(
          surface.id,
        )
        ? `Open ${surface.label}`
        : `Open ${surface.label} in the classic studio`,
    );
  }

  // A surface the page hosts itself: switches the workspace, no navigation.
  await drawer.locator('button[data-surface="mixer"]').click();
  await expect(page.locator(".workspace-title h2")).toHaveText("Mix");

  // It is marked as the current location when the list is reopened.
  await page.getByRole("button", { name: "Tools" }).click();
  await expect(
    drawer.locator('button[data-surface="mixer"]'),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    drawer.locator('button[data-surface="drum-machine"]'),
  ).not.toHaveAttribute("aria-current", "true");

  // A surface the page does not host: routed to the shell that renders it.
  await drawer.locator('button[data-surface="drum-machine"]').click();
  await expect(page).toHaveURL(/\/studio-classic\?view=drum-machine/);
  await expect(page.locator(".comp-shell")).toBeVisible();
  await expect(page.locator("app-drum-machine")).toBeVisible();
});

test("opens a page-hosted tool from the surface list", async ({ page }) => {
  await openStudio(page);
  await page.getByRole("button", { name: "Tools" }).click();

  await page
    .locator('.advanced-tools-drawer button[data-surface="plugins"]')
    .click();
  await expect(page.locator("app-plugin-store")).toBeVisible();
  await page.locator(".overlay-head .panel-close").click();
  await expect(page.locator("app-plugin-store")).toHaveCount(0);

  // The FX rack is its own destination, not a tool overlay.
  await page.getByRole("button", { name: "Tools" }).click();
  await page
    .locator('.advanced-tools-drawer button[data-surface="effects-rack"]')
    .click();
  await expect(page.locator("app-effects-rack-ui")).toBeVisible();
});

test("keeps the whole surface list usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  await page.getByRole("button", { name: "Tools" }).click();

  const sheet = page.locator(".advanced-tools-drawer");
  const rows = sheet.locator("button[data-surface]");
  await expect(rows).toHaveCount(STUDIO_SURFACES.length);

  // The sheet is scrollable, so the last surface is reachable by swiping...
  const scrollable = await sheet.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 40,
  );
  expect(scrollable).toBe(true);

  // ...and a tap on a row below the fold still lands, inside the thumb zone.
  const last = rows.last();
  await last.scrollIntoViewIfNeeded();
  const box = (await last.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await last.click();
  await expect(page.locator(".workspace-title h2")).toBeVisible();
});

/**
 * The palette is the third way into the Studio (besides the mode rail and the
 * Tools list), and the only one reachable from anywhere in the app. It already
 * listed seven surfaces as "Open X" through the workspace registry; the rest
 * were unreachable from it. The actions are generated from the shared catalogue,
 * so this drives the two destination kinds it contributes.
 */
test("opens the remaining studio surfaces from the command palette", async ({
  page,
}) => {
  await openStudio(page);
  const paletteInput = page.getByPlaceholder(/Search commands/);

  // A surface the palette could not reach, and the page does not host: the
  // `?view=` route forwards it to the shell that renders it.
  await page.keyboard.press("Control+k");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("channel rack");
  await page
    .locator('[data-action-id="studio-surface-channel-rack"]')
    .click();
  await expect(page).toHaveURL(/\/studio-classic\?view=channel-rack/);
  await expect(page.locator("app-channel-rack")).toBeVisible();

  // A surface the page hosts: same route, but the page switches workspace.
  await page.goto("/studio?view=mixer");
  await expect(page.locator(".workspace-title h2")).toHaveText("Mix");
  await page.keyboard.press("Control+k");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("arrangement");
  await page.locator('[data-action-id="studio-surface-arrangement"]').click();
  await expect(page).toHaveURL(/\/studio\?view=arrangement/);
  await expect(page.locator(".workspace-title h2")).toHaveText("Arrange");

  // No destination is listed twice: surfaces the palette already offered as
  // "Open X" must not also appear as "Studio: X".
  await page.goto("/studio");
  await expect(page.locator(".studio-top-bar")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(paletteInput).toBeVisible();
  for (const alreadyListed of ["drum-machine", "mixer", "piano-roll"]) {
    await expect(
      page.locator(`[data-action-id="studio-surface-${alreadyListed}"]`),
    ).toHaveCount(0);
  }
  // …while the surfaces it could not reach are all there.
  expect(
    await page.locator('[data-action-id^="studio-surface-"]').count(),
  ).toBeGreaterThan(6);
});

/**
 * Escape used to reach only the docked slide-overs. The four full-surface
 * editors (tools, FX rack, curve editor, versions) cover the workspace, and
 * their only way out was a Close button in the far corner — the same small
 * target the scrim exists to spare you. Dismissal is now layered, one surface
 * per press, innermost first.
 */
test("Escape dismisses the workspace overlays, then the docked panels", async ({
  page,
}) => {
  await openStudio(page);
  const drawer = page.locator(".advanced-tools-drawer");
  const overlay = page.locator(".workspace-overlay");

  await page.locator(".top-bar-actions button").filter({ hasText: "Tools" }).click();
  await expect(drawer).toBeVisible();

  await drawer.locator('[data-surface="synthesizer"]').click();
  await expect(overlay).toHaveCount(1);
  await expect(overlay.locator(".overlay-head h3")).toHaveText("Synths");

  // One press closes the overlay...
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);

  // ...the next closes the drawer it was opened from.
  await page.locator(".top-bar-actions button").filter({ hasText: "Tools" }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // With nothing open, Escape is not a navigation key: the page stays put.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/studio(\?|$)/);
  await expect(page.locator("app-arrangement-view")).toBeVisible();
});

/**
 * The page had no keyboard shortcuts of its own, while the classic shell
 * answered ⌘S/⌘E/⌘Z/⌘I — so the same app had two different sets of keys
 * depending on which studio you were in.
 */
test("answers the studio keyboard shortcuts and yields to text fields", async ({
  page,
}) => {
  await openStudio(page);

  await page.keyboard.press("Control+e");
  await expect(page.locator(".workspace-title h2")).toHaveText("Export");

  await page.keyboard.press("Control+i");
  await expect(page.locator(".ai-shell")).toHaveClass(/ai-shell-open/);

  await page.keyboard.press("Escape");
  await expect(page.locator(".ai-shell")).not.toHaveClass(/ai-shell-open/);

  // ⌘E inside a field is the platform's own "end of line", not an export.
  await modeButton(page, "Arrange").click();
  await page.locator(".top-bar-actions button").filter({ hasText: "Project" }).click();
  const nameField = page.locator(".project-field input").first();
  await nameField.focus();
  await page.keyboard.press("Control+e");
  await expect(page.locator(".workspace-title h2")).toHaveText("Arrange");
});

/**
 * The page renders its own footer transport, so `app-transport-bar` — the
 * component that owns Space/R/M in the classic shell — is not on the page and
 * nothing was listening for them. M is asserted through the metronome's
 * pressed state because it is the one transport key that changes a signal
 * without needing an audio device.
 */
test("answers the transport keys the classic shell's transport bar owns", async ({
  page,
}) => {
  await openStudio(page);
  const metronome = page.locator(".metronome-toggle");

  await expect(metronome).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("m");
  await expect(metronome).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("M");
  await expect(metronome).toHaveAttribute("aria-pressed", "false");

  // Focused controls keep Space for themselves: the browser activates them
  // natively, and claiming it too would fire the action twice. Loop is the
  // audio-free control to prove it with (Play would start the engine).
  const loop = page.locator(".loop-toggle");
  await loop.focus();
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(" ");
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  // …and the page did not ALSO start the transport from the same press.
  await expect(
    page.locator(".transport-left button").filter({ hasText: "Play" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(metronome).toHaveAttribute("aria-pressed", "false");

  // A text field owns its letters, so typing "m" in the project name never
  // toggles the click track.
  await page.locator(".top-bar-actions button").filter({ hasText: "Project" }).click();
  const nameField = page.locator(".project-field input").first();
  await nameField.click();
  await page.keyboard.type("mm");
  await expect(metronome).toHaveAttribute("aria-pressed", "false");
});

/**
 * The page answered eleven keys and showed none of them. The cheat sheet is
 * the shell's help affordance, re-hosted: it leads with the transport keys a
 * first-time user tries, and it lists nothing that the page does not answer.
 */
test("shows a cheat sheet of the keys the page actually answers", async ({
  page,
}) => {
  await openStudio(page);
  const card = page.locator(".shortcuts-card");
  const trigger = page
    .locator(".top-bar-actions button")
    .filter({ hasText: "Shortcuts" });

  await trigger.click();
  await expect(card).toBeVisible();
  await expect(card.locator(".shortcuts-head h3")).toHaveText("Studio shortcuts");

  // One row per advertised shortcut, and the three the shell's popover leads
  // with are among them.
  await expect(card.locator(".shortcuts-row")).toHaveCount(11);
  for (const label of ["Play / pause", "Record", "Metronome"]) {
    await expect(
      card.locator(".shortcuts-row").filter({ hasText: label }),
    ).toHaveCount(1);
  }

  // The scrim is the tap-to-dismiss the rest of the page uses.
  await page.locator(".shortcuts-scrim").click({ position: { x: 8, y: 8 } });
  await expect(card).toHaveCount(0);

  // "?" opens it, and it is the *top* layer: Escape takes the sheet and leaves
  // the panel it was opened over untouched.
  const drawer = page.locator(".advanced-tools-drawer");
  await page.locator(".top-bar-actions button").filter({ hasText: "Tools" }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Shift+Slash");
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(drawer).toBeVisible();
});

/**
 * Space used to be claimed only when the focused element was not focusable at
 * all, so it was dead on every canvas the user had clicked into. It now yields
 * only to the controls that consume it — and the piano roll, which does consume
 * it for cell preview, still wins by handling the key first.
 */
test("keeps Space alive on the workspace, and the piano roll's own use of it", async ({
  page,
}) => {
  await openStudio(page);
  const play = page
    .locator(".transport-left button")
    .filter({ hasText: "Play" });

  // A focusable surface that never uses Space: the key belongs to the page.
  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "space-probe";
    probe.tabIndex = 0;
    probe.style.cssText = "position:fixed;top:0;left:0;width:4px;height:4px";
    document.body.appendChild(probe);
  });
  await page.locator("#space-probe").focus();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => document.querySelector("#space-probe")?.remove());

  // The piano roll's grid is focusable *and* handles Space for preview. It
  // prevents the default, so the page must not also start the transport.
  await modeButton(page, "Keys").click();
  const grid = page.locator(".pr-grid");
  await grid.focus();
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

/**
 * Metronome and Loop are habits, not settings: an artist turns the click on at
 * the top of a session and expects it to survive an accidental reload. Both were
 * plain signals, so every reload reset them silently.
 */
test("keeps the metronome and loop toggles across a reload", async ({ page }) => {
  await openStudio(page);
  const metronome = page.locator(".metronome-toggle");
  const loop = page.locator(".loop-toggle");

  await expect(metronome).toHaveAttribute("aria-pressed", "false");
  await expect(loop).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("m");
  await loop.click();
  await expect(metronome).toHaveAttribute("aria-pressed", "true");
  await expect(loop).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator(".studio-top-bar")).toBeVisible();
  await expect(page.locator(".metronome-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".loop-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // …and turning them back off is remembered too, rather than the two toggles
  // disagreeing about which state is the "saved" one.
  await page.keyboard.press("m");
  await page.locator(".loop-toggle").click();
  await page.reload();
  await expect(page.locator(".studio-top-bar")).toBeVisible();
  await expect(page.locator(".metronome-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator(".loop-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
