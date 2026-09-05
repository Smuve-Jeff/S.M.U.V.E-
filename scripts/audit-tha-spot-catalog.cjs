#!/usr/bin/env node
/**
 * audit-tha-spot-catalog.cjs — integrity + (optionally) live reachability audit
 * for the Tha Spot game catalog (`src/assets/data/tha-spot-feed.json`).
 *
 * Usage:
 *   node scripts/audit-tha-spot-catalog.cjs                 # static audit, report only
 *   node scripts/audit-tha-spot-catalog.cjs --fix           # repair what is safely repairable
 *   node scripts/audit-tha-spot-catalog.cjs --live          # also probe game/embed URLs over HTTP
 *   node scripts/audit-tha-spot-catalog.cjs --fix --live    # probe + remove confirmed-dead entries
 *
 * Static checks
 *   - duplicate game ids, duplicate room/rail/promo ids
 *   - games missing required fields (id / name / url)
 *   - URL protocol sanity (http/https only; https for embeds)
 *   - enum validity (availability, multiplayerType, embedMode, inlinePolicy)
 *   - referential integrity: badgeIds → badges, rail/promo gameIds+roomIds,
 *     room.rules.gameIds, liveEvents[].featuredGameId, socialPresence[].gameId
 *   - local image paths resolve (src/ or public/)
 *   - rating bounds, releaseDate parseability
 *
 * --live probes each unique URL with curl (HEAD, GET fallback), caches results
 *   in /tmp for 24h, and classifies: dead (000/404/410/5xx), blocked (403/429 —
 *   review only, never auto-removed), ok.
 *
 * --fix actions
 *   - dedupe games (first wins), drop games missing required fields
 *   - drop all dangling references (badges, rails, promos, rooms, events, presence)
 *   - with --live: remove confirmed-dead games and their references
 *
 * Exit code 0 when the catalog is clean (or fully repaired), 1 otherwise —
 * safe to chain: `audit --fix --live && sync-tha-spot-feed.cjs`.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const CACHE = '/tmp/tha-spot-live-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const LIVE = args.has('--live');
const limitArg = process.argv.find((a) => a.startsWith('--live-limit='));
const LIVE_LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 0; // 0 = all
const concArg = process.argv.find((a) => a.startsWith('--live-concurrency='));
const CONCURRENCY = concArg ? Number(concArg.split('=')[1]) : 12;
const timeoutArg = process.argv.find((a) => a.startsWith('--live-timeout='));
const URL_TIMEOUT_S = timeoutArg ? Number(timeoutArg.split('=')[1]) : 10;

const DEAD_CODES = new Set(['000', '404', '410', '500', '502', '503', '504', '530']);
const REVIEW_CODES = new Set(['403', '429', '999']);
const ENUMS = {
  availability: ['Offline', 'Online', 'Hybrid'],
  multiplayerType: ['P2P', 'Server', 'None'],
  embedMode: ['inline', 'external-only'],
  inlinePolicy: ['trusted', 'external-only'],
};

const findings = { errors: [], warns: [], dead: [], blocked: [] };
const err = (cat, msg) => findings.errors.push(`${cat}: ${msg}`);
const warn = (cat, msg) => findings.warns.push(`${cat}: ${msg}`);

const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const games = Array.isArray(feed.games) ? feed.games : [];
const before = { games: games.length };

// ─── Static audit ────────────────────────────────────────────────────────────
const seenIds = new Map();
const badGames = new Set(); // removed by --fix
for (const g of games) {
  if (!g || typeof g !== 'object') { err('game', 'non-object entry'); continue; }
  if (g.id) seenIds.set(g.id, (seenIds.get(g.id) || 0) + 1);
  if (!g.id || !g.name || !g.url) {
    err('game', `missing required fields (id=${g.id || '<none>'})`);
    badGames.add(g);
  }
  if (g.url && /^(https?:)?\/\//i.test(g.url) && !/^https?:\/\//i.test(g.url)) {
    err('game', `${g.id}: protocol-relative url not allowed: ${g.url}`);
    badGames.add(g);
  }
  const isLocal = (u) => typeof u === 'string' && u.startsWith('/assets/');
  const localExists = (u) => ['src', 'public'].some((r) => fs.existsSync(path.join(ROOT, r, u.slice(1))));
  if (g.url && isLocal(g.url) && !localExists(g.url)) {
    err('game', `${g.id}: first-party launch file missing: ${g.url}`);
  }
  for (const [field, allowed] of Object.entries(ENUMS)) {
    const where = field === 'embedMode' || field === 'inlinePolicy' ? g.launchConfig : g;
    if (where && where[field] !== undefined && !allowed.includes(where[field])) {
      err('game', `${g.id}: invalid ${field} "${where[field]}"`);
    }
  }
  const emb = g.launchConfig || {};
  if (emb.approvedEmbedUrl && isLocal(emb.approvedEmbedUrl) && !localExists(emb.approvedEmbedUrl)) {
    err('game', `${g.id}: first-party embed file missing: ${emb.approvedEmbedUrl}`);
  }
  if (emb.embedMode === 'inline' && emb.approvedEmbedUrl && /^http:\/\//i.test(emb.approvedEmbedUrl)) {
    err('game', `${g.id}: approvedEmbedUrl must be https (got http)`);
  }
  if (typeof g.rating === 'number' && (g.rating < 0 || g.rating > 5)) {
    err('game', `${g.id}: rating out of range ${g.rating}`);
  }
  if (g.releaseDate && Number.isNaN(Date.parse(g.releaseDate))) {
    err('game', `${g.id}: unparseable releaseDate "${g.releaseDate}"`);
  }
  for (const img of ['image', 'bannerImage']) {
    const p = g[img];
    if (typeof p === 'string' && p.startsWith('assets/')) {
      const ok = ['src', 'public'].some((r) => fs.existsSync(path.join(ROOT, r, p)));
      if (!ok) err('game', `${g.id}: ${img} not found: ${p}`);
    }
  }
}
for (const [id, n] of seenIds) if (n > 1) err('game', `duplicate id "${id}" ×${n}`);

const badgeIds = new Set((feed.badges || []).map((b) => b && b.id));
const roomIds = new Set();
for (const r of feed.rooms || []) {
  if (!r || !r.id) { err('room', 'missing id'); continue; }
  if (roomIds.has(r.id)) err('room', `duplicate id "${r.id}"`);
  roomIds.add(r.id);
}
let gameIdSet = new Set(games.map((g) => g && g.id).filter(Boolean));
const checkIds = (cat, ids, valid) => {
  if (!Array.isArray(ids)) return 0;
  return ids.filter((id) => typeof id === 'string' && id && !valid.has(id)).length;
};

for (const g of games) {
  const n = (g.badgeIds || []).filter((id) => !badgeIds.has(id)).length;
  if (n) warn('game', `${g.id}: ${n} unknown badgeId(s)`);
}
for (const rail of feed.recommendationRails || []) {
  if (!rail || !rail.id) { err('rail', 'missing id'); continue; }
  const bad = checkIds('rail', rail.gameIds, gameIdSet) + checkIds('rail', rail.roomIds, roomIds);
  if (bad) err('rail', `${rail.id}: ${bad} dangling reference(s)`);
  if (Array.isArray(rail.gameIds) && rail.gameIds.length === 0) warn('rail', `${rail.id}: empty gameIds`);
}
for (const p of feed.promotions || []) {
  const bad = checkIds('promo', p.gameIds, gameIdSet) + checkIds('promo', p.roomIds, roomIds);
  if (bad) err('promo', `${p.id || '<no-id>'}: ${bad} dangling reference(s)`);
}
for (const r of feed.rooms || []) {
  if (r.rules && Array.isArray(r.rules.gameIds)) {
    const bad = checkIds('room', r.rules.gameIds, gameIdSet);
    if (bad) err('room', `${r.id}: ${bad} dangling rules.gameIds`);
  }
}
for (const e of feed.liveEvents || []) {
  if (e.featuredGameId && !gameIdSet.has(e.featuredGameId)) {
    err('event', `${e.id || '<no-id>'}: featuredGameId "${e.featuredGameId}" missing`);
  }
}
for (const s of feed.socialPresence || []) {
  if (s.gameId && !gameIdSet.has(s.gameId)) {
    err('social', `${s.userId || '<no-id>'}: gameId "${s.gameId}" missing`);
  }
}

// ─── Live reachability (optional) ────────────────────────────────────────────
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* fresh */ }
const fresh = (u) => cache[u] && Date.now() - cache[u].at < CACHE_TTL_MS;

