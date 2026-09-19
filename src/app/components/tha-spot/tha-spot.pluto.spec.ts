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
 *     `/embed/`, `/us/live-tv/<slug>` and `/en/live-tv/<slug>` variant was
 *     checked and redirects identically.
 *  3. GAMING / PLUTO TV is the only control that opens Pluto TV, and the 768px
 *     refinement block set `.mode-toggle-group` to `display: none`, which made
 *     the whole mode unreachable on every phone and portrait tablet.
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

  describe('the embed handshake', () => {
    it('grants encrypted-media so the DRM player can actually start', () => {
      const allow = /allow="([^"]*)"/.exec(plutoBlock)?.[1] ?? '';
      expect(allow).toContain('encrypted-media');
      // The player also needs these, and dropping any of them is a regression.
      expect(allow).toContain('autoplay');
      expect(allow).toContain('fullscreen');
      expect(allow).toContain('picture-in-picture');
      // Pluto keeps its session in cookies; in a cross-site frame the player can
      // only reach them through the Storage Access API.
      expect(allow).toContain('storage-access');
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
      expect(best).toBeGreaterThan(Math.max(...hidden.map((r) => classCount(r.selector))));
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
    it('is positioned once, by the toolbar, so both escapes move together', () => {
      const toolbar = flatRules(styles).find((r) =>
        r.selector.includes('pluto-toolbar')
      );
      expect(toolbar?.body).toContain('position: fixed');
      // The button used to carry its own fixed position; if it comes back the
      // two controls drift apart and one can end up off-screen on a phone.
      const btn = flatRules(styles).find(
        (r) => r.selector === '.exit-pluto-btn'
      );
      expect(btn?.body ?? '__no_such_rule__').not.toContain('position: fixed');
    });

    it('floors both controls at the 44px touch target', () => {
      const shared = flatRules(styles).find(
        (r) =>
          r.selector.includes('.exit-pluto-btn') &&
          r.selector.includes('.pluto-external-btn') &&
          r.body.includes('min-height')
      );
      expect(shared?.body).toContain('min-height: 44px');
    });
  });
});
