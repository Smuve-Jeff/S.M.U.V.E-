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
 * The group-collapse caret is a 20px glyph stretched to its name row with a
 * ::after that spreads it to 44px wide. The header is 80px: a 33.47px name row
 * above a 44.53px controls row whose 44px buttons overflow upward, so the
 * honest target is 44x~29 - the row's content box - and a 44px tall target
 * would cover the M button. The probe creates a real group, measures the
 * pseudo-element's box from its computed insets, hit-tests four points on that
 * box, and checks the right edge reaches neither the track name nor the
 * timeline grid and the bottom edge stops at the first control button.
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

    // Controls can extend below the arrangement's scroll box, where they are
    // clipped by it and cannot be tapped. Compare the gate with only the part
    // of each control that is actually painted inside that box.
    const canvas = track ? track.closest('.playlist-container') : null;
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const visibleRects = controlRects.map((rect) => {
      if (!canvasRect) return rect;
      const top = Math.max(rect.top, canvasRect.top);
      const bottom = Math.min(rect.bottom, canvasRect.bottom);
      const left = Math.max(rect.left, canvasRect.left);
      const right = Math.min(rect.right, canvasRect.right);
      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    });

    const gateOverlaps =
      !!gateRect &&
      visibleRects.some(
        (rect) =>
          rect.width > 0 &&
          rect.height > 0 &&
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

/**
 * Give the arrangement a group with a member so the collapse caret renders.
 * "+ GROUP" adopts the selected track, so the first lane is selected first.
 */
async function ensureGroupCaret(page) {
  if ((await page.locator('.track-group-toggle').count()) > 0) return;
  await page.evaluate(() => {
    document.querySelector('.track-header')?.click();
    const addGroup = [...document.querySelectorAll('button')].find((button) =>
      (button.textContent || '').includes('+ GROUP'),
    );
    if (addGroup) addGroup.click();
  });
  await page
    .waitForSelector('.track-group-toggle', { timeout: 5000 })
    .catch(() => null);
}

/**
 * Measure the caret's real target: the ::after box from its computed insets,
 * four edge hit-tests, and the neighbours the box must not reach.
 */
async function measureCaret(page) {
  if ((await page.locator('.track-group-toggle').count()) === 0) return null;
  await page.locator('.track-group-toggle').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const caret = document.querySelector('.track-group-toggle');
    if (!caret) return null;
    const rect = caret.getBoundingClientRect();
    const after = getComputedStyle(caret, '::after');
    const px = (value) => parseFloat(value) || 0;
    const target = {
      left: rect.left + px(after.left),
      right: rect.right - px(after.right),
      top: rect.top + px(after.top),
      bottom: rect.bottom - px(after.bottom),
    };
    const name = caret.parentElement.querySelector('.track-name');
    const nameRect = name ? name.getBoundingClientRect() : null;
    const grid = document.querySelector('.grid-viewport');
    const gridRect = grid ? grid.getBoundingClientRect() : null;
    // The first control button, not its container: the 44px buttons overflow
    // above .track-controls, so the button edge is the one that matters.
    const controls = caret
      .closest('.track-header')
      ?.querySelector('.track-controls .mini-btn');
    const controlsRect = controls ? controls.getBoundingClientRect() : null;
    const hitsCaret = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && !!hit.closest('.track-group-toggle');
    };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const edges = {
      top: hitsCaret(cx, target.top + 1),
      bottom: hitsCaret(cx, target.bottom - 1),
      left: hitsCaret(target.left + 1, cy),
      right: hitsCaret(target.right - 1, cy),
    };
    return {
      visualWidth: Math.round(rect.width),
      visualHeight: Math.round(rect.height),
      targetWidth: Math.round(target.right - target.left),
      targetHeight: Math.round(target.bottom - target.top),
      failedEdges: Object.keys(edges).filter((edge) => !edges[edge]),
      reachesName: nameRect ? target.right > nameRect.left + 0.5 : false,
      reachesGrid: gridRect ? target.right > gridRect.left + 0.5 : false,
      reachesControls: controlsRect
        ? target.bottom > controlsRect.top + 0.5
        : false,
    };
  });
}

/**
 * Vertical movement must have one owner: `.playlist-content` holds both the
 * header column and the lane grid, so neither inner surface may scroll on its
 * own. Scrolls the shared content and checks both surfaces move together.
 */
