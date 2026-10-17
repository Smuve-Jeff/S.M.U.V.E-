/**
 * Audit: for every unique retrogames.cc embed URL referenced by the Tha Spot
 * catalog, fetch the embed page and extract the canonical game URL. Because
 * retrogames.cc resolves embeds by numeric ID (the URL slug is decorative),
 * this reveals which game each embed *actually* loads, so titles/URLs that
 * disagree can be corrected.
 *
 * Usage: node scripts/audit-retro-embeds.cjs
 * Output: /tmp/retro-audit.json
 */
const fs = require('fs');
const { execSync } = require('child_process');

const rows = JSON.parse(fs.readFileSync('/tmp/retro-urls.json', 'utf8'));
const results = fs.existsSync('/tmp/retro-audit.json')
  ? JSON.parse(fs.readFileSync('/tmp/retro-audit.json', 'utf8'))
  : [];
const done = new Set(results.map((r) => r.url));

let i = 0;
for (const row of rows) {
  if (done.has(row.url)) continue;
  i++;
  let canonical = '';
  try {
    const html = execSync(
      `curl -s -L --max-time 15 -A "Mozilla/5.0" "${row.url}"`,
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const m = html.match(
      /https:\/\/www\.retrogames\.cc\/[a-z0-9-]+\/[a-z0-9-]+\.html/
    );
    if (m) canonical = m[0];
  } catch {
    /* network error — mark below */
  }
  results.push({ ...row, canonical, status: canonical ? 'ok' : 'error' });
  if (i % 10 === 0) {
    fs.writeFileSync('/tmp/retro-audit.json', JSON.stringify(results, null, 1));
    console.log(`progress: ${results.length}/${rows.length}`);
  }
}
fs.writeFileSync('/tmp/retro-audit.json', JSON.stringify(results, null, 1));
console.log('done', results.length);
