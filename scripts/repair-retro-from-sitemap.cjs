/**
 * Match every retrogames-backed catalog game to a retrogames.cc sitemap page
 * (strict), then extract each matched page's site-generated embed URL.
 *
 * Matching rules:
 *   - All significant name tokens (including roman numerals) must appear in
 *     the page slug.
 *   - The slug's leading tokens should align with the name (prefix match wins).
 *   - Genre hints map to platform categories; pages outside them are
 *     deprioritized (never required — some genres are loose).
 *   - Bootleg/hack/translation/japan/asia variants are rejected.
 *   - Fewest extra slug tokens wins (exact-title pages outrank variants).
 *
 * Sitemap pages: /tmp/retro-pages.txt. Output: /tmp/retro-repair.json
 * (resume-capable). Run repeatedly until done:
 *     node scripts/repair-retro-from-sitemap.cjs
 */
const fs = require('fs');
const { execSync } = require('child_process');

const feed = JSON.parse(
  fs.readFileSync('src/assets/data/tha-spot-feed.json', 'utf8')
);
const pages = fs
  .readFileSync('/tmp/retro-pages.txt', 'utf8')
  .split('\n')
  .filter(Boolean);

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

const STOP = new Set([
  'the','a','an','of','and','for','featuring','starring','new','special',
  'champion','absolute','game','games','play','browser','edition','version',
  'remaster','hd','wasm','web','online','elite','classic','master',
]);

// roman numerals are KEPT — they disambiguate sequels
const ROMAN = { i:'1', ii:'2', iii:'3', iv:'4', v:'5', vi:'6', vii:'7', viii:'8', ix:'9', x:'10', xi:'11', xii:'12', xiii:'13' };

function normTokens(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 || /^\d+$/.test(w));
}

function nameTokens(name) {
  return normTokens(name)
    .map(normalizeToken)
    .filter((w) => !STOP.has(w));
}

function normalizeToken(w) {
  // map roman numerals to digits so II and IX don't collide
  return ROMAN[w] ? ROMAN[w] : w;
}

function pageTokens(pageUrl) {
  const m = pageUrl.match(/retrogames\.cc\/([a-z0-9-]+)\/([a-z0-9-:]+)\.html$/);
  if (!m) return { category: '', tokens: [] };
  return {
    category: m[1],
    tokens: m[2].split('-').filter((w) => w.length > 2),
  };
}

const GENRE_CATS = {
  'arcade': ['arcade-games'],
  'arcade classic': ['arcade-games'],
  'fighting': ['arcade-games', 'snes-games', 'genesis-games', 'psx-games'],
  'beat \'em up': ['arcade-games', 'snes-games', 'genesis-games'],
  'rpg': ['snes-games', 'nes-games', 'gba-games', 'gbc-games', 'psx-games', 'gb-games'],
  'action rpg': ['snes-games', 'nes-games', 'gba-games', 'psx-games'],
  'puzzle': ['nes-games', 'snes-games', 'gbc-games', 'arcade-games'],
  'classic': ['nes-games', 'snes-games', 'genesis-games', 'arcade-games'],
  'platformer': ['snes-games', 'nes-games', 'gba-games', 'genesis-games', 'gb-games'],
  'shooting': ['arcade-games', 'snes-games', 'genesis-games', 'psx-games'],
  'shooter': ['arcade-games', 'snes-games', 'genesis-games', 'psx-games'],
  'fps': ['dos-games', 'snes-games', 'n64-games', 'psx-games', 'genesis-games', 'jaguar-games'],
  'racing': ['snes-games', 'genesis-games', 'n64-games', 'arcade-games'],
  'driving': ['snes-games', 'genesis-games', 'n64-games', 'arcade-games'],
  'sports': ['nes-games', 'snes-games', 'genesis-games', 'arcade-games', 'n64-games'],
  'adventure': ['nes-games', 'snes-games', 'n64-games', 'psx-games', 'gba-games'],
  'action': ['snes-games', 'nes-games', 'genesis-games', 'arcade-games', 'n64-games', 'gba-games', 'psx-games'],
  'action-adventure': ['snes-games', 'nes-games', 'n64-games', 'psx-games', 'gba-games'],
  'stealth': ['psx-games', 'n64-games', 'snes-games'],
  'horror': ['psx-games', 'snes-games', 'nes-games'],
  'rhythm': ['snes-games', 'nes-games', 'psx-games'],
  'strategy': ['snes-games', 'nes-games', 'genesis-games', 'psx-games'],
  'runner': ['arcade-games', 'gba-games'],
  'roguelike': ['nes-games', 'snes-games', 'gba-games'],
  'sandbox': ['snes-games', 'n64-games', 'psx-games'],
  'party': ['nes-games', 'snes-games', 'n64-games'],
  'moba': [],
  'card game': ['snes-games', 'nes-games'],
};