function probe(url) {
  return new Promise((resolve) => {
    const finish = (code) => resolve({ url, code: String(code).trim() });
    const run = (method, onFail) => {
      const c = spawn('curl', [
        '-s', '-o', '/dev/null', '-w', '%{http_code}',
        '-X', method, '-L', '--max-time', String(URL_TIMEOUT_S),
        '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', url,
      ]);
      let out = '';
      c.stdout.on('data', (d) => (out += d));
      c.on('error', () => onFail());
      c.on('close', () => {
        const code = out.trim();
        if (method === 'HEAD' && (code === '000' || code === '405' || code === '')) return onFail();
        finish(code || '000');
      });
    };
    run('HEAD', () => run('GET', () => finish('000')));
  });
}

async function probeAll(urls) {
  const stale = urls.filter((u) => !fresh(u));
  const queue = stale.slice(0, LIVE_LIMIT > 0 ? LIVE_LIMIT : stale.length);
  console.log(`LIVE: ${urls.length} unique URL(s), ${urls.length - stale.length} cached, probing ${queue.length}…`);
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async function worker() {
      while (queue.length) {
        const url = queue.shift();
        const { code } = await probe(url);
        cache[url] = { code, at: Date.now() };
        done++;
        if (done % 50 === 0) console.log(`  …${done}/${queue.length + done} probed`);
      }
    })
  );
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

