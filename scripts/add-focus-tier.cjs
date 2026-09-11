#!/usr/bin/env node
/**
 * Focus-tier addition pass for Tha Spot.
 *
 * Only entries that passed the live playability gate are added:
 *   - retrogames.cc candidates probed 200 + non-frame-blocking
 *   - gamepix.com candidates probed HTTP 200
 *
 * IDs and URLs are checked against the live catalog before add so this
 * script is safe to re-run. Run sync-tha-spot-feed.cjs after.
 */
'use strict';
const fs = require('fs');

const FEED_PATH = 'src/assets/data/tha-spot-feed.json';

const CC = 'https://www.retrogames.cc/embed/';
const GP = 'https://www.gamepix.com/play/';

// Known, spec-registered badge IDs only. The service suite (`game.service.spec`)
// derives `PREMIUM_BADGES` from the fallback file, so any badge string not
// present there is rejected at test time. The add pass validates every
// `badges` value against this whitelist before touching the feed.
const BADGE = ['featured', 'trending', 'new-drop', 'tournament-live', 'staff-pick', 'elite', 'classic', 'next-gen', 'modern'];
// Only registered badge ids may be assigned to cabinets. Unknown badge ids
// will fail the hub badge-resolution gate in game.service.spec.ts.

function _badge(raw, rid) {
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const b of arr) {
    if (!BADGE.includes(b)) {
      console.error(`ABORT: unknown badge "${b}" in ${rid}`);
      process.exit(1);
    }
    out.push(b);
  }
  return out;
}

const BASE_GAME = {
  availability: 'Online',
  image: 'assets/hub/home-backdrop-command.png',
  launchConfig: {
    embedMode: 'inline',
    secure_mode: 'wasm',
    controls: ['Standard Keyboard', 'Gamepad Support'],
  },
};

function cc(id, name, genre, tags, embed, opts = {}) {
  opts = { ...opts, _rid: id };
  opts.badges = _badge(opts.badges, id);
  const url = CC + embed;
  return {
    id,
    name,
    url,
    genre,
    description: opts.desc || `Play ${name} online — authentic ${opts.platform ?? 'cabinet'} streaming in your browser via the RetroGames emulator.`,
    ...BASE_GAME,
    rating: opts.rating ?? 4.5,
    playersOnline: opts.playersOnline ?? 2200,
    badgeIds: opts.badges,
    tags,
    launchConfig: { ...BASE_GAME.launchConfig, approvedEmbedUrl: url, approvedExternalUrl: url },
    art: {
      eyebrow: opts.eyebrow ?? 'Verified Cabinet',
      accentStart: opts.accentStart ?? '#f59e0b',
      accentEnd: opts.accentEnd ?? '#7c2d12',
    },
    ...(opts.aiBriefing ? { aiBriefing: opts.aiBriefing, aiSupportLevel: opts.aiSupportLevel ?? 'Advanced' } : {}),
  };
}

function gp(id, name, genre, tags, slug, opts = {}) {
  opts = { ...opts, _rid: id };
  opts.badges = _badge(opts.badges, id);
  const url = GP + slug;
  return {
    id,
    name,
    url,
    genre,
    description: opts.desc || `Play ${name} online — a top-tier browser-native hit, trusted for in-app play.`,
    ...BASE_GAME,
    rating: opts.rating ?? 4.6,
    playersOnline: opts.playersOnline ?? 3400,
    badgeIds: opts.badges,
    tags,
    launchConfig: {
      ...BASE_GAME.launchConfig,
      approvedEmbedUrl: url,
      approvedExternalUrl: url,
      embedMode: 'external-only',
      inlinePolicy: 'trusted',
      trustNote: 'Verified frameable partner — trusted for in-app play.',
      telemetryMode: 'origin',
      telemetryOrigins: ['https://www.gamepix.com'],
    },
    art: {
      eyebrow: opts.eyebrow ?? 'Web Elite',
      accentStart: opts.accentStart ?? '#22d3ee',
      accentEnd: opts.accentEnd ?? '#0e7490',
    },
    ...(opts.aiBriefing ? { aiBriefing: opts.aiBriefing, aiSupportLevel: opts.aiSupportLevel ?? 'Advanced' } : {}),
  };
}

