import { test, expect, type Page } from "@playwright/test";
import { seedAuthenticatedSession } from "./helpers";

/**
 * Coverage for src/studio-adaptive-display.css (Adaptive Display layer 4.0).
 *
 * The layer is a CSS-only deliverable, so it is verified in a real renderer
 * rather than by asserting that text exists on disk:
 *
 *   1. the build retains every capability block (a syntax error or an
 *      aggressive CSS optimizer would silently drop one);
 *   2. `prefers-contrast: more` actually repaints the shipped chrome — both the
 *      palette remap and the structural hairline fallback;
 *   3. `forced-colors: active` restores the active-destination state that is
 *      otherwise expressed only as a box-shadow (which force-colours strips);
 *   4. the overrides stay scoped to the shell instead of mutating :root.
 *
 * `prefers-contrast: less`, `dynamic-range: high` and
 * `prefers-reduced-transparency` cannot be emulated through CDP, so those three
 * blocks are covered by check (1) only. Stated here rather than assumed.
 */

const STUDIO = "/studio?view=arrangement";

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

type Block = { condition: string; cssText: string };

/** Every preference/capability media block the browser retained, normalized. */
function collectCapabilityBlocks(page: Page): Promise<Block[]> {
  return page.evaluate(() => {
    const KEYS = [
      "prefers-contrast",
      "forced-colors",
      "dynamic-range",
      "reduced-transparency",
    ];
    const found: { condition: string; cssText: string }[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) {
          const condition = rule.conditionText;
          if (KEYS.some((key) => condition.replace(/\s+/g, "").includes(key))) {
            found.push({ condition, cssText: rule.cssText });
          }
          walk(rule.cssRules);
        } else if (
          rule.constructor.name === "CSSSupportsRule" ||
          rule.constructor.name === "CSSLayerBlockRule"
        ) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* cross-origin sheet — ours are same-origin, so skipping is safe */
      }
    }
    return found;
  });
}

const squeeze = (value: string) => value.replace(/\s+/g, "");

/** `rgb(a)` channel values from any computed colour string. */
function channels(color: string): number[] {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return [0, 0, 0, 0];
  return match[1].split(",").map((part) => Number(part.trim()));
}

/** Alpha of a computed colour (1 when it is fully opaque `rgb()`). */
function alphaOf(color: string): number {
  const values = channels(color);
  return values.length > 3 ? values[3] : 1;
}

/** Rough relative luminance, 0 (black) … 1 (white). Enough to tell a graphite
    hairline from a white one without pulling in a colour library. */
function relativeLuminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The retained CSS for one capability block, or a readable failure. */
function blockFor(blocks: Block[], condition: string): string {
  const wanted = squeeze(condition);
  const hit = blocks.find((block) => squeeze(block.condition) === wanted);
  expect(hit, `no retained @media block for ${condition}`).toBeDefined();
  return squeeze(hit!.cssText);
}

/** Tokens + the structural hairline the layer is expected to move. */
function readShell(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".comp-shell") as HTMLElement | null;
    if (!shell) return null;
    const shellStyle = getComputedStyle(shell);
    const bar = document.querySelector(".comp-bottombar") as HTMLElement | null;
    return {
      muted: shellStyle.getPropertyValue("--stage-muted").trim(),
      line: shellStyle.getPropertyValue("--stage-line").trim(),
      barBorder: bar ? getComputedStyle(bar).borderTopColor : null,
    };
  });
}

test("the build keeps every capability block of the adaptive display layer", async ({
  page,
}) => {
  await page.goto(STUDIO);
  await expect(page.locator(".comp-shell")).toBeVisible();
  const blocks = await collectCapabilityBlocks(page);

  // 1. prefers-contrast: more — palette remap + non-colour state cue
  const more = blockFor(blocks, "(prefers-contrast: more)");
  expect(more).toContain("--stage-muted:#eef2fa!important");
  expect(more).toContain("--fl-line:rgba(255,255,255,0.72)!important");
  expect(more).toContain("--adc-hair-line");
  expect(more).toContain("outline-offset:-2px!important");

  // 2. prefers-contrast: less — glow budget + decoration removal
  const less = blockFor(blocks, "(prefers-contrast: less)");
  expect(less).toContain("--adc-marquee-opacity:0.24");
  expect(less).toContain("comp-aurora-blob");
  expect(less).toContain("box-shadow:none!important");

  // 3. forced-colors: active — system keywords, never the authored hues.
  //    Chromium's CSSOM lowercases system colours on serialization, so compare
  //    case-insensitively rather than on the authored spelling.
  const forced = blockFor(blocks, "(forced-colors: active)");
  expect(forced.toLowerCase()).toContain("canvastext");
  expect(forced.toLowerCase()).toContain("highlight");

  // 4. dynamic-range: high — true-black canvas
  expect(blockFor(blocks, "(dynamic-range: high)")).toContain(
    "--fl-bg:#000000!important",
  );

  // 5. prefers-reduced-transparency — opaque surfaces
  const reduced = blockFor(blocks, "(prefers-reduced-transparency: reduce)");
  expect(reduced).toContain("backdrop-filter:none!important");
  expect(reduced).toContain("background:var(--stage-paper,#1b1c21)!important");
});

