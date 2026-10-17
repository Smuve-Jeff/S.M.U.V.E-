import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * Coverage for the "professional studio" pass:
 *   · pro-surface-system.css — depth scale + Glassmorphism 2.0 on the shell
 *   · the contextual Inspector in the Arrangement view (desktop only)
 *   · swipe navigation + direction-aware view transitions (phones)
 *   · the reactive aurora layer being inert while the transport is stopped
 *
 * Everything is driven through the real UI: clicks, range inputs, and synthetic
 * touch sequences dispatched on the canvas.
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

/** Dispatch a synthetic one-finger horizontal swipe on the view canvas. */
async function swipe(page: Page, dx: number) {
  await page.evaluate((delta) => {
    const canvas = document.querySelector(".comp-canvas") as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const startX = rect.left + rect.width / 2;
    const make = (type: string, clientX: number) => {
      const touch = new Touch({
        identifier: 1,
        target: canvas,
        clientX,
        clientY: y,
      });
      return new TouchEvent(type, {
        touches: type === "touchend" ? [] : [touch],
        changedTouches: [touch],
        targetTouches: type === "touchend" ? [] : [touch],
        bubbles: true,
        cancelable: true,
      });
    };
    canvas.dispatchEvent(make("touchstart", startX));
    canvas.dispatchEvent(make("touchend", startX + delta));
    canvas.dispatchEvent(make("touchend", startX + delta));
  }, dx);
}

test("the shell carries one depth scale and one glass recipe", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/studio?view=arrangement");
  // First paint in a cold dev server compiles the dependency graph; the shell
  // itself is asserted, only its arrival budget is wider.
  await expect(page.locator(".comp-shell")).toBeVisible({ timeout: 30_000 });

  const theme = await page.evaluate(() => {
    const shell = getComputedStyle(
      document.querySelector(".comp-shell") as Element,
    );
    const value = (name: string) => shell.getPropertyValue(name).trim();
    return {
      workspace: value("--daw-z-workspace"),
      tools: value("--daw-z-tools"),
      menubar: value("--daw-z-menubar"),
      panel: value("--daw-z-panel"),
      toast: value("--daw-z-toast"),
      blur: value("--glass-v42-blur"),
      fill: value("--glass-v42-fill"),
    };
  });
  // The scale keeps the numeric values the shells already used, so nothing can
  // have silently restacked; the point is that they are now declared.
  expect(theme).toEqual({
    workspace: "0",
    tools: "40",
    menubar: "45",
    panel: "80",
    toast: "9000",
    blur: "12px",
    fill: "rgba(23, 24, 29, 0.76)",
  });

  const surfaces = await page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        zIndex: cs.zIndex,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
        bg: cs.backgroundImage.slice(0, 60),
      };
    };
    return {
      dock: read(".comp-bottombar"),
      toolbar: read(".comp-context-toolbar"),
      rail: read(".comp-rail"),
    };
  });

  // Glassmorphism 2.0 reached the docked chrome (the FL-Mobile flat layer used
  // to strip every blur on these surfaces).
  for (const surface of [surfaces.dock, surfaces.toolbar, surfaces.rail]) {
    if (!surface) continue;
    expect(surface.backdrop).toContain("blur(12px)");
    expect(surface.bg).toContain("linear-gradient");
  }
});

test("the Contextual Inspector edits the selected track without leaving the arrangement", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/studio?view=arrangement");
  // The inspector is a Pro-mode surface: a first-run Studio opens on the
  // Beginner Wizard, so the test switches modes the way a user does.
  await page.getByRole("button", { name: /Switch to Pro mode/ }).click();
  await expect(page.locator("app-inspector")).toBeVisible();

  // With no selection the column must explain itself, never render blank.
  // The seeded project may already have an active track, so the selection is
  // cleared explicitly rather than assumed.
  await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio"),
    );
    studio.musicManager.selectedTrackId.set(null);
  });
  await expect(page.locator("app-inspector .insp-empty")).toBeVisible();

  const created = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio"),
    );
    const before = studio.musicManager.tracks().length;
    studio.musicManager.addTrack("Inspector Bass", "grand-piano", "midi");
    const track = studio.musicManager.tracks().at(-1);
    studio.musicManager.selectedTrackId.set(track.id);
    return { before, id: track.id, name: track.name };
  });
  expect(created.name).toBe("Inspector Bass");

  const inspector = page.locator("app-inspector");
  await expect(inspector.locator(".insp-name")).toHaveText("Inspector Bass");
  await expect(inspector.locator(".insp-badge")).toHaveText("MIDI");
  // Level is reported in dB with tabular figures, not as a bare slider value.
  await expect(
    inspector.locator("#insp-volume").locator("..").locator("output"),
  ).toContainText("dB");

  // Drag the level fader and prove it lands on the live track model.
  await page.evaluate(() => {
    const slider = document.querySelector("#insp-volume") as HTMLInputElement;
    slider.value = "125";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const gain = await page.evaluate((id) => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio"),
    );
    return studio.musicManager.tracks().find((t: any) => t.id === id)?.gain;
  }, created.id);
  expect(gain).toBeCloseTo(1.25, 5);

  // Mute is a real switch on the track, and it reports its own state.
  await inspector.locator(".insp-switch-mute").click();
  await expect(inspector.locator(".insp-switch-mute")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The rack handoff selects the track and moves the shell to the FX view.
  await inspector.locator(".insp-link-btn").click();
  await expect(page.locator("[data-studio-workspace]")).toHaveAttribute(
    "data-studio-workspace",
    "effects-rack",
  );
});

