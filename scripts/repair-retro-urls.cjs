/**
 * Repair retrogames.cc embed URLs for the Tha Spot catalog.
 *
 * Discovery: retrogames.cc resolves embeds by NUMERIC ID — the URL slug is
 * purely decorative. The catalog's retrogames URLs carry IDs that point at
 * *different* games than their slugs/titles. This script re-resolves every
 * retrogames-backed game via retrogames.cc search:
 *
 *   1. Searches retrogames.cc for the game title.
 *   2. Fetches the canonical <title> of each candidate game page and verifies
 *      ALL significant catalog-name tokens appear (rejects hacks, bootlegs,
 *      translations, and wrong-but-orthographically-similar games).
 *   3. Extracts the site-generated embed URL from the winning game page.
 *   4. Writes /tmp/retro-repair.json (resume-capable checkpoint).
 *
 *     node scripts/repair-retro-urls.cjs
 */
const fs = require('fs');
const { execSync } = require('child_process');

const feed = JSON.parse(
  fs.readFileSync('src/assets/data/tha-spot-feed.json', 'utf8')
);
const OUT = '/tmp/retro-repair.json';
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const done = new Set(results.map((r) => r.gameId));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function http(url) {
  return execSync(`curl -s -L --max-time 20 -A "${UA}" "${url}"`, {
    encoding: 'utf8',
    maxBuffer: 6 * 1024 * 1024,
  });
}

function normTokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);
}

const STOP = new Set([
  'the','a','an','of','and','for','elite','classic','master','hd','wasm',
  'web','arcade','retro','online','edition','remaster','version','ps1','ps2',
  'n64','snes','nes','gba','gbc','genesis','dreamcast','usa','japan','europe',
  'world','super','ultra','iii','iv','v','vi','vii','viii','ix','x','ii','xi',
  'xii','xiii','featuring','starring','new','special','champion','absolute',
  'game','games','play','browser','volume','disc','set','rev','revision',
]);

const BAD_TITLE = /bootleg|hack|translation|prototype|beta|unl|unreleased|korea|china|brazil|hispanic|phoenix|pirate|clones?|homebrew|demo|sample|not for resale|euro|germany|france|italy|spain/i;

function significantTokens(name) {
  return normTokens(name).filter((w) => !STOP.has(w));
}

function verifyByTitle(name, canonicalTitle) {
  const need = significantTokens(name);
  if (need.length === 0) return { ok: false, reason: 'no significant tokens' };
  if (BAD_TITLE.test(canonicalTitle)) return { ok: false, reason: 'bad variant' };
  const titleTokens = new Set(normTokens(canonicalTitle));
  const missing = need.filter((t) => !titleTokens.has(t));
  if (missing.length > 0) return { ok: false, reason: `missing ${missing.join(',')}` };
  return { ok: true, need };
}

function scoreTitle(name, canonicalTitle, platform) {
  const need = significantTokens(name);
  const titleTokens = new Set(normTokens(canonicalTitle));
  let hits = 0;
  for (const t of need) if (titleTokens.has(t)) hits++;
  let score = hits * 2;
  // Prefer the platform hinted by the catalog genre when known.
  if (platform) {
    const pt = normTokens(platform);
    for (const p of pt) if (titleTokens.has(p)) score += 1;
  }
  const tail = canonicalTitle.toLowerCase();
  if (/usa|world|english/.test(tail)) score += 1;
  if (/disc\s*1|set\s*1|rev\s*a/.test(tail)) score += 1;
  return score;
}

function searchCandidates(name) {
  const q = encodeURIComponent(significantTokens(name).join(' '));
  const html = http(`https://www.retrogames.cc/search?q=${q}`);
  const pages = [
    ...new Set(
      [...html.matchAll(/href="(https:\/\/www\.retrogames\.cc\/[a-z0-9-]+\/[a-z0-9-]+\.html)"/g)].map(
        (m) => m[1]
      )
    ),
  ];
  return pages.slice(0, 12);
}

function canonicalTitleOf(gamePageUrl) {
  const html = http(gamePageUrl);
  const m = html.match(/<title>Play ([^<]+) Online in your browser - RetroGames\.cc<\/title>/);
  return m ? m[1].trim() : '';
}

function embedUrlOf(gamePageUrl) {
  const html = http(gamePageUrl);
  const m = html.match(/embed\/(\d+-[a-z0-9-]+\.html)/);
  return m ? `https://www.retrogames.cc/embed/${m[1]}` : null;
}

const targets = [];
for (const g of feed.games) {
  const cfg = g.launchConfig || {};
  const launchUrl = cfg.approvedExternalUrl || cfg.approvedEmbedUrl || g.url || '';
  if (!launchUrl.includes('retrogames.cc/embed/')) continue;
  targets.push({ gameId: g.id, name: g.name, genre: g.genre, launchUrl });
}

let idx = 0;
for (const t of targets) {
  if (done.has(t.gameId)) continue;
  idx++;
  const entry = {
    gameId: t.gameId,
    name: t.name,
    genre: t.genre,
    oldLaunchUrl: t.launchUrl,
    found: false,
    url: null,
    embedUrl: null,
    externalUrl: null,
    canonicalTitle: '',
    searchQuery: significantTokens(t.name).join(' '),
    confidence: 0,
    note: '',
  };
  try {
    const candidates = searchCandidates(t.name);
    let best = null;
    let bestScore = 0;
    for (const page of candidates) {
      let title = '';
      try { title = canonicalTitleOf(page); } catch { continue; }
      const v = verifyByTitle(t.name, title);
      if (!v.ok) continue;
      const sc = scoreTitle(t.name, title, t.genre);
      if (sc > bestScore) {
        bestScore = sc;
        best = { page, title };
      }
    }
    if (best) {
      entry.canonicalTitle = best.title;
      entry.confidence = bestScore;
      const embed = embedUrlOf(best.page);
      if (embed) {
        entry.found = true;
        entry.url = embed;
        entry.embedUrl = embed;
        entry.externalUrl = embed;
      } else {
        entry.note = 'no embed link on game page';
      }
    } else {
      entry.note = 'no verified title match';
    }
  } catch (e) {
    entry.note = `error: ${String(e.message || e).slice(0, 120)}`;
  }
  results.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  const found = entry.found ? 'FOUND' : 'SKIP ';
  console.log(`[${results.length}/${targets.length}] ${found} ${t.gameId} | ${t.name} | ${entry.note || entry.canonicalTitle}`);
}

console.log('\ndone', results.length);
