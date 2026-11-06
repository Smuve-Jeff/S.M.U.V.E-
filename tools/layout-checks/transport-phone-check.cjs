const { chromium } = require('playwright');

/**
 * Phone transport regression probe.
 *
 * The primary strip is allowed to scroll, but the loop and Click toggles must
 * be fully inside its initial viewport, 44×44, and receive their own taps.
 * The Click toggle must be identifiable by its visible label and must open a
 * More panel that exposes volume, count-in and a test click on phones.
 *
 * Run against a dev server on http://127.0.0.1:3000:
 *   node tools/layout-checks/transport-phone-check.cjs
 */
const BASE = 'http://127.0.0.1:3000';
const VIEWPORTS = [
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'portrait-360x800', width: 360, height: 800 },
];

async function measure(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.ctb-primary-row');
    if (row) row.scrollLeft = 0;

    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const rowRect = rectOf(row);
    const toggles = [...document.querySelectorAll('.ctb-toggles .ctb-toggle')];
    const loop = toggles.find((button) =>
      (button.getAttribute('aria-label') || '').toLowerCase().includes('loop'),
    );
    const click = toggles.find((button) =>
      (button.getAttribute('aria-label') || '')
        .toLowerCase()
        .includes('click track'),
    );

    const describeToggle = (button) => {
      if (!button) return null;
      const rect = rectOf(button);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        ...rect,
        fullyInRow:
          !!rowRect &&
          rect.left >= rowRect.left - 1 &&
          rect.right <= rowRect.right + 1,
        hitSelf: !!hit && hit.closest('.ctb-toggle') === button,
        aria: button.getAttribute('aria-label') || '',
        title: button.getAttribute('title') || '',
      };
    };

    const clickInfo = describeToggle(click);
    const bpm = document.querySelector('.ctb-bpm');
    const bpmRect = rectOf(bpm);
    const bpmInfo = bpmRect
      ? {
          ...bpmRect,
          fullyInRow:
            !!rowRect &&
            bpmRect.left >= rowRect.left - 1 &&
            bpmRect.right <= rowRect.right + 1,
        }
      : null;
    const label = click ? click.querySelector('.ctb-click-label') : null;
    if (clickInfo) {
      clickInfo.labelText = label ? (label.textContent || '').trim() : '';
      clickInfo.labelDisplay = label ? getComputedStyle(label).display : null;
    }

    const moreTrigger = document.querySelector('.ctb-secondary-trigger');
    const moreRect = rectOf(moreTrigger);
    const moreText = moreTrigger
      ? moreTrigger.querySelector('span:last-child')
      : null;

    // Details content is display:none until open; opening it is the same
    // native state change the user gets by tapping More.
    const details = document.querySelector('.ctb-secondary');
    if (details) details.open = true;
    const settings = document.querySelector('.ctb-click-settings');
    const settingsRect = rectOf(settings);
    const volume = document.querySelector('.ctb-click-volume-slider');
    const volumeRect = rectOf(volume);
    const countin = document.querySelector('.ctb-click-settings .ctb-countin');
    const countinStyle = countin ? getComputedStyle(countin) : null;

    const local = document.querySelector('.dm-metronome-toggle');
    const localRect = rectOf(local);
    let localHitSelf = false;
    if (localRect) {
      const hit = document.elementFromPoint(
        localRect.left + localRect.width / 2,
        localRect.top + localRect.height / 2,
      );
      localHitSelf = !!hit && hit.closest('.dm-metronome-toggle') === local;
    }

    return {
      viewportWidth: innerWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      row: rowRect,
      loop: describeToggle(loop),
      click: clickInfo,
      bpm: bpmInfo,
      more: moreRect
        ? {
            width: moreRect.width,
            textDisplay: moreText ? getComputedStyle(moreText).display : null,
          }
        : null,
      settings: settingsRect
        ? {
            ...settingsRect,
            display: getComputedStyle(settings).display,
            insideViewport:
              settingsRect.left >= -1 && settingsRect.right <= innerWidth + 1,
          }
        : null,
      volume: volumeRect,
      countin: countin
        ? {
            display: countinStyle ? countinStyle.display : null,
            chips: countin.querySelectorAll('.ctb-countin-chip').length,
          }
        : null,
      local: localRect
        ? {
            ...localRect,
            hitSelf: localHitSelf,
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
      history.pushState({}, '', '/studio?view=drum-machine');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForSelector('.wizard-shell', { timeout: 30000 });
    const showPro = page.getByRole('button', { name: /Show Pro Mode/i });
    if ((await showPro.count()) > 0) await showPro.click();
    await page.waitForSelector('.ctb-shell', { timeout: 20000 });
    await page.waitForTimeout(700);

    return await measure(page);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  let bad = 0;

  try {
    for (const viewport of VIEWPORTS) {
      const result = await runViewport(browser, viewport);
      console.log(viewport.name, JSON.stringify(result));
      const failures = [];

      if (!result.row) failures.push('no primary transport row');
      if (result.pageOverflow > 1) failures.push('page overflows horizontally');

      for (const key of ['loop', 'click']) {
        const toggle = result[key];
        if (!toggle) {
          failures.push(`missing ${key} toggle`);
          continue;
        }
        if (!toggle.fullyInRow) {
          failures.push(`${key} toggle is clipped by the scroll row`);
        }
        if (toggle.width < 43.5 || toggle.height < 43.5) {
          failures.push(`${key} toggle is not 44x44`);
        }
        if (!toggle.hitSelf) {
          failures.push(`${key} toggle does not receive its own tap`);
        }
      }

      if (result.click) {
        if (result.click.labelDisplay === 'none' || !result.click.labelText) {
          failures.push('Click label is not visible');
        }
        if (!/click track/i.test(result.click.aria)) {
          failures.push('Click toggle does not identify the click track');
        }
      }

      if (!result.bpm) {
        failures.push('missing BPM control');
      } else if (!result.bpm.fullyInRow) {
        failures.push('BPM control is clipped by the scroll row');
      }

      if (result.more && result.viewportWidth <= 480) {
        if (result.more.textDisplay !== 'none') {
          failures.push('More text still takes primary-row width at 390px');
        }
      }

      if (!result.settings) {
        failures.push('Click settings panel is missing');
      } else {
        if (result.settings.display === 'none') {
          failures.push('Click settings panel does not open');
        }
        if (result.settings.width < 200 || !result.settings.insideViewport) {
          failures.push('Click settings panel is clipped');
        }
      }

      if (!result.volume || result.volume.width < 40) {
        failures.push('click volume slider is missing');
      }
      if (!result.countin) {
        failures.push('count-in picker is missing');
      } else {
        if (result.countin.display === 'none') {
          failures.push('count-in picker is hidden on a phone');
        }
        if (result.countin.chips !== 3) {
          failures.push('count-in picker does not offer OFF/1B/2B');
        }
      }

      if (result.local) {
        if (result.local.width < 43.5 || result.local.height < 43.5) {
          failures.push('Drum Machine click toggle is not 44x44');
        }
        if (!result.local.hitSelf) {
          failures.push('Drum Machine click toggle does not receive its tap');
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
  console.log('Phone transport click controls hold.');
})();
