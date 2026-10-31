const { chromium } = require('playwright');
const VPS = [{ n: 'phone-landscape', w: 844, h: 390 }, { n: 'phone-portrait', w: 390, h: 844 }];
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  let bad = 0;
  for (const vp of VPS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    for (const route of ['/dj', '/mixer']) {
      await page.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, route);
      await page.waitForTimeout(2000);
      const res = await page.evaluate(() => {
        const sc = document.querySelector('.route-anim-host');
        const h = document.querySelector('.mix-header, .dj-booth');
        return { scrollTop: sc ? Math.round(sc.scrollTop) : null, firstTop: h ? Math.round(h.getBoundingClientRect().top) : null };
      });
      if (res.scrollTop !== 0 || (res.firstTop !== null && res.firstTop < -2)) bad++;
      console.log(JSON.stringify({ vp: vp.n, route, ...res, ok: res.scrollTop === 0 }));
    }
    await ctx.close();
  }
  await browser.close();
  console.log('SCROLL_FAILURES', bad);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('PROBE_FAILED', e.message); process.exit(2); });
