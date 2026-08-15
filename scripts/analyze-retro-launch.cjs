const fs = require('fs');
const feed = JSON.parse(
  fs.readFileSync('src/assets/data/tha-spot-feed.json', 'utf8')
);
const audit = JSON.parse(fs.readFileSync('/tmp/retro-audit.json', 'utf8'));
const canonByUrl = new Map(audit.map((r) => [r.url, r.canonical]));

function canonTitle(canonical) {
  const m = canonical && canonical.match(/\/([a-z0-9-]+)\.html$/);
  return m ? m[1] : '';
}

function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);
}

const generic = new Set([
  'usa', 'japan', 'europe', 'world', 'rev', 'revision', 'version', 'set',
  'bootleg', 'the', 'and', 'edition', 'online', 'browser', 'play', 'game',
  'games', 'classic', 'elite', 'master', 'absolute', 'high', 'fidelity',
  'stabilized', 'disc', 'rom', 'snes', 'nes', 'genesis', 'n64', 'psx',
  'ps2', 'gba', 'gbc', 'dc', 'arcade', 'dos', 'ii', 'iii', 'iv', 'v', 'vi',
  'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xv', 'zero', 'one', 'two',
  'three', '4', '5', '6', '7', '8', '9', '10', 'special', 'champion',
]);

const rows = [];
for (const g of feed.games) {
  const cfg = g.launchConfig || {};
  const urls = [cfg.approvedExternalUrl, cfg.approvedEmbedUrl, g.url].filter(
    (u) => u && u.includes('retrogames.cc/embed/')
  );
  if (urls.length === 0) continue;
  // effective launch URL (external-first, matching the component)
  const launchUrl = cfg.approvedExternalUrl || cfg.approvedEmbedUrl || g.url;
  const canonical = canonByUrl.get(launchUrl) || '';
  const canonSlug = canonTitle(canonical)
    .split('-')
    .filter((w) => w.length > 2 && !generic.has(w));
  const nameWords = new Set(norm(g.name));
  const shared = canonSlug.filter((w) => nameWords.has(w));
  const matches = shared.length > 0;
  rows.push({
    id: g.id,
    name: g.name,
    genre: g.genre,
    launchUrl,
    canonical,
    canonSlug: canonSlug.join(' '),
    matched: matches,
    embedMode: cfg.embedMode,
  });
}

const bad = rows.filter((r) => !r.matched);
const good = rows.filter((r) => r.matched);
console.log(`retrogames-backed games: ${rows.length}`);
console.log(`  canonical matches title: ${good.length}`);
console.log(`  canonical MISMATCHES title: ${bad.length}`);
fs.writeFileSync('/tmp/retro-launch-bad.json', JSON.stringify(bad, null, 1));
fs.writeFileSync('/tmp/retro-launch-good.json', JSON.stringify(good, null, 1));
console.log('\n--- MISMATCHED (first 60) ---');
bad.slice(0, 60).forEach((r) =>
  console.log(
    `  ${r.id} | ${r.name} [${r.genre}] | ${r.launchUrl}\n      loads: ${r.canonical}`
  )
);