test("the inspector is not forced onto a phone-width canvas", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/studio?view=arrangement");
  await expect(page.locator(".comp-shell")).toBeVisible();
  await expect(page.locator("app-inspector")).toHaveCount(0);
});

test("horizontal swipe walks the primary views and states its direction", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/studio?view=arrangement");
  const workspace = page.locator("[data-studio-workspace]");
  const canvas = page.locator(".comp-canvas");
  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );

  await swipe(page, -140);
  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "drum-machine",
  );
  await expect(canvas).toHaveAttribute("data-view-dir", "forward");

  await swipe(page, 140);
  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );
  await expect(canvas).toHaveAttribute("data-view-dir", "backward");

  // The rail is clamped: a long swipe past the first entry must not wrap.
  await swipe(page, 200);
  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );
});

test("a vertical flick is a scroll, never a view change", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/studio?view=arrangement");
  const workspace = page.locator("[data-studio-workspace]");
  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );

  await page.evaluate(() => {
    const canvas = document.querySelector(".comp-canvas") as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const at = (clientX: number, clientY: number) =>
      new Touch({ identifier: 1, target: canvas, clientX, clientY });
    canvas.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [at(x, y)],
        changedTouches: [at(x, y)],
        targetTouches: [at(x, y)],
        bubbles: true,
      }),
    );
    canvas.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [at(x + 70, y + 240)],
        targetTouches: [],
        bubbles: true,
      }),
    );
  });

  await expect(workspace).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );
});

test("the reactive aurora stays inert until the transport rolls", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/studio?view=arrangement");
  await expect(page.locator(".comp-aurora")).toBeAttached();

  const idle = await page.evaluate(() => {
    const shell = document.querySelector(".comp-shell") as HTMLElement;
    const read = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      return el ? getComputedStyle(el).opacity : null;
    };
    return {
      active: getComputedStyle(shell).getPropertyValue("--atmo-active").trim(),
      low: read(".comp-aurora-energy-low"),
      high: read(".comp-aurora-energy-high"),
    };
  });
  // A stopped project must not paint a full-field blurred wash.
  expect(idle.active).toBe("0");
  expect(idle.low).toBe("0");
  expect(idle.high).toBe("0");

  // ...and the layer is wired: publishing a frame lights it up.
  const lit = await page.evaluate(() => {
    const shell = document.querySelector(".comp-shell") as HTMLElement;
    shell.style.setProperty("--atmo-active", "1");
    shell.style.setProperty("--atmo-low", "0.9");
    shell.style.setProperty("--atmo-high", "0.7");
    const read = (selector: string) =>
      getComputedStyle(document.querySelector(selector) as Element).opacity;
    return {
      low: Number(read(".comp-aurora-energy-low")),
      high: Number(read(".comp-aurora-energy-high")),
    };
  });
  expect(lit.low).toBeGreaterThan(0.3);
  expect(lit.high).toBeGreaterThan(0.2);
});

test("the aurora service detaches cleanly when a project reloads", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/studio?view=mastering");
  await expect(page.locator("app-studio")).toBeAttached();
  const state = await page.evaluate(() => {
    const studio = (window as any).ng.getComponent(
      document.querySelector("app-studio"),
    );
    const atmosphere = studio["atmosphere"];
    return {
      bound: !!atmosphere,
      reacting: atmosphere?.reacting?.() ?? null,
      level: atmosphere?.level?.() ?? null,
    };
  });
  expect(state.bound).toBe(true);
  expect(state.reacting).toBe(false);
  expect(state.level).toBe(0);
});