async function measureSync(page) {
  const grid = page.locator('.grid-viewport');
  if ((await grid.count()) === 0) return null;
  await page.evaluate(() => {
    const content = document.querySelector('.playlist-content');
    if (content) content.scrollTop = 0;
  });

  // A real wheel over the lane grid must not scroll the grid itself: vertical
  // movement belongs to `.playlist-content`, which carries both surfaces.
  const box = await grid.boundingBox();
  if (box) {
    await page.mouse.move(
      box.x + box.width - 24,
      box.y + Math.min(48, Math.max(8, box.height / 2)),
    );
    await page.mouse.wheel(0, 48);
    await page.waitForTimeout(220);
  }

  return page.evaluate(async () => {
    const content = document.querySelector('.playlist-content');
    const headers = document.querySelector('.track-headers');
    const gridEl = document.querySelector('.grid-viewport');
    if (!content || !headers || !gridEl) return null;
    const frame = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    const top = (el) => el.getBoundingClientRect().top;
    const wheelEffect = {
      content: Math.round(content.scrollTop),
      headers: headers.scrollTop,
      grid: gridEl.scrollTop,
    };
    content.scrollTop = 0;
    await frame();
    const headersTop = top(headers);
    const gridTop = top(gridEl);
    content.scrollTop = 24;
    await frame();
    const moved = {
      headers: +(top(headers) - headersTop).toFixed(1),
      grid: +(top(gridEl) - gridTop).toFixed(1),
    };
    const scrolled = content.scrollTop;
    content.scrollTop = 0;
    await frame();
    return {
      // Header rows and lanes share one ruler offset, so the column must not
      // carry a vertical range of its own. The grid's small remainder is the
      // horizontal scrollbar's band (classic scrollbars, desktop browsers).
      headersOverflow: headers.scrollHeight - headers.clientHeight,
      gridOverflow: gridEl.scrollHeight - gridEl.clientHeight,
      wheelEffect,
      scrolled,
      moved,
      rowDelta: +(moved.headers - moved.grid).toFixed(1),
    };
  });
}

/**
 * Header rows and lane bands must start level at rest. The canvas draws lane 1
 * `data-ruler-height` pixels below its own top edge; the header column carries
 * the same band as a gutter. Comparing rect tops (rather than layout offsets)
 * also catches the compact gate layout, where both surfaces drop the band.
 */
async function measureAlignment(page) {
  return page.evaluate(() => {
    const headers = document.querySelector('.track-headers');
    const canvas = document.querySelector('.gl-canvas');
    const rows = [...document.querySelectorAll('.track-header')];
    if (!headers || !canvas || rows.length === 0) return null;

    const headersRect = headers.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const ruler = Number(canvas.getAttribute('data-ruler-height') || 0);
    const first = rows[0];
    const firstOffset = first.offsetTop;
    const deltas = rows.map((row) => {
      const laneOffset = row.offsetTop - firstOffset;
      return row.getBoundingClientRect().top - (canvasRect.top + ruler + laneOffset);
    });

    return {
      ruler,
      gutter: +(first.getBoundingClientRect().top - headersRect.top).toFixed(1),
      maxRowDelta: +Math.max(...deltas.map(Math.abs)).toFixed(1),
    };
  });
}

/**
 * A one-finger vertical drag over the lane grid must move the shared content.
 * The grid is not a vertical scroller (measureSync proves that), so without
 * forwarding the drag would do nothing. Playwright's touchscreen only taps, so
 * this drives real touch events through CDP.
 */