(async () => {
if (LIVE) {
  const skipOffline = new Set();
  const urlMap = new Map(); // url -> [game]
  for (const g of games) {
    if (!g || badGames.has(g) || !g.url) continue;
    if (g.availability === 'Offline') { skipOffline.add(g.id); continue; }
    const urls = [g.url, g.launchConfig && g.launchConfig.approvedEmbedUrl].filter(
      (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
    );
    for (const u of urls) {
      if (!urlMap.has(u)) urlMap.set(u, []);
      urlMap.get(u).push(g);
    }
  }
  await probeAll([...urlMap.keys()]);
  const deadGames = new Set();
  for (const [url, gs] of urlMap) {
    const { code } = cache[url] || {};
    if (DEAD_CODES.has(code)) {
      findings.dead.push(`${code} ${url} → ${gs.map((g) => g.id).join(', ')}`);
      gs.forEach((g) => deadGames.add(g));
    } else if (REVIEW_CODES.has(code)) {
      findings.blocked.push(`${code} ${url} → ${gs.map((g) => g.id).join(', ')}`);
    }
  }
  if (deadGames.size) console.log(`LIVE: ${deadGames.size} game(s) on dead URLs`);
  if (skipOffline.size) console.log(`LIVE: skipped ${skipOffline.size} game(s) declared availability:"Offline"`);
}

// ─── Fix ─────────────────────────────────────────────────────────────────────
let removedGames = 0;
if (FIX) {
  const remove = new Set();
  for (const g of games) if (badGames.has(g)) remove.add(g);
  if (LIVE) {
    // recompute from cache for determinism
    for (const g of games) {
      if (g && g.url && cache[g.url] && DEAD_CODES.has(cache[g.url].code)) remove.add(g);
      const emb = g && g.launchConfig && g.launchConfig.approvedEmbedUrl;
      if (emb && cache[emb] && DEAD_CODES.has(cache[emb].code)) remove.add(g);
    }
  }
  const keep = games.filter((g) => !remove.has(g));
  removedGames = games.length - keep.length;
  const removedIds = new Set(games.filter((g) => remove.has(g)).map((g) => g.id).filter(Boolean));
  gameIdSet = new Set(keep.map((g) => g.id));

  if (removedIds.size) {
    const clean = (ids) => (Array.isArray(ids) ? ids.filter((id) => gameIdSet.has(id)) : ids);
    for (const rail of feed.recommendationRails || []) {
      if (Array.isArray(rail.gameIds)) rail.gameIds = clean(rail.gameIds);
      if (Array.isArray(rail.roomIds)) rail.roomIds = clean(rail.roomIds);
    }
    for (const p of feed.promotions || []) {
      if (Array.isArray(p.gameIds)) p.gameIds = clean(p.gameIds);
      if (Array.isArray(p.roomIds)) p.roomIds = clean(p.roomIds);
    }
    for (const r of feed.rooms || []) if (r.rules) r.rules.gameIds = clean(r.rules.gameIds);
    for (const e of feed.liveEvents || []) if (removedIds.has(e.featuredGameId)) e.featuredGameId = '';
    for (const s of feed.socialPresence || []) if (removedIds.has(s.gameId)) s.gameId = '';
  }
  feed.games = keep;
}

// ─── Report ──────────────────────────────────────────────────────────────────
const show = (arr, n) => arr.slice(0, n).forEach((l) => console.log('  ' + l));
console.log('\n────────── AUDIT SUMMARY ──────────');
console.log(`games: ${before.games} → ${feed.games.length}${removedGames ? ` (−${removedGames})` : ''}`);
console.log(`errors: ${findings.errors.length}  warnings: ${findings.warns.length}  dead: ${findings.dead.length}  blocked(review): ${findings.blocked.length}`);
if (findings.dead.length) { console.log('dead URLs:'); show(findings.dead, 40); }
if (findings.blocked.length) { console.log('blocked (review only, NOT removed):'); show(findings.blocked, 40); }
if (findings.errors.length) { console.log('errors:'); show(findings.errors, 40); }
if (findings.warns.length) { console.log('warnings:'); show(findings.warns, 20); }

if (FIX && removedGames) {
  fs.writeFileSync(JSON_FEED, JSON.stringify(feed, null, 2) + '\n');
  console.log(`FIX: wrote ${JSON_FEED} (removed ${removedGames} games + their references)`);
} else if (FIX) {
  console.log('FIX: nothing to remove');
}

const remaining = findings.errors.length + findings.dead.length;
console.log(`Result: ${remaining === 0 ? 'CLEAN' : `${remaining} unresolved issue(s)`}`);
process.exit(remaining === 0 ? 0 : 1);
})();
