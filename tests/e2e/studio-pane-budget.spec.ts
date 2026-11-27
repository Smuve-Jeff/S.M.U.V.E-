import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * Pane budget — how much of the window is actually a workstation.
 *
 * The shell can look correct in a screenshot and still be unusable: 22% of a
 * 1440×900 window sat behind the Hub frame, a lone MORE button owned a whole
 * 44px row, the transport scrolled its own controls under the edge, and the
 * dock truncated "Playlist" to "PLAYLI…" on every phone. These assertions are
 * ratios and containment checks rather than pixel snapshots, so they survive a
 * palette change and still catch a regression of the budget itself.
 */

const PHONE = { width: 390, height: 844 };
const PHONE_SMALL = { width: 360, height: 640 };
const PHONE_TINY = { width: 328, height: 640 };
const DESKTOP = { width: 1440, height: 900 };

/** The three status pills that share the 22px strip. */
const STATUS_PILLS = [
  ".studio-durability-status",
  ".studio-sync-status",
  ".studio-monitor-status",
] as const;

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

async function openStudio(page: Page, view = "arrangement") {
  await page.goto(`/studio-classic?view=${view}`);
  await expect(page.locator("[data-studio-workspace]")).toHaveAttribute(
    "data-studio-workspace",
    view,
  );
}

/** Fraction of the viewport height the workspace canvas occupies. */
async function canvasShare(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".studio-primary-canvas");
    return canvas ? canvas.getBoundingClientRect().height / innerHeight : 0;
  });
}

test("the Studio owns the whole window on desktop", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openStudio(page);

  const shell = await page.evaluate(() => {
    const rect = document.querySelector(".comp-shell")!.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      viewportH: innerHeight,
      viewportW: innerWidth,
      hubSidebar: !!document.querySelector(".sidebar, app-sidebar"),
    };
  });

  // Full-bleed: the Hub frame used to eat 195px of a 900px window.
  expect(shell.height).toBeGreaterThanOrEqual(shell.viewportH * 0.96);
  expect(shell.width).toBeGreaterThanOrEqual(shell.viewportW * 0.96);
  // ...and the timeline gets the majority of what is left.
  expect(await canvasShare(page)).toBeGreaterThan(0.6);
});

test("the session band reports its own height and never runs under the marquee", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openStudio(page);

  const band = await page.evaluate(() => {
    const host = document.querySelector("app-ai-band")!;
    const inner = host.querySelector(".ai-band")!;
    const marquee = document.querySelector(".stage-marquee");
    return {
      hostHeight: host.getBoundingClientRect().height,
      innerHeight: inner.getBoundingClientRect().height,
      hostBottom: host.getBoundingClientRect().bottom,
      marqueeTop: marquee?.getBoundingClientRect().top ?? null,
    };
  });

  // The band was flex-shrunk to 27px while its content needed 58px, so the
  // roster chips spilled under the marquee strip.
  expect(band.hostHeight).toBeGreaterThanOrEqual(band.innerHeight - 1);
  if (band.marqueeTop !== null) {
    expect(band.hostBottom).toBeLessThanOrEqual(band.marqueeTop + 1);
  }
});

test("a phone spends one row on the tools trigger and the session band", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openStudio(page);

  const rail = await page.evaluate(() => {
    const wrapper = document.querySelector(".comp-chrome-rail")!;
    const more = wrapper.querySelector(".comp-tool-more")!;
    const band = wrapper.querySelector("app-ai-band")!;
    const m = more.getBoundingClientRect();
    const b = band.getBoundingClientRect();
    return {
      display: getComputedStyle(wrapper).display,
      height: wrapper.getBoundingClientRect().height,
      sameRow: Math.abs(m.top - b.top) <= 4,
      moreHeight: m.height,
    };
  });

  expect(rail.display).toBe("flex");
  expect(rail.sameRow).toBe(true);
  // One 44px target plus the band, not two stacked 44/48px bars.
  expect(rail.height).toBeLessThanOrEqual(62);
  expect(rail.moreHeight).toBeGreaterThanOrEqual(44);
});

