const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  let bad = 0;
  for (const vp of [{ n: 'landscape-844', w: 844, h: 390 }, { n: 'portrait-390', w: 390, h: 844 }, { n: 'desktop-1440', w: 1440, h: 900 }]) {
    const mobile = vp.w < 900;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    await page.evaluate(() => { history.pushState({}, '', '/dj'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(2200);
    const res = await page.evaluate(() => {
      const con = document.querySelector('.booth-console');
      const sc = document.querySelector('.deck-chassis.deck-a .swipe-container');
      const ts = document.querySelector('.deck-chassis.deck-a .tone-stack');
      const limit = sc.getBoundingClientRect().left + sc.clientWidth;
      let maxOver = 0;
      for (const el of sc.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        maxOver = Math.max(maxOver, Math.round(r.right - limit));
      }
      return { consoleCw: con.clientWidth, consoleSw: con.scrollWidth, swipeCw: sc.clientWidth, swipeSw: sc.scrollWidth, toneSw: ts.scrollWidth, toneCw: ts.clientWidth, maxOver, pageScroll: document.documentElement.scrollWidth };
    });
    const ok = res.swipeSw <= res.swipeCw + 4 && res.maxOver <= 4 && res.pageScroll <= vp.w + 2;
    if (!ok) bad++;
    console.log(vp.n, JSON.stringify({ ...res, ok }));
    await ctx.close();
  }
  await browser.close();
  console.log('TONE_FAILURES', bad);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('PROBE_FAILED', e.message); process.exit(2); });
