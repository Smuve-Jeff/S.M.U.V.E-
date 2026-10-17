/**
 * Studio UI layout audit — measures the built studio module in a real browser
 * at three profiles: portrait Android phone (412x915), landscape phone
 * (915x412) and Chrome desktop (1440x900).
 *
 * Modes:
 *   node scripts/audit-studio-ui.mjs                             # sweep every studio view
 *   node scripts/audit-studio-ui.mjs profile=landscape            # sweep one device profile
 *   node scripts/audit-studio-ui.mjs views=arrangement,mixer      # sweep selected views
 *   node scripts/audit-studio-ui.mjs probe profile=mobile view=mixer selectors=.a,.b
 *
 * Probe extras: `why` (matching CSS rules), `children=<sel>` (child rects),
 * `scrollers`, `tallest`, `click=<sel>`.
 *
 * Metrics per view: pageOverflow, offenders (page-level overflow), viewportCut
 * (content clipped by a non-scrollable ancestor — permanently unreachable),
 * clipped, smallTargets (<44px hit areas, touch profiles only), tinyText
 * (<10px) and console/page errors. `npm run build` first: this serves
 * Build/browser on an ephemeral port (SPA fallback) — no dev server is started
 * and nothing is left running when the process exits.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'Build/browser';
const AUTH_SALT = 'SMUVE_SALT_V4_SECURE_HASH';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    try {
      const file = join(ROOT, path);
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
      });
      res.end(body);
    } catch {
      try {
        const body = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port })
    );
  });
}

/** Runs in the page: per-view layout defect metrics. */
function collectMetrics({ mobile }) {
  const vw = window.innerWidth;
  const results = {
    viewport: { vw, vh: window.innerHeight },
    pageOverflow: document.documentElement.scrollWidth - vw,
    offenders: [],
    viewportCut: [],
    smallTargets: [],
    tinyText: [],
    clipped: [],
  };

  const describe = (el) => {
    const cls =
      typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
    const id = el.id ? '#' + el.id : '';
    let path = el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
    let p = el.parentElement;
    let depth = 0;
    while (p && depth < 2) {
      const pcls =
        typeof p.className === 'string'
          ? p.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      path = p.tagName.toLowerCase() + (pcls ? '.' + pcls : '') + ' > ' + path;
      p = p.parentElement;
      depth++;
    }
    return path;
  };

  const visible = (el) =>
    el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

  /** Is the element's horizontal overflow contained by a clipping/scrolling ancestor? */
  const contained = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (
        cs.overflowX !== 'visible' ||
        cs.overflowY !== 'visible' ||
        cs.contain !== 'none'
      ) {
        return true;
      }
      p = p.parentElement;
    }
    return false;
  };

  // Content pushed past the viewport edge and clipped by a NON-scrollable
  // ancestor: permanently unreachable on this device.
  const seenCut = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (Math.max(r.right - vw, -r.left) <= 1.5) continue;
    if (el.closest('svg')) continue;
    // Decoration (aurora blobs, marquee ribbons) is clipped on purpose.
    if (el.closest('[aria-hidden="true"]')) continue;
    let p = el.parentElement;
    let clipped = false;
    let reachable = false;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (!clipped && /hidden|clip/.test(cs.overflowX)) clipped = true;
      if (
        /auto|scroll/.test(cs.overflowX) &&
        p.scrollWidth > p.clientWidth + 1
      ) {
        reachable = true;
        break;
      }
      p = p.parentElement;
    }
    if (!clipped || reachable) continue;
    const key = describe(el);
    if (seenCut.has(key)) continue;
    seenCut.add(key);
    results.viewportCut.push({
      el: key,
      overRight: Math.round(r.right - vw),
      w: Math.round(r.width),
    });
  }

  // Page-level horizontal overflow that nothing contains.
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const over = Math.max(r.right - vw, -r.left);
    if (over <= 1.5) continue;
    if (contained(el)) continue;
    const key = describe(el);
    if (seen.has(key) || el.closest('svg')) continue;
    seen.add(key);
    results.offenders.push({
      el: key,
      overRight: Math.round(r.right - vw),
      overLeft: Math.round(-r.left),
      w: Math.round(r.width),
    });
  }

  // Interactive hit areas too small for a fingertip.
  const interactiveSel =
    'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [tabindex]';
  for (const el of document.querySelectorAll(interactiveSel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (mobile && (r.height < 44 || r.width < 44)) {
      results.smallTargets.push({
        el: describe(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        label: (el.getAttribute('aria-label') || el.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 38),
      });
    }
  }

  // Text too small to read on a phone.
  const seenTiny = new Set();
  for (const el of document.querySelectorAll(
    'span, p, label, button, a, li, td, th'
  )) {
    if (!visible(el)) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (el.querySelector('span, p, label, div, button, a')) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 10) {
      const key = describe(el) + '|' + size;
      if (seenTiny.has(key)) continue;
      seenTiny.add(key);
      results.tinyText.push({
        el: describe(el),
        size,
        text: text.slice(0, 30),
      });
    }
  }

  // Content cut off by a non-scrollable container.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    const scrollable = /auto|scroll/.test(cs.overflow);
    if (scrollable) continue;
    const cutX =
      el.scrollWidth > el.clientWidth + 4 && /hidden|clip/.test(cs.overflowX);
    const cutY =
      el.scrollHeight > el.clientHeight + 4 && /hidden|clip/.test(cs.overflowY);
    if (!cutX && !cutY) continue;
    if (contained(el)) continue; // a scrollable ancestor can reveal it
    results.clipped.push({
      el: describe(el),
      axis: cutX ? (cutY ? 'xy' : 'x') : 'y',
      hiddenPx: Math.round(
        cutX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
      ),
      overflow: cs.overflow,
    });
  }

  return results;
}

