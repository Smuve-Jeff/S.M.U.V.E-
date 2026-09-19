import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pluto TV regression contract.
 *
 * Every assertion here locks out a defect that was measured in real Chromium
 * against the shipped markup, not inferred from reading it:
 *
 *  1. The iframe was granted `autoplay; fullscreen` only. Pluto's player is
 *     DRM-protected, and Chrome refuses the EME handshake in a cross-origin
 *     frame whose `allow` list omits `encrypted-media` — 19
 *     "Permissions policy violation: encrypted-media is not allowed in this
 *     document" errors, and a player that never leaves "Optimizing your video
 *     playback experience". Listing the permission drives that count to zero.
 *  2. The frame pointed at `https://pluto.tv/embed/live/channel/<slug>`, a route
 *     Pluto no longer serves: it 301s to `/embed/.../` and 302s to
 *     `https://pluto.tv/us/watch/live-tv/`, so no channel is ever tuned. Every
 *     `/embed/`, `/us/live-tv/<slug>`, `/en/live-tv/<slug>` and `?embed=true`
 *     variant was checked and redirects identically.
 *  3. GAMING / PLUTO TV is the only control that opens Pluto TV, and the 768px
 *     refinement block set `.mode-toggle-group` to `display: none`, which made
 *     the whole mode unreachable on every phone and portrait tablet.
 *  4. The player is gated behind Pluto's own pre-roll ad. With the permission
 *     fixed the frame still made ZERO media requests and never created a
 *     `<video>` element (measured: real trusted click on a guide cell plus a
 *     real Enter). Ad-blocked and region-locked viewers hit exactly that, so
 *     the surface carries its own in-app fallback rather than dead-ending.
 */
