/**
 * Anomaly probe — drives the running app in the managed preview and collects
 * console errors, page errors, and any "System Anomaly Detected" toast text.
 * Run: node scripts/anomaly-probe.js (preview must be up).
 */
const { chromium } = require('playwright');

(async () => {
  const base = 'http://localhost:4200';
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

  const nav = async (path, wait) => {
    try {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(wait);
    } catch (e) {
      consoleErrors.push('NAV ' + path + ': ' + e.message);
    }
  };

  await nav('/', 2500);
  await nav('/hub', 3000);
  await nav('/studio?view=arrangement', 6000);
  await nav('/hub', 2500);

  let toastText = [];
  try {
    toastText = await page.evaluate(
      () => document.body.innerText.match(/System Anomaly Detected[^\n]*/g) || []
    );
  } catch {
    /* page navigated away */
  }

  console.log('=== TOASTS IN DOM ===');
  console.log(toastText.join('\n'));
  console.log('=== ANOMALY CONSOLE LINES ===');
  console.log([...new Set(anomalyToasts)].join('\n') || '(none)');
  console.log('=== CONSOLE/PAGE ERRORS (' + consoleErrors.length + ' total, deduped) ===');
  console.log([...new Set(consoleErrors)].slice(0, 40).join('\n---\n') || '(none)');
  await browser.close();
})();
