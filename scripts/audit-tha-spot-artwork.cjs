#!/usr/bin/env node
/** Read-only audit: node scripts/audit-tha-spot-artwork.cjs [--live]
 * Inspects the runtime GameService catalogue, including curated additions and
 * normalization overrides. Writes no feeds or source files. Requires preview.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    // Test-only API fixture in this isolated browser. Never creates a real
    // account or contacts production data; exercise the normal login UI.
    await page.route('**/auth/login', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        token: 'artwork-audit-fixture', emailVerificationAvailable: false,
        user: { id: 900001, name: 'Artwork Audit', email: 'artwork@example.test',
          role: 'Artist', emailVerified: true, createdAt: '2026-10-03T00:00:00Z' },
      }),
    }));
    await page.route('**/api/**', (route) => route.request().url().endsWith('/auth/login')
      ? route.fallback() : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(process.env.THA_SPOT_AUDIT_URL || 'http://127.0.0.1:4200/tha-spot', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.locator('app-login, app-tha-spot').first().waitFor({ timeout: 30000 });
    if (await page.locator('app-login').count()) {
      await page.locator('input[name="email"]').fill('artwork@example.test');
      await page.locator('input[name="password"]').fill('AuditFixture!2026');
      await page.locator('button[type="submit"]').click();
    }
    await page.waitForFunction(() => {
      const element = document.querySelector('app-tha-spot');
      return element && window.ng?.getComponent(element)?.games()?.length > 0;
    }, null, { timeout: 30000 });
    const live = process.argv.includes('--live');
    const result = await page.evaluate(async (live) => {
      const component = window.ng.getComponent(document.querySelector('app-tha-spot'));
      const games = component.games();
      const byImage = new Map();
      for (const game of games) {
        const image = component.getGameImage(game);
        const entry = byImage.get(image) || { image, ids: [] };
        entry.ids.push(game.id);
        byImage.set(image, entry);
      }
      const entries = [...byImage.values()];
      const failures = [];
      let decoded = 0;
      let skipped = 0;
      let cursor = 0;
      await Promise.all(Array.from({ length: 12 }, async () => {
        while (cursor < entries.length) {
          const entry = entries[cursor++];
          if (!live && entry.image.startsWith('https:')) { skipped++; continue; }
          const ok = await new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => { img.src = ''; resolve(false); }, 10000);
            img.onload = () => { clearTimeout(timeout); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); };
            img.onerror = () => { clearTimeout(timeout); resolve(false); };
            img.src = entry.image;
          });
          if (ok) decoded++;
          else failures.push(entry);
        }
      }));
      return {
        games: games.length, uniqueImages: entries.length, decoded, skipped,
        titleArtwork: entries.filter((e) => e.image.startsWith('data:image/svg+xml')).length,
        sharedBackdrop: games.filter((g) => component.getGameImage(g).includes('home-backdrop-command.png')).length,
        failures,
      };
    }, live);
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length || result.sharedBackdrop) process.exitCode = 1;
    if (process.argv.includes('--smoke')) {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const modern = await page.evaluate(() => window.ng.getComponent(document.querySelector('app-tha-spot')).games()
        .filter((game) => game.id.startsWith('modern-')).map((game) => ({ name: game.name, url: game.url })));
      await page.evaluate(() => {
        window.__auditOpened = [];
        window.open = (url) => { window.__auditOpened.push(url); return null; };
      });
      for (const game of modern) {
        await page.getByRole('button', { name: `Open ${game.name}`, exact: true }).first().click();
        await page.locator('.launch-btn-ultra').click();
        await page.getByRole('button', { name: 'DEPLOY', exact: true }).click();
        const opened = await page.evaluate(() => window.__auditOpened.at(-1));
        if (opened !== game.url) throw new Error(`Wrong launch for ${game.name}: ${opened}`);
      }
      // Inspect rendered geometry and images in both responsive layouts.
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const rail = page.locator('.rail-item').filter({ has: page.getByRole('heading', { name: 'Modern browser spotlight' }) });
        await rail.scrollIntoViewIfNeeded();
        await rail.locator('img').first().waitFor();
        await page.waitForTimeout(1000);
        const layout = await rail.evaluate((element) => ({
          cards: element.querySelectorAll('.game-card').length,
          images: [...element.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth > 0).length,
          width: element.getBoundingClientRect().width,
          horizontalPageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        console.log(JSON.stringify({ viewport: width, ...layout }));
        if (layout.cards !== 9 || layout.images < 1 || layout.horizontalPageOverflow) throw new Error(`Broken modern rail at ${width}px`);
        await page.screenshot({ path: `/tmp/tha-spot-${width}.png` });
      }
      if (errors.length) throw new Error(`Runtime errors: ${errors.join('; ')}`);
      console.log(`SMOKE PASS: ${modern.length} card → preview → confirmation → publisher launches; desktop/mobile rendered.`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
