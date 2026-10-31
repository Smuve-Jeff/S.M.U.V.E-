const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  let bad = 0;
  const run = async (vp, portraitPhone) => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 900, hasTouch: vp.w < 900 });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    await page.evaluate(() => { history.pushState({}, '', '/dj'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(2200);
    const res = await page.evaluate(() => {
      const con = document.querySelector('.booth-console');
      const deck = document.querySelector('.deck-chassis.deck-a');
      const btn = document.querySelector('.deck-chassis.deck-a .transport-button.play');
      const d = deck.getBoundingClientRect();
      const b = btn ? btn.getBoundingClientRect() : null;
      return {
        pageScroll: document.documentElement.scrollWidth,
        consoleClientW: con.clientWidth,
        consoleScrollW: con.scrollWidth,
        deckW: Math.round(d.width),
        deckRight: Math.round(d.right),
        playInsideDeck: b ? b.right <= d.right + 1 && b.left >= d.left - 1 : null,
        panes: con.children.length,
      };
    });
    console.log(vp.name, JSON.stringify(res));
    if (portraitPhone) {
      if (res.pageScroll > vp.w + 2 || res.deckW < res.consoleClientW - 3 || res.consoleScrollW < res.consoleClientW * 2.5 || res.playInsideDeck !== true) bad++;
    } else if (res.consoleScrollW > res.consoleClientW + 20) { bad++; }
    await ctx.close();
  };
  await run({ name: 'phone-portrait-390', w: 390, h: 844 }, true);
  await run({ name: 'phone-landscape-844', w: 844, h: 390 }, false);
  await run({ name: 'desktop-1440', w: 1440, h: 900 }, false);
  await browser.close();
  console.log('CAROUSEL_FAILURES', bad);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('PROBE_FAILED', e.message); process.exit(2); });
