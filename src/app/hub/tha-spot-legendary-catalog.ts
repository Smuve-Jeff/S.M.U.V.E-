import { Game } from './game';

/**
 * "Legendary" catalogue wave for Tha Spot.
 *
 * This rail is deliberately limited to browser games a broad audience already
 * recognizes. Every row is free to start and launches externally from its
 * publisher page; no install, purchase, embed, or redistribution claim is made.
 *
 * The previous 35-title "Free browser vault" was removed: it was mostly niche
 * Flash-era filler. Existing household-name archive rows are surfaced in the
 * separate `premium-household-names` rail instead of duplicated here.
 */

const TRUST_NOTE_BROWSER =
  'Free-to-play browser game page, verified reachable. Opens externally after the on-site domain confirmation; no install, purchase, iframe embedding, or redistribution is implied.';

const TRUST_NOTE_NYT =
  'Free daily browser game on NYT Games; a free NYT account may be required to save progress. Opens externally; no embed or redistribution is implied.';

const TRUST_NOTE_GOOGLE =
  'Official Google Doodle; free browser game. Opens externally; no embed or redistribution is implied.';

const TRUST_NOTE_COOLMATH =
  'Free browser game page on Coolmath Games. Opens externally; no embed or redistribution is implied.';

const TRUST_NOTE_CARD_TABLE =
  'Free browser game page on an ad-supported publisher site. Opens externally; no embed or redistribution is implied.';

type BrowserGameInput = {
  id: string;
  name: string;
  url: string;
  description: string;
  genre: string;
  tags: string[];
  multiplayerType?: Game['multiplayerType'];
  modes?: string[];
  objectives: string[];
  controls: string[];
  briefing: string;
  badgeIds?: string[];
  trustNote?: string;
  art: { eyebrow: string; accentStart: string; accentEnd: string };
};

function browserGame(input: BrowserGameInput): Game {
  return {
    id: input.id,
    name: input.name,
    url: input.url,
    description: input.description,
    genre: input.genre,
    tags: ['Browser', 'Free to Play', 'Iconic', ...input.tags],
    availability: 'Online',
    multiplayerType: input.multiplayerType ?? 'None',
    badgeIds: input.badgeIds ?? ['modern', 'featured'],
    sessionObjectives: input.objectives,
    controlHints: input.controls,
    aiBriefing: input.briefing,
    launchConfig: {
      approvedExternalUrl: input.url,
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: input.controls,
      modes: input.modes ?? ['Solo'],
      trustNote: input.trustNote ?? TRUST_NOTE_BROWSER,
    },
    art: input.art,
  };
}