const VIEWS = [
  'arrangement',
  'piano-roll',
  'drum-machine',
  'channel-rack',
  'mixer',
  'effects-rack',
  'vocal-suite',
  'dj',
  'performance',
  'mastering',
  'ai-produce',
  'sound-browser',
  'sound-pad',
  'synthesizer',
  'chord-editor',
  'sampler',
  'score',
  'sample-library',
  'plugins',
  'audio-recorder',
];

const PROFILES = {
  mobile: {
    name: 'android-412x915',
    width: 412,
    height: 915,
    mobile: true,
  },
  // Same Android phone, rotated: the tightest shell tier (portrait rules stop
  // applying above 768px width, landscape height rules kick in at <=480px).
  landscape: {
    name: 'android-915x412',
    width: 915,
    height: 412,
    mobile: true,
  },
  desktop: { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
};

// Split on the FIRST `=` only: selectors like `click=[aria-label="x"]` contain
// further `=` / quoting that must survive intact.
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    const k = (i < 0 ? a : a.slice(0, i)).replace(/^--/, '');
    const v = i < 0 ? '' : a.slice(i + 1);
    return [k, v];
  })
);
const probeMode = 'probe' in args;
const requestedViews = args.views ? args.views.split(',') : VIEWS;
const requestedProfiles = args.profile ? [args.profile] : ['mobile', 'desktop'];

const { server, port } = await serveStatic();
const browser = await chromium.launch();
const out = {};

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
const session = Buffer.from(JSON.stringify(user) + '|' + AUTH_SALT, 'utf8').toString(
  'base64'
);

