#!/usr/bin/env node
/**
 * Catalog upgrade sourcing helper.
 *
 * Discovers PLAYABLE (frameable) cabinets for iconic/popular titles from:
 *  - retrogames.cc platform categories (console/arcade emulation, embeddable)
 *  - gamepix.com most-played / new / discovery (modern HTML5, embeddable)
 *
 * Resumable: listings + embed lookups are cached under /tmp/catalog-src-cache,
 * so re-runs continue where a previous run was killed.
 *
 * Output: /tmp/upgrade-pool.json  [{ id, name, displayName, platform, slug, url, embed, source }]
 */
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CACHE_DIR = '/tmp/catalog-src-cache';
fs.mkdirSync(CACHE_DIR, { recursive: true });

const cacheGet = (key) => {
  try {
    return JSON.parse(fs.readFileSync(`${CACHE_DIR}/${key}.json`, 'utf8'));
  } catch {
    return null;
  }
};
const cacheSet = (key, val) => {
  fs.writeFileSync(`${CACHE_DIR}/${key}.json`, JSON.stringify(val));
};

function fetch(url, maxMs = 20000) {
  try {
    const out = execFileSync(
      'curl',
      ['-s', '-L', '-A', UA, '--max-time', String(Math.floor(maxMs / 1000)), url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    return out;
  } catch {
    return '';
  }
}

/** Platforms on retrogames.cc (category -> label). */
const CC_PLATFORMS = {
  'n64-games': 'N64',
  'psx-games': 'PS1',
  'snes-games': 'SNES',
  'genesis-games': 'Genesis',
  'gameboyadvance-games': 'GBA',
  'gameboycolor-games': 'GBC',
  'gameboy-games': 'GB',
  'gamegear-games': 'Game Gear',
  'mastersystem-games': 'Master System',
  'arcade-games': 'Arcade',
  'nes-games': 'NES',
};

const MAX_PAGES = 60; // safety cap per platform

async function scrapeCc(only) {
  const found = {}; // platform -> Map(slug -> true)
  const cached = cacheGet('cc-slugs') || {};
  for (const [cat] of Object.entries(CC_PLATFORMS)) {
    if (only && cat !== only) continue;
    if (cached[cat]) {
      found[cat] = new Map(Object.entries(cached[cat]).map(([slug]) => [slug, true]));
      console.log(`cc ${cat}: ${found[cat].size} (cached)`);
      continue;
    }
    const first = fetch(`https://www.retrogames.cc/${cat}`);
    if (!first) {
      console.log(`skip ${cat}: unreachable`);
      continue;
    }
    // Determine last page from pagination links.
    const pages = [...first.matchAll(new RegExp(`https://www\\.retrogames\\.cc/${cat}/page/(\\d+)\\.html`, 'g'))].map(
      (m) => Number(m[1])
    );
    const lastPage = Math.min(pages.length ? Math.max(...pages) : 1, MAX_PAGES);
    const htmls = [first];
    for (let p = 2; p <= lastPage; p++) {
      const h = fetch(`https://www.retrogames.cc/${cat}/page/${p}.html`);
      if (h) htmls.push(h);
    }
    found[cat] = new Map();
    for (const h of htmls) {
      for (const m of h.matchAll(/href="https:\/\/www\.retrogames\.cc\/[a-z0-9]+-games\/([a-z0-9:-]+)\.html"/g)) {
        found[cat].set(m[1], true);
      }
    }
    cached[cat] = Object.fromEntries([...found[cat]]);
    cacheSet('cc-slugs', cached);
    console.log(`cc ${cat}: ${found[cat].size} titles across ${lastPage} pages`);
  }
  return found;
}

/** Iconic-title keyword matcher. */
const CC_MATCHERS = [
  // N64
  { kw: 'goldeneye', name: 'GoldenEye 007', platforms: ['n64-games'] },
  { kw: 'mario-kart-64', name: 'Mario Kart 64', platforms: ['n64-games'] },
  { kw: 'banjo-kazooie', name: 'Banjo-Kazooie', platforms: ['n64-games'] },
  { kw: 'paper-mario', name: 'Paper Mario', platforms: ['n64-games'] },
  { kw: 'pokemon-stadium', name: 'Pokémon Stadium', platforms: ['n64-games'] },
  { kw: 'kirby-64', name: 'Kirby 64: The Crystal Shards', platforms: ['n64-games'] },
  { kw: 'f-zero-x', name: 'F-Zero X', platforms: ['n64-games'] },
  { kw: 'diddy-kong-racing', name: 'Diddy Kong Racing', platforms: ['n64-games'] },
  { kw: 'super-smash-bros', name: 'Super Smash Bros.', platforms: ['n64-games'] },
  { kw: 'wave-race', name: 'Wave Race 64', platforms: ['n64-games'] },
  { kw: 'donkey-kong-64', name: 'Donkey Kong 64', platforms: ['n64-games'] },
  { kw: 'perfect-dark', name: 'Perfect Dark', platforms: ['n64-games'] },
  { kw: 'jet-force-gemini', name: 'Jet Force Gemini', platforms: ['n64-games'] },
  { kw: 'mario-party-2', name: 'Mario Party 2', platforms: ['n64-games'] },
  { kw: 'mario-party-3', name: 'Mario Party 3', platforms: ['n64-games'] },
  { kw: 'conkers-bad-fur-day', name: "Conker's Bad Fur Day", platforms: ['n64-games'] },
  { kw: '1080', name: '1080° Snowboarding', platforms: ['n64-games'] },
  { kw: 'star-fox-64', name: 'Star Fox 64', platforms: ['n64-games'] },
  { kw: 'yoshis-story', name: "Yoshi's Story", platforms: ['n64-games'] },
  // PS1
  { kw: 'crash-bandicoot-2', name: 'Crash Bandicoot 2: Cortex Strikes Back', platforms: ['psx-games'] },
  { kw: 'crash-bandicoot-3', name: 'Crash Bandicoot 3: Warped', platforms: ['psx-games'] },
  { kw: 'crash-team-racing', name: 'Crash Team Racing', platforms: ['psx-games'] },
  { kw: 'spyro-the-dragon', name: 'Spyro the Dragon', platforms: ['psx-games'] },
  { kw: 'spyro-2', name: "Spyro 2: Ripto's Rage", platforms: ['psx-games'] },
  { kw: 'spyro-year-of-the-dragon', name: 'Spyro: Year of the Dragon', platforms: ['psx-games'] },
  { kw: 'final-fantasy-vii', name: 'Final Fantasy VII (PS1)', platforms: ['psx-games'] },
  { kw: 'final-fantasy-viii', name: 'Final Fantasy VIII', platforms: ['psx-games'] },
  { kw: 'final-fantasy-ix', name: 'Final Fantasy IX', platforms: ['psx-games'] },
  { kw: 'chrono-cross', name: 'Chrono Cross', platforms: ['psx-games'] },
  { kw: 'metal-gear-solid', name: 'Metal Gear Solid (PS1)', platforms: ['psx-games'] },
  { kw: 'resident-evil-2', name: 'Resident Evil 2 (PS1)', platforms: ['psx-games'] },
  { kw: 'resident-evil-3', name: 'Resident Evil 3: Nemesis', platforms: ['psx-games'] },
  { kw: 'castlevania-symphony', name: 'Castlevania: Symphony of the Night', platforms: ['psx-games'] },
  { kw: 'tomb-raider', name: 'Tomb Raider (PS1)', platforms: ['psx-games'] },
  { kw: 'tony-hawks-pro-skater-2', name: "Tony Hawk's Pro Skater 2 (PS1)", platforms: ['psx-games'] },
  { kw: 'gran-turismo-2', name: 'Gran Turismo 2', platforms: ['psx-games'] },
  { kw: 'tekken-3', name: 'Tekken 3 (PS1)', platforms: ['psx-games'] },
  { kw: 'tekken-2', name: 'Tekken 2 (PS1)', platforms: ['psx-games'] },
  { kw: 'twisted-metal-2', name: 'Twisted Metal 2', platforms: ['psx-games'] },
  { kw: 'mega-man-x4', name: 'Mega Man X4', platforms: ['psx-games'] },
  { kw: 'mega-man-x5', name: 'Mega Man X5', platforms: ['psx-games'] },
  { kw: 'marvel-vs-capcom', name: 'Marvel vs. Capcom', platforms: ['psx-games'] },
  { kw: 'soul-blade', name: 'Soul Blade', platforms: ['psx-games'] },
  { kw: 'wipeout', name: 'Wipeout (PS1)', platforms: ['psx-games'] },
  { kw: 'medievil', name: 'MediEvil', platforms: ['psx-games'] },
  { kw: 'rayman', name: 'Rayman (PS1)', platforms: ['psx-games'] },
  { kw: 'ape-escape', name: 'Ape Escape', platforms: ['psx-games'] },
  { kw: 'oddworld', name: "Oddworld: Abe's Oddysee", platforms: ['psx-games'] },
  { kw: 'duke-nukem-3d', name: 'Duke Nukem 3D (PS1)', platforms: ['psx-games'] },
  { kw: 'need-for-speed-iii', name: 'Need for Speed III: Hot Pursuit', platforms: ['psx-games'] },
  { kw: 'parasite-eve', name: 'Parasite Eve', platforms: ['psx-games'] },
  // SNES
  { kw: 'chrono-trigger', name: 'Chrono Trigger (SNES)', platforms: ['snes-games'] },
  { kw: 'super-mario-rpg', name: 'Super Mario RPG', platforms: ['snes-games'] },
  { kw: 'donkey-kong-country-2', name: 'Donkey Kong Country 2', platforms: ['snes-games'] },
  { kw: 'donkey-kong-country-3', name: 'Donkey Kong Country 3', platforms: ['snes-games'] },
  { kw: 'kirby-super-star', name: 'Kirby Super Star', platforms: ['snes-games'] },
  { kw: 'super-metroid', name: 'Super Metroid', platforms: ['snes-games'] },
  { kw: 'yoshis-island', name: "Yoshi's Island", platforms: ['snes-games'] },
  { kw: 'earthbound', name: 'EarthBound', platforms: ['snes-games'] },
  { kw: 'secret-of-mana', name: 'Secret of Mana', platforms: ['snes-games'] },
  { kw: 'super-castlevania-iv', name: 'Super Castlevania IV', platforms: ['snes-games'] },
  { kw: 'contra-iii', name: 'Contra III: The Alien Wars', platforms: ['snes-games'] },
  { kw: 'tmnt-turtles-in-time', name: 'TMNT IV: Turtles in Time', platforms: ['snes-games'] },
  { kw: 'zombies-ate-my-neighbors', name: 'Zombies Ate My Neighbors', platforms: ['snes-games'] },
  { kw: 'super-bomberman', name: 'Super Bomberman', platforms: ['snes-games'] },
  { kw: 'f-zero', name: 'F-Zero (SNES)', platforms: ['snes-games'] },
  { kw: 'super-star-wars', name: 'Super Star Wars', platforms: ['snes-games'] },
  { kw: 'mortal-kombat-2', name: 'Mortal Kombat II (SNES)', platforms: ['snes-games'] },
  { kw: 'mortal-kombat-3', name: 'Mortal Kombat 3 (SNES)', platforms: ['snes-games'] },
  { kw: 'nba-jam', name: 'NBA Jam (SNES)', platforms: ['snes-games'] },
  { kw: 'super-punch-out', name: 'Super Punch-Out!!', platforms: ['snes-games'] },
  { kw: 'star-fox', name: 'Star Fox (SNES)', platforms: ['snes-games'] },
  { kw: 'pilotwings', name: 'Pilotwings', platforms: ['snes-games'] },
  { kw: 'breath-of-fire', name: 'Breath of Fire', platforms: ['snes-games'] },
  { kw: 'illusions-of-gaia', name: 'Illusion of Gaia', platforms: ['snes-games'] },
  { kw: 'actraiser', name: 'ActRaiser', platforms: ['snes-games'] },
  { kw: 'sunset-riders', name: 'Sunset Riders', platforms: ['snes-games'] },
  { kw: 'wild-guns', name: 'Wild Guns', platforms: ['snes-games'] },
  { kw: 'tetris-attack', name: 'Tetris Attack', platforms: ['snes-games'] },
  { kw: 'super-mario-all-stars', name: 'Super Mario All-Stars', platforms: ['snes-games'] },
  { kw: 'mega-man-x', name: 'Mega Man X (SNES)', platforms: ['snes-games'] },
  { kw: 'mega-man-7', name: 'Mega Man 7', platforms: ['snes-games'] },
  // Genesis
  { kw: 'sonic-3', name: 'Sonic the Hedgehog 3', platforms: ['genesis-games'] },
  { kw: 'sonic-knuckles', name: 'Sonic & Knuckles', platforms: ['genesis-games'] },
  { kw: 'sonic-2', name: 'Sonic the Hedgehog 2', platforms: ['genesis-games'] },
  { kw: 'streets-of-rage-2', name: 'Streets of Rage 2', platforms: ['genesis-games'] },
  { kw: 'streets-of-rage-3', name: 'Streets of Rage 3', platforms: ['genesis-games'] },
  { kw: 'gunstar-heroes', name: 'Gunstar Heroes', platforms: ['genesis-games'] },
  { kw: 'ristar', name: 'Ristar', platforms: ['genesis-games'] },
  { kw: 'castlevania-bloodlines', name: 'Castlevania: Bloodlines', platforms: ['genesis-games'] },
  { kw: 'contra-hard-corps', name: 'Contra: Hard Corps', platforms: ['genesis-games'] },
  { kw: 'tmnt-hyperstone', name: 'TMNT: The Hyperstone Heist', platforms: ['genesis-games'] },
  { kw: 'mortal-kombat-2', name: 'Mortal Kombat II (Genesis)', platforms: ['genesis-games'] },
  { kw: 'mortal-kombat-3', name: 'Mortal Kombat 3 (Genesis)', platforms: ['genesis-games'] },
  { kw: 'nba-jam', name: 'NBA Jam (Genesis)', platforms: ['genesis-games'] },
  { kw: 'road-rash', name: 'Road Rash', platforms: ['genesis-games'] },
  { kw: 'golden-axe', name: 'Golden Axe', platforms: ['genesis-games'] },
  { kw: 'altered-beast', name: 'Altered Beast', platforms: ['genesis-games'] },
  { kw: 'outrun', name: 'OutRun (Genesis)', platforms: ['genesis-games'] },
  { kw: 'phantasy-star-iv', name: 'Phantasy Star IV', platforms: ['genesis-games'] },
  { kw: 'shining-force', name: 'Shining Force', platforms: ['genesis-games'] },
  { kw: 'ecco', name: 'Ecco the Dolphin', platforms: ['genesis-games'] },
  { kw: 'comix-zone', name: 'Comix Zone', platforms: ['genesis-games'] },
  { kw: 'vectorman', name: 'Vectorman', platforms: ['genesis-games'] },
  { kw: 'earthworm-jim', name: 'Earthworm Jim (Genesis)', platforms: ['genesis-games'] },
  { kw: 'shinobi-3', name: 'Shinobi III', platforms: ['genesis-games'] },
  { kw: 'kid-chameleon', name: 'Kid Chameleon', platforms: ['genesis-games'] },
  { kw: 'toe-jam-and-earl', name: 'ToeJam & Earl', platforms: ['genesis-games'] },
  { kw: 'rocket-knight', name: 'Rocket Knight Adventures', platforms: ['genesis-games'] },
  // GBA
  { kw: 'pokemon-emerald', name: 'Pokémon Emerald', platforms: ['gameboyadvance-games'] },
  { kw: 'pokemon-fire-red', name: 'Pokémon FireRed', platforms: ['gameboyadvance-games'] },
  { kw: 'pokemon-leaf-green', name: 'Pokémon LeafGreen', platforms: ['gameboyadvance-games'] },
  { kw: 'pokemon-ruby', name: 'Pokémon Ruby', platforms: ['gameboyadvance-games'] },
  { kw: 'pokemon-sapphire', name: 'Pokémon Sapphire', platforms: ['gameboyadvance-games'] },
  { kw: 'metroid-fusion', name: 'Metroid Fusion', platforms: ['gameboyadvance-games'] },
  { kw: 'metroid-zero-mission', name: 'Metroid: Zero Mission', platforms: ['gameboyadvance-games'] },
  { kw: 'zelda-minish-cap', name: 'The Legend of Zelda: The Minish Cap', platforms: ['gameboyadvance-games'] },
  { kw: 'zelda-a-link-to-the-past', name: 'Zelda: A Link to the Past (GBA)', platforms: ['gameboyadvance-games'] },
  { kw: 'super-mario-advance', name: 'Super Mario Advance', platforms: ['gameboyadvance-games'] },
  { kw: 'mario-kart-super-circuit', name: 'Mario Kart: Super Circuit', platforms: ['gameboyadvance-games'] },
  { kw: 'wario-ware', name: 'WarioWare, Inc.', platforms: ['gameboyadvance-games'] },
  { kw: 'kirby-amazing-mirror', name: 'Kirby & The Amazing Mirror', platforms: ['gameboyadvance-games'] },
  { kw: 'kirby-nightmare-in-dream-land', name: 'Kirby: Nightmare in Dream Land', platforms: ['gameboyadvance-games'] },
  { kw: 'sonic-advance', name: 'Sonic Advance', platforms: ['gameboyadvance-games'] },
  { kw: 'golden-sun', name: 'Golden Sun', platforms: ['gameboyadvance-games'] },
  { kw: 'castlevania-aria-of-sorrow', name: 'Castlevania: Aria of Sorrow', platforms: ['gameboyadvance-games'] },
  { kw: 'final-fantasy-vi', name: 'Final Fantasy VI (GBA)', platforms: ['gameboyadvance-games'] },
  { kw: 'final-fantasy-tactics-advance', name: 'Final Fantasy Tactics Advance', platforms: ['gameboyadvance-games'] },
  { kw: 'advance-wars', name: 'Advance Wars', platforms: ['gameboyadvance-games'] },
  { kw: 'fire-emblem', name: 'Fire Emblem (GBA)', platforms: ['gameboyadvance-games'] },
  { kw: 'mega-man-zero', name: 'Mega Man Zero', platforms: ['gameboyadvance-games'] },
  { kw: 'dbz-buus-fury', name: "Dragon Ball Z: Buu's Fury", platforms: ['gameboyadvance-games'] },
  { kw: 'dbz-supersonic-warriors', name: 'Dragon Ball Z: Supersonic Warriors', platforms: ['gameboyadvance-games'] },
  { kw: 'yoshis-island', name: "Yoshi's Island (GBA)", platforms: ['gameboyadvance-games'] },
  { kw: 'mario-luigi', name: 'Mario & Luigi: Superstar Saga', platforms: ['gameboyadvance-games'] },
  { kw: 'f-zero-maximum-velocity', name: 'F-Zero: Maximum Velocity', platforms: ['gameboyadvance-games'] },
  { kw: 'rayman-3', name: 'Rayman 3 (GBA)', platforms: ['gameboyadvance-games'] },
  { kw: 'sonic-advance-2', name: 'Sonic Advance 2', platforms: ['gameboyadvance-games'] },
  // GBC
  { kw: 'pokemon-crystal', name: 'Pokémon Crystal', platforms: ['gameboycolor-games'] },
  { kw: 'pokemon-gold', name: 'Pokémon Gold', platforms: ['gameboycolor-games'] },
  { kw: 'pokemon-silver', name: 'Pokémon Silver', platforms: ['gameboycolor-games'] },
  { kw: 'zelda-ages', name: 'Zelda: Oracle of Ages', platforms: ['gameboycolor-games'] },
  { kw: 'zelda-seasons', name: 'Zelda: Oracle of Seasons', platforms: ['gameboycolor-games'] },
  { kw: 'wario-land-3', name: 'Wario Land 3', platforms: ['gameboycolor-games'] },
  { kw: 'mario-tennis', name: 'Mario Tennis (GBC)', platforms: ['gameboycolor-games'] },
  // GB
  { kw: 'kirbys-dream-land', name: "Kirby's Dream Land", platforms: ['gameboy-games'] },
  { kw: 'wario-land', name: 'Wario Land', platforms: ['gameboy-games'] },
  { kw: 'tetris', name: 'Tetris (GB)', platforms: ['gameboy-games'] },
  // Arcade / Neo Geo
  { kw: 'metal-slug', name: 'Metal Slug (Arcade)', platforms: ['arcade-games'] },
  { kw: 'metal-slug-2', name: 'Metal Slug 2', platforms: ['arcade-games'] },
  { kw: 'metal-slug-3', name: 'Metal Slug 3 (Arcade)', platforms: ['arcade-games'] },
  { kw: 'king-of-fighters-98', name: "The King of Fighters '98", platforms: ['arcade-games'] },
  { kw: 'king-of-fighters-2002', name: 'The King of Fighters 2002', platforms: ['arcade-games'] },
  { kw: 'samurai-shodown', name: 'Samurai Shodown', platforms: ['arcade-games'] },
  { kw: 'garou', name: 'Garou: Mark of the Wolves', platforms: ['arcade-games'] },
  { kw: 'puzzle-bobble', name: 'Puzzle Bobble', platforms: ['arcade-games'] },
  { kw: 'snow-bros', name: 'Snow Bros.', platforms: ['arcade-games'] },
  { kw: 'bubble-bobble', name: 'Bubble Bobble', platforms: ['arcade-games'] },
  { kw: 'pac-man', name: 'Pac-Man (Arcade)', platforms: ['arcade-games'] },
  { kw: 'galaga', name: 'Galaga', platforms: ['arcade-games'] },
  { kw: 'ms-pac-man', name: 'Ms. Pac-Man', platforms: ['arcade-games'] },
  { kw: 'dig-dug', name: 'Dig Dug', platforms: ['arcade-games'] },
  { kw: 'space-invaders', name: 'Space Invaders (Arcade)', platforms: ['arcade-games'] },
  { kw: 'donkey-kong', name: 'Donkey Kong (Arcade)', platforms: ['arcade-games'] },
  { kw: 'frogger', name: 'Frogger (Arcade)', platforms: ['arcade-games'] },
  { kw: '1943', name: '1943: The Battle of Midway', platforms: ['arcade-games'] },
  { kw: 'raiden', name: 'Raiden (Arcade)', platforms: ['arcade-games'] },
  { kw: 'gradius', name: 'Gradius (Arcade)', platforms: ['arcade-games'] },
  { kw: 'rtype', name: 'R-Type (Arcade)', platforms: ['arcade-games'] },
  { kw: 'x-men', name: 'X-Men (Arcade)', platforms: ['arcade-games'] },
  { kw: 'simpsons', name: 'The Simpsons (Arcade)', platforms: ['arcade-games'] },
  { kw: 'tmnt', name: 'TMNT (Arcade)', platforms: ['arcade-games'] },
  { kw: 'final-fight', name: 'Final Fight (Arcade)', platforms: ['arcade-games'] },
  { kw: 'street-fighter-ii', name: 'Street Fighter II (Arcade)', platforms: ['arcade-games'] },
  { kw: 'mortal-kombat', name: 'Mortal Kombat (Arcade)', platforms: ['arcade-games'] },
  { kw: 'nba-jam', name: 'NBA Jam (Arcade)', platforms: ['arcade-games'] },
  { kw: 'joust', name: 'Joust', platforms: ['arcade-games'] },
  { kw: 'rampage', name: 'Rampage (Arcade)', platforms: ['arcade-games'] },
  { kw: 'centipede', name: 'Centipede', platforms: ['arcade-games'] },
  { kw: 'asteroids', name: 'Asteroids', platforms: ['arcade-games'] },
  { kw: '1942', name: '1942', platforms: ['arcade-games'] },
  { kw: 'street-fighter-iii', name: 'Street Fighter III', platforms: ['arcade-games'] },
  { kw: 'street-fighter-alpha', name: 'Street Fighter Alpha', platforms: ['arcade-games'] },
];

function matchCc(found) {
  const hits = [];
  for (const matcher of CC_MATCHERS) {
    for (const cat of matcher.platforms) {
      const slugs = [...(found[cat] || []).keys()];
      const exact = slugs.filter((s) => s.includes(matcher.kw));
      // Prefer shortest slug (usually the base/usa release).
      exact.sort((a, b) => a.length - b.length);
      if (exact.length) {
        hits.push({ kw: matcher.kw, name: matcher.name, platform: cat, slug: exact[0], all: exact.slice(0, 4) });
        break;
      }
    }
  }
  return hits;
}

/** Resolve retrogames.cc embed id from a game page. */
function resolveEmbed(gameUrl) {
  const h = fetch(gameUrl, 15000);
  const m = h.match(/\/embed\/(\d+-[a-z0-9-]+\.html)/);
  return m ? m[1] : null;
}

async function scrapeGamepix() {
  const slugs = new Set(cacheGet('gp-slugs') || []);
  for (const page of ['most-played', 'new', 'discovery']) {
    const h = fetch(`https://www.gamepix.com/${page}`);
    if (!h) continue;
    for (const m of h.matchAll(/https:\/\/www\.gamepix\.com\/play\/([a-z0-9-]+)/g)) slugs.add(m[1]);
    for (const m of h.matchAll(/"([a-z0-9]+(-[a-z0-9]+)+)"/g)) {
      if (m[1].length > 2 && m[1].length < 60) slugs.add(m[1]);
    }
    console.log(`gamepix ${page}: ${slugs.size} slugs so far`);
  }
  cacheSet('gp-slugs', [...slugs]);
  return [...slugs];
}

const GP_WANT = [
  'basket-random', 'soccer-random', 'basketball-legends', 'soccer-legends', 'football-legends',
  'volley-random', 'retro-bowl', 'retro-bowl-college', 'temple-run', 'subway-surfers',
  'stacky-dash', 'color-road', 'tomb-of-the-mask', 'bounce-alley', 'draw-climber',
  'death-run-3d', 'helix-jump', 'stack', 'tunnel-rush', 'flappy-bird', 'jetpack-joyride',
  'idle-breakout', 'miner-dash', 'paper-io', 'hole-io', 'snake-io', '2048', 'wordle',
  'flag-paint', 'ice-stacker', 'punch-hero', 'mr-bullet', 'piano-tiles', 'doodle-jump',
  'rocket-league-2d', 'krunker-io', 'venge-io', 'shell-shockers', 'smash-karts',
  'drift-hunters', 'slope', 'paper-io-2', 'cut-the-rope', 'fruit-ninja', 'moto-x3m',
  'basketball-master', 'crossy-road', 'angry-birds', '8-ball-pool-game', 'stickman-hook',
  'traffic-run', 'rooftop-snipers', 'getaway-shootout', 'duck-life', 'bloxd-io',
  'basketball-stars', 'head-soccer-2024',
];

async function main() {
  const onlyCc = process.argv.includes('--cc-only');
  const onlyGp = process.argv.includes('--gp-only');
  const platArg = process.argv.find((a) => a.startsWith('--platform='));
  const platform = platArg ? platArg.split('=')[1] : null;
  const embedsOnly = process.argv.includes('--embeds-only');

  const pool = [];
  if (!onlyGp) {
    const found = embedsOnly
      ? Object.fromEntries(
          Object.entries(cacheGet('cc-slugs') || {}).map(([cat, slugs]) => [cat, new Map(Object.entries(slugs).map(([s]) => [s, true]))])
        )
      : await scrapeCc(platform);
    const foundKeys = Object.keys(found);
    if (platform && !foundKeys.includes(platform)) {
      console.log(`platform ${platform} not in cache; run without --embeds-only first`);
      process.exit(1);
    }
    const hits = matchCc(found).filter((h) => (platform ? h.platform === platform : true));
    const embeds = cacheGet('cc-embeds') || {};
    console.log(`\n${hits.length} keyword matches to resolve (platform: ${platform || 'all'})...`);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const gameUrl = `https://www.retrogames.cc/${h.platform}/${h.slug}.html`;
      if (embeds[h.slug]) {
        process.stdout.write(`\r  ${i + 1}/${hits.length} ${h.name} (cached)`);
      } else {
        const embed = resolveEmbed(gameUrl);
        embeds[h.slug] = embed || '';
        cacheSet('cc-embeds', embeds);
        process.stdout.write(`\r  ${i + 1}/${hits.length} ${h.name} -> ${embed ? 'EMBED ' + embed : 'MISSING'}`);
      }
      const embed = embeds[h.slug] || null;
      const base = h.name.replace(/ \((PS1|SNES|Genesis|GBA|Arcade|GB)\)/g, '');
      pool.push({
        id: `up-${h.platform}-${h.slug}`.slice(0, 60),
        name: h.name,
        displayName: base,
        platform: h.platform,
        slug: h.slug,
        url: embed ? `https://www.retrogames.cc/embed/${embed}` : gameUrl,
        embed,
        source: 'retrogames.cc',
      });
    }
    console.log();
  }

  if (!onlyCc && !platform && !embedsOnly) {
    const gpSlugs = await scrapeGamepix();
    const wanted = cacheGet('gp-wanted') || [];
    const todo = GP_WANT.filter((s) => !wanted.includes(s));
    const verified = new Set(cacheGet('gp-verified') || []);
    for (const slug of todo) {
      let code = '404';
      if (gpSlugs.includes(slug)) {
        code = '200';
      } else {
        try {
          code = execFileSync(
            'curl',
            ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-A', UA, '--max-time', '12', `https://www.gamepix.com/play/${slug}`],
            { encoding: 'utf8' }
          ).trim();
        } catch {
          code = '000';
        }
      }
      wanted.push(slug);
      cacheSet('gp-wanted', wanted);
      if (code === '200') {
        verified.add(slug);
        cacheSet('gp-verified', [...verified]);
        const pretty = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        pool.push({
          id: `gp-${slug}`,
          name: pretty,
          displayName: pretty,
          platform: 'web',
          slug,
          url: `https://www.gamepix.com/play/${slug}`,
          embed: `https://www.gamepix.com/play/${slug}`,
          source: 'gamepix',
          verified: true,
        });
        process.stdout.write(`\r  gp ${slug} -> OK`);
      } else {
        process.stdout.write(`\r  gp ${slug} -> ${code}`);
      }
    }
    console.log(`\ngamepix: ${verified.size} verified of ${wanted.length} tried`);
  }

  const existing = [];
  try { existing.push(...JSON.parse(fs.readFileSync('/tmp/upgrade-pool.json', 'utf8'))); } catch {}
  const byId = new Map(existing.map((g) => [g.id, g]));
  for (const g of pool) byId.set(g.id, g);
  const merged = [...byId.values()];
  fs.writeFileSync('/tmp/upgrade-pool.json', JSON.stringify(merged, null, 2));
  console.log(`\npool written: /tmp/upgrade-pool.json (${merged.length} candidates total)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});