export const LEGENDARY_BROWSER_GAMES: Game[] = [
  browserGame({
    id: 'legend-wordle',
    name: 'Wordle',
    url: 'https://www.nytimes.com/games/wordle/index.html',
    description:
      'The daily five-letter word phenomenon: six guesses, colour-coded clues, and one shared puzzle for everyone each day.',
    genre: 'Word',
    tags: ['Word', 'Daily', 'Puzzle'],
    objectives: ['Solve the daily word', 'Keep a streak alive', 'Share a spoiler-free result'],
    controls: [
      'Type a five-letter word and press Enter',
      'Green means right letter, right spot; yellow means wrong spot',
    ],
    briefing:
      'Open with a word rich in common vowels and consonants, then use each clue to eliminate letters before the sixth guess.',
    trustNote: TRUST_NOTE_NYT,
    art: { eyebrow: 'Daily Word', accentStart: '#22c55e', accentEnd: '#14532d' },
  }),
  browserGame({
    id: 'legend-connections',
    name: 'Connections',
    url: 'https://www.nytimes.com/games/connections',
    description:
      "The NYT's daily grouping puzzle: find four sets of four connected words without falling for the board's overlapping traps.",
    genre: 'Puzzle',
    tags: ['Puzzle', 'Word', 'Daily'],
    objectives: ['Solve the daily board', 'Find a perfect group', 'Keep a streak alive'],
    controls: [
      'Tap four words that share a connection, then submit the group',
      'Correct groups lock in; a wrong group costs one of your four lives',
    ],
    briefing:
      'Clear the safest four first and leave ambiguous words for later. A single wrong group can collapse two categories at once.',
    trustNote: TRUST_NOTE_NYT,
    art: { eyebrow: 'Daily Groups', accentStart: '#fbbf24', accentEnd: '#78350f' },
  }),
  browserGame({
    id: 'legend-spelling-bee',
    name: 'Spelling Bee',
    url: 'https://www.nytimes.com/puzzles/spelling-bee',
    description:
      "The NYT's daily word game: make as many words as you can from seven letters, always using the centre letter.",
    genre: 'Word',
    tags: ['Word', 'Daily', 'Puzzle'],
    objectives: ['Reach the first rank', 'Find a pangram', 'Fill the hive'],
    controls: [
      'Click the letters or type to build a word',
      'Press Enter to submit; every word must use the centre letter',
    ],
    briefing:
      'Start with the obvious short words, then look for prefixes and suffixes that turn one root into several answers.',
    trustNote: TRUST_NOTE_NYT,
    art: { eyebrow: 'Letter Hive', accentStart: '#facc15', accentEnd: '#713f12' },
  }),
  browserGame({
    id: 'legend-mini-crossword',
    name: 'The Mini',
    url: 'https://www.nytimes.com/crosswords/game/mini',
    description:
      "The NYT's quick daily crossword: a compact five-by-five grid designed for a coffee-break solve.",
    genre: 'Puzzle',
    tags: ['Puzzle', 'Word', 'Daily'],
    objectives: ['Finish a Mini', 'Solve without a hint', 'Beat your best time'],
    controls: [
      'Click a square and type; arrow keys move between squares',
      'Tab switches between across and down clues',
    ],
    briefing:
      'Fill the short across answers first. A single confident corner usually unlocks the longer down clues.',
    trustNote: TRUST_NOTE_NYT,
    art: { eyebrow: 'Quick Grid', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  }),
  browserGame({
    id: 'legend-geoguessr',
    name: 'GeoGuessr',
    url: 'https://www.geoguessr.com/',
    description:
      'Drop into a random Street View location and deduce where in the world you are from road signs, architecture, vegetation, and sunlight.',
    genre: 'Casual',
    tags: ['Geography', 'Trivia', 'Multiplayer'],
    multiplayerType: 'Server',
    modes: ['Solo', 'Online Multiplayer'],
    objectives: ['Place a guess within 100 km', 'Complete a five-round map', 'Challenge a friend'],
    controls: [
      'Drag to look around; click the map to place your pin',
      'Use language, plates, and road markings as evidence',
    ],
    briefing:
      'Check the sun direction, driving side, and signage language first; those three clues eliminate most of the planet.',
    art: { eyebrow: 'World Detective', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  }),
  browserGame({
    id: 'legend-cookie-clicker',
    name: 'Cookie Clicker',
    url: 'https://cookieclicker.com/',
    description:
      'The idle-game landmark: bake cookies, hire grandmas, unlock upgrades, and watch an absurd economy snowball.',
    genre: 'Simulation',
    tags: ['Idle', 'Clicker', 'Classic'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Bake your first cookie', 'Buy a cursor upgrade', 'Unlock the next building'],
    controls: [
      'Click the big cookie to bake',
      'Spend cookies on buildings and upgrades in the side panels',
    ],
    briefing:
      'Reinvest early and often; idle production compounds faster than manual clicking once the first upgrades land.',
    art: { eyebrow: 'Idle Empire', accentStart: '#fbbf24', accentEnd: '#78350f' },
  }),
  browserGame({
    id: 'legend-pac-man-doodle',
    name: 'Pac-Man (Google Doodle)',
    url: 'https://www.google.com/logos/2010/pacman10-i.html',
    description:
      "Google's playable 30th-anniversary Pac-Man Doodle: the arcade maze, ghosts, and power pellets in a browser tab.",
    genre: 'Arcade',
    tags: ['Arcade', 'Classic', 'Maze'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Clear a maze', 'Eat a ghost', 'Beat the high score'],
    controls: [
      'Arrow keys steer Pac-Man',
      'Eat a power pellet to turn the ghosts blue and chase them',
    ],
    briefing:
      'Clear one side of the maze before committing to the other. Save a power pellet for the moment the ghosts close in.',
    trustNote: TRUST_NOTE_GOOGLE,
    art: { eyebrow: 'Arcade Doodle', accentStart: '#facc15', accentEnd: '#713f12' },
  }),
  browserGame({
    id: 'legend-champion-island',
    name: 'Doodle Champion Island Games',
    url: 'https://www.google.com/doodles/doodle-champion-island-games-begin',
    description:
      "Google's anime-style sports RPG: explore Champion Island as Lucky the ninja cat and beat seven sport champions.",
    genre: 'Adventure',
    tags: ['Adventure', 'Sports', 'RPG'],
    objectives: ['Win the opening table-tennis match', 'Collect a sacred scroll', 'Try a second sport'],
    controls: [
      'Arrow keys or WASD move; Space interacts',
      'Follow the on-screen prompts for each sport',
    ],
    briefing:
      'Talk to every islander before leaving an area. Side quests unlock shortcuts and make the later champions much easier.',
    trustNote: TRUST_NOTE_GOOGLE,
    art: { eyebrow: 'Champion Island', accentStart: '#f97316', accentEnd: '#7c2d12' },
  }),
  browserGame({
    id: 'legend-hill-climb-racing',
    name: 'Hill Climb Racing',
    url: 'https://www.crazygames.com/game/hill-climb-racing',
    description:
      'The one-thumb driving classic: balance a jeep over impossible hills, collect coins, and upgrade the next vehicle.',
    genre: 'Racing',
    tags: ['Racing', 'Physics', 'Driving'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Reach the first checkpoint', 'Collect a full coin run', 'Unlock a new vehicle'],
    controls: [
      'Hold the right pedal to accelerate and the left pedal to brake or reverse',
      'Ease off the throttle to keep the nose down on steep climbs',
    ],
    briefing:
      'Feather the throttle over crests and let the suspension settle before the next climb; flat-out speed flips the jeep.',
    art: { eyebrow: 'Offroad Classic', accentStart: '#facc15', accentEnd: '#713f12' },
  }),
  browserGame({
    id: 'legend-cut-the-rope',
    name: 'Cut the Rope',
    url: 'https://poki.com/en/g/cut-the-rope',
    description:
      'The physics-puzzle classic: slice ropes, pop bubbles, and feed candy to the insatiable little monster Om Nom.',
    genre: 'Casual',
    tags: ['Physics', 'Puzzle', 'Classic'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Feed Om Nom the first candy', 'Collect three stars in a level', 'Finish a chapter'],
    controls: [
      'Swipe or drag across a rope to cut it',
      'Tap bubbles and special objects to trigger them',
    ],
    briefing:
      'Cut one rope at a time and watch the candy arc; the third star is usually hidden behind a delayed second cut.',
    art: { eyebrow: 'Physics Treat', accentStart: '#4ade80', accentEnd: '#14532d' },
  }),
  browserGame({
    id: 'legend-angry-birds',
    name: 'Angry Birds',
    url: 'https://poki.com/en/g/angry-birds',
    description:
      'The slingshot smash that defined mobile gaming: launch birds at ramshackle pig forts and topple them with physics.',
    genre: 'Arcade',
    tags: ['Physics', 'Puzzle', 'Classic'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Clear the first level', 'Three-star a level', 'Topple a tower with one bird'],
    controls: [
      'Drag back from the slingshot and release to launch',
      'Tap during flight to use a bird special ability',
    ],
    briefing:
      'Aim at load-bearing blocks rather than the pigs themselves, and save the special bird for the final collapse.',
    art: { eyebrow: 'Slingshot Legend', accentStart: '#ef4444', accentEnd: '#7f1d1d' },
  }),
  browserGame({
    id: 'legend-bad-piggies',
    name: 'Bad Piggies',
    url: 'https://poki.com/en/g/bad-piggies',
    description:
      'Build a contraption from frames, wheels, balloons, and motors, then steer the pigs to the finish without wrecking the machine.',
    genre: 'Arcade',
    tags: ['Physics', 'Building', 'Puzzle'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Build a cart that reaches the goal', 'Collect the star box', 'Finish a three-star build'],
    controls: [
      'Drag parts onto the blueprint grid',
      'Press test, then use the on-screen motor and brake controls',
    ],
    briefing:
      'Balance the cart, keep the centre of mass low, and test early instead of overbuilding before the first run.',
    art: { eyebrow: 'Contraption Lab', accentStart: '#84cc16', accentEnd: '#365314' },
  }),
  browserGame({
    id: 'legend-uno-online',
    name: 'UNO Online',
    url: 'https://www.crazygames.com/game/uno-online',
    description:
      'The card-night staple online: match colours and numbers, stack action cards, and call UNO before the table catches you.',
    genre: 'Party',
    tags: ['Cards', 'Multiplayer', 'Classic'],
    badgeIds: ['classic', 'featured'],
    multiplayerType: 'Server',
    modes: ['Online Multiplayer'],
    objectives: ['Win a round', 'Call UNO correctly', 'Win with a draw-two finish'],
    controls: [
      'Click a playable card to play it',
      'Press the UNO button as soon as you are down to one card',
    ],
    briefing:
      'Track colour shortages, hold action cards for the leader, and call UNO immediately rather than after the next play.',
    art: { eyebrow: 'Card Night', accentStart: '#f43f5e', accentEnd: '#881337' },
  }),
  browserGame({
    id: 'legend-monopoly',
    name: 'Monopoly',
    url: 'https://www.crazygames.com/game/monopoly',
    description:
      'The board-game icon in the browser: buy streets, build houses, negotiate trades, and bankrupt the table.',
    genre: 'Party',
    tags: ['Board', 'Multiplayer', 'Classic'],
    badgeIds: ['classic', 'featured'],
    multiplayerType: 'Server',
    modes: ['Online Multiplayer'],
    objectives: ['Buy your first property', 'Complete a colour set', 'Bankrupt a rival'],
    controls: [
      'Roll the dice and choose whether to buy',
      'Use the trade panel to offer property swaps',
    ],
    briefing:
      'Secure one full colour set early, keep a cash buffer for rent, and trade only when it completes a set.',
    art: { eyebrow: 'Board Empire', accentStart: '#22c55e', accentEnd: '#14532d' },
  }),
  browserGame({
    id: 'legend-line-rider',
    name: 'Line Rider',
    url: 'https://www.linerider.com/',
    description:
      'The original draw-your-own-track sandbox: sketch slopes and loops, then send a sled rider through the physics course.',
    genre: 'Agility',
    tags: ['Physics', 'Sandbox', 'Creative'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Draw a track the rider survives', 'Build a loop', 'Share a finished track'],
    controls: [
      'Draw lines with the mouse to build terrain',
      'Press play, then pause to adjust the track',
    ],
    briefing:
      'Start with a gentle downhill, avoid sharp concave corners, and test in short bursts before drawing the next section.',
    art: { eyebrow: 'Sled Physics', accentStart: '#93c5fd', accentEnd: '#1e3a8a' },
  }),
  browserGame({
    id: 'legend-runescape',
    name: 'RuneScape',
    url: 'https://www.runescape.com/',
    description:
      'The genre-defining browser MMORPG: quest, skill, trade, and explore Gielinor in a world that has been running for decades.',
    genre: 'RPG',
    tags: ['MMO', 'Multiplayer', 'Classic'],
    badgeIds: ['classic', 'featured'],
    multiplayerType: 'Server',
    modes: ['Online Multiplayer'],
    objectives: ['Finish a starter quest', 'Train a skill to level 10', 'Trade with another player'],
    controls: [
      'Click to move, interact, and attack',
      'Use the skill and inventory panels to train and manage gear',
    ],
    briefing:
      'Pick one money-making skill and one combat style early, and finish quests for unlocks instead of grinding blind.',
    art: { eyebrow: 'Gielinor', accentStart: '#fbbf24', accentEnd: '#78350f' },
  }),
  browserGame({
    id: 'legend-surviv-io',
    name: 'Surviv.io',
    url: 'https://surviv.io/',
    description:
      'The top-down battle-royale icon: drop onto the map, loot weapons and healing, and outlast the lobby.',
    genre: 'Battle Royale',
    tags: ['Shooting', 'Multiplayer', 'PvP'],
    multiplayerType: 'Server',
    modes: ['Online Multiplayer'],
    objectives: ['Loot a full loadout', 'Reach the final circle', 'Win a solo match'],
    controls: ['WASD moves; mouse aims and fires', 'Use cover and healing items before re-engaging'],
    briefing:
      'Land near loot but away from the hot drop, rotate early with the circle, and heal behind hard cover.',
    art: { eyebrow: 'Last Survivor', accentStart: '#fb7185', accentEnd: '#881337' },
  }),
  browserGame({
    id: 'legend-tetr-io',
    name: 'TETR.IO',
    url: 'https://tetr.io/',
    description:
      'A modern competitive block-stacker: fast gravity, hold and ghost pieces, and ranked multiplayer duels.',
    genre: 'Arcade',
    tags: ['Blocks', 'Competitive', 'Multiplayer'],
    multiplayerType: 'Server',
    modes: ['Solo', 'Online Multiplayer'],
    objectives: ['Complete a solo sprint', 'Win an online duel', 'Clear a four-line combo'],
    controls: ['Arrow keys move and rotate; Space hard drops', 'C or Shift holds a piece'],
    briefing:
      'Keep the stack flat, save the hold for a bad piece, and build for consecutive clears instead of single lines.',
    art: { eyebrow: 'Block Speed', accentStart: '#a78bfa', accentEnd: '#4c1d95' },
  }),
  browserGame({
    id: 'legend-big-tower-tiny-square',
    name: 'Big Tower Tiny Square',
    url: 'https://www.coolmathgames.com/0-big-tower-tiny-square',
    description:
      'The precision platformer that made one tiny square famous: climb a trap-filled tower with one jump and no checkpoints.',
    genre: 'Platformer',
    tags: ['Platformer', 'Precision', 'Classic'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Reach the first checkpoint', 'Escape a trap room', 'Climb the tower'],
    controls: [
      'Arrow keys or A/D move; Space or Up jumps',
      'Hold to jump higher; watch for fake floors',
    ],
    briefing:
      'Jump late and commit. Most traps trigger when you rush, so watch each room for one beat before moving.',
    trustNote: TRUST_NOTE_COOLMATH,
    art: { eyebrow: 'Tiny Tower', accentStart: '#f472b6', accentEnd: '#831843' },
  }),
  browserGame({
    id: 'legend-solitaire',
    name: 'Solitaire',
    url: 'https://www.solitaired.com/',
    description:
      'The classic Klondike solitaire table: build the four suits from ace to king and clear the deck.',
    genre: 'Card',
    tags: ['Cards', 'Classic', 'Solitaire'],
    badgeIds: ['classic', 'featured'],
    objectives: ['Win a game', 'Clear a suit', 'Finish a daily deal'],
    controls: [
      'Drag cards to build descending alternating-colour columns',
      'Double-click a card to send it to the foundation',
    ],
    briefing:
      'Expose hidden cards before chasing foundation moves. An empty column is worth more than an early ace.',
    trustNote: TRUST_NOTE_CARD_TABLE,
    art: { eyebrow: 'Card Table', accentStart: '#22c55e', accentEnd: '#14532d' },
  }),
  browserGame({
    id: 'legend-checkers',
    name: 'Checkers',
    url: 'https://www.247checkers.com/',
    description:
      "The classic diagonal board game: jump your opponent's pieces, chain captures, and reach the back rank to crown a king.",
    genre: 'Board',
    tags: ['Board', 'Strategy', 'Multiplayer'],
    badgeIds: ['classic', 'featured'],
    multiplayerType: 'Server',
    modes: ['Solo', 'Online Multiplayer'],
    objectives: ['Win a game', 'Make a double jump', 'Crown a king'],
    controls: [
      'Click a piece, then a highlighted destination',
      'Captures are mandatory when available',
    ],
    briefing:
      'Trade toward the centre and keep your back row intact. A forced capture can walk your piece straight into a trap.',
    trustNote: TRUST_NOTE_CARD_TABLE,
    art: { eyebrow: 'Board Duel', accentStart: '#ef4444', accentEnd: '#7f1d1d' },
  }),
  browserGame({
    id: 'legend-backgammon',
    name: 'Backgammon',
    url: 'https://www.247backgammon.org/',
    description:
      'The ancient dice-and-checkers race: move all fifteen stones into your home board and bear them off before your opponent.',
    genre: 'Board',
    tags: ['Board', 'Strategy', 'Multiplayer'],
    badgeIds: ['classic', 'featured'],
    multiplayerType: 'Server',
    modes: ['Solo', 'Online Multiplayer'],
    objectives: ['Win a game', 'Make a point', 'Bear off a stone'],
    controls: [
      'Roll the dice, then click a stone and its destination',
      'Use both dice; doubles give four moves',
    ],
    briefing:
      'Blocking points matter more than raw distance. Keep a spare checker back and avoid leaving a blot in reach.',
    trustNote: TRUST_NOTE_CARD_TABLE,
    art: { eyebrow: 'Dice & Points', accentStart: '#f59e0b', accentEnd: '#78350f' },
  }),
];

export const LEGENDARY_GAMES: Game[] = [...LEGENDARY_BROWSER_GAMES];