for (const profileKey of requestedProfiles) {
  const profile = PROFILES[profileKey];
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    userAgent: profile.mobile
      ? 'Mozilla/5.0 (Linux; Android 14; moto g power 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
      : undefined,
  });
  await context.addInitScript(
    ({ s }) => sessionStorage.setItem('smuve_auth_session', s),
    { s: session }
  );
  const page = await context.newPage();

  if (probeMode) {
    const view = args.view || 'arrangement';
    const selectors = (args.selectors || 'app-studio').split(',');
    await page.goto(`http://127.0.0.1:${port}/studio?view=${view}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('.comp-shell', { timeout: 15000 });
    await page.waitForTimeout(1200);
    if (args.click) {
      await page.click(args.click, { timeout: 8000 });
      await page.waitForTimeout(900);
    }
    // back=<n>: press the system/browser back gesture n times, so overlay and
    // view-history behaviour can be measured (see the studio back trap).
    if (args.back) {
      const times = Math.max(1, Number(args.back) || 1);
      for (let i = 0; i < times; i++) {
        await page.evaluate(() => window.history.back());
        await page.waitForTimeout(800);
      }
    }
    const rows = await page.evaluate((sels) => {
      const props = [
        'display',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxHeight',
        'padding',
        'margin',
        'transform',
        // Containing-block triggers for `position: fixed` descendants.
        'filter',
        'backdropFilter',
        'willChange',
        'contain',
        'perspective',
        'animation',
        'overflow',
        'overflowX',
        'overflowY',
        'fontSize',
        'zIndex',
        'visibility',
        'opacity',
        'pointerEvents',
        'flex',
        'flexWrap',
        'flexBasis',
        'flexGrow',
        'flexShrink',
        'order',
        'maxWidth',
        'gap',
        'alignItems',
        'justifyContent',
        'boxSizing',
        'letterSpacing',
        'lineHeight',
        'textOverflow',
        'whiteSpace',
      ];
      return sels.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, missing: true };
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const style = {};
        for (const p of props) style[p] = cs[p];
        return {
          sel,
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          viewport: { vw: innerWidth, vh: innerHeight },
          scroll: {
            cw: el.clientWidth,
            ch: el.clientHeight,
            sw: el.scrollWidth,
            sh: el.scrollHeight,
          },
          visible: el.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }),
          style,
        };
      });
    }, selectors);
    if ('why' in args) {
      rows.push({ __why: await page.evaluate((sels) => {
        const interesting = /max-width|min-width|(^|[^-])width|height|font-size|overflow|order|flex-basis/;
        const out = {};
        const rules = [];
        for (const sheet of document.styleSheets) {
          let list;
          try {
            list = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of list) {
            const push = (r, ctx) => rules.push({ r, ctx });
            if (rule.cssRules) {
              // Walk nested (media query) rules.
              for (const inner of rule.cssRules) push(inner, rule.conditionText || '');
            } else push(rule, '');
          }
        }
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          out[sel] = [];
          for (const { r, ctx } of rules) {
            if (!r.selectorText) continue;
            if (!interesting.test(r.style.cssText)) continue;
            let matches = false;
            try {
              matches = el.matches(r.selectorText);
            } catch {
              continue;
            }
            if (!matches) continue;
            const decls = [];
            for (const prop of [
              'max-width',
              'width',
              'min-width',
              'height',
              'min-height',
              'font-size',
              'overflow',
              'overflow-x',
              'order',
              'flex-basis',
              'display',
              'padding',
            ]) {
              const v = r.style.getPropertyValue(prop);
              if (v) decls.push(prop + ':' + v);
            }
            if (!decls.length) continue;
            out[sel].push({ sel: r.selectorText.slice(0, 90), ctx, decls: decls.join('; ') });
          }
        }
        return out;
      }, selectors) });
    }
    if (args.children) {
      rows.push({ __children: await page.evaluate((parentSel) => {
        const parent = document.querySelector(parentSel);
        if (!parent) return [];
        return [...parent.children].map((el) => ({
          el:
            el.tagName.toLowerCase() +
            (typeof el.className === 'string' && el.className
              ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
              : ''),
          rect: (() => {
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            };
          })(),
          cw: el.clientWidth,
          sw: el.scrollWidth,
          flex: getComputedStyle(el).flex,
          overflow: getComputedStyle(el).overflow,
        }));
      }, args.children) });
    }
    if ('scrollers' in args) {
      rows.push({ __scrollers: await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('app-studio *')) {
          const cs = getComputedStyle(el);
          if (!/auto|scroll/.test(cs.overflow) && !/auto|scroll/.test(cs.overflowX)) continue;
          if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
          out.push({
            el:
              el.tagName.toLowerCase() +
              (typeof el.className === 'string' && el.className
                ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
                : ''),
            cw: el.clientWidth,
            sw: el.scrollWidth,
            ch: el.clientHeight,
            sh: el.scrollHeight,
            overflow: cs.overflow,
          });
        }
        return out;
      }) });
    }
    if ('tallest' in args) {
      rows.push({ __tallest: await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          out.push({
            el:
              el.tagName.toLowerCase() +
              (typeof el.className === 'string' && el.className
                ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
                : ''),
            y: Math.round(r.y),
            h: Math.round(r.height),
            w: Math.round(r.width),
            bottom: Math.round(r.bottom),
            pos: getComputedStyle(el).position,
          });
        }
        out.sort((a, b) => b.bottom - a.bottom);
        return out.slice(0, 18);
      }) });
    }
    if (probeMode) {
      rows.push({
        __state: await page.evaluate(() => ({
          url: location.href,
          search: location.search,
          historyLength: history.length,
          state: history.state,
        })),
      });
    }
    out[profile.name] = rows;
    await context.close();
    continue;
  }

  const errors = [];
  page.on('pageerror', (e) =>
    errors.push('PAGEERROR: ' + e.message.slice(0, 160))
  );
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text().slice(0, 160);
    if (/404|Failed to load resource|net::ERR|profile from cloud/.test(t)) return;
    errors.push('CONSOLE: ' + t);
  });

  const viewReports = {};
  for (const view of requestedViews) {
    errors.length = 0;
    await page.goto(`http://127.0.0.1:${port}/studio?view=${view}`, {
      waitUntil: 'domcontentloaded',
    });
    try {
      await page.waitForSelector('.comp-shell', { timeout: 15000 });
    } catch {
      viewReports[view] = { bootFailed: true, errors: [...errors] };
      continue;
    }
    await page.waitForTimeout(1300);
    viewReports[view] = {
      ...(await page.evaluate(collectMetrics, { mobile: profile.mobile })),
      errors: [...new Set(errors)],
    };
  }
  out[profile.name] = viewReports;
  await context.close();
}

await browser.close();
server.close();
console.log(JSON.stringify(out, null, 1));
