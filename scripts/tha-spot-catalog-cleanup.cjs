/**
 * One-shot cleanup for the Tha Spot game catalog.
 *
 * Removes entries whose launch sources were verified dead/unplayable
 * (dead gamepix slugs with no retrogames.cc fallback, dos.zone bundles that
 * 404, diablo-web repo, quakejs.com SSL failure, arenaofvalor marketing page,
 * poki moba-legends 404) from BOTH feed sources, and drops their dangling
 * references from recommendationRails.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const TS_FEED = path.join(ROOT, 'src', 'app', 'hub', 'tha-spot-feed.fallback.ts');

const REMOVE_IDS = [
  // Dead gamepix slugs with no retrogames.cc fallback
  'kart-fight',
  'rail-surfers',
  'tower-build',
  'hero-adventure',
  'dungeon-fury',
  'cyber-adventure',
  'tag-team-titans',
  'gridiron-drive',
  'rally-racquet-tour',
  'squad-ops-ghost-protocol',
  'raid-fireteam-z',
  'legends-of-the-rift',
  'sonic-racing',
  'moto-x3m-3d',
  'fnf-music-battle',
  'dominoes-classic',
  'soccer-skills-world-cup',
  'fc-24-tribute-elite',
  'madden-24-tribute-elite',
  'nba-2k24-tribute-elite',
  'forza-horizon-5-tribute-elite',
  'lol-tribute-elite',
  'forza-motorsport-tribute-elite',
  'rocket-league-tribute-elite',
  'forza-horizon-4-tribute-elite',
  'krunker-io-master-elite',
  'ev-io-tactical-elite',
  'subway-surfers-arcade',
  'snake-classic-elite',
  'crossy-road-web-elite',
  'bullet-force-web-elite',
  'stickman-hook-web-elite',
  'flip-diving-web-elite',
  // dos.zone bundles (all 404 + CSP frame-ancestors blocks framing)
  'dig-dug-arcade',
  'fallout-dos',
  'fallout-2-dos',
  'deus-ex-ps2-conspiracy-elite',
  'quake-3-dc-elite',
  'prince-of-persia-elite-master',
  'quake-elite-master',
  'duke-nukem-time-to-kill-elite-master',
  'quake-ii-elite-master',
  // Other dead/unplayable hosts
  'diablo-web',
  'quakejs',
  'moba-arena-of-valor',
  'mobile-legends-elite',
];

const removeSet = new Set(REMOVE_IDS);

// ─────────────────────────────────────────────────────────────────────────────
// 1. JSON feed
// ─────────────────────────────────────────────────────────────────────────────
const json = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const beforeGames = json.games.length;
json.games = json.games.filter((g) => !removeSet.has(g.id));
const removedGames = beforeGames - json.games.length;

let removedRailRefs = 0;
for (const rail of json.recommendationRails || []) {
  if (Array.isArray(rail.gameIds)) {
    const before = rail.gameIds.length;
    rail.gameIds = rail.gameIds.filter((id) => !removeSet.has(id));
    removedRailRefs += before - rail.gameIds.length;
  }
}
fs.writeFileSync(JSON_FEED, JSON.stringify(json, null, 2) + '\n');
console.log(`JSON: removed ${removedGames} games, ${removedRailRefs} rail refs (${json.games.length} remain)`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. TypeScript fallback feed
// ─────────────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(TS_FEED, 'utf8');
const lines = src.split('\n');

function findArrayRange(startMarker) {
  const start = lines.findIndex((l) => l.startsWith(startMarker));
  if (start < 0) return null;
  // find closing "  ]," at the same indentation
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '  ],') return { start, end: i };
  }
  return null;
}

const gamesRange = findArrayRange('  games: [');
if (!gamesRange) throw new Error('games: [ not found in fallback');

// Identify top-level game object blocks within the games array.
// Blocks are delimited by lines that are exactly "    {" .. "    }," / "    }".
const blocks = [];
let current = null;
for (let i = gamesRange.start + 1; i < gamesRange.end; i++) {
  const line = lines[i];
  if (line === '    {') {
    current = { start: i, end: -1, id: null };
  } else if (line === '    },' || line === '    }') {
    if (current) {
      current.end = i;
      blocks.push(current);
      current = null;
    }
  } else if (current && current.id === null && /^      id: '([^']+)',$/.test(line)) {
    current.id = line.match(/^      id: '([^']+)',$/)[1];
  }
}

const keptBlocks = blocks.filter((b) => !(b.id && removeSet.has(b.id)));
const removedTsGames = blocks.length - keptBlocks.length;

// Rebuild the games array: keep block lines verbatim, comma-join all but the last.
const newGameLines = [];
keptBlocks.forEach((b, idx) => {
  for (let i = b.start; i <= b.end; i++) {
    let line = lines[i];
    const isLast = idx === keptBlocks.length - 1;
    if (i === b.end) {
      line = isLast ? '    }' : '    },';
    }
    newGameLines.push(line);
  }
});

const outLines = lines.slice(0, gamesRange.start + 1)
  .concat(newGameLines)
  .concat(lines.slice(gamesRange.end));

// Now clean recommendationRails gameIds (recompute range in the new line set).
const railsRange = findArrayRange.call(
  { lines: outLines },
  '  recommendationRails: ['
);
// findArrayRange uses `lines` closure; recompute directly:
const railsStart = outLines.findIndex((l) => l.startsWith('  recommendationRails: ['));
let railsEnd = -1;
for (let i = railsStart + 1; i < outLines.length; i++) {
  if (outLines[i] === '  ],') { railsEnd = i; break; }
}
if (railsStart < 0 || railsEnd < 0) throw new Error('recommendationRails: [ not found in fallback');

let removedTsRailRefs = 0;
for (let i = railsStart + 1; i < railsEnd; i++) {
  const m = outLines[i].match(/^(\s*)'([^']+)',$/);
  if (m && removeSet.has(m[2])) {
    outLines[i] = null;
    removedTsRailRefs++;
  }
}
const filteredOut = outLines.filter((l) => l !== null);

fs.writeFileSync(TS_FEED, filteredOut.join('\n'));
console.log(`TS:   removed ${removedTsGames} games, ${removedTsRailRefs} rail refs`);
console.log('Done.');
