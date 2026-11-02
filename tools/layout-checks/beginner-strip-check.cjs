const { chromium } = require('playwright');

/**
 * Beginner Mode keeps the first-song step visible above every Studio tool.
 * It must stay a strip: on a portrait phone the instruction may use a second
 * line, but on a landscape phone (a workspace of roughly 200px) it collapses
 * to one row so the tool's own header stays on screen.
 *
 * Measured in the Studio on 2026-11-02:
 *   360x640 -> 66.5px tall, instruction visible.
 *   568x320 -> 24.0px tall, instruction hidden, 139px of tool below it.
 */
const BASE = 'http://127.0.0.1:3000';
const PORTRAIT = { width: 360, height: 640 };
const LANDSCAPE = { width: 568, height: 320 };

async function measure(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
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
  await page.waitForSelector('.beginner-step-hint', { timeout: 30000 });
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const strip = document.querySelector('.beginner-step-hint');
    const doLine = document.querySelector('.beginner-step-hint-do');
    const canvas = document.querySelector('.comp-view');
    return {
      height: strip ? +strip.getBoundingClientRect().height.toFixed(1) : null,
      descVisible: !!doLine && getComputedStyle(doLine).display !== 'none',
      canvasHeight: canvas
        ? +canvas.getBoundingClientRect().height.toFixed(1)
        : null,
      text: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : '',
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  let bad = 0;

  const portrait = await measure(browser, PORTRAIT);
  console.log('portrait-360x640', JSON.stringify(portrait));
  if (
    !(portrait.height > 0) ||
    portrait.height > 96 ||
    !portrait.descVisible ||
    !/Step 2 of 6/.test(portrait.text) ||
    portrait.pageOverflow > 1
  ) {
    bad++;
    console.log('  FAIL portrait budget');
  }

  const landscape = await measure(browser, LANDSCAPE);
  console.log('landscape-568x320', JSON.stringify(landscape));
  if (
    !(landscape.height > 0) ||
    landscape.height > 40 ||
    landscape.descVisible ||
    !/Step 2 of 6/.test(landscape.text) ||
    !(landscape.canvasHeight > landscape.height * 4)
  ) {
    bad++;
    console.log('  FAIL landscape budget');
  }

  await browser.close();
  if (bad) process.exit(1);
  console.log('Beginner strip layout budgets hold.');
})();