test("prefers-contrast: more repaints the studio chrome instead of restating it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ contrast: "no-preference" });
  await page.goto(STUDIO);
  await expect(page.locator("[data-studio-workspace]")).toHaveAttribute(
    "data-studio-workspace",
    "arrangement",
  );
  await expect(page.locator(".comp-bottombar")).toBeVisible();

  const baseline = await readShell(page);
  expect(baseline).not.toBeNull();

  // The preference is set *before* the document loads, exactly as it arrives
  // from an OS accessibility setting. Headless Chromium re-resolves media
  // queries on a live toggle, but not the `!important` consumer declarations
  // those queries guard (custom properties update, the properties reading them
  // keep their pre-toggle used value), so a live toggle would measure the
  // authored palette rather than this layer.
  await page.emulateMedia({ contrast: "more" });
  await page.reload();
  await expect(page.locator(".comp-bottombar")).toBeVisible();

  const boosted = await readShell(page);
  expect(boosted).not.toBeNull();

  // The authored graphite inks are replaced by the high-contrast pair.
  expect(boosted!.muted).not.toBe(baseline!.muted);
  expect(boosted!.muted).toBe("#eef2fa");
  expect(boosted!.line).toBe("rgba(255, 255, 255, 0.72)");

  // The shell's own hairline is reinforced too, not just the tokens — the dock
  // reads its separator from the FL line family, not from --stage-line.
  //
  // Asserting the rendered luminance rather than the authored rgba string:
  // Chromium resolves the computed border colour through its own colour path
  // (`rgba(255,255,255,0.72)` serializes as a slightly different channel/alpha
  // triple under `prefers-contrast: more`), so pinning the literal string would
  // be pinning a browser implementation detail. The claim being verified is
  // "the near-invisible graphite separator became a light, mostly-opaque one".
  expect(boosted!.barBorder).not.toBe(baseline!.barBorder);
  expect(relativeLuminance(baseline!.barBorder!)).toBeLessThan(0.2);
  expect(relativeLuminance(boosted!.barBorder!)).toBeGreaterThan(0.6);
  expect(alphaOf(boosted!.barBorder!)).toBeGreaterThanOrEqual(0.6);

  // Reverting restores the authored palette: the layer is not sticky.
  await page.emulateMedia({ contrast: "no-preference" });
  expect((await readShell(page))!.muted).toBe(baseline!.muted);
});

test("forced-colors: active restores the shadow-only active destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(STUDIO);
  await expect(page.locator(".comp-tab-active")).toBeVisible();

  // Loaded under the setting rather than toggled at runtime, for the reason
  // documented in the contrast test above.
  await page.emulateMedia({ forcedColors: "active" });
  await page.reload();
  await expect(page.locator(".comp-tab-active")).toBeVisible();
  const active = await page.evaluate(() => {
    const tab = document.querySelector(
      ".comp-tab-active",
    ) as HTMLElement | null;
    if (!tab) return null;
    const style = getComputedStyle(tab);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineOffset: style.outlineOffset,
      borderStyle: style.borderTopStyle,
    };
  });
  expect(active).not.toBeNull();
  expect(active!.outlineStyle).toBe("solid");
  expect(active!.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(active!.outlineOffset).toBe("-2px");
  expect(active!.borderStyle).toBe("solid");
});

test("the overrides are scoped to the shell and never mutate the root", async ({
  page,
}) => {
  await page.emulateMedia({ contrast: "more" });
  await page.goto(STUDIO);
  await expect(page.locator(".comp-shell")).toBeVisible();
  const scoping = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const shell = document.querySelector(".comp-shell") as HTMLElement;
    return {
      shellPresent: shell !== null,
      adapterOnRoot: root.getPropertyValue("--adc-ink-strong").trim(),
      adapterOnBody: body.getPropertyValue("--adc-ink-strong").trim(),
      adapterOnShell: getComputedStyle(shell)
        .getPropertyValue("--adc-ink-strong")
        .trim(),
    };
  });
  expect(scoping.shellPresent).toBe(true);
  // The adaptive tokens live on the shell, so nothing outside the Studio can
  // pick them up.
  expect(scoping.adapterOnRoot).toBe("");
  expect(scoping.adapterOnBody).toBe("");
  expect(scoping.adapterOnShell).toBe("#ffffff");
});
