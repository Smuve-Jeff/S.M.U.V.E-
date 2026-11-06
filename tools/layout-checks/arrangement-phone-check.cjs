const { chromium } = require('playwright');

/**
 * Arrangement phone regression probe.
 *
 * The Arrangement header is a deliberate horizontal rail on phones. The rail
 * must have a visible scrollbar, not just hidden overflow, and the final tools
 * must be reachable. The first lane's M/S/copy/delete controls must stay
 * 44px tall, fit inside the header column, and not be intercepted by the
 * Beginner-mode gate pill.
 *
 * Run against a dev server on http://127.0.0.1:3000:
 *   node tools/layout-checks/arrangement-phone-check.cjs
 */
const BASE = 'http://127.0.0.1:3000';
const VIEWPORTS = [
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
];

async function measure(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.playlist-header');
    const headerStyle = header ? getComputedStyle(header) : null;
    const borderBottom = headerStyle
      ? parseFloat(headerStyle.borderBottomWidth) || 0
      : 0;
    if (header) header.scrollLeft = header.scrollWidth;
    const maxScroll = header ? header.scrollWidth - header.clientWidth : 0;
    const last = header ? header.lastElementChild : null;
    const lastRect = last ? last.getBoundingClientRect() : null;

    const track = document.querySelector('.track-header');
    const trackRect = track ? track.getBoundingClientRect() : null;
    const controls = [
      ...document.querySelectorAll(
        '.track-header:first-of-type .track-controls .mini-btn',
      ),
    ];
    const controlRects = controls.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    const gate = document.querySelector('.comp-gate-return');
    const gateRect = gate ? gate.getBoundingClientRect() : null;
    const gateButton = document.querySelector('.comp-gate-return-btn');
    const gateButtonRect = gateButton ? gateButton.getBoundingClientRect() : null;
    const gateCopy = document.querySelector('.comp-gate-return-copy');

    const gateOverlaps = !!gateRect && controlRects.some(
      (rect) =>
        gateRect.left < rect.right &&
        gateRect.right > rect.left &&
        gateRect.top < rect.bottom &&
        gateRect.bottom > rect.top,
    );
    const hitAtControls = controlRects.map((rect) => {
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return !!hit && !!hit.closest('.track-controls');
    });

    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      header: header
        ? {
            clientWidth: header.clientWidth,
            scrollWidth: header.scrollWidth,
            maxScroll,
            reachedEnd: Math.abs(header.scrollLeft - maxScroll) < 2,
            scrollbarWidth: headerStyle.scrollbarWidth,
            scrollbarHeight:
              header.offsetHeight - header.clientHeight - borderBottom,
            overflowX: headerStyle.overflowX,
            lastChildVisibleAtEnd: lastRect
              ? lastRect.right <= innerWidth + 1
              : false,
          }
        : null,
      trackHeader: trackRect
        ? {
            width: trackRect.width,
            height: trackRect.height,
            controlCount: controlRects.length,
            controlsInside: controlRects.every(
              (rect) =>
                rect.left >= trackRect.left - 1 &&
                rect.right <= trackRect.right + 1,
            ),
            allControls44High:
              controlRects.length === 4 &&
              controlRects.every((rect) => rect.height >= 44),
          }
        : null,
      gate: gateRect
        ? {
            width: gateRect.width,
            height: gateRect.height,
            buttonHeight: gateButtonRect ? gateButtonRect.height : 0,
            copyDisplay: gateCopy ? getComputedStyle(gateCopy).display : null,
            overlapsTrackControls: gateOverlaps,
            allControlHitsLand: hitAtControls.length === 4 && hitAtControls.every(Boolean),
          }
        : null,
    };
  });
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('smuve_beginner_mode', 'true');
      localStorage.setItem('smuve_wizard_done', JSON.stringify([1]));
      localStorage.setItem('smuve_music_map_seen', 'true');
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    await page.evaluate(() => {
      history.pushState({}, '', '/studio?view=arrangement');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForSelector('.wizard-shell', { timeout: 30000 });
    await page.getByRole('button', { name: /Show Pro Mode/i }).click();
    await page.waitForSelector('.playlist-header', { timeout: 20000 });
    await page.waitForTimeout(700);

    if ((await page.locator('.track-header').count()) === 0) {
      await page.evaluate(() => {
        const addTrack = [...document.querySelectorAll('button')].find((button) =>
          (button.textContent || '').includes('+ TRACK'),
        );
        if (addTrack) addTrack.click();
      });
      await page.waitForTimeout(500);
    }

    return await measure(page);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    // Playwright hides scrollbars by default; this probe is specifically about
    // the visible scrollbar, so keep Chromium's native scrollbar rendering.
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  let bad = 0;

  try {
    for (const viewport of VIEWPORTS) {
      const result = await runViewport(browser, viewport);
      console.log(viewport.name, JSON.stringify(result));
      const isLandscape = viewport.width > viewport.height;
      const failures = [];

      if (!result.header) failures.push('no playlist header');
      if (!result.trackHeader) failures.push('no track header');
      if (!result.gate) failures.push('no guided gate');
      if (result.pageOverflow > 1) failures.push('page overflows horizontally');

      if (result.header) {
        if (!(result.header.scrollWidth > result.header.clientWidth)) {
          failures.push('header does not overflow');
        }
        if (result.header.scrollbarWidth !== 'thin') {
          failures.push('header scrollbar is not thin');
        }
        if (!(result.header.scrollbarHeight >= 4)) {
          failures.push('header scrollbar is not visible');
        }
        if (result.header.overflowX !== 'auto') {
          failures.push('header does not scroll horizontally');
        }
        if (!result.header.reachedEnd) failures.push('header cannot reach its end');
        if (!result.header.lastChildVisibleAtEnd) {
          failures.push('last header control is clipped at end');
        }
      }

      if (result.trackHeader) {
        if (result.trackHeader.controlCount !== 4) {
          failures.push('expected four track controls');
        }
        if (!result.trackHeader.allControls44High) {
          failures.push('track controls are not 44px tall');
        }
        if (!result.trackHeader.controlsInside) {
          failures.push('track controls overhang the track header');
        }
      }

      if (result.gate) {
        const maxGateHeight = isLandscape ? 50 : 56;
        if (!(result.gate.height <= maxGateHeight)) {
          failures.push(`gate is taller than ${maxGateHeight}px`);
        }
        if (!(result.gate.buttonHeight >= 44)) {
          failures.push('gate action is not 44px tall');
        }
        if (result.gate.copyDisplay !== 'none') {
          failures.push('gate secondary copy is visible');
        }
        if (result.gate.overlapsTrackControls) {
          failures.push('gate overlaps track controls');
        }
        if (!result.gate.allControlHitsLand) {
          failures.push('gate intercepts a track control hit target');
        }
      }

      if (failures.length) {
        bad++;
        console.log(`  FAIL ${viewport.name}: ${failures.join('; ')}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (bad) process.exit(1);
  console.log('Arrangement phone layout budgets hold.');
})();
