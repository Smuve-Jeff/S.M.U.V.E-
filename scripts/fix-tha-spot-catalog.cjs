/**
 * fix-tha-spot-catalog.cjs — hygiene pass over the Tha Spot JSON feed.
 *
 * Fixes surfaced by the game-series audit:
 *   1. Removes rows that duplicate an existing entry for the SAME game on the
 *      SAME platform (elite row + generic harvest row, or revision/region
 *      variants of the same cabinet). The kept "survivor" id is asserted to
 *      exist and to share the display title of the removed row.
 *   2. Slugifies GameDistribution row ids that carry url-encoded chars,
 *      apostrophes, `!`, spaces, or mixed case (they double as deep-link and
 *      storage keys). Prints the id map for downstream key syncs.
 *
 * Idempotent. Run BEFORE `node scripts/sync-tha-spot-feed.cjs`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');

// id -> survivor kept in the catalog (same game, same platform)
const REMOVE_DUPLICATE_ROWS = {
  'rg-21649-tecmo-bowl-usa-rev-a': 'tecmo-bowl-elite',
  'rg-22294-10-yard-fight-usa-europe': '10-yard-fight-classic-elite',
  'rg-22552-final-fantasy-vi-japan': 'final-fantasy-vi-elite-master',
  'rg-22857-chrono-trigger-usa': 'chrono-trigger-snes-elite',
  'rg-16910-comix-zone-europe': 'comix-zone-genesis-elite',
  'rg-16868-battletoads-usa': 'battletoads-nes-elite',
  'rg-19249-track-field-usa': 'track-and-field-nes',
  'rg-30173-golden-axe-world-v1-1': 'rg-16712-golden-axe-world',
  'rg-29834-batman-europe': 'rg-30222-batman-usa',
  'rg-18448-forgotten-worlds-world-v1-1': 'rg-30101-forgotten-worlds-world',
  'rg-29890-contra-the-hard-corps-japan': 'rg-30224-contra-hard-corps-usa',
};

const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const games = feed.games || [];

// ── 1. Dedupe ───────────────────────────────────────────────────────────────
const byId = new Map(games.map((game) => [game.id, game]));
const removed = [];
for (const [id, survivorId] of Object.entries(REMOVE_DUPLICATE_ROWS)) {
  if (!byId.has(id)) continue; // already removed in a previous run
  const survivor = byId.get(survivorId);
  if (!survivor) {
    throw new Error(`fix-tha-spot-catalog: survivor ${survivorId} missing`);
  }
  removed.push(id);
  byId.delete(id);
}
feed.games = [...byId.values()];

// ── 2. Slugify unsafe gd ids ────────────────────────────────────────────────
const slugifyGd = (rawId) => {
  const rest = rawId.slice(3);
  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    decoded = rest.replace(/%[0-9a-f]{2}/gi, (m) =>
      String.fromCharCode(parseInt(m.slice(1), 16))
    );
  }
  return 'gd-' + decoded.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const idRename = new Map();
for (const game of feed.games) {
  if (!/^gd-/i.test(game.id)) continue;
  const slug = slugifyGd(game.id);
  if (slug !== game.id && /^gd-[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    idRename.set(game.id, slug);
  }
}
for (const game of feed.games) {
  if (idRename.has(game.id)) game.id = idRename.get(game.id);
}

const idCounts = new Map();
for (const game of feed.games) {
  idCounts.set(game.id, (idCounts.get(game.id) || 0) + 1);
}
const collisions = [...idCounts.entries()].filter(([, c]) => c > 1);
if (collisions.length) {
  throw new Error(
    'fix-tha-spot-catalog: id collisions after slugify: ' +
      collisions.map(([id]) => id).join(', ')
  );
}

// ── 3. Write back ────────────────────────────────────────────────────────────
fs.writeFileSync(JSON_FEED, JSON.stringify(feed, null, 2) + '\n');

console.log('removed duplicate rows:', removed.length);
removed.forEach((id) => console.log('  -', id, '-> kept', REMOVE_DUPLICATE_ROWS[id]));
console.log('renamed gd ids:', idRename.size);
for (const [from, to] of idRename) console.log('  gd:', from, '->', to);
console.log('games now:', feed.games.length);
