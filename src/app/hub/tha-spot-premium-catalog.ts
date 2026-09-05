/**
 * Runtime allowlist for the premium Tha Spot shelf.
 *
 * The JSON feed remains the source/archive so it can be refreshed without
 * losing history, but the UI must not present an unreviewed provider dump as
 * the product catalog. Keep this list intentionally small and reviewable:
 * owned cabinets, modern browser-native games, official current titles, and
 * polished popular web destinations with truthful external launch contracts.
 */
export const PREMIUM_ACTIVE_GAME_IDS = [
  // Owned S.M.U.V.E. cabinets
  'battlefield',
  'remix-arena',
  'neon-drift',
  'vinyl-vault',
  'cipher-surge',
  'tempo-lockdown',
  'halo-combat-evolved',
  'tekken-4-tribute',

  // Modern browser-native experiences
  'slow-roads-webgl',
  'venge-io-webgl',
  'minecraft-classic',
  'zombsroyale-io-multiplayer',
  'smash-karts-web-elite',
  'drift-hunters-web-elite',
  'fruit-ninja-web-elite',

  // Curated popular browser games (appended by the service)
  'poki-temple-run-2',
  'poki-subway-surfers',
  'poki-crossy-road',
  'poki-stickman-hook',
  'poki-retro-bowl',
  'poki-drive-mad',
  'poki-monkey-mart',
  'poki-friday-night-funkin',

  // Current-generation destination titles
  'gta-online',
  'sea-of-thieves',
  'destiny-2',
  'warframe',
  'apex-legends',
  'valorant',
  'rainbow-six-siege',
  'rocket-league',
  'fortnite',
  'minecraft',
  'fifa-24',

  // Premium genre coverage for action, adventure, RPG, and sports
  'tomb-runner',
  'moto-x3m',
  'tactical-squad',
  'sniper-mission',
  'zombie-idle-defense',
  'mythic-raid-online',
  'tower-defense',
  'nba-pro-3d',
  'nfl-redzone-rush',
  'boxing-heavyweight',
] as const;

export const PREMIUM_RECOMMENDATION_RAILS = [
  {
    id: 'premium-studio-warmup',
    title: 'Studio warm-up',
    subtitle: 'Owned cabinets for a fast, focused first run.',
    gameIds: ['battlefield', 'remix-arena', 'tempo-lockdown', 'neon-drift'],
    maxItems: 4,
  },
  {
    id: 'premium-open-world',
    title: 'Open-world drop zone',
    subtitle: 'Shared worlds, exploration, and long-session momentum.',
    gameIds: [
      'minecraft-classic',
      'gta-online',
      'sea-of-thieves',
      'minecraft',
      'slow-roads-webgl',
    ],
    maxItems: 5,
  },
  {
    id: 'premium-action-adventure',
    title: 'Action + adventure',
    subtitle: 'High-energy movement, combat, and expedition-ready picks.',
    gameIds: [
      'halo-combat-evolved',
      'venge-io-webgl',
      'zombie-idle-defense',
      'tomb-runner',
      'poki-stickman-hook',
    ],
    maxItems: 5,
  },
  {
    id: 'premium-rpg-depth',
    title: 'RPG depth runs',
    subtitle: 'Progression, raids, builds, and campaign-minded sessions.',
    gameIds: [
      'warframe',
      'destiny-2',
      'mythic-raid-online',
      'tower-defense',
      'poki-monkey-mart',
    ],
    maxItems: 5,
  },
  {
    id: 'premium-sports-arena',
    title: 'Sports arena',
    subtitle: 'Competitive football, hoops, and quick-play sports energy.',
    gameIds: [
      'rocket-league',
      'fifa-24',
      'poki-retro-bowl',
      'nba-pro-3d',
      'nfl-redzone-rush',
    ],
    maxItems: 5,
  },
  {
    id: 'premium-racing-line',
    title: 'Racing line',
    subtitle: 'Drift, stunt, and precision driving rotations.',
    gameIds: [
      'neon-drift',
      'slow-roads-webgl',
      'smash-karts-web-elite',
      'drift-hunters-web-elite',
      'poki-drive-mad',
    ],
    maxItems: 5,
  },
  {
    id: 'premium-versus',
    title: 'Versus signal',
    subtitle: 'Tactical pressure, battle royale drops, and head-to-head play.',
    gameIds: [
      'battlefield',
      'venge-io-webgl',
      'zombsroyale-io-multiplayer',
      'apex-legends',
      'valorant',
      'rainbow-six-siege',
      'tekken-4-tribute',
    ],
    maxItems: 6,
  },
  {
    id: 'premium-iconic-now',
    title: 'Iconic right now',
    subtitle: 'Recognizable worlds and modern social destinations.',
    gameIds: [
      'fortnite',
      'minecraft',
      'rocket-league',
      'poki-subway-surfers',
      'poki-friday-night-funkin',
      'poki-crossy-road',
    ],
    maxItems: 6,
  },
] as const;
