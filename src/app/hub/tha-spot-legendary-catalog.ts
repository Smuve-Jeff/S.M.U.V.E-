import { Game } from './game';
import { FREE_BROWSER_VAULT_GAMES } from './tha-spot-free-vault-catalog';

/**
 * "Legendary" catalogue wave for Tha Spot.
 *
 * Both shelves are free-to-play browser games:
 *  - LEGENDARY_BROWSER_GAMES: household-name browser games.
 *  - LEGENDARY_FREE_VAULT_GAMES: Flash-era classics and .io icons.
 *
 * Every row launches externally from a publisher page; no install, purchase,
 * embed, or redistribution claim is made.
 *
 * Every row carries real session objectives, control hints, tags, and a
 * truthful launch contract so the HUD launch preview is never empty.
 */

const TRUST_NOTE_BROWSER =
  'Free-to-play browser game page, verified reachable. Opens externally after the on-site domain confirmation; no install, purchase, iframe embedding, or redistribution is implied.';

export const LEGENDARY_BROWSER_GAMES: Game[] = [
  {
    id: 'legend-wordle',
    name: 'Wordle',
    url: 'https://www.nytimes.com/games/wordle/index.html',
    description:
      'The daily five-letter word phenomenon: six guesses, colour-coded clues, and one shared puzzle for everyone each day.',
    genre: 'Casual',
    tags: ['Casual', 'Word', 'Daily', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Solve the daily word',
      'Keep a streak alive',
      'Share a spoiler-free result',
    ],
    controlHints: [
      'Type a five-letter word and press Enter',
      'Green means right letter, right spot; yellow means wrong spot',
    ],
    aiBriefing:
      'A daily deduction puzzle. Open with a word rich in common vowels and consonants, then use each colour clue to eliminate letters before the sixth guess.',
    launchConfig: {
      approvedExternalUrl: 'https://www.nytimes.com/games/wordle/index.html',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Daily Word', accentStart: '#22c55e', accentEnd: '#14532d' },
  },
  {
    id: 'legend-geoguessr',
    name: 'GeoGuessr',
    url: 'https://www.geoguessr.com/',
    description:
      'Drop into a random Street View location and deduce where in the world you are from road signs, architecture, vegetation, and sunlight.',
    genre: 'Casual',
    tags: ['Casual', 'Geography', 'Trivia', 'Multiplayer', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Place a guess within 100 km',
      'Complete a five-round map',
      'Challenge a friend to a duel',
    ],
    controlHints: [
      'Drag to look around; click the map to place your pin',
      'Use language, plates, and road markings as evidence',
    ],
    aiBriefing:
      'Geography deduction at speed. Check the sun direction, driving side, and signage language first; those three clues eliminate most of the planet.',
    launchConfig: {
      approvedExternalUrl: 'https://www.geoguessr.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Mouse', 'Touch'],
      modes: ['Solo', 'Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'World Detective', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  },
  {
    id: 'legend-minesweeper',
    name: 'Minesweeper Online',
    url: 'https://minesweeper.online/',
    description:
      'The definitive modern home of the Windows classic: flagged minefields, first-click safety, leaderboards, and daily challenges.',
    genre: 'Casual',
    tags: ['Casual', 'Logic', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Clear a beginner board',
      'Win without a flag',
      'Beat your best time',
    ],
    controlHints: [
      'Left click reveals a cell; right click plants a flag',
      'Numbers count adjacent mines; chord with both buttons to clear satisfied cells',
    ],
    aiBriefing:
      'Pure logic under pressure. Solve forced cells first, keep flag count honest, and only guess when no deterministic move remains.',
    launchConfig: {
      approvedExternalUrl: 'https://minesweeper.online/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Classic Logic', accentStart: '#94a3b8', accentEnd: '#1e293b' },
  },
  {
    id: 'legend-sudoku',
    name: 'Sudoku.com',
    url: 'https://sudoku.com/',
    description:
      'The familiar nine-by-nine number puzzle with difficulty tiers, notes, hints, and a fresh daily grid.',
    genre: 'Casual',
    tags: ['Casual', 'Logic', 'Numbers', 'Daily', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Finish an easy grid',
      'Complete a grid without hints',
      'Try an expert puzzle',
    ],
    controlHints: [
      'Select a cell, then type or tap a number',
      'Use notes to pencil in candidates and avoid guessing',
    ],
    aiBriefing:
      'A logic discipline, not a guessing game. Scan rows, columns, and boxes for singles before reaching for notes or hints.',
    launchConfig: {
      approvedExternalUrl: 'https://sudoku.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Number Grid', accentStart: '#60a5fa', accentEnd: '#1e3a8a' },
  },
  {
    id: 'legend-cookie-clicker',
    name: 'Cookie Clicker',
    url: 'https://cookieclicker.com/',
    description:
      'The idle-game landmark: bake cookies, hire grandmas, unlock upgrades, and watch an absurd economy snowball.',
    genre: 'Simulation',
    tags: ['Simulation', 'Idle', 'Clicker', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Bake your first cookie',
      'Buy a cursor upgrade',
      'Unlock the next building tier',
    ],
    controlHints: [
      'Click the big cookie to bake',
      'Spend cookies on buildings and upgrades in the side panels',
    ],
    aiBriefing:
      'An exponential-growth toy. Reinvest early and often; idle production compounds faster than manual clicking once the first upgrades land.',
    launchConfig: {
      approvedExternalUrl: 'https://cookieclicker.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Idle Empire', accentStart: '#fbbf24', accentEnd: '#78350f' },
  },
  {
    id: 'legend-happy-wheels',
    name: 'Happy Wheels',
    url: 'https://www.crazygames.com/game/happy-wheels',
    description:
      'The legendary physics ragdoll obstacle course: pick a rider, survive user-made deathtraps, and laugh at every failure.',
    genre: 'Action',
    tags: ['Action', 'Physics', 'Ragdoll', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Reach the finish line',
      'Survive a fan-made level',
      'Complete a run without losing your rider',
    ],
    controlHints: [
      'Arrow keys drive and lean the vehicle',
      'Space ejects the rider; Z and Shift control limbs in some levels',
    ],
    aiBriefing:
      'Momentum and limb physics decide everything. Feather the throttle on ramps and keep the vehicle upright rather than racing flat out.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/happy-wheels',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Ragdoll Chaos', accentStart: '#f97316', accentEnd: '#7c2d12' },
  },
  {
    id: 'legend-hill-climb-racing',
    name: 'Hill Climb Racing',
    url: 'https://www.crazygames.com/game/hill-climb-racing',
    description:
      'The one-thumb driving classic: balance a jeep over impossible hills, collect coins, and upgrade the next vehicle.',
    genre: 'Racing',
    tags: ['Racing', 'Physics', 'Driving', 'Casual', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Reach the first checkpoint',
      'Collect a full coin run',
      'Unlock a new vehicle',
    ],
    controlHints: [
      'Hold the right pedal to accelerate and the left pedal to brake or reverse',
      'Ease off the throttle to keep the nose down on steep climbs',
    ],
    aiBriefing:
      'A balance game disguised as a racer. Feather the throttle over crests and let the suspension settle before the next climb.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/hill-climb-racing',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Offroad Classic', accentStart: '#facc15', accentEnd: '#713f12' },
  },
  {
    id: 'legend-cut-the-rope',
    name: 'Cut the Rope',
    url: 'https://poki.com/en/g/cut-the-rope',
    description:
      'The physics-puzzle classic: slice ropes, pop bubbles, and feed candy to the insatiable little monster Om Nom.',
    genre: 'Casual',
    tags: ['Casual', 'Physics', 'Puzzle', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Feed Om Nom the first candy',
      'Collect three stars in a level',
      'Finish a full chapter',
    ],
    controlHints: [
      'Swipe or drag across a rope to cut it',
      'Tap bubbles and special objects to trigger them',
    ],
    aiBriefing:
      'A pendulum puzzle. Cut one rope at a time and watch the candy arc; the third star is usually hidden behind a delayed second cut.',
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/cut-the-rope',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Physics Treat', accentStart: '#4ade80', accentEnd: '#14532d' },
  },
  {
    id: 'legend-papas-freezeria',
    name: "Papa's Freezeria",
    url: 'https://poki.com/en/g/papas-freezeria',
    description:
      'The beloved time-management classic: run the ice-cream shop, build sundaes in order, and keep a growing queue happy.',
    genre: 'Simulation',
    tags: ['Simulation', 'Management', 'Time Management', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Complete the first day',
      'Build an order without mistakes',
      'Earn a perfect score on a sundae',
    ],
    controlHints: [
      'Click ingredients to add them in the ticket order',
      'Move finished orders to the counter before the meter runs out',
    ],
    aiBriefing:
      'A queue-management rhythm game. Batch identical steps, keep toppings close, and never let the order station idle while a ticket waits.',
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/papas-freezeria',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Diner Rush', accentStart: '#f9a8d4', accentEnd: '#831843' },
  },
  {
    id: 'legend-angry-birds',
    name: 'Angry Birds',
    url: 'https://poki.com/en/g/angry-birds',
    description:
      'The slingshot smash that defined mobile gaming: launch birds at ramshackle pig forts and topple them with physics.',
    genre: 'Arcade',
    tags: ['Arcade', 'Physics', 'Puzzle', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Clear the first level',
      'Three-star a level',
      'Topple a tower with a single bird',
    ],
    controlHints: [
      'Drag back from the slingshot and release to launch',
      'Tap during flight to use a bird special ability',
    ],
    aiBriefing:
      'Structural demolition. Aim at load-bearing blocks rather than the pigs themselves, and save the special bird for the final collapse.',
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/angry-birds',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Slingshot Legend', accentStart: '#ef4444', accentEnd: '#7f1d1d' },
  },
  {
    id: 'legend-bad-piggies',
    name: 'Bad Piggies',
    url: 'https://poki.com/en/g/bad-piggies',
    description:
      'Build a contraption from frames, wheels, balloons, and motors, then steer the pigs to the finish without wrecking the machine.',
    genre: 'Arcade',
    tags: ['Arcade', 'Physics', 'Building', 'Puzzle', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Build a cart that reaches the goal',
      'Collect the star box',
      'Finish a level with a three-star build',
    ],
    controlHints: [
      'Drag parts onto the blueprint grid',
      'Press the test button, then use the on-screen motor and brake controls',
    ],
    aiBriefing:
      'An engineering sandbox. Balance the cart, keep the centre of mass low, and test early instead of overbuilding before the first run.',
    launchConfig: {
      approvedExternalUrl: 'https://poki.com/en/g/bad-piggies',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Contraption Lab', accentStart: '#84cc16', accentEnd: '#365314' },
  },
  {
    id: 'legend-uno-online',
    name: 'UNO Online',
    url: 'https://www.crazygames.com/game/uno-online',
    description:
      'The card-night staple online: match colours and numbers, stack action cards, and call UNO before the table catches you.',
    genre: 'Party',
    tags: ['Party', 'Cards', 'Multiplayer', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Win a round',
      'Call UNO correctly',
      'Win with a draw-two finish',
    ],
    controlHints: [
      'Click a playable card to play it',
      'Press the UNO button as soon as you are down to one card',
    ],
    aiBriefing:
      'Card counting with a social trap. Track colour shortages, hold action cards for the leader, and call UNO immediately rather than after the next play.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/uno-online',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Card Night', accentStart: '#f43f5e', accentEnd: '#881337' },
  },
  {
    id: 'legend-monopoly',
    name: 'Monopoly',
    url: 'https://www.crazygames.com/game/monopoly',
    description:
      'The board-game icon in the browser: buy streets, build houses, negotiate trades, and bankrupt the table.',
    genre: 'Party',
    tags: ['Party', 'Board', 'Multiplayer', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Buy your first property',
      'Complete a colour set',
      'Bankrupt a rival',
    ],
    controlHints: [
      'Roll the dice and choose whether to buy',
      'Use the trade panel to offer property swaps',
    ],
    aiBriefing:
      'A cash-flow game with a housing ladder. Secure one full colour set early, keep a cash buffer for rent, and trade only when it completes a set.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/monopoly',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Board Empire', accentStart: '#22c55e', accentEnd: '#14532d' },
  },
  {
    id: 'legend-slope',
    name: 'Slope',
    url: 'https://www.crazygames.com/game/slope',
    description:
      'A neon endless-runner icon: steer a ball down an accelerating chute, dodge blocks, and chase a higher score each run.',
    genre: 'Action',
    tags: ['Action', 'Runner', 'Endless', 'Reflex', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Survive the first stretch',
      'Beat your best distance',
      'Reach a high-speed section without a hit',
    ],
    controlHints: [
      'Use A and D or the arrow keys to steer',
      'Look two obstacles ahead and move early',
    ],
    aiBriefing:
      'Speed compounds fast. Stay near the centre line, commit to one lane early, and do not chase every gap in the opening seconds.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/slope',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Neon Descent', accentStart: '#22d3ee', accentEnd: '#155e75' },
  },
  {
    id: 'legend-mahjong-solitaire',
    name: 'Mahjongg Solitaire',
    url: 'https://www.crazygames.com/game/mahjongg-solitaire',
    description:
      'The timeless tile-matching solitaire: clear layered layouts by pairing identical free tiles before the board locks up.',
    genre: 'Casual',
    tags: ['Casual', 'Tiles', 'Logic', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Clear the first layout',
      'Finish a board without a hint',
      'Beat your best clear time',
    ],
    controlHints: [
      'Click a free tile, then click its matching pair',
      'Free tiles have an open side and no tile on top',
    ],
    aiBriefing:
      'A layered matching puzzle. Clear tall stacks to free the most tiles, and save matches that expose long blocked rows for later.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/mahjongg-solitaire',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Tile Classic', accentStart: '#f5d0a9', accentEnd: '#78350f' },
  },
  {
    id: 'legend-8-ball-pool',
    name: '8 Ball Pool',
    url: 'https://www.crazygames.com/game/8-ball-pool',
    description:
      'The pool-hall staple in the browser: aim, apply spin, pocket your group, and finish on the eight ball.',
    genre: 'Sports',
    tags: ['Sports', 'Billiards', 'Multiplayer', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Pocket your first ball',
      'Clear a group',
      'Win a match on the eight ball',
    ],
    controlHints: [
      'Drag from the cue ball to set power and direction',
      'Use the spin control to shape the cue ball after contact',
    ],
    aiBriefing:
      'Position beats power. Plan the cue ball path two shots ahead, and take easy safeties rather than low-percentage pots.',
    launchConfig: {
      approvedExternalUrl: 'https://www.crazygames.com/game/8-ball-pool',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Touch'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Table Legend', accentStart: '#4ade80', accentEnd: '#14532d' },
  },
  {
    id: 'legend-line-rider',
    name: 'Line Rider',
    url: 'https://www.linerider.com/',
    description:
      'The original draw-your-own-track sandbox: sketch slopes and loops, then send a sled rider through the physics course.',
    genre: 'Agility',
    tags: ['Agility', 'Physics', 'Sandbox', 'Creative', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'None',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Draw a track the rider survives',
      'Build a loop',
      'Share a finished track',
    ],
    controlHints: [
      'Draw lines with the mouse to build terrain',
      'Press play, then pause to adjust the track',
    ],
    aiBriefing:
      'A physics sketchpad. Start with a gentle downhill, avoid sharp concave corners, and test in short bursts before drawing the next section.',
    launchConfig: {
      approvedExternalUrl: 'https://www.linerider.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Mouse', 'Keyboard'],
      modes: ['Solo'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Sled Physics', accentStart: '#93c5fd', accentEnd: '#1e3a8a' },
  },
  {
    id: 'legend-pokemon-showdown',
    name: 'Pokémon Showdown',
    url: 'https://play.pokemonshowdown.com/',
    description:
      'The long-running competitive Pokémon battle simulator: build a team, pick a tier, and fight turn-based battles in the browser.',
    genre: 'Strategy',
    tags: ['Strategy', 'Pokemon', 'Competitive', 'Turn-Based', 'Multiplayer', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Build a legal team',
      'Win a ranked battle',
      'Try a random battle',
    ],
    controlHints: [
      'Choose a move or switch from the battle menu',
      'Use the team builder to set moves, items, and EVs',
    ],
    aiBriefing:
      'Turn-based prediction. Scout the opponent team before committing your sweeper, and preserve your answer to their fastest threat.',
    launchConfig: {
      approvedExternalUrl: 'https://play.pokemonshowdown.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Battle Sim', accentStart: '#facc15', accentEnd: '#713f12' },
  },
  {
    id: 'legend-tetr-io',
    name: 'TETR.IO',
    url: 'https://tetr.io/',
    description:
      'A modern competitive block-stacker: fast gravity, hold and ghost pieces, and ranked multiplayer duels.',
    genre: 'Arcade',
    tags: ['Arcade', 'Blocks', 'Competitive', 'Multiplayer', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Complete a solo sprint',
      'Win an online duel',
      'Clear a four-line combo',
    ],
    controlHints: [
      'Arrow keys move and rotate; Space hard drops',
      'C or Shift holds a piece for later',
    ],
    aiBriefing:
      'Speed plus board discipline. Keep the stack flat, save the hold for a bad piece, and build for consecutive clears instead of single lines.',
    launchConfig: {
      approvedExternalUrl: 'https://tetr.io/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard'],
      modes: ['Solo', 'Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Block Speed', accentStart: '#a78bfa', accentEnd: '#4c1d95' },
  },
  {
    id: 'legend-surviv-io',
    name: 'Surviv.io',
    url: 'https://surviv.io/',
    description:
      'The top-down battle-royale icon: drop onto the map, loot weapons and healing, and outlast the lobby.',
    genre: 'Battle Royale',
    tags: ['Battle Royale', 'Shooting', 'Multiplayer', 'PvP', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['modern', 'featured'],
    sessionObjectives: [
      'Loot a full loadout',
      'Reach the final circle',
      'Win a solo match',
    ],
    controlHints: [
      'WASD moves; mouse aims and fires',
      'Use cover and healing items before re-engaging',
    ],
    aiBriefing:
      'A fast top-down survival loop. Land near loot but away from the hot drop, rotate early with the circle, and heal behind hard cover.',
    launchConfig: {
      approvedExternalUrl: 'https://surviv.io/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Last Survivor', accentStart: '#fb7185', accentEnd: '#881337' },
  },
  {
    id: 'legend-runescape',
    name: 'RuneScape',
    url: 'https://www.runescape.com/',
    description:
      'The genre-defining browser MMORPG: quest, skill, trade, and explore Gielinor in a world that has been running for decades.',
    genre: 'RPG',
    tags: ['RPG', 'MMO', 'Multiplayer', 'Classic', 'Browser', 'Free to Play', 'Iconic'],
    availability: 'Online',
    multiplayerType: 'Server',
    badgeIds: ['classic', 'featured'],
    sessionObjectives: [
      'Finish a starter quest',
      'Train a skill to level 10',
      'Trade with another player',
    ],
    controlHints: [
      'Click to move, interact, and attack',
      'Use the skill and inventory panels to train and manage gear',
    ],
    aiBriefing:
      'A long-horizon progression game. Pick one money-making skill and one combat style early, and finish quests for unlocks instead of grinding blind.',
    launchConfig: {
      approvedExternalUrl: 'https://www.runescape.com/',
      embedMode: 'external-only',
      telemetryMode: 'none',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Multiplayer'],
      trustNote: TRUST_NOTE_BROWSER,
    },
    art: { eyebrow: 'Gielinor', accentStart: '#fbbf24', accentEnd: '#78350f' },
  },
];

export const LEGENDARY_FREE_VAULT_GAMES: Game[] = FREE_BROWSER_VAULT_GAMES;

export const LEGENDARY_GAMES: Game[] = [
  ...LEGENDARY_BROWSER_GAMES,
  ...LEGENDARY_FREE_VAULT_GAMES,
];
