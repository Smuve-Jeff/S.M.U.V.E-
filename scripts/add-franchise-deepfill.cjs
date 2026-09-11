#!/usr/bin/env node
/**
 * Franchise deep-fill pass for Tha Spot.
 *
 * Adds 11 NEW-GENERATION authentic cabinets (all probed 200 OK, no
 * frame-blocking headers — see scripts/probe-candidates.cjs):
 *   - Madden NFL 99/2000/2001/2002 (N64) — completes the series arc into 3D
 *   - NBA Live 2000, NBA Jam 2000, NBA Showtime (N64) — era-authentic NBA set
 *   - X-Men: Children of the Atom, Mutant Academy (PS1)
 *   - Spider-Man + Spider-Man 2: Enter Electro (PS1, Neversoft)
 *
 * Only verified-playable URLs are added; entries append AFTER the premium
 * shelf so launch ordering is untouched. Run sync-tha-spot-feed.cjs after.
 */
'use strict';
const fs = require('fs');

const FEED_PATH = 'src/assets/data/tha-spot-feed.json';
const CC = 'https://www.retrogames.cc/embed/';

const BASE = {
  availability: 'Online',
  image: 'assets/hub/home-backdrop-command.png',
  launchConfig: {
    embedMode: 'inline',
    secure_mode: 'wasm',
    controls: ['Standard Keyboard', 'Gamepad Support'],
  },
};

function retro(id, name, platform, genre, tags, embed, opts = {}) {
  const url = CC + embed;
  return {
    id,
    name,
    url,
    genre,
    description:
      opts.desc ||
      `Play ${name} online — authentic ${platform} cabinet streaming in your browser via the RetroGames emulator.`,
    ...BASE,
    rating: opts.rating ?? 4.5,
    playersOnline: opts.playersOnline ?? 1800,
    badgeIds: opts.badges ?? ['classic'],
    tags,
    launchConfig: { ...BASE.launchConfig, approvedEmbedUrl: url, approvedExternalUrl: url },
    art: {
      eyebrow: opts.eyebrow ?? 'Verified Cabinet',
      accentStart: opts.accentStart ?? '#f59e0b',
      accentEnd: opts.accentEnd ?? '#7c2d12',
    },
    ...(opts.aiBriefing ? { aiBriefing: opts.aiBriefing, aiSupportLevel: opts.aiSupportLevel ?? 'Advanced' } : {}),
  };
}

