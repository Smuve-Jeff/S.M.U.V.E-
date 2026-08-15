const fs = require('fs');
const rows = JSON.parse(fs.readFileSync('/tmp/retro-audit.json', 'utf8'));
const feed = JSON.parse(
  fs.readFileSync('src/assets/data/tha-spot-feed.json', 'utf8')
);

function slugWords(canonical) {
  const m = canonical.match(/\/([a-z0-9-]+)\.html$/);
  if (!m) return [];
  return m[1].split('-').filter((w) => w.length > 2);
}

function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);
}

const OUT = [];
for (const r of rows) {
  const g = feed.games.find((x) => x.id === r.gameId);
  if (!g) continue;
  const nameWords = new Set(norm(g.name));
  const slug = slugWords(r.canonical);
  // remove generic tokens
  const generic = new Set([
    'usa', 'japan', 'europe', 'world', 'rev', 'revision', 'version', 'set',
    'bootleg', 'the', 'and', 'edition', 'online', 'browser', 'play', 'game',
    'games', 'classic', 'elite', 'master', 'absolute', 'high', 'fidelity',
    'stabilized', 'disc', 'rom', 'usa', 'snes', 'nes', 'genesis', 'n64',
    'psx', 'ps2', 'gba', 'gbc', 'dc', 'arcade', 'dos',
  ]);
  const slugFiltered = slug.filter((w) => !generic.has(w));
  const shared = slugFiltered.filter((w) => nameWords.has(w));
  const isMatch =
    shared.length > 0 ||
    slugFiltered.length === 0 ||
    (slugFiltered.length > 0 && shared.length >= Math.min(1, slugFiltered.length));
  OUT.push({
    id: r.gameId,
    name: g.name,
    catalogUrl: r.url,
    idNum: r.id,
    embedMode: r.embedMode,
    canonical: r.canonical,
    status: r.status,
    slug: slugFiltered,
    shared,
    ok: isMatch && r.status === 'ok',
  });
}

const mismatched = OUT.filter((x) => !x.ok);
console.log('total entries:', OUT.length);
console.log('MATCHING/OK:', OUT.length - mismatched.length);
console.log('MISMATCHED:', mismatched.length);
fs.writeFileSync('/tmp/retro-mismatch.json', JSON.stringify(mismatched, null, 1));
console.log('\nSample mismatches:');
mismatched.slice(0, 40).forEach((m) =>
  console.log(`  ${m.name} | embed ${m.idNum} | canon ${m.canonical} | mode=${m.embedMode}`)
);