async function measureTouchDrag(page) {
  const grid = page.locator('.grid-viewport');
  if ((await grid.count()) === 0) return null;

  await page.evaluate(() => {
    const content = document.querySelector('.playlist-content');
    if (content) content.scrollTop = 0;
  });
  await page.waitForTimeout(100);

  const before = await page.evaluate(() => {
    const content = document.querySelector('.playlist-content');
    const headers = document.querySelector('.track-headers');
    const gridEl = document.querySelector('.grid-viewport');
    if (!content || !headers || !gridEl) return null;
    const gridRect = gridEl.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const visibleTop = Math.max(gridRect.top, contentRect.top);
    const visibleBottom = Math.min(gridRect.bottom, contentRect.bottom);
    return {
      startTop: content.scrollTop,
      headersTop: headers.getBoundingClientRect().top,
      gridTop: gridRect.top,
      x: gridRect.left + Math.min(Math.max(40, gridRect.width * 0.65), gridRect.width - 12),
      y: visibleTop + Math.max(8, (visibleBottom - visibleTop) / 2),
    };
  });
  if (!before) return null;

  const cdp = await page.context().newCDPSession(page);
  const touchPoint = (y) => [
    { x: before.x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touchPoint(before.y),
  });
  for (let step = 1; step <= 6; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touchPoint(before.y - step * 8),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);

  const after = await page.evaluate(() => {
    const content = document.querySelector('.playlist-content');
    const headers = document.querySelector('.track-headers');
    const gridEl = document.querySelector('.grid-viewport');
    return {
      content: Math.round(content.scrollTop),
      headersTop: headers.getBoundingClientRect().top,
      gridTop: gridEl.getBoundingClientRect().top,
      headersScroll: headers.scrollTop,
      gridScroll: gridEl.scrollTop,
    };
  });
  await page.evaluate(() => {
    const content = document.querySelector('.playlist-content');
    if (content) content.scrollTop = 0;
  });

  return {
    startTop: before.startTop,
    content: after.content,
    headersScroll: after.headersScroll,
    gridScroll: after.gridScroll,
    movedHeaders: +(after.headersTop - before.headersTop).toFixed(1),
    movedGrid: +(after.gridTop - before.gridTop).toFixed(1),
    rowDelta: +(
      after.headersTop -
      before.headersTop -
      (after.gridTop - before.gridTop)
    ).toFixed(1),
  };
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

    // Measure the pre-existing budgets first. Seeding the group scrolls the
    // header column, so doing it before `measure()` would let the caret check
    // perturb the rail and gate assertions it shares a page with.
    const result = await measure(page);
    result.alignment = await measureAlignment(page);
    await ensureGroupCaret(page);
    result.caret = await measureCaret(page);
    result.sync = await measureSync(page);
    result.touch = await measureTouchDrag(page);
    return result;
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

      // 44px wide is the Studio's tap guidance. Vertically the target is the
      // name row's content box (~29px): the row is 33.47px and its buttons
      // overflow upward, so 44px tall would cover the M button.
      if (!result.caret) {
        failures.push('no group caret to measure');
      } else {
        if (!(result.caret.targetWidth >= 44)) {
          failures.push(`caret target is ${result.caret.targetWidth}px wide`);
        }
        if (!(result.caret.targetHeight >= 28)) {
          failures.push(
            `caret target is ${result.caret.targetHeight}px tall (row content is ~29px)`,
          );
        }
        if (result.caret.failedEdges.length) {
          failures.push(
            `caret target edges miss the caret: ${result.caret.failedEdges.join(', ')}`,
          );
        }
        if (result.caret.reachesName) {
          failures.push('caret target reaches the track name');
        }
        if (result.caret.reachesGrid) {
          failures.push('caret target reaches the timeline grid');
        }
        if (result.caret.reachesControls) {
          failures.push('caret target reaches the track controls');
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

      // The ruler band is the canvas's, so the header column must reserve the
      // same band; otherwise every header row sits exactly that far above its
      // lane. At rest no scroll offset can hide the difference.
      if (!result.alignment) {
        failures.push('no header rows and lane bands to align');
      } else {
        if (result.alignment.ruler <= 0) {
          failures.push('canvas does not report its ruler height');
        }
        if (Math.abs(result.alignment.maxRowDelta) > 1) {
          failures.push(
            `header rows sit ${result.alignment.maxRowDelta}px above their lanes at rest`,
          );
        }
      }

      // One vertical scroller: neither inner surface may scroll away from the
      // other, and scrolling the shared content must move both by one amount.
      if (!result.sync) {
        failures.push('no scroll surfaces to compare');
      } else {
        if (result.sync.headersOverflow > 1) {
          failures.push('track headers carry their own vertical scroll');
        }
        if (result.sync.gridOverflow > 16) {
          failures.push('lane grid carries more than its scrollbar band');
        }
        if (result.sync.wheelEffect.grid !== 0) {
          failures.push('a wheel over the grid scrolls the grid alone');
        }
        if (result.sync.wheelEffect.headers !== 0) {
          failures.push('a wheel over the grid scrolls the headers alone');
        }
        if (!(result.sync.wheelEffect.content > 1)) {
          failures.push('a wheel over the grid does not move the shared content');
        }
        if (!(result.sync.scrolled > 1)) {
          failures.push('arrangement does not scroll vertically');
        }
        if (Math.abs(result.sync.rowDelta) > 1) {
          failures.push('headers and grid rows move apart');
        }
      }

      // A finger drag is the phone's real scroll gesture; the shared content
      // must take it even though the grid itself cannot scroll.
      if (!result.touch) {
        failures.push('no lane grid to drag');
      } else {
        if (!(result.touch.content - result.touch.startTop > 20)) {
          failures.push('a finger drag over the lane grid does not scroll');
        }
        if (result.touch.gridScroll !== 0) {
          failures.push('a finger drag scrolls the grid alone');
        }
        if (result.touch.headersScroll !== 0) {
          failures.push('a finger drag scrolls the headers alone');
        }
        if (Math.abs(result.touch.rowDelta) > 1) {
          failures.push('a finger drag moves headers and grid apart');
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
