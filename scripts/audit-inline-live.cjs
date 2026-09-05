/**
 * audit-inline-live.cjs — CI-safe live reachability sweep for Tha Spot.
 *
 * Scoped to the cabinets the app actually FRAMES inline (embedMode ===
 * "inline" with a remote approvedEmbedUrl). These are the only URLs whose
 * outage breaks play inside the app:
 *   - External-only titles (krunker.io, agar.io, rocketleague.com, …) are
 *     opened in a new tab and routinely return 403 to datacenter probes —
 *     probing them in CI would only produce false alarms, so they are skipped.
 *
 * Classification:
 *   - ok           200..399
 *   - dead         000 (timeout/unreachable), 404, 410, 5xx — FAILS the check
 *   - review       403/429 (anti-bot) — reported but does NOT fail the check
 *
 * Depends only on Node >= 18 (global fetch). No node_modules required, so CI
 * can run it without `npm ci`.
 *
 * Usage:
 *   node scripts/audit-inline-live.cjs            # sweep every inline cabinet
 *   node scripts/audit-inline-live.cjs --hosts=retrogames.cc,retrogames.cz
 *   node scripts/audit-inline-live.cjs --limit=20 # bounded smoke (CI PRs)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const CONCURRENCY = 10;
const TIMEOUT_MS = 10000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const hostArg = process.argv.find((a) => a.startsWith('--hosts='));
const HOST_FILTER = hostArg
  ? new Set(hostArg.split('=')[1].split(',').map((h) => h.trim()).filter(Boolean))
  : null;
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0; // 0 = all

const DEAD_CODES = new Set(['000', '404', '410', '500', '502', '503', '504', '530']);
const REVIEW_CODES = new Set(['403', '429', '999']);

const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const games = feed.games || [];

const byUrl = new Map();
for (const game of games) {
  const lc = game.launchConfig ?? {};
  if (lc.embedMode !== 'inline') continue;
  const target =
    lc.approvedEmbedUrl ||
    (game.url && /^https?:/i.test(game.url) ? game.url : '') ||
    '';
  if (!target || !/^https?:/i.test(target)) continue;
  const host = new URL(target).hostname.toLowerCase();
  if (HOST_FILTER && !HOST_FILTER.has(host)) continue;
  if (!byUrl.has(target)) byUrl.set(target, []);
  byUrl.get(target).push(game.id);
}

const urls = [...byUrl.keys()];
const queue = LIMIT > 0 ? urls.slice(0, LIMIT) : urls;

async function probeOne(url) {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timer);
      return { status: res.status };
    } catch {
      clearTimeout(timer);
      return null;
    }
  };
  const head = await attempt('HEAD');
  if (head && head.status < 500) return head.status;
  const get = await attempt('GET');
  return get ? get.status : 0;
}

(async () => {
  console.log(`INLINE-LIVE: ${urls.length} inline cabinet URL(s)${queue.length !== urls.length ? ` (smoke: first ${queue.length})` : ''}`);
  const results = [];
  let done = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const status = await probeOne(url);
      results.push({ url, status, games: byUrl.get(url) });
      done += 1;
      if (done % 25 === 0) console.log(`  …${done} probed`);
    }
  });
  await Promise.all(workers);

  const dead = results.filter((r) => DEAD_CODES.has(String(r.status)));
  const review = results.filter((r) => REVIEW_CODES.has(String(r.status)));
  const ok = results.length - dead.length - review.length;

  console.log(`INLINE-LIVE: ${ok} ok | ${dead.length} dead | ${review.length} review(anti-bot)`);
  for (const r of dead) {
    console.log(`  DEAD ${r.status} ${r.url} -> ${r.games.join(', ')}`);
  }
  for (const r of review) {
    console.log(`  REVIEW ${r.status} ${r.url} -> ${r.games.join(', ')}`);
  }

  if (dead.length) {
    console.error(`INLINE-LIVE FAILED: ${dead.length} inline cabinet(s) unreachable`);
    process.exit(1);
  }
  console.log('INLINE-LIVE PASS');
})().catch((err) => {
  console.error('INLINE-LIVE error:', err);
  process.exit(1);
});
