const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const feed = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json'), 'utf8')
);

const seen = new Set();
const rows = [];
for (const g of feed.games) {
  const cands = [
    g.url,
    g.launchConfig && g.launchConfig.approvedEmbedUrl,
    g.launchConfig && g.launchConfig.approvedExternalUrl,
  ];
  for (const u of cands) {
    if (!u || !u.includes('retrogames.cc/embed/')) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    const id = (u.match(/embed\/(\d+)/) || [])[1];
    rows.push({
      id,
      url: u,
      name: g.name,
      gameId: g.id,
      embedMode: g.launchConfig && g.launchConfig.embedMode,
    });
  }
}
fs.writeFileSync('/tmp/retro-urls.json', JSON.stringify(rows, null, 1));
console.log('unique retrogames embed URLs:', rows.length);
