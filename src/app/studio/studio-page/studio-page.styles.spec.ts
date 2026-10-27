import { readFileSync } from "fs";
import { join } from "path";

/**
 * Contract test for the composed studio page's stylesheet.
 *
 * The page draws its own chrome (top bar, mode rail, transport, slide-over
 * panels) instead of the classic shell's `.comp-shell`, so the contracts the
 * global stylesheets give that shell do not reach it. These assertions encode
 * the ones that were missing in practice:
 *
 *   1. Every custom property the page consumes is defined somewhere. The page
 *      arrived shipping `var(--studio-bg, #f5f2ee)`, and `--studio-bg` was
 *      defined nowhere — so a light skin was what users actually saw, inside a
 *      dark app. A fallback is not a definition.
 *   2. No custom property defines itself (`--x: var(--x, …)` is a cycle and
 *      computes to the guaranteed-invalid value).
 *   3. Phone contract: the shell is pinned to the visual viewport (`dvh`), the
 *      transport clears the gesture bar, the phone layout is keyed on height as
 *      well as width (a landscape phone is short, not narrow), and the chrome
 *      carries a real touch floor.
 */
const PAGE_CSS = join(
  __dirname,
  "studio-page.component.css",
);

/** Every global stylesheet the page can inherit from, plus the page itself. */
const STYLE_SOURCES = [
  PAGE_CSS,
  join(__dirname, "../../../styles.css"),
  join(__dirname, "../../../studio-redesign-global.css"),
  join(__dirname, "../../../studio-pro-surface.css"),
  join(__dirname, "../../../studio-adaptive-display.css"),
  join(__dirname, "../../../studio-fl-mobile.css"),
];

const read = (path: string) => readFileSync(path, "utf8");
const css = read(PAGE_CSS).replace(/\s+/g, " ");

