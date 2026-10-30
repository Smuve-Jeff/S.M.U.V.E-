import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const TOKEN_SALT = 'SMUVE_SALT_V4_SECURE_HASH';
// Mirrors tests/e2e/helpers.ts
const user = {
  id: 'user_e2e_exec',
  email: 'e2e@smuve.test',
  artistName: 'Executive Artist',
  role: 'Artist',
  permissions: ['STANDARD'],
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLogin: '2026-01-01T00:00:00.000Z',
  profileCompleteness: 100,
};

const views = [
  'quick-session',
  'arrangement',
  'session',
  'piano-roll',
  'drum-machine',
  'mixer',
  'channel-rack',
  'effects-rack',
  'performance',
  'performer',
  'mastering',
  'dj',
  'vocal-suite',
  'audio-recorder',
  'sampler',
  'score',
  'plugins',
  'sample-library',
  'sound-browser',
  'sound-pad',
  'synthesizer',
  'chord-editor',
  'ai-produce',
];

const viewports = [
  { name: 'portrait-412', width: 412, height: 915 },
  { name: 'portrait-360', width: 360, height: 800 },
  { name: 'landscape-915', width: 915, height: 412 },
  { name: 'landscape-800', width: 800, height: 360 },
];

const base = process.env.BASE_URL || 'http://127.0.0.1:4200';
const outDir = new URL('./studio-gap-audit/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = [];
const only = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : null;
const activeViewports = only ? viewports.filter((v) => only.includes(v.name)) : viewports;

for (const vp of activeViewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(({ u }) => {
    const session = btoa(`${JSON.stringify(u)}|${'SMUVE_SALT_V4_SECURE_HASH'}`);
    sessionStorage.setItem('smuve_auth_session', session);
  }, { u: user });
  const page = await context.newPage();

  for (const view of views) {
    try {
      await page.goto(`${base}/studio?view=${view}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('.comp-shell', { timeout: 25000 });
      await page.waitForTimeout(1200);

      const measurement = await page.evaluate(() => {
        const rect = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            top: Math.round(r.top * 10) / 10,
            bottom: Math.round(r.bottom * 10) / 10,
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            position: cs.position,
            display: cs.display,
            overflowY: cs.overflowY,
            paddingBottom: cs.paddingBottom,
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
          };
        };
        const canvas = document.querySelector('.comp-canvas');
        const canvasRect = canvas?.getBoundingClientRect();
        const viewEl = document.querySelector('.comp-view');
        const inner = viewEl?.firstElementChild;
        const innerRect = inner?.getBoundingClientRect();

        // Find the lowest visible content edge inside the scrolling workspace.
        let contentBottom = canvasRect ? canvasRect.top : 0;
        let contentEl = null;
        if (canvas) {
          for (const el of canvas.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.height <= 0 || r.width <= 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
            if (r.bottom > contentBottom) {
              contentBottom = r.bottom;
              contentEl = el;
            }
          }
        }

        return {
          vw: document.documentElement.clientWidth,
          vh: window.innerHeight,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          shell: rect('.comp-shell'),
          status: rect('.studio-project-status'),
          topbar: rect('.comp-topbar'),
          tools: rect('.comp-topbar-tools'),
          main: rect('.comp-main'),
          canvas: rect('.comp-canvas'),
          viewRect: rect('.comp-view'),
          bottombar: rect('.comp-bottombar'),
          dock: rect('.comp-topbar-center'),
          fab: rect('.comp-fab'),
          aiBand: rect('.comp-ai-band, .comp-assistant-band, .comp-ai-strip'),
          canvasContentBottom:
            canvasRect ? Math.round((contentBottom - canvasRect.top) * 10) / 10 : 0,
          canvasInnerScroll: canvas ? canvas.scrollHeight - canvas.clientHeight : 0,
          viewInnerScroll: viewEl ? viewEl.scrollHeight - viewEl.clientHeight : 0,
          innerOverflow: inner
            ? inner.scrollHeight - inner.clientHeight
            : 0,
          innerBottom: innerRect ? Math.round(innerRect.bottom * 10) / 10 : null,
          contentEl:
            contentEl?.className && typeof contentEl.className === 'string'
              ? contentEl.className.slice(0, 80)
              : contentEl?.tagName ?? null,
        };
      });

      const b = (r) => (r ? r.bottom : null);
      const t = (r) => (r ? r.top : null);
      const dockTop = measurement.dock?.position === 'fixed' ? t(measurement.dock) : null;
      const canvasBottom = b(measurement.canvas);
      const viewBottom = b(measurement.viewRect);
      const navTop = t(measurement.bottombar);

      results.push({
        viewport: vp.name,
        view,
        ...measurement,
        gapCanvasToNav:
          canvasBottom != null && navTop != null
            ? Math.round((navTop - canvasBottom) * 10) / 10
            : null,
        gapViewToNav:
          viewBottom != null && navTop != null
            ? Math.round((navTop - viewBottom) * 10) / 10
            : null,
        dockOverlapCanvas:
          dockTop != null && canvasBottom != null
            ? Math.round((canvasBottom - dockTop) * 10) / 10
            : null,
        chromeAboveCanvas: measurement.canvas ? t(measurement.canvas) : null,
        canvasVisibleHeight:
          canvasBottom != null && t(measurement.canvas) != null
            ? Math.round((canvasBottom - t(measurement.canvas)) * 10) / 10
            : null,
      });

      await page.screenshot({
        path: `${outDir}${vp.name}-${view}.png`,
        fullPage: false,
      });
    } catch (error) {
      results.push({ viewport: vp.name, view, error: String(error?.message ?? error) });
    }
  }
  await context.close();
}

writeFileSync(`${outDir}measurements.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(`wrote ${results.length} rows to ${outDir}measurements.json`);
