/**
 * Saga-authenticity pass for Tha Spot.
 *
 * 1. Swap hack / mislabeled cabinets to authentic retail versions:
 *    - retrogames.cc: Super Metroid (Japan, USA), FF7 (PS1 Disc 1), Tekken 2
 *      (PS1), EarthBound (USA), Golden Sun (GBA), DBZ Hyper Dimension /
 *      Super Butouden / Super Butouden 3 (SNES JP), Double Dragon III (NES),
 *      Metal Gear Solid (PS1 Disc 1 / GBC Ghost Babel).
 *    - retrogames.cz (verified frameable, no XFO/CSP): Super Mario World,
 *      Super Mario Kart, Mega Man X, Mega Man X3.
 * 2. Remove redundant hack duplicates (Super Mario Kart Deluxe, SamSho II
 *    Special 2017 hack) — authentic versions now exist in-catalog.
 * 3. Fill saga gaps: Zelda x6, Sonic x4, Pokemon x3, Mega Man X2/7,
 *    Street Fighter II Turbo / Super SFII, Double Dragon III / Super Double
 *    Dragon, DBZ Dragon Power, Metal Gear Solid / Ghost Babel / Snake's
 *    Revenge, Super Mario Land / Super Mario 64.
 *
 * Applies the same operations to tha-spot-feed.json and
 * tha-spot-feed.fallback.ts so the offline mirror stays in sync.
 */
const fs = require('fs');

const FEED_PATH = 'src/assets/data/tha-spot-feed.json';
const FALLBACK_PATH = 'src/app/hub/tha-spot-feed.fallback.ts';

const CZ = 'https://www.retrogames.cz/';
const CC = 'https://www.retrogames.cc/embed/';
const IMAGE = 'assets/hub/home-backdrop-command.png';

const CZ_TRUST =
  'Authentic retail cabinet via RetroGames.cz — verified to serve without frame-blocking headers.';

/* ------------------------------------------------------------------ */
/* Swaps: replace the cabinet + presentation of an existing entry.     */
/* ------------------------------------------------------------------ */
const swaps = [
  {
    id: 'super-mario-world-elite-master',
    name: 'Super Mario World (SNES)',
    url: CZ + 'play_245-SNES.php',
    genre: 'Platformer',
    tags: ['Platformer', 'Retro', 'SNES', 'Classic', 'Elite'],
    desc:
      'Play Super Mario World online — the authentic 1990 SNES masterpiece that launched Dinosaur Land, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'rg-44214-super-mario-kart-world',
    name: 'Super Mario Kart (SNES)',
    url: CZ + 'play_789-SNES.php',
    genre: 'Racing',
    tags: ['Racing', 'Retro', 'SNES', 'Classic'],
    desc:
      'Play Super Mario Kart online — the authentic 1992 SNES original that invented kart racing, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'mmx-classic',
    name: 'Mega Man X (SNES)',
    url: CZ + 'play_865-SNES.php',
    genre: 'Platformer',
    tags: ['Platformer', 'Retro', 'SNES', 'Classic', 'Elite'],
    desc:
      'Play Mega Man X online — the authentic 1993 SNES action-platformer that reinvented the series, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'mega-man-x3-elite-master',
    name: 'Mega Man X3 (SNES)',
    url: CZ + 'play_933-SNES.php',
    genre: 'Action',
    tags: ['Action', 'Platformer', 'Retro', 'SNES', 'Elite'],
    desc:
      'Play Mega Man X3 online — the authentic 1995 SNES finale of the X saga, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'super-metroid-elite-master',
    name: 'SNES Super Metroid (Japan, USA) (En,Ja)',
    url: CC + '16893-super-metroid-japan-usa-en-ja.html',
    genre: 'Action',
    tags: ['Action', 'Retro', 'SNES', 'Elite', 'Adventure'],
    desc:
      'Play Super Metroid online — the authentic 1994 SNES classic that defined the Metroidvania genre, streaming in your browser via the RetroGames emulator.',
  },
  {
    id: 'final-fantasy-vii-elite',
    name: 'PlayStation Final Fantasy VII (USA) (Disc 1)',
    url: CC + '43658-final-fantasy-vii-usa-disc-1.html',
    genre: 'RPG',
    tags: ['RPG', 'Retro', 'PS1', 'Adventure', 'JRPG'],
    desc:
      'Play Final Fantasy VII online — the authentic 1997 PlayStation classic, Disc 1 streaming in your browser via the RetroGames emulator.',
  },
  {
    id: 'rg-44098-tekken-2',
    name: 'PlayStation Tekken 2',
    url: CC + '41514-tekken-2.html',
    genre: 'Fighting',
    tags: ['Fighting', 'Retro', 'PS1', 'Classic'],
    desc:
      'Play Tekken 2 online — the authentic 1996 PlayStation fighter that perfected the King of Iron Fist Tournament, streaming via the RetroGames emulator.',
  },
  {
    id: 'rg-43121-mother-2-deluxe-2-0',
    name: 'SNES EarthBound (USA)',
    url: CC + '24789-earthbound-usa.html',
    genre: 'RPG',
    tags: ['RPG', 'Retro', 'SNES', 'JRPG', 'Classic'],
    desc:
      'Play EarthBound online — the authentic 1994 SNES RPG journey across Eagleland, streaming in your browser via the RetroGames emulator.',
    renameTo: 'earthbound-usa',
  },
  {
    id: 'golden-sun-gba-elite',
    name: 'Game Boy Advance Golden Sun (U)(Mode7)',
    url: CC + '28962-golden-sun-u-mode7.html',
    genre: 'RPG',
    tags: ['RPG', 'GBA', 'JRPG', 'Classic', 'Fantasy'],
    desc:
      'Play Golden Sun online — the authentic 2001 GBA JRPG that launched the beloved duology, streaming in your browser via the RetroGames emulator.',
  },
];