describe('Tha Spot — Pluto TV contract', () => {
  /*
   * Comments stripped: these assertions are about declarations, and several are
   * negative (`not.toContain(...)`), so prose that explains a removed route or
   * rule must not read as the route or rule itself.
   */
  const strip = (source: string) =>
    source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const template = strip(
    readFileSync(join(__dirname, 'tha-spot.component.html'), 'utf8')
  );
  const styles = strip(
    readFileSync(join(__dirname, 'tha-spot.component.css'), 'utf8')
  );
  const plutoStyles = strip(
    readFileSync(join(__dirname, 'tha-spot.pluto.css'), 'utf8')
  );
  const componentSource = readFileSync(
    join(__dirname, 'tha-spot.component.ts'),
    'utf8'
  );

  /** Markup of the full-screen Pluto surface: from its root to the next </main>. */
  const plutoBlock = (() => {
    const start = template.indexOf('pluto-standalone-experience');
    expect(start).toBeGreaterThan(-1);
    const end = template.indexOf('</main>', start);
    return template.slice(start, end === -1 ? undefined : end);
  })();

  /** Class-count specificity of a selector (every `.foo` counts once). */
  const classCount = (selector: string) => (selector.match(/\./g) ?? []).length;

  /** Braced spans of every block opened by `query`, so rules can be scoped to it. */
  const mediaSpans = (query: string): Array<[number, number]> => {
    const spans: Array<[number, number]> = [];
    let i = styles.indexOf(query);
    while (i !== -1) {
      const open = styles.indexOf('{', i);
      let depth = 0;
      let close = open;
      for (; close < styles.length; close++) {
        if (styles[close] === '{') depth++;
        else if (styles[close] === '}' && --depth === 0) break;
      }
      spans.push([open, close]);
      i = styles.indexOf(query, close);
    }
    return spans;
  };

  /** Every flat `selector { body }` rule in `source`, in source order. */
  const flatRules = (source: string) =>
    Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
      selector: m[1].trim(),
      body: m[2],
    }));

  /** Permission tokens of an `allow="..."` value, as a comparable set. */
  const tokens = (allow: string) =>
    new Set(
      allow
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
    );

  const plutoAllow = /allow="([^"]*)"/.exec(plutoBlock)?.[1] ?? '';

  /** The canonical policy the game cabinets use — same list, one source. */
  const canonicalBase = (() => {
    const at = componentSource && 0; // no-op so the slice below stays explicit
    void at;
    const service = readFileSync(
      join(__dirname, '../../hub/game.service.ts'),
      'utf8'
    );
    const methodAt = service.indexOf(
      'buildIframeAllowAttr(game?: Game): string {'
    );
    return /const base =\s*'([^']+)'/.exec(service.slice(methodAt))?.[1] ?? '';
  })();

  describe('the embed handshake', () => {
    it('grants encrypted-media so the DRM player can actually start', () => {
      expect(plutoAllow).toContain('encrypted-media');
      // The player also needs these, and dropping any of them is a regression.
      expect(plutoAllow).toContain('autoplay');
      expect(plutoAllow).toContain('fullscreen');
      expect(plutoAllow).toContain('picture-in-picture');
      // Pluto keeps its session in cookies; in a cross-site frame the player can
      // only reach them through the Storage Access API.
      expect(plutoAllow).toContain('storage-access');
    });

    it('embeds the Live TV surface instead of the dead per-channel embed route', () => {
      expect(plutoBlock).not.toContain('/embed/live/channel');
      expect(plutoBlock).toContain('https://pluto.tv/us/watch/live-tv/');
    });

    it('paints nothing over the frame — the player owns its own controls', () => {
      // These HUD layers carry z-index 5-7 and the iframe carries none, so they
      // paint on top of the video AND Pluto's native control bar.
      expect(plutoBlock).not.toContain('hud-glitch-overlay');
      expect(plutoBlock).not.toContain('hud-overlay-scanner');
      expect(plutoBlock).not.toContain('hud-decorative-line');
    });

    it('keeps an external escape hatch reachable while the frame is stalled', () => {
      const link =
        /<a[\s\S]*?pluto-external-btn[\s\S]*?<\/a>/.exec(plutoBlock)?.[0] ?? '';
      expect(link).toContain('https://pluto.tv');
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      // The external link is what keeps logPlutoLaunch() from being dead code.
      expect(link).toContain('logPlutoLaunch()');
    });

    it('surfaces both escapes from the same fixed toolbar', () => {
      const toolbar = /<div class="pluto-toolbar">([\s\S]*?)<\/div>/.exec(
        plutoBlock
      )?.[1];
      expect(toolbar).toContain('exit-pluto-btn');
      expect(toolbar).toContain('pluto-external-btn');
      expect(toolbar).toContain('pluto-help-btn');
    });

    it('cannot drift from the canonical cabinet permissions policy', () => {
      expect(canonicalBase).not.toBe('');
      expect([...tokens(plutoAllow)].sort()).toEqual(
        [...tokens(canonicalBase)].sort()
      );
      // A cross-origin player has no business reading the user's clipboard.
      expect(plutoAllow).not.toContain('clipboard-read');
    });
  });

  describe('the frame sandbox', () => {
    const sandbox = /sandbox="([^"]*)"/.exec(plutoBlock)?.[1] ?? '';

    it('is declared, so Pluto cannot reach the app around it', () => {
      expect(sandbox).not.toBe('');
    });

    it('keeps the origin and storage the DRM player runs on', () => {
      /*
       * Measured in Chromium against the shipped markup, sandboxed vs not:
       * 0 encrypted-media violations in both, all 71 Pluto scripts loaded in
       * both, frame origin https://pluto.tv in both, cookies reachable in both,
       * requestStorageAccess present in both. So this does not break the player.
       */
      expect(sandbox).toContain('allow-scripts');
      expect(sandbox).toContain('allow-same-origin');
      // Without this token the `storage-access` permission above is inert.
      expect(sandbox).toContain('allow-storage-access-by-user-activation');
    });

    it('can never navigate the app it is embedded in', () => {
      expect(sandbox).not.toContain('allow-top-navigation');
    });

    it('carries the tokens the player actually needs', () => {
      // Sign In and the ad "Learn More" links open popups, and a fullscreen
      // player locks orientation on a phone.
      for (const token of [
        'allow-forms',
        'allow-popups',
        'allow-popups-to-escape-sandbox',
        'allow-modals',
        'allow-orientation-lock',
        'allow-presentation',
      ]) {
        expect(`${token}: ${sandbox}`).toContain(token);
      }
    });
  });

  describe('the in-app fallback', () => {
    const fallback = /<section[\s\S]*?id="pluto-fallback"[\s\S]*?<\/section>/.exec(
      plutoBlock
    )?.[0] ?? '';

    it('exists as a real labelled region, not a tooltip', () => {
      expect(fallback).not.toBe('');
      expect(fallback).toContain('role="region"');
      expect(fallback).toContain('aria-label="Pluto TV alternatives"');
      expect(fallback).toContain('*ngIf="plutoFallback()"');
    });

    it('is reachable from a state-reporting control in the toolbar', () => {
      const button =
        /<button[\s\S]*?pluto-help-btn[\s\S]*?<\/button>/.exec(plutoBlock)?.[0] ??
        '';
      expect(button).toContain('(click)="togglePlutoFallback()"');
      expect(button).toContain('aria-controls="pluto-fallback"');
      // Expanded state must be exposed, never colour alone.
      expect(button).toContain('[attr.aria-expanded]="plutoFallback()"');
    });

    it('offers only destinations that actually resolve', () => {
      // Verified by request: 200 for each, no redirect off the intended page.
      const verified = [
        'https://pluto.tv/us/watch/live-tv/',
        'https://pluto.tv/us/movies/',
        'https://pluto.tv/us/shows/',
      ];
      const declared = [
        ...componentSource.matchAll(/url:\s*'(https:\/\/pluto\.tv[^']*)'/g),
      ].map((m) => m[1]);

      expect(declared.sort()).toEqual([...verified].sort());
      // No fabricated channel slugs: every /embed/ and /live-tv/<slug> form we
      // tested redirects to the hub, so linking one would promise a channel the
      // link cannot deliver.
      for (const url of declared) {
        expect(url).not.toContain('/embed/');
        expect(url).not.toMatch(/live-tv\/[a-z]/);
      }
    });

    it('renders each destination as a safe new-tab link', () => {
      const link = /<a[\s\S]*?class="pluto-destination"[\s\S]*?<\/a>/.exec(
        fallback
      )?.[0];
      expect(link).toContain('[href]="destination.url"');
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(fallback).toContain('*ngFor="let destination of plutoDestinations"');
    });

    it('rebuilds the frame instead of leaving a dead one behind', () => {
      // An *ngIf would keep the same node, and a stalled cross-origin frame
      // never recovers in place — the tracked attempt is what remounts it.
      expect(plutoBlock).toContain(
        '@for (attempt of plutoFrameKeys(); track attempt)'
      );
      expect(plutoBlock).toContain(
        'class="iframe-glitch-wrapper" *ngIf="!plutoFallback()"'
      );
      expect(fallback).toContain('(click)="retryPlutoFrame()"');
    });

    it('nudges a stalled viewer without waiting for them to ask', () => {
      const hint =
        /<button[\s\S]*?pluto-stall-hint[\s\S]*?<\/button>/.exec(plutoBlock)?.[0] ??
        '';
      expect(hint).toContain('*ngIf="plutoStallHint() && !plutoFallback()"');
      expect(hint).toContain('(click)="togglePlutoFallback()"');
    });

    it('arms the nudge from a timer that is cleared on leave and on destroy', () => {
      // 30s is long enough that a working player never triggers it.
      expect(componentSource).toContain('}, 30000);');
      // `onCleanup` is what stops the pending timeout on teardown.
      expect(componentSource).toContain(
        'onCleanup(() => this.clearPlutoHint());'
      );
      expect(componentSource).toContain('displayMode() === ');
    });
  });

  describe('the mode switch on phones', () => {
    const phoneSpans = mediaSpans('@media (max-width: 768px)');
    const inPhoneQuery = (rule: { selector: string; body: string }) =>
      phoneSpans.some(([open, close]) => {
        const at = styles.indexOf(rule.selector);
        return at > open && at < close;
      });

    const modeRules = flatRules(styles).filter((r) =>
      r.selector.includes('.mode-toggle-group')
    );

    it('shows the switch inside the phone media query', () => {
      const revealed = modeRules.filter(
        (r) => r.body.includes('display: flex') && inPhoneQuery(r)
      );
      expect(revealed.length).toBeGreaterThan(0);
    });

    it('wins on specificity, so source order cannot hide it again', () => {
      const hidden = modeRules.filter((r) => r.body.includes('display: none'));
      const revealed = modeRules.filter(
        (r) => r.body.includes('display: flex') && inPhoneQuery(r)
      );
      expect(hidden.length).toBeGreaterThan(0);
      // The revealing rule must out-rank every hiding one, otherwise the later
      // `display: none` in the refinement block would win again.
      const best = Math.max(...revealed.map((r) => classCount(r.selector)));
      expect(best).toBeGreaterThan(
        Math.max(...hidden.map((r) => classCount(r.selector)))
      );
    });

    it('floors the switch buttons at the 44px touch target', () => {
      const btn = flatRules(styles).find(
        (r) => r.selector.includes('mode-btn') && inPhoneQuery(r)
      );
      expect(btn?.body).toContain('min-height: 44px');
      expect(btn?.body).toMatch(/flex:\s*1 1 0/);
    });
  });

  describe('the pluto toolbars', () => {
    it('is positioned once, by the toolbar, so every escape moves together', () => {
      const toolbar = flatRules(styles).find((r) =>
        r.selector === '.pluto-toolbar'
      );
      expect(toolbar?.body).toContain('position: fixed');
      // The button used to carry its own fixed position; if it comes back the
      // controls drift apart and one can end up off-screen on a phone.
      const btn = flatRules(styles).find(
        (r) => r.selector === '.exit-pluto-btn'
      );
      expect(btn?.body ?? '__no_such_rule__').not.toContain('position: fixed');
    });

    it('floors every control at the 44px touch target', () => {
      const shared = flatRules(styles).find(
        (r) =>
          r.selector.includes('.exit-pluto-btn') &&
          r.selector.includes('.pluto-external-btn') &&
          r.body.includes('min-height')
      );
      expect(shared?.body).toContain('min-height: 44px');
    });
  });

  describe('the pluto stylesheet', () => {
    it('is wired in alongside the component stylesheet', () => {
      expect(componentSource).toContain(
        "styleUrls: ['./tha-spot.component.css', './tha-spot.pluto.css'],"
      );
    });

    it('makes the fallback a real full-viewport scroll surface', () => {
      const panel = flatRules(plutoStyles).find(
        (r) => r.selector === '.pluto-fallback'
      );
      // It renders with nothing loaded from Pluto, so it cannot rely on the
      // page behind it: it owns the viewport and scrolls itself.
      expect(panel?.body).toContain('position: fixed');
      expect(panel?.body).toContain('inset: 0');
      expect(panel?.body).toContain('overflow-y: auto');
    });

    it('floors every fallback control at the 44px touch target', () => {
      for (const selector of [
        '.pluto-destination',
        '.pluto-retry-btn',
        '.pluto-stall-hint',
      ]) {
        const rule = flatRules(plutoStyles).find((r) => r.selector === selector);
        expect(`${selector}: ${rule?.body ?? 'MISSING'}`).toContain(
          'min-height: 44px'
        );
      }
    });

    it('marks the help button active state', () => {
      expect(plutoStyles).toContain('.pluto-help-btn.active');
    });
  });
});
