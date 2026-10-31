const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  let bad = 0;
  for (const vp of [{ n: 'desktop-1440', w: 1440, h: 900 }, { n: 'desktop-1280', w: 1280, h: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    await page.evaluate(() => { history.pushState({}, '', '/dj'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(2200);
    const res = await page.evaluate(() => {
      const con = document.querySelector('.booth-console');
      const cr = con.getBoundingClientRect();
      const decks = [...document.querySelectorAll('.deck-chassis')].map((d) => {
        const r = d.getBoundingClientRect();
        return { leftOver: Math.round(cr.left - r.left), rightOver: Math.round(r.right - cr.right) };
      });
      return { cw: con.clientWidth, sw: con.scrollWidth, padL: getComputedStyle(con).paddingLeft, decks, pageScroll: document.documentElement.scrollWidth };
    });
    const ok = res.sw > res.cw + 1 ? false : true;
    if (!ok) bad++;
    console.log(vp.n, JSON.stringify({ ...res, ok }));
    await ctx.close();
  }
  await browser.close();
  console.log('CONSOLE_FIT_FAILURES', bad);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('PROBE_FAILED', e.message); process.exit(2); });