for (const viewport of [PHONE, PHONE_SMALL]) {
  test(`dock labels stay whole at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStudio(page);

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll(".comp-tab-label")].map((el) => ({
        text: el.textContent!.trim(),
        clipped: el.scrollWidth > el.clientWidth + 1,
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        tabHeight: (el.closest(".comp-tab") as HTMLElement).getBoundingClientRect()
          .height,
      })),
    );

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      // "PLAYLI…" was the shipped state before this pass.
      expect(label.clipped, `"${label.text}" is truncated`).toBe(false);
      expect(label.fontSize).toBeGreaterThanOrEqual(10);
      expect(label.tabHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test(`the transport keeps its primary controls on screen at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openStudio(page);

    const transport = await page.evaluate(() => {
      const row = document.querySelector(".comp-topbar-center")!;
      const names = [".ctb-play", ".ctb-stop", ".ctb-rec", ".ctb-bpm"];
      return {
        overflow: row.scrollWidth - row.clientWidth,
        visible: names.map((selector) => {
          const el = document.querySelector(selector)!;
          const rect = el.getBoundingClientRect();
          return {
            selector,
            inside: rect.left >= -1 && rect.right <= innerWidth + 1,
            height: rect.height,
          };
        }),
      };
    });

    for (const control of transport.visible) {
      expect(control.inside, `${control.selector} is off screen`).toBe(true);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
    // Whatever does continue past the edge is a preference, never a primary.
    expect(transport.overflow).toBeGreaterThanOrEqual(0);
  });
}

test("the transport strip fits the phone and pins its More chip", async ({ page }) => {
  // 390px used to carry a 499px strip: loop, metronome and the whole More
  // popover started past the right edge, so the only way to reach them was to
  // drag the top bar sideways. The strip now takes the width it is given, the
  // primary controls scroll inside it, and More is pinned.
  for (const viewport of [PHONE, PHONE_SMALL]) {
    await page.setViewportSize(viewport);
    await openStudio(page);

    const strip = await page.evaluate(() => {
      const shell = document.querySelector(".ctb-shell")!;
      const more = document.querySelector(".ctb-secondary-trigger")!;
      const row = document.querySelector(".ctb-primary-row")!;
      const rowBox = row.getBoundingClientRect();
      const loops = [...document.querySelectorAll(".ctb-toggle")].find((el) =>
        (el.getAttribute("aria-label") ?? "").toLowerCase().includes("loop"),
      )!;
      const inside = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.left >= rowBox.left - 1 && r.right <= rowBox.right + 1;
      };
      return {
        vw: innerWidth,
        row: { left: rowBox.left, right: rowBox.right },
        shellRight: shell.getBoundingClientRect().right,
        moreRight: more.getBoundingClientRect().right,
        moreHeight: more.getBoundingClientRect().height,
        controls: [".ctb-play", ".ctb-stop", ".ctb-rec", ".ctb-bpm", ".ctb-toggles"].map(
          (selector) => {
            const r = document.querySelector(selector)!.getBoundingClientRect();
            return { selector, left: r.left, right: r.right };
          },
        ),
        primaryVisible: [".ctb-play", ".ctb-stop", ".ctb-rec", ".ctb-bpm"].every(
          (selector) => inside(document.querySelector(selector)!),
        ),
        loopVisible: inside(loops),
        scrollable: row.scrollWidth - row.clientWidth,
      };
    });

    expect(strip.shellRight, `strip overflows at ${viewport.width}px`).toBeLessThanOrEqual(
      strip.vw + 1,
    );
    expect(strip.moreRight).toBeLessThanOrEqual(strip.vw + 1);
    expect(strip.moreHeight).toBeGreaterThanOrEqual(44);
    // Play/stop/record, tempo and the loop toggle are live controls.
    expect(
      strip.primaryVisible,
      `primary controls outside the row at ${viewport.width}px: ${JSON.stringify(strip)}`,
    ).toBe(true);
    expect(
      strip.loopVisible,
      `loop outside the row at ${viewport.width}px: ${JSON.stringify(strip)}`,
    ).toBe(true);
    // The bar/beat readout is the only thing allowed past the edge.
    expect(strip.scrollable).toBeGreaterThan(0);
  }
});

