/**
 * sync-tha-spot-feed.cjs — single source of truth for the Tha Spot catalog.
 *
 * The JSON asset (`src/assets/data/tha-spot-feed.json`) is the authoritative
 * catalog that ships at runtime. `src/app/hub/tha-spot-feed.fallback.ts` is a
 * compiled-in mirror used when the asset cannot be fetched (offline / PWA).
 * These two feeds drifted apart over several catalog migrations, so the
 * fallback was surfacing a materially different (and partially dead) library.
 *
 * This script:
 *   1. Repairs dangling cross-references in the JSON feed:
 *      - recommendationRails[].gameIds / roomIds  → dropped if the game/room no longer exists
 *      - promotions[].gameIds / roomIds           → dropped if the game/room no longer exists
 *      - rooms[].rules.gameIds                    → dropped if the game no longer exists
 *      - liveEvents[].featuredGameId              → cleared if the game no longer exists
 *      - socialPresence[].gameId                  → cleared if the game no longer exists
 *   2. Rewrites the JSON feed (2-space indent, trailing newline).
 *   3. Regenerates `tha-spot-feed.fallback.ts` from the repaired JSON so the
 *      fallback is an exact mirror of the primary catalog.
 *
 * The script is idempotent. Run it after every catalog edit:
 *     node scripts/sync-tha-spot-feed.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const TS_FEED = path.join(ROOT, 'src', 'app', 'hub', 'tha-spot-feed.fallback.ts');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Repair dangling references
// ─────────────────────────────────────────────────────────────────────────────
const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));

const gameIds = new Set((feed.games || []).map((g) => g && g.id));
const roomIds = new Set((feed.rooms || []).map((r) => r && r.id));

let repairedRefs = 0;

function dropDangling(ids) {
  if (!Array.isArray(ids)) return ids;
  const before = ids.length;
  const kept = ids.filter((id) => typeof id === 'string' && gameIds.has(id));
  repairedRefs += before - kept.length;
  return kept;
}

function dropDanglingRooms(ids) {
  if (!Array.isArray(ids)) return ids;
  const before = ids.length;
  const kept = ids.filter((id) => typeof id === 'string' && roomIds.has(id));
  repairedRefs += before - kept.length;
  return kept;
}

for (const rail of feed.recommendationRails || []) {
  if (Array.isArray(rail.gameIds)) rail.gameIds = dropDangling(rail.gameIds);
  if (Array.isArray(rail.roomIds)) rail.roomIds = dropDanglingRooms(rail.roomIds);
}

for (const promo of feed.promotions || []) {
  if (Array.isArray(promo.gameIds)) promo.gameIds = dropDangling(promo.gameIds);
  if (Array.isArray(promo.roomIds)) promo.roomIds = dropDanglingRooms(promo.roomIds);
}

for (const room of feed.rooms || []) {
  if (room.rules && Array.isArray(room.rules.gameIds)) {
    room.rules.gameIds = dropDangling(room.rules.gameIds);
  }
}

for (const event of feed.liveEvents || []) {
  if (
    typeof event.featuredGameId === 'string' &&
    event.featuredGameId &&
    !gameIds.has(event.featuredGameId)
  ) {
    event.featuredGameId = '';
    repairedRefs += 1;
  }
}

for (const entry of feed.socialPresence || []) {
  if (
    typeof entry.gameId === 'string' &&
    entry.gameId &&
    !gameIds.has(entry.gameId)
  ) {
    entry.gameId = '';
    repairedRefs += 1;
  }
}

fs.writeFileSync(JSON_FEED, JSON.stringify(feed, null, 2) + '\n');
console.log(
  `JSON: ${feed.games.length} games, ${feed.recommendationRails.length} rails, ` +
    `repaired ${repairedRefs} dangling reference(s)`
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Regenerate the compiled-in fallback from the repaired JSON
// ─────────────────────────────────────────────────────────────────────────────
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function renderString(value) {
  return (
    "'" +
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029') +
    "'"
  );
}

function renderValue(value, indent) {
  const pad = '  '.repeat(indent);

  if (value === null) return 'null';
  if (typeof value === 'string') return renderString(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrimitive = value.every(
      (v) => v === null || typeof v !== 'object'
    );
    if (allPrimitive) {
      return '[' + value.map((v) => renderValue(v, indent)).join(', ') + ']';
    }
    const lines = value.map(
      (v) => pad + '  ' + renderValue(v, indent + 1) + ','
    );
    return '[\n' + lines.join('\n') + '\n' + pad + ']';
  }

  const keys = Object.keys(value);
  const lines = keys.map((key) => {
    const k = IDENTIFIER.test(key) ? key : renderString(key);
    return (
      pad + '  ' + k + ': ' + renderValue(value[key], indent + 1) + ','
    );
  });
  return '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const header = [
  "import { ThaSpotFeed } from './game';",
  '',
  '/**',
  ' * Compiled-in fallback for the Tha Spot catalog.',
  ' *',
  ' * GENERATED from `src/assets/data/tha-spot-feed.json` — do not edit by hand.',
  ' * Refresh with: `node scripts/sync-tha-spot-feed.cjs`',
  ' */',
  'export const THA_SPOT_FALLBACK_FEED: ThaSpotFeed = ' +
    renderValue(feed, 0) +
    ';',
  '',
].join('\n');

fs.writeFileSync(TS_FEED, header);
console.log(`TS:   regenerated fallback mirroring ${feed.games.length} games`);
console.log('Done.');
