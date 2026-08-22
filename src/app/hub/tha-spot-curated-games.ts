import { Game } from './game';

/**
 * Curated publisher pages outside the RetroGames inventory.
 *
 * These pages are intentionally external-only: the providers expose playable
 * browser experiences, but do not promise a stable iframe embedding contract.
 * Keeping the source metadata here lets the live feed and offline fallback
 * share the same additions without a second network request.
 */
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