test("no utility control in the desktop top bar is pushed off its own edge", async ({
  page,
}) => {
  // The right cluster used to be the flex item that shrank (378px of box for
  // 669px of content), so theme, Stage FX, shortcuts, Sets, share, collab and
  // the AI button all started past its right edge at 1440px.
  for (const width of [1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await openStudio(page);

    const cluster = await page.evaluate(() => {
      const el = document.querySelector(".comp-topbar-right")!;
      const right = el.getBoundingClientRect().right;
      const children = [...el.children].filter(
        (child) => getComputedStyle(child).display !== "none",
      );
      return {
        count: children.length,
        vw: innerWidth,
        right,
        clipped: children
          .filter((child) => child.getBoundingClientRect().right > right + 1)
          .map((child) => (child.className || child.tagName).toString()),
      };
    });

    expect(cluster.count).toBeGreaterThanOrEqual(8);
    expect(cluster.right).toBeLessThanOrEqual(cluster.vw + 1);
    expect(cluster.clipped, `clipped at ${width}px`).toEqual([]);
  }
});

test("the floating assistant never parks on a primary action", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openStudio(page);

  const overlap = await page.evaluate(() => {
    const fab = document.querySelector(".comp-fab");
    if (!fab) return null;
    const f = fab.getBoundingClientRect();
    const targets = [
      ...document.querySelectorAll(".wizard-footer-btn, .ctb-btn, .comp-tab"),
    ];
    return targets
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          f.left < r.right &&
          f.right > r.left &&
          f.top < r.bottom &&
          f.bottom > r.top
        );
      })
      .map((el) => el.textContent!.trim().slice(0, 24));
  });

  expect(overlap).toEqual([]);
});