describe("studio page stylesheet contract", () => {
  it("defines every custom property it consumes", () => {
    const own = new Set<string>();
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) own.add(match[1]);

    const consumed = new Set<string>();
    for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      consumed.add(match[1]);
    }
    const external = [...consumed].filter((name) => !own.has(name));

    // A property defined only under `.comp-shell` (every `--fl-*` token, for
    // instance) does not reach this page: it renders outside that shell. Only
    // `:root` definitions are actually inherited here.
    const atRoot = new Set<string>();
    for (const source of STYLE_SOURCES) {
      if (source === PAGE_CSS) continue;
      for (const block of rootBlocks(read(source))) {
        for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
          atRoot.add(match[1]);
        }
      }
    }

    expect(external.filter((name) => !atRoot.has(name))).toEqual([]);
  });

  it("does not depend on a fallback to hide an undefined token", () => {
    // The failure this page actually shipped: `var(--studio-bg, #f5f2ee)`, with
    // `--studio-bg` defined nowhere, so the fallback was the whole theme.
    const ownAndExternal = new Set<string>();
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
      ownAndExternal.add(match[1]);
    }
    for (const source of STYLE_SOURCES) {
      if (source === PAGE_CSS) continue;
      for (const block of rootBlocks(read(source))) {
        for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
          ownAndExternal.add(match[1]);
        }
      }
    }

    const unconsumedThemeVars = [
      ...css.matchAll(/var\(\s*(--studio-[a-z0-9-]+)\s*,/gi),
    ]
      .map((match) => match[1])
      .filter((name) => !ownAndExternal.has(name));

    expect(unconsumedThemeVars).toEqual([]);
  });

  it("never defines a custom property in terms of itself", () => {
    const cycles: string[] = [];
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const [declaration, name, value] = match;
      if (new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value)) {
        cycles.push(declaration.trim());
      }
    }
    expect(cycles).toEqual([]);
  });

  it("pins the shell to the visual viewport instead of 100vh", () => {
    expect(css).toMatch(/height: 100vh;\s*height: 100dvh;/);
  });

  it("clears the gesture bar in the transport bar", () => {
    // The bar consumes the inset token; the token is where the env() lives, so
    // both halves are asserted — otherwise a rule could reference a token that
    // resolves to nothing.
    expect(insetToken("--studio-inset-bottom")).toMatch(
      /env\(safe-area-inset-bottom/,
    );
    const transport = css.match(
      /\.studio-transport-bar \{ ([^}]+) \}/,
    )?.[1];
    expect(transport).toBeDefined();
    expect(transport).toMatch(/padding-bottom: calc\([^)]*--studio-inset-bottom/);
  });

  it("clears the notch in the top bar", () => {
    expect(insetToken("--studio-inset-top")).toMatch(
      /env\(safe-area-inset-top/,
    );
    const topBar = css.match(/\.studio-top-bar \{ ([^}]+) \}/)?.[1];
    expect(topBar).toBeDefined();
    expect(topBar).toMatch(/padding-top: calc\([^)]*--studio-inset-top/);
  });

  it("sizes both bars and the panels that dock between them from one token", () => {
    // A sheet that docks with a different idea of the bar height than the bar
    // itself slides under the transport, which outranks it in the depth scale —
    // and the sheet's last rows become unreachable on a phone.
    const transport = css.match(
      /\.studio-transport-bar \{ ([^}]+) \}/,
    )?.[1];
    expect(transport).toMatch(/min-height: calc\(var\(--studio-bottom-bar\)/);

    const topBar = css.match(/\.studio-top-bar \{ ([^}]+) \}/)?.[1];
    expect(topBar).toMatch(/min-height: calc\(var\(--studio-top-bar\)/);

    for (const block of [
      css.match(/\.advanced-tools-drawer \{([^}]+)\}/)?.[1] ?? "",
      css.match(/\.support-panel \{([^}]+)\}/)?.[1] ?? "",
    ]) {
      expect(block).toMatch(
        /bottom: calc\(var\(--studio-bottom-bar\) \+ var\(--studio-inset-bottom\)\)/,
      );
    }
  });

  it("keys the phone layout on height as well as width", () => {
    // Width alone is not the phone signal: a landscape phone is 844-932px wide,
    // so a width-only query hands it the desktop row (180px rail + 300px
    // inspector beside ~270px of canvas). Stacking is the portrait answer...
    expect(css).toMatch(
      /@media \(max-width: 860px\) and \(orientation: portrait\), \(max-width: 600px\)/,
    );
    // ...and short viewports get the row back, height-keyed, with the canvas
    // taking everything the two bars leave.
    // The block has no nested braces, so capture to its closing brace.
    const landscape = css.match(
      /@media \(orientation: landscape\) and \(max-height: 520px\) \{([^}]+)\}/,
    )?.[1];
    expect(landscape).toBeDefined();
    expect(landscape).toMatch(/flex-direction: row/);
    // The icon rail is for landscape phones, not a short desktop window.
    expect(css).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 520px\) and \(max-width: 932px\)/,
    );
  });

  it("carries a 44px-class touch floor for the page chrome", () => {
    const phoneBlock = css.match(
      /@media \(max-width: 768px\), \(pointer: coarse\) \{ ([\s\S]+?) \} \}/,
    )?.[1];
    expect(phoneBlock).toBeDefined();
    expect(phoneBlock).toMatch(/min-height: 48px/);
    expect(phoneBlock).toMatch(/--studio-touch/);
  });

  it("keeps the page chrome reachable without colour", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)/);
  });

  it("stacks its panels on the shared depth scale, not raw numbers", () => {
    for (const property of [
      "z-index: var(--studio-z-panel)",
      "z-index: var(--studio-z-panel-scrim)",
      "z-index: var(--studio-z-overlay)",
      "box-shadow: var(--studio-elev-panel)",
    ]) {
      expect(css).toContain(property);
    }
    // The panels must not sit on the tools tier: that is *below* the scrim they
    // draw for themselves, so every open sheet rendered behind its own backdrop.
    expect(css).not.toContain("z-index: var(--studio-z-tools)");
  });

  it("anchors the save banner without moving the bars", () => {
    const block = css.match(/\.save-warning \{ ([^}]+) \}/)?.[1];
    expect(block).toBeDefined();
    // Absolute, so it can never change the distance between the bars — that
    // distance is what every panel docks from.
    expect(block).toMatch(/position: absolute/);
    // Below the panel scrim, above the workspace.
    expect(block).toMatch(
      /z-index: calc\(var\(--studio-z-panel-scrim\) - 1\)/,
    );
  });
});

/** The declaration value of a custom property on `.studio-shell`. */
function insetToken(name: string): string {
  const value = css.match(
    new RegExp(`${name}\\s*:\\s*([^;]+);`),
  )?.[1];
  expect(value).toBeDefined();
  return value!;
}

/** The declaration blocks whose selector list contains `:root`. */
function rootBlocks(source: string): string[] {
  const blocks: string[] = [];
  const rule = /(^|[;}\n])([^{};]*:root[^{}]*)\{([^{}]*)\}/g;
  for (const match of source.matchAll(rule)) blocks.push(match[3]);
  return blocks;
}
