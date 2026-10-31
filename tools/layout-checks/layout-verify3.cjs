const { chromium } = require('playwright');
const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'phone-landscape', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'desktop-landscape', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'desktop-portrait', width: 800, height: 1280, isMobile: false, hasTouch: false },
];
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  let failures = 0;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await page.waitForURL(/guest-access/, { timeout: 20000 });
    for (const route of ['/dj', '/mixer']) {
      await page.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, route);
      await page.waitForTimeout(1800);
      const res = await page.evaluate(() => {
        const vw = window.innerWidth;
        const inScroller = (el) => {
          let p = el.parentElement;
          while (p) {
            const cs = getComputedStyle(p);
            if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 2) return true;
            p = p.parentElement;
          }
          return false;
        };
        const clipped = [];
        for (const el of document.querySelectorAll('button, input, label, select, [role="button"]')) {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (inScroller(el)) continue;
          if (r.right > vw + 1 || r.left < -1) clipped.push({ cls: (el.className || '').toString().slice(0, 36), left: Math.round(r.left), right: Math.round(r.right) });
        }
        const booth = document.querySelector('.dj-booth');
        const boothOverflow = booth ? Math.max(0, booth.scrollWidth - booth.clientWidth) : 0;
        return { pageScroll: document.documentElement.scrollWidth, clipped, boothOverflow };
      });
      const bad = res.clipped.length > 0 || res.pageScroll > vp.width + 2;
      if (bad) failures++;
      console.log(JSON.stringify({ viewport: vp.name, route, pageScroll: res.pageScroll, innerW: vp.width, boothOverflow: res.boothOverflow, clipped: res.clipped.slice(0, 3), ok: !bad }));
    }
    await ctx.close();
  }
  await browser.close();
  console.log('FAILURES', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('PROBE_FAILED', e.message); process.exit(2); });