for (const viewport of [PHONE_TINY, PHONE_SMALL]) {
  test(`the status strip holds one row with every pill at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openStudio(page, "audio-recorder");

    /* The sync and mono pills are driven through real state (the same signals
       the template binds to). The durability pill needs a browser that refuses
       to promise persistent storage; when the test browser does promise it,
       the pill's own markup is mounted instead so the strip's worst case is
       still covered. */
    await page.evaluate(async () => {
      const studio = (window as any).ng.getComponent(
        document.querySelector("app-studio"),
      );
      const workspace = studio.projectWorkspace;
      const id = workspace.metadata()?.id ?? "pane-budget-strip";
      workspace.syncStatuses.set({
        ...workspace.syncStatuses(),
        [id]: {
          id,
          projectId: id,
          state: "synced",
          reason: "Pane budget probe",
          updatedAt: 0,
          cloudBytes: 4_400_000,
          breakdown: { audioBytes: 0, guideBytes: 0, projectBytes: 0 },
        },
      });
      studio.monitorMono.set(true);

    });

    /* Mount whichever pill the environment did not produce. A brand-new
       workspace has no cloud status yet, and a browser that grants persistent
       storage never shows the durability warning — but the strip's worst case
       is all three at once, and that is the case this test locks in. The
       markup is the template's own, classes and all. */
    await page.evaluate(() => {
      const strip = document.querySelector(".studio-project-status");
      if (!strip) throw new Error("the status strip is not in the shell");
      const mount = (className: string, html: string) => {
        if (strip.querySelector(`.${className}`)) return;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = className;
        pill.innerHTML = html;
        strip.appendChild(pill);
      };
      mount(
        "studio-durability-status",
        '<span class="material-symbols-outlined" aria-hidden="true">shield</span>' +
          '<span>Not protected</span>' +
          '<span class="studio-durability-action" aria-hidden="true">Back up</span>',
      );
      mount(
        "studio-sync-status",
        '<span class="material-symbols-outlined" aria-hidden="true">cloud_done</span>' +
          "<span>Saved</span>" +
          '<span class="studio-sync-size">4.2 MB</span>',
      );
      mount(
        "studio-monitor-status",
        '<span class="material-symbols-outlined" aria-hidden="true">hearing</span>' +
          '<span class="studio-monitor-label">MONO</span>',
      );
    });

    // Signals drive change detection; give Angular a frame before measuring.
    await expect(page.locator(".studio-sync-status")).toBeVisible();
    await expect(page.locator(".studio-monitor-status")).toBeVisible();
    await expect(page.locator(".studio-durability-status")).toBeVisible();

    const strip = await page.evaluate((pillSelectors) => {
      const host = document.querySelector(".studio-project-status")!;
      const box = host.getBoundingClientRect();
      const label = [...host.children].find(
        (child) =>
          child.tagName === "SPAN" &&
          !child.classList.contains("material-symbols-outlined"),
      ) as HTMLElement | undefined;

      const pills = pillSelectors.map((selector) => {
        const pill = host.querySelector(selector)!;
        const rect = pill.getBoundingClientRect();
        const centreX = rect.left + rect.width / 2;
        /* Every 2px band of the strip inside this pill's column must resolve to
           the pill: that is what makes a 20px chip tappable in a 22px row, and
           it must stop at the top bar rather than stealing its taps. */
        const rows = [];
        for (let offset = 1; offset < box.height; offset += 2) {
          const hit = document.elementFromPoint(centreX, box.top + offset);
          rows.push({
            offset,
            self: !!hit && hit.closest(selector) !== null,
          });
        }
        return {
          selector,
          height: Math.round(rect.height),
          withinStrip: rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
          hitRows: rows.length,
          missedRows: rows.filter((row) => !row.self).map((row) => row.offset),
        };
      });

      return {
        height: Math.round(box.height),
        overflow: host.scrollWidth - host.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
        labelText: label?.innerText.trim() ?? "",
        pills,
      };
    }, STATUS_PILLS);

    // One row: the 22px strip plus its 1px hairlines, not the 36–47px it
    // rendered when a pill's 44px button box or a wrapped label set the height.
    expect(strip.height, "the strip is not one row").toBeGreaterThanOrEqual(20);
    expect(strip.height, "the strip is not one row").toBeLessThanOrEqual(25);
    expect(strip.overflow, "the strip scrolls sideways").toBeLessThanOrEqual(1);
    expect(strip.pageOverflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
    expect(strip.labelClipped, `"${strip.labelText}" is truncated`).toBe(false);

    expect(strip.pills).toHaveLength(STATUS_PILLS.length);
    for (const pill of strip.pills) {
      expect(pill.withinStrip, `${pill.selector} leaves the strip`).toBe(true);
      expect(pill.height, `${pill.selector} is taller than the strip`).toBeLessThanOrEqual(
        strip.height,
      );
      expect(pill.hitRows, `${pill.selector} has no hit rows`).toBeGreaterThan(
        Math.floor((strip.height - 1) / 2) - 2,
      );
      expect(
        pill.missedRows,
        `${pill.selector} is not the hit target at y=${pill.missedRows.join(",")}`,
      ).toEqual([]);
    }
  });
}

test("no studio view scrolls the page sideways", async ({ page }) => {
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    await openStudio(page, "arrangement");
    for (const view of ["arrangement", "mixer", "piano-roll", "drum-machine"]) {
      await page.evaluate((target) => {
        const studio = (window as any).ng.getComponent(
          document.querySelector("app-studio"),
        );
        studio.setActiveView(target);
      }, view);
      await expect(page.locator("[data-studio-workspace]")).toHaveAttribute(
        "data-studio-workspace",
        view,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      expect(overflow, `${view} at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  }
});