/* ------------------------------------------------------------------ */
/* Removals: entries whose only justification was "no authentic        */
/* cabinet exists" — an authentic one is now in the catalog.           */
/* ------------------------------------------------------------------ */
const removals = [
  'rg-43860-super-mario-kart-deluxe',
  'samsho2-arcade-elite',
];

/* ------------------------------------------------------------------ */
/* Additions: saga gaps filled with authentic retail cabinets.         */
/* ------------------------------------------------------------------ */
const adds = [
  {
    id: 'super-mario-land-gb',
    name: 'Super Mario Land',
    url: CZ + 'play_145-GameBoy.php',
    genre: 'Platformer',
    rating: 4.6,
    playersOnline: 420,
    tags: ['Platformer', 'Retro', 'GB', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Super Mario Land online — the authentic 1989 Game Boy debut of Mario on handheld, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'super-mario-64',
    name: 'Super Mario 64',
    url: CZ + 'play_978-N64.php',
    genre: 'Platformer',
    rating: 4.9,
    playersOnline: 940,
    tags: ['Platformer', 'Retro', 'N64', '3D Platformer'],
    badges: ['classic', 'featured'],
    desc:
      'Play Super Mario 64 online — the authentic 1996 N64 launch title that defined 3D platforming, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-nes',
    name: 'The Legend of Zelda',
    url: CZ + 'play_068-NES.php',
    genre: 'Adventure',
    rating: 4.8,
    playersOnline: 610,
    tags: ['Adventure', 'Retro', 'NES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play The Legend of Zelda online — the authentic 1986 NES original that started the Hyrule saga, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-ii-nes',
    name: 'Zelda II: The Adventure of Link',
    url: CZ + 'play_126-NES.php',
    genre: 'Adventure',
    rating: 4.4,
    playersOnline: 390,
    tags: ['Adventure', 'Retro', 'NES', 'Classic', 'Action RPG'],
    badges: ['classic'],
    desc:
      'Play Zelda II: The Adventure of Link online — the authentic 1987 NES side-scrolling sequel, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-alttp-snes',
    name: 'The Legend of Zelda: A Link to the Past',
    url: CZ + 'play_283-SNES.php',
    genre: 'Adventure',
    rating: 4.9,
    playersOnline: 880,
    tags: ['Adventure', 'Retro', 'SNES', 'Classic'],
    badges: ['classic', 'staff-pick'],
    desc:
      'Play The Legend of Zelda: A Link to the Past online — the authentic 1991 SNES masterpiece of the Hyrule saga, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-links-awakening-gb',
    name: 'The Legend of Zelda: Link\u2019s Awakening',
    url: CZ + 'play_977-GameBoy.php',
    genre: 'Adventure',
    rating: 4.7,
    playersOnline: 460,
    tags: ['Adventure', 'Retro', 'GB', 'Classic'],
    badges: ['classic'],
    desc:
      'Play The Legend of Zelda: Link\u2019s Awakening online — the authentic 1993 Game Boy journey through Koholint Island, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-oot-n64',
    name: 'The Legend of Zelda: Ocarina of Time',
    url: CZ + 'play_984-N64.php',
    genre: 'Adventure',
    rating: 5.0,
    playersOnline: 1200,
    tags: ['Adventure', 'Retro', 'N64', 'Classic', 'Open World'],
    badges: ['classic', 'featured', 'staff-pick'],
    desc:
      'Play The Legend of Zelda: Ocarina of Time online — the authentic 1998 N64 legend of time and destiny, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'zelda-majoras-mask-n64',
    name: 'The Legend of Zelda: Majora\u2019s Mask',
    url: CZ + 'play_1065-N64.php',
    genre: 'Adventure',
    rating: 4.8,
    playersOnline: 720,
    tags: ['Adventure', 'Retro', 'N64', 'Classic'],
    badges: ['classic'],
    desc:
      'Play The Legend of Zelda: Majora\u2019s Mask online — the authentic 2000 N64 race against the moon, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'sonic-1-genesis',
    name: 'Sonic the Hedgehog',
    url: CZ + 'play_117-Genesis.php',
    genre: 'Platformer',
    rating: 4.8,
    playersOnline: 660,
    tags: ['Platformer', 'Retro', 'Genesis', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Sonic the Hedgehog online — the authentic 1991 Genesis debut of the blue blur, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'sonic-spinball-genesis',
    name: 'Sonic the Hedgehog: Spinball',
    url: CZ + 'play_1757-Genesis.php',
    genre: 'Action',
    rating: 4.0,
    playersOnline: 280,
    tags: ['Action', 'Retro', 'Genesis', 'Classic', 'Pinball'],
    badges: ['classic'],
    desc:
      'Play Sonic the Hedgehog: Spinball online — the authentic 1993 Genesis pinball adventure, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'sonic-3d-blast-genesis',
    name: 'Sonic 3D Blast',
    url: CZ + 'play_507-Genesis.php',
    genre: 'Platformer',
    rating: 4.1,
    playersOnline: 310,
    tags: ['Platformer', 'Retro', 'Genesis', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Sonic 3D Blast online — the authentic 1996 isometric Genesis adventure, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'sonic-triple-trouble-gg',
    name: 'Sonic the Hedgehog: Triple Trouble',
    url: CZ + 'play_1240-GameGear.php',
    genre: 'Platformer',
    rating: 4.5,
    playersOnline: 240,
    tags: ['Platformer', 'Retro', 'Game Gear', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Sonic the Hedgehog: Triple Trouble online — the authentic 1994 Game Gear classic, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'pokemon-red-gb',
    name: 'Pok\u00e9mon Red Version',
    url: CZ + 'play_285-GameBoy.php',
    genre: 'RPG',
    rating: 4.9,
    playersOnline: 1500,
    tags: ['RPG', 'Retro', 'GB', 'JRPG', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Pok\u00e9mon Red Version online — the authentic 1996 Game Boy beginning of the Pok\u00e9mon journey, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'pokemon-blue-gb',
    name: 'Pok\u00e9mon Blue Version',
    url: CZ + 'play_284-GameBoy.php',
    genre: 'RPG',
    rating: 4.9,
    playersOnline: 1420,
    tags: ['RPG', 'Retro', 'GB', 'JRPG', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Pok\u00e9mon Blue Version online — the authentic 1996 Game Boy counterpart to Red, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'pokemon-snap-n64',
    name: 'Pok\u00e9mon Snap',
    url: CZ + 'play_1090-N64.php',
    genre: 'Shooting',
    rating: 4.6,
    playersOnline: 380,
    tags: ['Shooting', 'Retro', 'N64', 'Classic', 'Photography'],
    badges: ['classic'],
    desc:
      'Play Pok\u00e9mon Snap online — the authentic 1999 N64 photo safari through the Pok\u00e9mon islands, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'mega-man-x2-snes',
    name: 'Mega Man X2 (SNES)',
    url: CZ + 'play_895-SNES.php',
    genre: 'Platformer',
    rating: 4.7,
    playersOnline: 350,
    tags: ['Platformer', 'Retro', 'SNES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Mega Man X2 online — the authentic 1994 SNES hunt for the X-Hunters, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'mega-man-7-snes',
    name: 'Mega Man 7 (SNES)',
    url: CZ + 'play_904-SNES.php',
    genre: 'Platformer',
    rating: 4.5,
    playersOnline: 300,
    tags: ['Platformer', 'Retro', 'SNES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Mega Man 7 online — the authentic 1995 SNES return of the original robot master, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'sf2-turbo-snes',
    name: 'Street Fighter II Turbo: Hyper Fighting',
    url: CZ + 'play_1133-SNES.php',
    genre: 'Fighting',
    rating: 4.9,
    playersOnline: 760,
    tags: ['Fighting', 'Retro', 'SNES', 'Classic'],
    badges: ['classic', 'staff-pick'],
    desc:
      'Play Street Fighter II Turbo: Hyper Fighting online — the authentic 1992 SNES speed demon, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'super-sf2-snes',
    name: 'Super Street Fighter II: The New Challengers',
    url: CZ + 'play_919-SNES.php',
    genre: 'Fighting',
    rating: 4.7,
    playersOnline: 520,
    tags: ['Fighting', 'Retro', 'SNES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Super Street Fighter II: The New Challengers online — the authentic 1993 SNES tournament of legends, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'double-dragon-iii-nes',
    name: 'NES Double Dragon III - The Sacred Stones (USA)',
    url: CC + '22161-double-dragon-iii-the-sacred-stones-usa.html',
    genre: 'Beat \'em up',
    rating: 4.3,
    playersOnline: 340,
    tags: ['Beat \'em up', 'Retro', 'NES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play NES Double Dragon III - The Sacred Stones (USA) online — the authentic finale of the NES beat-em-up saga, streaming via the RetroGames emulator.',
  },
  {
    id: 'super-double-dragon-snes',
    name: 'Super Double Dragon',
    url: CZ + 'play_925-SNES.php',
    genre: 'Beat \'em up',
    rating: 4.5,
    playersOnline: 290,
    tags: ['Beat \'em up', 'Retro', 'SNES', 'Classic'],
    badges: ['classic'],
    desc:
      'Play Super Double Dragon online — the authentic 1992 SNES reunion of the Lee brothers, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'dbz-hyper-dimension-snes',
    name: 'SNES Dragon Ball Z - Hyper Dimension (Japan)',
    url: CC + '23402-dragon-ball-z-hyper-dimension-japan.html',
    genre: 'Fighting',
    rating: 4.8,
    playersOnline: 470,
    tags: ['Fighting', 'Retro', 'SNES', 'Classic', 'Anime'],
    badges: ['classic'],
    desc:
      'Play SNES Dragon Ball Z - Hyper Dimension (Japan) online — the authentic final Super Famicom DBZ fighter, streaming via the RetroGames emulator.',
  },
  {
    id: 'dbz-super-butouden-snes',
    name: 'SNES Dragon Ball Z - Super Butouden (Japan)',
    url: CC + '23964-dragon-ball-z-super-butouden-japan.html',
    genre: 'Fighting',
    rating: 4.6,
    playersOnline: 430,
    tags: ['Fighting', 'Retro', 'SNES', 'Classic', 'Anime'],
    badges: ['classic'],
    desc:
      'Play SNES Dragon Ball Z - Super Butouden (Japan) online — the authentic 1993 Super Famicom tournament fighter, streaming via the RetroGames emulator.',
  },
  {
    id: 'dbz-super-butouden-3-snes',
    name: 'SNES Dragon Ball Z - Super Butouden 3 (Japan)',
    url: CC + '23298-dragon-ball-z-super-butouden-3-japan.html',
    genre: 'Fighting',
    rating: 4.7,
    playersOnline: 450,
    tags: ['Fighting', 'Retro', 'SNES', 'Classic', 'Anime'],
    badges: ['classic'],
    desc:
      'Play SNES Dragon Ball Z - Super Butouden 3 (Japan) online — the authentic 1994 Super Famicom championship fighter, streaming via the RetroGames emulator.',
  },
  {
    id: 'dbz-dragon-power-nes',
    name: 'Dragon Ball (Dragon Power)',
    url: CZ + 'play_1243-NES.php',
    genre: 'Beat \'em up',
    rating: 4.2,
    playersOnline: 260,
    tags: ['Beat \'em up', 'Retro', 'NES', 'Classic', 'Anime'],
    badges: ['classic'],
    desc:
      'Play Dragon Ball (Dragon Power) online — the authentic 1986 NES debut of Goku, streaming via the RetroGames.cz emulator.',
  },
  {
    id: 'mgs-ps1',
    name: 'PlayStation Metal Gear Solid (USA) (Disc 1)',
    url: CC + '43266-metal-gear-solid-disc-1.html',
    genre: 'Stealth',
    rating: 4.9,
    playersOnline: 690,
    tags: ['Stealth', 'Retro', 'PS1', 'Classic', 'Tactical'],
    badges: ['classic', 'staff-pick'],
    desc:
      'Play PlayStation Metal Gear Solid (USA) (Disc 1) online — the authentic 1998 stealth masterpiece, streaming via the RetroGames emulator.',
  },
  {
    id: 'mgs-gbc',
    name: 'Game Boy Color Metal Gear Solid (USA) (Ghost Babel)',
    url: CC + '26934-metal-gear-solid-usa.html',
    genre: 'Stealth',
    rating: 4.6,
    playersOnline: 320,
    tags: ['Stealth', 'Retro', 'GBC', 'Classic', 'Tactical'],
    badges: ['classic'],
    desc:
      'Play Game Boy Color Metal Gear Solid (USA) (Ghost Babel) online — the authentic 2000 GBC stealth adventure, streaming via the RetroGames emulator.',
  },
  {
    id: 'snakes-revenge-nes',
    name: 'Snake\u2019s Revenge',
    url: CZ + 'play_1119-NES.php',
    genre: 'Stealth',
    rating: 4.0,
    playersOnline: 210,
    tags: ['Stealth', 'Retro', 'NES', 'Classic', 'Tactical'],
    badges: ['classic'],
    desc:
      'Play Snake\u2019s Revenge online — the authentic 1990 NES sequel to Metal Gear, streaming via the RetroGames.cz emulator.',
  },
];

/* ------------------------------------------------------------------ */
/* Rails: surface new flagship saga cabinets on curated rails.         */
/* ------------------------------------------------------------------ */
const railAdds = {
  'rail-golden-era': [
    'rg-44214-super-mario-kart-world',
    'zelda-alttp-snes',
    'sonic-1-genesis',
  ],
  'rail-rpg-depths': ['earthbound-usa', 'pokemon-red-gb', 'golden-sun-gba-elite'],
  'rail-neo-zone': ['sf2-turbo-snes', 'dbz-hyper-dimension-snes', 'mega-man-x2-snes'],
  'rail-open-world-empires': ['zelda-oot-n64', 'zelda-majoras-mask-n64'],
};

function launchConfigFor(url, preserve = {}) {
  const lc = {
    approvedEmbedUrl: url,
    embedMode: 'inline',
  };
  if (url.includes('retrogames.cc')) {
    lc.secure_mode = 'wasm';
  } else {
    lc.trustNote = CZ_TRUST;
  }
  lc.approvedExternalUrl = url;
  for (const key of ['controls', 'modes', 'difficulty', 'inlinePolicy']) {
    if (preserve[key] !== undefined) lc[key] = preserve[key];
  }
  return lc;
}

function buildEntry(spec, oldEntry = null) {
  const preserveLc = oldEntry?.launchConfig || {};
  const entry = {
    id: spec.renameTo || spec.id,
    name: spec.name,
    url: spec.url,
    description: spec.desc,
    genre: spec.genre,
    rating: spec.rating ?? oldEntry?.rating ?? 4.6,
    playersOnline: spec.playersOnline ?? oldEntry?.playersOnline ?? 400,
    availability: oldEntry?.availability || 'Online',
    tags: spec.tags,
    badgeIds: spec.badges ?? oldEntry?.badgeIds ?? ['classic'],
    launchConfig: launchConfigFor(spec.url, preserveLc),
  };
  if (oldEntry?.art) entry.art = oldEntry.art;
  else
    entry.art = {
      eyebrow: 'Verified Cabinet',
      accentStart: '#f59e0b',
      accentEnd: '#7c2d12',
    };
  entry.image = oldEntry?.image || IMAGE;
  return entry;
}

/* ==================== JSON feed ==================== */
const feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
const games = feed.games;

let jsonErrors = [];
const byId = (id) => games.find((g) => g.id === id);

for (const spec of swaps) {
  const old = byId(spec.id);
  if (!old) {
    jsonErrors.push(`JSON: swap target ${spec.id} missing`);
    continue;
  }
  const entry = buildEntry(spec, old);
  Object.assign(old, entry);
  if (spec.renameTo) {
    old.id = spec.renameTo;
  }
}

for (const id of removals) {
  const idx = games.findIndex((g) => g.id === id);
  if (idx === -1) jsonErrors.push(`JSON: removal target ${id} missing`);
  else games.splice(idx, 1);
}

for (const spec of adds) {
  if (byId(spec.id)) {
    jsonErrors.push(`JSON: add target ${spec.id} already exists`);
    continue;
  }
  games.push(buildEntry(spec));
}

for (const [railId, ids] of Object.entries(railAdds)) {
  const rail = feed.recommendationRails?.find((r) => r.id === railId);
  if (!rail) {
    jsonErrors.push(`JSON: rail ${railId} missing`);
    continue;
  }
  rail.gameIds = rail.gameIds || [];
  for (const id of ids) {
    if (!rail.gameIds.includes(id)) rail.gameIds.push(id);
  }
}

fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2) + '\n');
console.log(`JSON: games ${games.length}, errors: ${jsonErrors.length ? jsonErrors.join('; ') : 'none'}`);

/* ==================== Fallback TS ==================== */
let src = fs.readFileSync(FALLBACK_PATH, 'utf8');
const lines = src.split('\n');

function findEntryBlock(id) {
  const idIdx = lines.findIndex((l) => l.trim() === `id: '${id}',`);
  if (idIdx === -1) return null;
  let start = idIdx;
  // Walk up to the `    {` opener that starts this entry (test the current
  // line so the opener itself is included when it sits directly above).
  while (start > 0 && !/^    \{$/.test(lines[start])) start -= 1;
  if (!/^    \{$/.test(lines[start])) return null;
  let depth = 0;
  let end = start;
  for (let i = start; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function tsString(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function tsValue(v, indent) {
  if (typeof v === 'string') return tsString(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => tsValue(x, indent)).join(', ')}]`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const inner = keys
      .map((k) => `${indent}  ${k}: ${tsValue(v[k], indent + '  ')},`)
      .join('\n');
    return `{\n${inner}\n${indent}}`;
  }
  return String(v);
}

function tsBlock(entry) {
  const keys = Object.keys(entry);
  const inner = keys
    .map((k) => `      ${k}: ${tsValue(entry[k], '      ')},`)
    .join('\n');
  return `    {\n${inner}\n    },`;
}

let fallbackErrors = [];

// Swaps + rename
for (const spec of swaps) {
  const oldId = spec.id;
  const block = findEntryBlock(oldId);
  if (!block) {
    fallbackErrors.push(`fallback: swap target ${oldId} missing`);
    continue;
  }
  const oldText = lines.slice(block.start, block.end + 1).join('\n');
  const oldEntry = {};
  // Preserve rating/players/availability/badgeIds/image/art/launch extras by
  // parsing the existing block's simple `key: value,` lines.
  for (const line of oldText.split('\n')) {
    const m = line.match(/^\s{6}(rating|playersOnline|availability|badgeIds|image): (.*),$/);
    if (m) {
      try {
        oldEntry[m[1]] = m[1] === 'availability' ? m[2].replace(/^'|'$/g, '') : JSON.parse(m[2].replace(/'/g, '"'));
      } catch {
        /* keep simple */
      }
    }
  }
  const entry = buildEntry(spec, oldEntry);
  lines.splice(block.start, block.end - block.start + 1, ...tsBlock(entry).split('\n'));
}

// Renames (id line swap for entries whose id changed)
for (const spec of swaps) {
  if (!spec.renameTo) continue;
  const idIdx = lines.findIndex((l) => l.trim() === `id: '${spec.id}',`);
  if (idIdx === -1) {
    fallbackErrors.push(`fallback: rename source ${spec.id} missing`);
    continue;
  }
  lines[idIdx] = `      id: '${spec.renameTo}',`;
}

// Removals
for (const id of removals) {
  const block = findEntryBlock(id);
  if (!block) {
    fallbackErrors.push(`fallback: removal target ${id} missing`);
    continue;
  }
  lines.splice(block.start, block.end - block.start + 1);
}

// Additions: insert before the games array close (`  ],`)
const gamesClose = lines.findIndex((l, i) => i > 400 && l.trim() === '],' && lines[i - 1].trim() === '},');
if (gamesClose === -1) {
  fallbackErrors.push('fallback: could not locate games array close');
} else {
  const blocks = adds.map((spec) => tsBlock(buildEntry(spec))).join('\n');
  lines.splice(gamesClose, 0, blocks + '\n');
}

// Rail additions
for (const [railId, ids] of Object.entries(railAdds)) {
  const railIdx = lines.findIndex((l) => l.trim() === `id: '${railId}',`);
  if (railIdx === -1) {
    fallbackErrors.push(`fallback: rail ${railId} missing`);
    continue;
  }
  let gameIdsLine = -1;
  for (let i = railIdx; i < lines.length && i < railIdx + 30; i += 1) {
    if (lines[i].includes('gameIds:')) {
      gameIdsLine = i;
      break;
    }
  }
  if (gameIdsLine === -1) {
    fallbackErrors.push(`fallback: rail ${railId} has no gameIds`);
    continue;
  }
  const m = lines[gameIdsLine].match(/gameIds:\s*\[([\s\S]*?)\]/);
  if (!m) {
    fallbackErrors.push(`fallback: rail ${railId} gameIds unparsable`);
    continue;
  }
  const existing = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  for (const id of ids) if (!existing.includes(id)) existing.push(id);
  lines[gameIdsLine] = `      gameIds: [${existing.map((x) => tsString(x)).join(', ')}],`;
}

src = lines.join('\n');
fs.writeFileSync(FALLBACK_PATH, src);
console.log(
  `fallback: errors: ${fallbackErrors.length ? fallbackErrors.join('; ') : 'none'}`
);