function genreCats(genre) {
  return GENRE_CATS[(genre || '').toLowerCase()] || [];
}

const BAD = /bootleg|hack|translation|prototype|beta|unl|unreleased|korea|china|brazil|hispanic|phoenix|pirate|homebrew|demo|sample|not for resale|euro|germany|france|italy|spain|sweden|australia|japan|asia|conversion|data-file|proto/i;
const GOOD = /usa|world|english|rev-a|set-1|disc-1|v-1-1/i;

function scorePage(pageUrl, name, genre) {
  const need = nameTokens(name);
  if (need.length === 0) return 0;
  const { category, tokens } = pageTokens(pageUrl);
  const toks = tokens.map(normalizeToken);
  const missing = need.filter((t) => !toks.includes(t));
  if (missing.length > 0) return 0; // must contain all name tokens

  const cats = genreCats(genre);
  let score = 100; // full containment
  // prefix bonus: first tokens of slug should match the name order
  const slugStart = toks.slice(0, need.length).join(' ');
  const needStr = need.join(' ');
  if (slugStart === needStr) score += 40;
  else if (toks.join(' ').includes(needStr)) score += 20;
  // platform affinity
  if (cats.length > 0 && cats.includes(category)) score += 15;
  // variant penalties
  const extra = toks.length - need.length;
  score -= extra * 5; // prefer exact titles
  if (BAD.test(pageUrl)) score -= 50;
  if (GOOD.test(pageUrl)) score += 5;
  return score;
}

// index pages by first significant token
const indexByToken = new Map();
for (const p of pages) {
  const { tokens } = pageTokens(p);
  if (tokens.length === 0) continue;
  const key = normalizeToken(tokens[0]);
  if (!indexByToken.has(key)) indexByToken.set(key, []);
  indexByToken.get(key).push(p);
}

function findCandidates(name, genre) {
  const need = nameTokens(name).map(normalizeToken);
  if (need.length === 0) return [];
  const seen = new Set();
  const out = [];
  const add = (p) => {
    if (seen.has(p)) return;
    seen.add(p);
    const sc = scorePage(p, name, genre);
    if (sc > 0) out.push({ page: p, score: sc });
  };
  // candidates via index (first token) + global containment pass
  for (const t of need.slice(0, 2)) {
    for (const p of indexByToken.get(t) || []) add(p);
  }
  for (const p of pages) {
    const { tokens } = pageTokens(p);
    const toks = tokens.map(normalizeToken);
    const missing = need.filter((t) => !toks.includes(t));
    if (missing.length === 0) add(p);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

function canonicalTitleOf(pageUrl) {
  const html = http(pageUrl);
  const m = html.match(/<title>Play ([^<]+) Online in your browser - RetroGames\.cc<\/title>/);
  return m ? m[1].trim() : '';
}

function embedUrlOf(pageUrl) {
  const html = http(pageUrl);
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
console.log(`targets: ${targets.length}, index: ${indexByToken.size} tokens`);

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
    page: '',
    confidence: 0,
    note: '',
  };
  try {
    const cands = findCandidates(t.name, t.genre);
    const verified = [];
    for (const c of cands.slice(0, 4)) {
      try {
        const title = canonicalTitleOf(c.page);
        const need = nameTokens(t.name).map(normalizeToken);
        const tt = new Set(normTokens(title).map(normalizeToken));
        const missing = need.filter((tk) => !tt.has(tk));
        if (missing.length > 0) continue;
        verified.push({ ...c, title });
      } catch {
        /* skip */
      }
    }
    if (verified.length > 0) {
      const best = verified[0];
      entry.canonicalTitle = best.title;
      entry.page = best.page;
      entry.confidence = best.score;
      const embed = embedUrlOf(best.page);
      if (embed) {
        entry.found = true;
        entry.url = embed;
        entry.embedUrl = embed;
        entry.externalUrl = embed;
      } else {
        entry.note = 'no embed link on matched page';
      }
    } else {
      entry.note = 'no verified match';
    }
  } catch (e) {
    entry.note = `error: ${String(e.message || e).slice(0, 100)}`;
  }
  results.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  const f = entry.found ? 'FOUND' : 'SKIP ';
  console.log(`[${results.length}/${targets.length}] ${f} ${t.gameId} | ${t.name} | ${entry.note || entry.canonicalTitle}`);
}

console.log('\ndone', results.length);