const ADDITIONS = [
  // ----- Madden NFL: the 3D-era N64 arc -----
  retro('madden-nfl-99-n64', 'Madden NFL 99 (N64)', 'N64', 'Sports',
    ['Sports', 'Football', 'Retro', 'N64', 'Classic', 'Simulation'], '32136-madden-nfl-99-usa.html',
    { rating: 4.5, playersOnline: 1800, eyebrow: 'EA Sports Elite',
      aiBriefing: "The first 3D Madden — polygonal players, franchise mode, and John Madden's voice arrive on the N64." }),
  retro('madden-nfl-2000-n64', 'Madden NFL 2000 (N64)', 'N64', 'Sports',
    ['Sports', 'Football', 'Retro', 'N64', 'Classic', 'Simulation'], '32551-madden-nfl-2000-usa.html',
    { rating: 4.6, playersOnline: 1900, eyebrow: 'EA Sports Elite',
      aiBriefing: 'Refined 3D football with deeper playbooks — the millennium Madden still hits hard.' }),
  retro('madden-nfl-2001-n64', 'Madden NFL 2001 (N64)', 'N64', 'Sports',
    ['Sports', 'Football', 'Retro', 'N64', 'Classic', 'Simulation'], '32595-madden-nfl-2001-usa.html',
    { rating: 4.5, playersOnline: 1700, eyebrow: 'EA Sports Elite' }),
  retro('madden-nfl-2002-n64', 'Madden NFL 2002 (N64)', 'N64', 'Sports',
    ['Sports', 'Football', 'Retro', 'N64', 'Classic', 'Simulation'], '32297-madden-nfl-2002-usa.html',
    { rating: 4.4, playersOnline: 1500, eyebrow: 'EA Sports Elite',
      aiBriefing: "The final N64 Madden — the last cartridge edition of the franchise, closing the series' 64-bit chapter." }),
  // ----- NBA: era-authentic simulation + arcade set -----
  retro('nba-live-2000-n64', 'NBA Live 2000 (N64)', 'N64', 'Sports',
    ['Sports', 'Basketball', 'Retro', 'N64', 'Classic', 'Simulation'], '32503-nba-live-2000-usa-en-fr-de-es.html',
    { rating: 4.5, playersOnline: 1800, eyebrow: 'EA Sports Elite',
      aiBriefing: 'EA\'s flagship NBA sim at its N64 peak — full rosters, franchise play, and Jordan himself on the roster.' }),
  retro('nba-jam-2000-n64', 'NBA Jam 2000 (N64)', 'N64', 'Sports',
    ['Sports', 'Basketball', 'Retro', 'N64', 'Classic', 'Arcade'], '32238-nba-jam-2000-usa.html',
    { rating: 4.5, playersOnline: 1900, eyebrow: 'Acclaim Elite',
      aiBriefing: 'He\'s on fire! Arcade 2-on-2 basketball with monster dunks — the Jam lineage burns on.' }),
  retro('nba-showtime-n64', 'NBA Showtime: NBA on NBC (N64)', 'N64', 'Sports',
    ['Sports', 'Basketball', 'Retro', 'N64', 'Classic', 'Arcade'], '32695-nba-showtime-nba-on-nbc-usa.html',
    { rating: 4.6, playersOnline: 2000, eyebrow: 'Midway Elite',
      aiBriefing: 'Midway\'s 3-on-3 arcade showcase — the direct descendant of NBA Jam, in glorious 3D.' }),
  // ----- X-Men: PS1 era -----
  retro('xmen-children-atom-ps1', 'X-Men: Children of the Atom (PS1)', 'PS1', 'Fighting',
    ['Fighting', 'Retro', 'PS1', 'Classic', 'PvP', 'Marvel'], '42409-x-men-children-of-the-atom.html',
    { rating: 4.7, playersOnline: 2600, eyebrow: 'Capcom Marvel',
      aiBriefing: "Capcom's 1994 marvel-versus fighter that started it all — Wolverine, Storm, and Magneto in pixel-perfect combat.", aiSupportLevel: 'Advanced' }),
  retro('xmen-mutant-academy-ps1', 'X-Men: Mutant Academy (PS1)', 'PS1', 'Fighting',
    ['Fighting', 'Retro', 'PS1', 'Classic', 'PvP', 'Marvel'], '46403-x-men-mutant-academy-usa.html',
    { rating: 4.4, playersOnline: 1600, eyebrow: 'Activision Elite' }),
  // ----- Spider-Man: PS1 era -----
  retro('spider-man-ps1', 'Spider-Man (PS1)', 'PS1', 'Action',
    ['Action', 'Adventure', 'Retro', 'PS1', 'Classic', 'Marvel'], '41980-spider-man.html',
    { rating: 4.7, playersOnline: 2800, eyebrow: 'Neversoft Elite',
      aiBriefing: 'Neversoft\'s 2000 web-head debut — full 3D web-swinging, symbiote trouble, and the best Spidey voice cast of the era.', aiSupportLevel: 'Advanced' }),
  retro('spider-man-2-electro-ps1', 'Spider-Man 2: Enter Electro (PS1)', 'PS1', 'Action',
    ['Action', 'Adventure', 'Retro', 'PS1', 'Classic', 'Marvel'], '41981-spider-man-2-enter-electro.html',
    { rating: 4.6, playersOnline: 2400, eyebrow: 'Neversoft Elite',
      aiBriefing: 'Electro lights up the skyline — the 2001 sequel with new suits, new moves, and bigger stunts.' }),
];

// ---------------------------------------------------------------------------
// APPLY — append after the existing archive (premium shelf stays first)
// ---------------------------------------------------------------------------

const feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
const existingIds = new Set(feed.games.map((g) => g.id));
const existingUrls = new Set(feed.games.map((g) => g.url));

const added = [];
for (const entry of ADDITIONS) {
  if (existingIds.has(entry.id)) {
    console.log(`skip (id exists): ${entry.id}`);
    continue;
  }
  if (existingUrls.has(entry.url)) {
    console.log(`skip (url exists): ${entry.id}`);
    continue;
  }
  added.push(entry);
  existingIds.add(entry.id);
  existingUrls.add(entry.url);
}

// Sanity: duplicate display names would fail the integrity suite.
const nameCounts = new Map();
for (const g of feed.games) nameCounts.set(g.name, (nameCounts.get(g.name) ?? 0) + 1);
for (const g of added) {
  if (nameCounts.has(g.name)) {
    console.error(`ABORT: display name collision "${g.name}"`);
    process.exit(1);
  }
  nameCounts.set(g.name, 1);
}

feed.games = [...feed.games, ...added];
fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2) + '\n');

console.log(`added: ${added.length} | catalog: ${feed.games.length - added.length} -> ${feed.games.length}`);
console.log('Next: node scripts/sync-tha-spot-feed.cjs');