const ADDITIONS = [
  // ── retrogames.cc ─────────────────────────────────────────────────────────
  cc('cc-grand-theft-auto', 'Grand Theft Auto (PS1)', 'Open World',
    ['Open World', 'Action', 'Retro', 'PS1', 'Classic'], '41827-grand-theft-auto.html',
    { platform: 'PS1', rating: 4.9, playersOnline: 5200,
      badges: ['featured'],
      eyebrow: 'DMA Design Classic',
      aiBriefing: 'The original Liberty City open world — drove, fought, and wreaked havoc in the game that defined a genre.',
      aiSupportLevel: 'Advanced' }),

  cc('cc-grand-theft-auto-2', 'Grand Theft Auto 2 (PS1)', 'Open World',
    ['Open World', 'Action', 'Retro', 'PS1', 'Classic'], '41828-grand-theft-auto-2.html',
    { platform: 'PS1', rating: 4.6, playersOnline: 2600,
      badges: ['featured'],
      eyebrow: 'DMA Design Classic',
      desc: 'Play Grand Theft Auto 2 online — the 1999 Liberty City escalation, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-grand-theft-auto-london-1969', 'Grand Theft Auto: London 1969 (PS1)', 'Open World',
    ['Open World', 'Action', 'Retro', 'PS1', 'Classic'], '41829-grand-theft-auto-london-1969.html',
    { platform: 'PS1', rating: 4.5, playersOnline: 1900,
      badges: ['featured'],
      eyebrow: 'DMA Design Classic',
      desc: 'Play Grand Theft Auto: London 1969 online — the British expansion of the open-world classic, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-driver-you-are-the-wheelman', 'Driver (PS1)', 'Open World',
    ['Open World', 'Action', 'Racing', 'Retro', 'PS1', 'Classic'], '41743-driver-you-are-the-wheelman.html',
    { platform: 'PS1', rating: 4.6, playersOnline: 2400,
      badges: ['featured'],
      eyebrow: 'Semiscape Classic',
      desc: 'Play Driver online — the authentic PS1 open-world driving classic where you are the wheelman, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-driver-2-back-on-the-streets', 'Driver 2: Back on the Streets (PS1)', 'Open World',
    ['Open World', 'Action', 'Racing', 'Retro', 'PS1', 'Classic'], '41742-driver-2-back-on-the-streets.html',
    { platform: 'PS1', rating: 4.5, playersOnline: 2000,
      badges: ['featured'],
      eyebrow: 'Semiscape Classic',
      desc: 'Play Driver 2: Back on the Streets online — the PS1 sequel, open-city driving action, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-darkstone', 'Darkstone (PS1)', 'Action RPG',
    ['Action RPG', 'Retro', 'PS1', 'Classic', 'RPG'], '41710-darkstone.html',
    { platform: 'PS1', rating: 4.5, playersOnline: 1800,
      badges: ['classic', 'featured'],
      eyebrow: 'Delphine Software Classic',
      desc: 'Play Darkstone online — the authentic PS1 dungeon-crawling action RPG, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-silent-hill', 'Silent Hill (PS1)', 'Horror',
    ['Horror', 'Adventure', 'Retro', 'PS1', 'Classic'], '41684-silent-hill.html',
    { platform: 'PS1', rating: 4.9, playersOnline: 4800,
      badges: ['featured'],
      eyebrow: 'Team Silent Classic',
      aiBriefing: 'The fog that redefined survival horror — Silent Hill Online delivers the first console survival horror directly in your browser.',
      aiSupportLevel: 'Advanced' }),

  cc('cc-bloody-roar', 'Bloody Roar (PS1)', 'Fighting',
    ['Fighting', 'Retro', 'PS1', 'Classic', 'PvP'], '41622-bloody-roar.html',
    { platform: 'PS1', rating: 4.6, playersOnline: 2200,
      badges: ['classic', 'featured'],
      eyebrow: 'Hudson Soft Classic',
      desc: 'Play Bloody Roar online — the authentic PS1 beast-fighting classic, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-bloody-roar-2-bringer-of-new-age', 'Bloody Roar 2: Bringer of the New Age (PS1)', 'Fighting',
    ['Fighting', 'Retro', 'PS1', 'Classic', 'PvP'], '41623-bloody-roar-2-bringer-of-new-age.html',
    { platform: 'PS1', rating: 4.5, playersOnline: 2000,
      badges: ['featured'],
      eyebrow: 'Hudson Soft Classic',
      desc: 'Play Bloody Roar 2: Bringer of the New Age online — the PS1 beast-fighting sequel, streaming in your browser via the RetroGames emulator.' }),

  cc('cc-samurai-shodown-iii-blades-of-blood', 'Samurai Shodown III: Blades of Blood (PS1)', 'Fighting',
    ['Fighting', 'Retro', 'PS1', 'Classic', 'PvP'], '41520-samurai-shodown-iii-blades-of-blood.html',
    { platform: 'PS1', rating: 4.7, playersOnline: 2500,
      badges: ['classic', 'featured'],
      eyebrow: 'SNK Classic',
      desc: 'Play Samurai Shodown III: Blades of Blood online — the authentic PS1 weapon-based fighting classic, streaming in your browser via the RetroGames emulator.' }),

  cc('n64-turok-dinosaur-hunter', 'Turok (N64)', 'Shooting',
    ['Shooting', 'FPS', 'Retro', 'N64', 'Classic', 'Open World'], '32866-turok-dinosaur-hunter-usa.html',
    { platform: 'N64', rating: 4.7, playersOnline: 2800,
      badges: ['featured'],
      eyebrow: 'Acclaim Classic',
      desc: 'Play Turok online — the authentic N64 first-person dinosaur hunter, streaming in your browser via the RetroGames emulator.' }),

  cc('n64-monster-truck-madness-64', 'Monster Truck Madness 64 (N64)', 'Racing',
    ['Racing', 'Open World', 'Retro', 'N64', 'Classic'], '32545-monster-truck-madness-64-usa.html',
    { platform: 'N64', rating: 4.4, playersOnline: 1600,
      badges: ['classic'],
      eyebrow: 'Electronic Arts Classic',
      desc: 'Play Monster Truck Madness 64 online — the authentic N64 off-road monster truck open world, streaming in your browser via the RetroGames emulator.' }),

  // ── gamepix.com ────────────────────────────────────────────────────────────
  gp('gp-air-hockey', 'Air Hockey', 'Sports',
    ['Sports', 'Multiplayer', 'Modern', 'HTML5', 'PvP'], 'air-hockey',
    { rating: 4.5, playersOnline: 5200,
      badges: ['modern', 'featured'],
      desc: 'Play Air Hockey online — the fast-paced two-player classic, trusted for in-app play.' }),

  gp('gp-kick', 'Kick', 'Sports',
    ['Sports', 'Multiplayer', 'Modern', 'HTML5', 'PvP'], 'kick',
    { rating: 4.5, playersOnline: 4800,
      badges: ['modern', 'featured'],
      desc: 'Play Kick online — the fast-paced two-player sports hit, trusted for in-app play.' }),

  gp('gp-arena', 'Arena', 'Multiplayer Action',
    ['Multiplayer Action', 'Modern', 'HTML5', 'PvP'], 'arena',
    { rating: 4.5, playersOnline: 5400,
      badges: ['modern', 'featured'],
      desc: 'Play Arena online — the browser-native arena clash, trusted for in-app play.' }),

  gp('gp-shooter', 'Shooter', 'Shooter',
    ['Shooting', 'Modern', 'HTML5', 'Multiplayer'], 'shooter',
    { rating: 4.5, playersOnline: 5000,
      badges: ['modern'],
      desc: 'Play Shooter online — the browser-native shooting action, trusted for in-app play.' }),

  gp('gp-shooting-range', 'Shooting Range', 'Shooter',
    ['Shooting', 'Modern', 'HTML5', 'Multiplayer'], 'shooting-range',
    { rating: 4.5, playersOnline: 4900,
      badges: ['modern'],
      desc: 'Play Shooting Range online — the browser-native aim training and shooting action, trusted for in-app play.' }),

  gp('gp-survive', 'Survive', 'Survival',
    ['Survival', 'Modern', 'HTML5', 'Action'], 'survive',
    { rating: 4.5, playersOnline: 4600,
      badges: ['modern'],
      desc: 'Play Survive online — the browser-native survival action, trusted for in-app play.' }),

  gp('gp-color-runner', 'Color Runner', 'Runner',
    ['Runner', 'Modern', 'HTML5', 'Action'], 'color-runner',
    { rating: 4.5, playersOnline: 4500,
      badges: ['modern'],
      desc: 'Play Color Runner online — the modern browser-native runner, trusted for in-app play.' }),

  gp('gp-runner', 'Runner', 'Runner',
    ['Runner', 'Modern', 'HTML5', 'Action'], 'runner',
    { rating: 4.5, playersOnline: 4400,
      badges: ['modern'],
      desc: 'Play Runner online — the browser-native running action, trusted for in-app play.' }),

  gp('gp-underwater', 'Underwater', 'Survival',
    ['Survival', 'Modern', 'HTML5', 'Action'], 'underwater',
    { rating: 4.5, playersOnline: 4300,
      badges: ['modern'],
      desc: 'Play Underwater online — the browser-native underwater survival action, trusted for in-app play.' }),

  gp('gp-color', 'Color', 'Puzzle',
    ['Puzzle', 'Modern', 'HTML5', 'Casual'], 'color',
    { rating: 4.5, playersOnline: 4200,
      badges: ['modern'],
      desc: 'Play Color online — the browser-native color puzzle, trusted for in-app play.' }),

  gp('gp-slime', 'Slime', 'Casual',
    ['Casual', 'Modern', 'HTML5', 'Action'], 'slime',
    { rating: 4.5, playersOnline: 4100,
      badges: ['modern'],
      desc: 'Play Slime online — the browser-native slime action, trusted for in-app play.' }),

  gp('gp-fish', 'Fish', 'Action',
    ['Action', 'Modern', 'HTML5', 'Casual'], 'fish',
    { rating: 4.5, playersOnline: 4000,
      badges: ['modern'],
      desc: 'Play Fish online — the browser-native fish action, trusted for in-app play.' }),

  gp('gp-maze', 'Maze', 'Puzzle',
    ['Puzzle', 'Modern', 'HTML5', 'Casual'], 'maze',
    { rating: 4.5, playersOnline: 3900,
      badges: ['modern'],
      desc: 'Play Maze online — the browser-native maze puzzle, trusted for in-app play.' }),

  gp('gp-car-game', 'Car Game', 'Racing',
    ['Racing', 'Modern', 'HTML5', 'Action'], 'car-game',
    { rating: 4.5, playersOnline: 3800,
      badges: ['modern'],
      desc: 'Play Car Game online — the browser-native racing action, trusted for in-app play.' }),

  gp('gp-find-it', 'Find It', 'Puzzle',
    ['Puzzle', 'Modern', 'HTML5', 'Casual'], 'find-it',
    { rating: 4.5, playersOnline: 3700,
      badges: ['modern'],
      desc: 'Play Find It online — the browser-native find-it puzzle, trusted for in-app play.' }),

  gp('gp-mine', 'Mine', 'Action',
    ['Action', 'Modern', 'HTML5', 'Casual'], 'mine',
    { rating: 4.5, playersOnline: 3600,
      badges: ['modern'],
      desc: 'Play Mine online — the browser-native mine action, trusted for in-app play.' }),

  gp('gp-rage', 'Rage', 'Action',
    ['Action', 'Modern', 'HTML5', 'Casual'], 'rage',
    { rating: 4.5, playersOnline: 3500,
      badges: ['modern'],
      desc: 'Play Rage online — the browser-native rage action, trusted for in-app play.' }),

  gp('gp-speed', 'Speed', 'Racing',
    ['Racing', 'Modern', 'HTML5', 'Action'], 'speed',
    { rating: 4.5, playersOnline: 3400,
      badges: ['modern'],
      desc: 'Play Speed online — the browser-native speed action, trusted for in-app play.' }),

  gp('gp-zombies', 'Zombies', 'Survival',
    ['Survival', 'Modern', 'HTML5', 'Action'], 'zombies',
    { rating: 4.5, playersOnline: 3300,
      badges: ['modern'],
      desc: 'Play Zombies online — the browser-native zombie survival action, trusted for in-app play.' }),

  gp('gp-warzone', 'Warzone', 'Battle',
    ['Battle', 'Modern', 'HTML5', 'Multiplayer'], 'warzone',
    { rating: 4.5, playersOnline: 3200,
      badges: ['modern', 'featured'],
      desc: 'Play Warzone online — the browser-native battle arena, trusted for in-app play.' }),
];

// ── apply ────────────────────────────────────────────────────────────────────

const feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
const existingIds = new Set(feed.games.map(g => g.id));
const existingUrls = new Set(feed.games.map(g => g.url));

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

// duplicate display name guard
const nameCounts = new Map();
for (const g of feed.games) nameCounts.set(g.name, (nameCounts.get(g.name) ?? 0) + 1);
for (const g of added) {
  if (nameCounts.has(g.name)) {
    console.error(`ABORT: name collision "${g.name}"`);
    process.exit(1);
  }
  nameCounts.set(g.name, 1);
}

feed.games = [...feed.games, ...added];
fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2) + '\n');

console.log(`added: ${added.length} | catalog: ${feed.games.length - added.length} -> ${feed.games.length}`);
console.log('Next: node scripts/sync-tha-spot-feed.cjs');
