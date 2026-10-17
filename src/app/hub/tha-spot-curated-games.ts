import { Game } from './game';

/**
 * Curated publisher pages outside the RetroGames inventory.
 *
 * These pages are intentionally external-only: the providers expose playable
 * browser experiences, but do not promise a stable iframe embedding contract.
 * Keeping the source metadata here lets the live feed and offline fallback
 * share the same additions without a second network request.
 */
/** Reviewed publisher destinations; dates are browser releases, not console releases.
 * Ratings are publisher snapshots on 2026-10-03, converted to the hub's 5-point scale.
 * No live-player counts are invented and no game binaries are redistributed.
 */
export const MODERN_BROWSER_GAMES: Game[] = [
  {
    id: 'modern-polytrack', name: 'PolyTrack',
    url: 'https://kodub.itch.io/polytrack',
    description: 'Low-poly time-trial racing with loops, jumps, a track editor, community tracks, and multiplayer added in the 2026 update.',
    genre: 'Racing', rating: 4.7, multiplayerType: 'Server',
    tags: ['Racing', '3D', 'Time Trial', 'Level Editor', 'Multiplayer', 'Modern', 'itch.io'],
    sessionObjectives: ['Finish a clean lap', 'Improve your personal best', 'Explore a community track'],
    controlHints: ['WASD or arrows to drive', 'R or Enter to restart'],
  },
  {
    id: 'modern-veck-io', name: 'Veck.io',
    url: 'https://www.crazygames.com/game/veck-io', releaseDate: '2025-12-03',
    description: 'Fast 3D multiplayer arena shooter with slide movement, private lobbies, team matches from 1v1 to 4v4, and Gun Game.',
    genre: 'Shooting', rating: 4.35, multiplayerType: 'Server',
    tags: ['Shooting', 'FPS', '3D', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    sessionObjectives: ['Practice a weapon in the range', 'Join a team match', 'Try Gun Game'],
    controlHints: ['WASD to move; Space to jump; Shift or C to slide', 'Mouse to aim and fire'],
  },
  {
    id: 'modern-skillwarz', name: 'SkillWarz',
    url: 'https://www.crazygames.com/game/skillwarz', releaseDate: '2024-11-25',
    description: 'Movement-focused 3D FPS with bounce pads, teleports, classes, bot practice, and Deathmatch, Gun Game, and Skull Hunt modes.',
    genre: 'Shooting', rating: 4.6, multiplayerType: 'Server',
    tags: ['Shooting', 'FPS', '3D', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    sessionObjectives: ['Learn a map in bot practice', 'Use a bounce pad to reposition', 'Finish a Gun Game round'],
    controlHints: ['WASD to move; Shift to sprint; C to slide', 'Mouse to aim and fire; R to reload'],
  },
  {
    id: 'modern-hazmob', name: 'Hazmob FPS: Online Shooter',
    url: 'https://www.crazygames.com/game/hazmob-fps-online-shooter', releaseDate: '2024-02-26',
    description: 'Desktop 3D multiplayer FPS with customizable weapons, private matches, and objective modes including capture the flag and domination.',
    genre: 'Shooting', rating: 4.3, multiplayerType: 'Server',
    tags: ['Shooting', 'FPS', '3D', 'Desktop', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    sessionObjectives: ['Try a quick battle', 'Play an objective mode', 'Customize a loadout'],
    controlHints: ['WASD to move; Shift to run; C to crouch', 'Mouse to aim and fire; 1–3 to change weapons'],
  },
  {
    id: 'modern-racing-limits', name: 'Racing Limits',
    url: 'https://www.crazygames.com/game/racing-limits', releaseDate: '2023-11-06',
    description: '3D traffic racing with career, infinite, against-time, and free-driving modes, camera choices, and vehicle upgrades.',
    genre: 'Racing', rating: 4.5, multiplayerType: 'Server',
    tags: ['Racing', '3D', 'Driving', 'Multiplayer', 'Modern', 'CrazyGames'],
    sessionObjectives: ['Finish a career event', 'Try two-way traffic', 'Beat a time challenge'],
    controlHints: ['Arrow keys to accelerate, brake, and steer', 'C to change camera; F for nitro'],
  },
  {
    id: 'modern-rally-racer-dirt', name: 'Rally Racer Dirt',
    url: 'https://www.crazygames.com/game/rally-racer-dirt', releaseDate: '2023-11-17',
    description: '3D rally driving on asphalt and dirt with tunable cars, challenge and survival runs, and a real-time multiplayer mode.',
    genre: 'Racing', rating: 4.55, multiplayerType: 'Server',
    tags: ['Racing', '3D', 'Drifting', 'Multiplayer', 'Modern', 'CrazyGames'],
    sessionObjectives: ['Clear a rally challenge', 'Link a controlled drift', 'Pass checkpoints in survival mode'],
    controlHints: ['WASD or arrows to drive', 'Space or Q for handbrake; C to change camera'],
  },
  {
    id: 'modern-vectaria', name: 'Vectaria.io',
    url: 'https://poki.com/en/g/vectaria-io', releaseDate: '2023-09-26',
    description: 'Voxel multiplayer sandbox with resource gathering, crafting, creative building, and survival worlds with optional PvP.',
    genre: 'Adventure', rating: 4.23, multiplayerType: 'Server',
    tags: ['Adventure', '3D', 'Sandbox', 'Crafting', 'Multiplayer', 'Modern', 'Poki'],
    sessionObjectives: ['Build a shelter', 'Explore creative mode', 'Choose your PvP setting before joining survival'],
    controlHints: ['WASD to move; Space to jump', 'Left click to mine; right click to build; X for inventory'],
  },
  {
    id: 'modern-super-liquid-soccer', name: 'Super Liquid Soccer',
    url: 'https://poki.com/en/g/super-liquid-soccer', releaseDate: '2023-05-08',
    description: 'Ragdoll-style 3D football with national teams, 7-a-side tournaments, friendly matches, and penalty shootouts.',
    genre: 'Sports', rating: 4.09, multiplayerType: 'None',
    tags: ['Sports', '3D', 'Soccer', 'Physics', 'Modern', 'Poki'],
    sessionObjectives: ['Complete a friendly match', 'Combine a through ball with a shot', 'Win a penalty shootout'],
    controlHints: ['WASD to move; M to pass; J to shoot', 'L to chip; I for through pass; Q or E to switch player'],
  },
  {
    id: 'modern-level-devil', name: 'Level Devil',
    url: 'https://poki.com/en/g/level-devil', releaseDate: '2023-12-01',
    description: 'Precision platforming with disappearing floors, shifting traps, secret keys, and a shared-device two-player versus mode.',
    genre: 'Action', rating: 4.41, multiplayerType: 'None',
    tags: ['Action', 'Platformer', 'Puzzle', 'Local Versus', 'Modern', 'Poki'],
    sessionObjectives: ['Reach an exit', 'Learn a hidden trap pattern', 'Try two-player mode on one device'],
    controlHints: ['A/D or arrows to move', 'W, Up, or Space to jump'],
  },
].map((game): Game => ({
  ...game,
  multiplayerType: game.multiplayerType as Game['multiplayerType'],
  availability: 'Online',
  tags: [...game.tags, 'Web'],
  badgeIds: ['modern', 'new-drop', 'staff-pick'],
  aiBriefing: game.description,
  modes: game.multiplayerType === 'Server' ? ['solo', 'team'] : ['solo'],
  launchConfig: {
    approvedExternalUrl: game.url,
    embedMode: 'external-only',
    telemetryMode: 'none',
    controls: game.controlHints,
    modes: game.multiplayerType === 'Server' ? ['Online Multiplayer'] : ['Solo'],
    trustNote: 'Reviewed publisher browser-game page. Opens on the publisher site; no redistribution or iframe permission is assumed.',
  },
}));

export const CURATED_POKI_GAMES: Game[] = [
  {
    id: 'poki-temple-run-2',
    name: 'Temple Run 2',
    url: 'https://poki.com/en/g/temple-run-2',
    description:
      'Fast, polished endless runner with responsive lane switching, jumps, slides, and daily replay value.',
    genre: 'Arcade',
    rating: 4.7,
    playersOnline: 42000,
    availability: 'Online',
    tags: ['Arcade', 'Runner', 'Poki', 'Modern'],
    badgeIds: ['modern', 'trending'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/temple-run-2',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-subway-surfers',
    name: 'Subway Surfers',
    url: 'https://poki.com/en/g/subway-surfers',
    description:
      'Iconic endless runner with colorful worlds, quick reactions, and a strong pick-up-and-play loop.',
    genre: 'Arcade',
    rating: 4.7,
    playersOnline: 51000,
    availability: 'Online',
    tags: ['Arcade', 'Runner', 'Poki', 'Iconic'],
    badgeIds: ['modern', 'featured'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/subway-surfers',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-crossy-road',
    name: 'Crossy Road',
    url: 'https://poki.com/en/g/crossy-road',
    description:
      'Bright timing-based arcade classic with short sessions, escalating hazards, and score-chasing mastery.',
    genre: 'Arcade',
    rating: 4.6,
    playersOnline: 29000,
    availability: 'Online',
    tags: ['Arcade', 'Timing', 'Poki', 'Iconic'],
    badgeIds: ['modern', 'classic'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/crossy-road',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-stickman-hook',
    name: 'Stickman Hook',
    url: 'https://poki.com/en/g/stickman-hook',
    description:
      'Physics-driven swinging platformer built around momentum, timing, and clean level routing.',
    genre: 'Action',
    rating: 4.6,
    playersOnline: 18000,
    availability: 'Online',
    tags: ['Action', 'Physics', 'Poki', 'Modern'],
    badgeIds: ['modern', 'staff-pick'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/stickman-hook',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-retro-bowl',
    name: 'Retro Bowl',
    url: 'https://poki.com/en/g/retro-bowl',
    description:
      'Compact American football management and play-calling experience with sharp retro presentation.',
    genre: 'Sports',
    rating: 4.8,
    playersOnline: 24000,
    availability: 'Online',
    tags: ['Sports', 'Management', 'Poki', 'Competitive'],
    badgeIds: ['modern', 'trending'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/retro-bowl',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-drive-mad',
    name: 'Drive Mad',
    url: 'https://poki.com/en/g/drive-mad',
    description:
      'Precision driving challenge with wild tracks, flips, and increasingly demanding vehicle control.',
    genre: 'Racing',
    rating: 4.6,
    playersOnline: 22000,
    availability: 'Online',
    tags: ['Racing', 'Physics', 'Poki', 'Modern'],
    badgeIds: ['modern', 'new-drop'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/drive-mad',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-monkey-mart',
    name: 'Monkey Mart',
    url: 'https://poki.com/en/g/monkey-mart',
    description:
      'Relaxed shop-management sim with satisfying upgrade loops, staffing, and customer flow.',
    genre: 'Strategy',
    rating: 4.7,
    playersOnline: 16000,
    availability: 'Online',
    tags: ['Strategy', 'Simulation', 'Poki', 'Modern'],
    badgeIds: ['modern', 'staff-pick'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/monkey-mart',
      embedMode: 'external-only',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
  {
    id: 'poki-friday-night-funkin',
    name: "Friday Night Funkin'",
    url: 'https://poki.com/en/g/friday-night-funkin',
    description:
      'Rhythm battle favorite with expressive timing windows, memorable tracks, and score-driven replayability.',
    genre: 'Rhythm',
    rating: 4.8,
    playersOnline: 27000,
    availability: 'Online',
    tags: ['Rhythm', 'Music', 'Poki', 'Iconic'],
    badgeIds: ['modern', 'featured'],
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/friday-night-funkin',
      embedMode: 'external-only',
      controls: ['Keyboard'],
      modes: ['Solo'],
      trustNote:
        'Official Poki game page; opens externally because provider framing is not guaranteed.',
    },
  },
];
