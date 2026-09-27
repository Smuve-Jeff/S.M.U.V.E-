const { chromium } = require('playwright');
// Seed the session EXACTLY as the app expects: base64(JSON|salt) with the
// default salt (window.env.AUTH_SALT is not set in dev/prod index.html).
const SALT = 'SMUVE_SALT_V4_SECURE_HASH';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const anomalyToasts = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    if (/System Anomaly Detected/i.test(text)) anomalyToasts.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  const user = {
    id: 'user_probe', email: 'probe@smuve.test', artistName: 'Probe Artist',
    role: 'Artist', permissions: ['STANDARD'],
    createdAt: '2026-01-01T00:00:00.000Z', lastLogin: '2026-01-01T00:00:00.000Z',
    profileCompleteness: 100,
  };
  const session = Buffer.from(`${JSON.stringify(user)}|${SALT}`).toString('base64');
  await page.addInitScript(({ authSession }) => {
    sessionStorage.setItem('smuve_auth_session', authSession);
  }, { authSession: session });

  await page.goto('http://localhost:4200/studio?view=arrangement', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  for (const label of ['Mixer', 'Drum Machine', 'Piano Roll', 'Vocal Suite', 'Arrange']) {
    await page.evaluate((lbl) => {
      const btn = Array.from(document.querySelectorAll('.comp-rail-item')).find(b => b.textContent.trim().includes(lbl));
      if (btn) btn.click();
    }, label).catch(() => {});
    await page.waitForTimeout(1800);
  }
  await page.evaluate(() => { const b = document.querySelector('.comp-tool-create'); if (b) b.click(); }).catch(() => {});
  await page.waitForTimeout(2500);

  const toasts = await page.evaluate(() => document.body.innerText.match(/System Anomaly Detected[^\n]*/g) || []).catch(() => []);
  console.log('=== TOASTS IN DOM ==='); console.log(toasts.join('\n') || '(none)');
  console.log('=== ANOMALY CONSOLE LINES ==='); console.log([...new Set(anomalyToasts)].join('\n') || '(none)');
  console.log('=== CONSOLE/PAGE ERRORS (' + consoleErrors.length + ') ===');
  console.log([...new Set(consoleErrors)].slice(0, 50).join('\n---\n') || '(none)');
  await browser.close();
})();
