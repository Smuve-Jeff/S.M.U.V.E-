import { Game } from './game';

/**
 * Curated CrazyGames catalog (web-source expansion wave).
 *
 * Every title below was verified playable before inclusion: the provider's
 * /embed/ endpoint answered HTTP 200 with no X-Frame-Options / CSP
 * frame-ancestors blocking, so these play inline inside the cabinet iframe.
 * The same URL serves as the external fallback, mirroring the RetroGames
 * launch contract. CrazyGames is already a trusted cabinet host
 * (games.crazygames.com) — www.crazygames.com/embed/ is the same provider's
 * first-party embedding endpoint.
 *
 * These are modern, widely known, high-quality browser games filling genre
 * gaps the emulation archive cannot serve (browser-native co-op, party,
 * .io PvP, puzzle-platformer co-op, modern endless runners).
 *
 * Second wave (below): the couch-co-op, party, and iconic-classics shelf.
 * Every /embed/ URL in this wave was re-probed and answered HTTP 200 with no
 * frame-blocking headers before inclusion, same contract as wave one. These
 * rows also ship the full session briefing (objectives, control hints, AI
 * briefing) so the launch preview reads like a real cabinet, not a link card.
 */
export const CURATED_CRAZYGAMES_GAMES: Game[] = [
  {
    id: 'cg-run-3',
    sessionObjectives: [
      'Reach the twentieth tunnel without a fall',
      'Unlock a second runner',
      'Finish a full run without dropping out',
    ],
    controlHints: [
      'A/D or arrow keys swap tunnel walls',
      'Space jumps across a gap in the floor',
    ],
    aiBriefing:
      'Momentum runner — the wall flip is the entire game. Land centre-tunnel so you keep speed, and read two tunnels ahead before you commit.',
    name: 'Run 3',
    url: 'https://www.crazygames.com/embed/run-3',
    description:
      'Iconic endless space runner: gravity flips across tunnel walls, locked characters to unlock, and infinite procedurally stacked levels.',
    genre: 'Action',
    rating: 4.7,
    playersOnline: 31000,
    availability: 'Online',
    tags: ['Action', 'Runner', 'Platformer', 'Multiplayer', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/run-3',
      approvedExternalUrl: 'https://www.crazygames.com/embed/run-3',
      embedMode: 'inline',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo', 'Local Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Web Classic', accentStart: '#22d3ee', accentEnd: '#0e7490' },
  },
  {
    id: 'cg-paper-minecraft',
    sessionObjectives: [
      'Survive the first night',
      'Craft a full stone tool set',
      'Light a shelter before dusk',
    ],
    controlHints: [
      'WASD to move, mouse to place and break blocks',
      'Stack torches early — darkness spawns mobs',
    ],
    aiBriefing:
      'A 2D survival sandbox: bank food and light before the sun drops. Night mobs punish an open base, so wall up rather than exploring late.',
    name: 'Paper Minecraft',
    url: 'https://www.crazygames.com/embed/paper-minecraft',
    description:
      'The beloved 2D Minecraft sandbox: mine, craft, build, and survive through day-night cycles in creative or survival mode.',
    genre: 'Adventure',
    rating: 4.6,
    playersOnline: 27000,
    availability: 'Online',
    tags: ['Adventure', 'Sandbox', 'Survival', 'Crafting', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/paper-minecraft',
      approvedExternalUrl: 'https://www.crazygames.com/embed/paper-minecraft',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Sandbox Icon', accentStart: '#4ade80', accentEnd: '#166534' },
  },
  {
    id: 'cg-fireboy-watergirl',
    sessionObjectives: [
      'Get both heroes to the exit together',
      'Hold a lever so your partner can cross',
      'Clear the temple without losing a hero',
    ],
    controlHints: [
      'Player 1: arrow keys — Player 2: WASD',
      'Never step in your opposite element — water kills Fireboy, lava kills Watergirl',
    ],
    aiBriefing:
      'Co-op is mandatory here. Call your lever timings out loud: the partner piece of a puzzle is almost always a switch the other player has to hold.',
    name: 'Fireboy and Watergirl',
    url: 'https://www.crazygames.com/embed/fireboy-and-watergirl-the-forest-temple',
    description:
      'The definitive two-player co-op puzzle platformer: guide Fireboy and Watergirl through the Forest Temple using elemental switches, levers, and teamwork.',
    genre: 'Adventure',
    rating: 4.7,
    playersOnline: 22000,
    availability: 'Online',
    tags: ['Adventure', 'Puzzle', 'Platformer', 'Co-op', 'Multiplayer', 'CrazyGames'],
    badgeIds: ['modern', 'featured', 'staff-pick'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl:
        'https://www.crazygames.com/embed/fireboy-and-watergirl-the-forest-temple',
      approvedExternalUrl:
        'https://www.crazygames.com/embed/fireboy-and-watergirl-the-forest-temple',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Co-op', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Co-op Legend', accentStart: '#f87171', accentEnd: '#1d4ed8' },
  },
  {
    id: 'cg-narrow-one',
    sessionObjectives: [
      'Capture the enemy flag in a live round',
      'Score a long-range arrow',
      'Win a team match',
    ],
    controlHints: [
      'Hold the draw key to charge the bow',
      'Aim high at distance — arrows drop',
    ],
    aiBriefing:
      'Positional archery capture-the-flag. Hold height instead of duelling in the open, and remember the arrow drop decides any fight past mid-range.',
    name: 'Narrow One',
    url: 'https://www.crazygames.com/embed/narrow-one',
    description:
      'Fast multiplayer archery capture-the-flag: bow duels, vertical castle maps, and real-time team showdowns in a vivid stylized world.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 19000,
    availability: 'Online',
    tags: ['Shooting', 'Multiplayer', 'PvP', 'Archery', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/narrow-one',
      approvedExternalUrl: 'https://www.crazygames.com/embed/narrow-one',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Archery PvP', accentStart: '#fbbf24', accentEnd: '#92400e' },
  },
  {
    id: 'cg-deadshot-io',
    sessionObjectives: [
      'Win a team deathmatch',
      'Land a one-tap elimination',
      'Finish a match with a positive spread',
    ],
    controlHints: [
      'WASD to move, mouse to aim, click to fire',
      'Reload behind cover instead of mid-lane',
    ],
    aiBriefing:
      'Tight browser FPS lobbies. Pre-aim the corners you are about to swing and keep a reload timer in your head — this cabinet punishes a dry gun.',
    name: 'Deadshot.io',
    url: 'https://www.crazygames.com/embed/deadshot-io',
    description:
      'Lightning-fast browser FPS: tight gunplay, ranked-style lobbies, weapon variety, and quick-match team deathmatch against live players.',
    genre: 'Shooting',
    rating: 4.6,
    playersOnline: 26000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/deadshot-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/deadshot-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Browser FPS', accentStart: '#f87171', accentEnd: '#7f1d1d' },
  },
  {
    id: 'cg-subway-clash-3d',
    sessionObjectives: [
      'Hold the lobby objective for a full timer',
      'Flank through a side lane',
      'Finish top of the scoreboard',
    ],
    controlHints: [
      'Pick a loadout at spawn, reload key between fights',
      'Use the side stairs to bypass the centre lane',
    ],
    aiBriefing:
      'A third-person lobby shooter with maps that reward rotation. Move with a teammate — the centre lanes are shooting galleries.',
    name: 'Subway Clash 3D',
    url: 'https://www.crazygames.com/embed/subway-clash-3d',
    description:
      'Team-based 3D shooter set across subway tunnels and city streets: capture points, heavy weapons, and live squad skirmishes.',
    genre: 'Shooting',
    rating: 4.4,
    playersOnline: 15000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/subway-clash-3d',
      approvedExternalUrl: 'https://www.crazygames.com/embed/subway-clash-3d',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Squad Warfare', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  },
  {
    id: 'cg-time-shooter-2',
    sessionObjectives: [
      'Clear a wave without reloading mid-fight',
      'Hold a chokepoint for a full wave',
      'Survive ten waves',
    ],
    controlHints: [
      'Fire in controlled bursts at torso height',
      'Relocate between waves instead of camping one lane',
    ],
    aiBriefing:
      'Wave-survival FPS — never fight in the open. Funnel enemies through doorways so they queue up into your line of fire.',
    name: 'Time Shooter 2',
    url: 'https://www.crazygames.com/embed/time-shooter-2',
    description:
      'SUPERHOT-style tactical FPS: time moves only when you move, weapons shatter after a few shots, and every duel is a puzzle of angles.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 14000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Tactical', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/time-shooter-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/time-shooter-2',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Time-Bending FPS', accentStart: '#e879f9', accentEnd: '#701a75' },
  },
  {
    id: 'cg-a-small-world-cup',
    sessionObjectives: [
      'Win a two-player cup match',
      'Score from beyond the halfway line',
      'Keep a clean sheet',
    ],
    controlHints: [
      'A screen prompt shows both players\u2019 keys',
      'Move into the pass lane before you strike',
    ],
    aiBriefing:
      'One-touch couch football. Spamming the kick gives the ball away — steer into the lane first, then release the shot inside the box.',
    name: 'A Small World Cup',
    url: 'https://www.crazygames.com/embed/a-small-world-cup',
    description:
      'Physics-driven one-on-one football: ragdoll strikers, comedy own-goals, and national-team knockout runs in quick two-minute matches.',
    genre: 'Sports',
    rating: 4.5,
    playersOnline: 17000,
    availability: 'Online',
    tags: ['Sports', 'Football', 'Physics', 'Multiplayer', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/a-small-world-cup',
      approvedExternalUrl: 'https://www.crazygames.com/embed/a-small-world-cup',
      embedMode: 'inline',
      controls: ['Keyboard', 'Touch'],
      modes: ['Solo', 'Local Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Ragdoll Football', accentStart: '#34d399', accentEnd: '#065f46' },
  },
  {
    id: 'cg-duck-life-4',
    sessionObjectives: [
      'Find the water on the first cave',
      'Collect every seed in a stage',
      'Clear a stage without losing a duck',
    ],
    controlHints: [
      'Hold the jump key to glide',
      'Check ceilings for alternate routes',
    ],
    aiBriefing:
      'A physics platformer about arc, not speed: charge your jump at the very lip of a ledge, then glide to stretch the distance.',
    name: 'Duck Life 4',
    url: 'https://www.crazygames.com/embed/ducklife-4',
    description:
      'The classic duck-training RPG: raise runners, flyers, and swimmers through mini-game tournaments across six biomes to become champion.',
    genre: 'Sports',
    rating: 4.6,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Sports', 'Racing', 'Training', 'RPG', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/ducklife-4',
      approvedExternalUrl: 'https://www.crazygames.com/embed/ducklife-4',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Training Champ', accentStart: '#facc15', accentEnd: '#854d0e' },
  },
  {
    id: 'cg-getaway-shootout',
    sessionObjectives: [
      'Reach the getaway car first',
      'Win a two-player race',
      'Land a hit while airborne',
    ],
    controlHints: [
      'Player 1: WASD — Player 2: arrow keys',
      'Grab rooftop weapons, then keep shooting while you jump',
    ],
    aiBriefing:
      'A chaotic race-and-gun on one screen. Movement beats aim: spam the jump and fire on the way down, or you will be out-paced to the car.',
    name: 'Getaway Shootout',
    url: 'https://www.crazygames.com/embed/getaway-shootout',
    description:
      'Two-player escape races: awkward hop movement, wild power-ups, and weapons across heist maps — first to the getaway vehicle wins.',
    genre: 'Action',
    rating: 4.5,
    playersOnline: 13000,
    availability: 'Online',
    tags: ['Action', 'Multiplayer', 'PvP', 'Party', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/getaway-shootout',
      approvedExternalUrl: 'https://www.crazygames.com/embed/getaway-shootout',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Heist Race', accentStart: '#fb923c', accentEnd: '#7c2d12' },
  },
  {
    id: 'cg-12-minibattles',
    sessionObjectives: [
      'Win a minigame series',
      'Take a round without losing a life',
      'Survive a sudden-death tiebreak',
    ],
    controlHints: [
      'Controls change per minigame — read the prompt first',
      'Player 1: arrows — Player 2: WASD',
    ],
    aiBriefing:
      'Twelve one-button duels in a row. The winner is whoever reads the new rule fastest, so pause for the prompt instead of guessing.',
    name: '12 MiniBattles',
    url: 'https://www.crazygames.com/embed/12-minibattles',
    description:
      'The one-button party classic: 12 rapid-fire local versus minigames — tug of war, shootouts, and reaction duels on a single keyboard.',
    genre: 'Arcade',
    rating: 4.4,
    playersOnline: 11000,
    availability: 'Online',
    tags: ['Arcade', 'Party', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/12-minibattles',
      approvedExternalUrl: 'https://www.crazygames.com/embed/12-minibattles',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Party Pack', accentStart: '#c084fc', accentEnd: '#581c87' },
  },
  {
    id: 'cg-bad-ice-cream',
    sessionObjectives: [
      'Clear every fruit on the stage',
      'Trap a monster behind a built wall',
      'Finish the stage with both players alive',
    ],
    controlHints: [
      'Player 1: arrows — Player 2: WASD',
      'Build walls to trap monsters, not only to shield yourself',
    ],
    aiBriefing:
      'Co-op maze survival. Talk through wall placements: a wall that saves you can lock your partner in with a monster.',
    name: 'Bad Ice-Cream',
    url: 'https://www.crazygames.com/embed/bad-ice-cream',
    description:
      'Nitrome arcade favorite: freeze ice walls, dodge roaming enemies, and collect every fruit across handcrafted puzzle mazes.',
    genre: 'Arcade',
    rating: 4.6,
    playersOnline: 10000,
    availability: 'Online',
    tags: ['Arcade', 'Puzzle', 'Nitrome', 'Multiplayer', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bad-ice-cream',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bad-ice-cream',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Solo', 'Local Co-op'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Nitrome Classic', accentStart: '#67e8f9', accentEnd: '#155e75' },
  },
  {
    id: 'cg-bad-ice-cream-2',
    sessionObjectives: [
      'Collect the full fruit set',
      'Open a monster path with a timed wall break',
      'Clear a stage without a respawn',
    ],
    controlHints: [
      'Player 1: arrows — Player 2: WASD',
      'Wall breaks can crush monsters as well as open routes',
    ],
    aiBriefing:
      'The tougher co-op maze. Route the monsters first, then farm the fruit — a clean lane beats a fast grab every time.',
    name: 'Bad Ice-Cream 2',
    url: 'https://www.crazygames.com/embed/bad-ice-cream-2',
    description:
      'The sequel sharpens everything: new enemies, trickier mazes, more fruit orders, and two-player co-op frosting chaos.',
    genre: 'Arcade',
    rating: 4.5,
    playersOnline: 9000,
    availability: 'Online',
    tags: ['Arcade', 'Puzzle', 'Nitrome', 'Multiplayer', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bad-ice-cream-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bad-ice-cream-2',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Solo', 'Local Co-op'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Nitrome Sequel', accentStart: '#67e8f9', accentEnd: '#155e75' },
  },
  {
    id: 'cg-worlds-hardest-game',
    sessionObjectives: [
      'Reach the second checkpoint',
      'Clear a spike trap first try',
      'Finish a run without a full restart',
    ],
    controlHints: [
      'Arrow keys only — there is no jump trick',
      'Memorise each trap trigger before you speed up',
    ],
    aiBriefing:
      'Trial-and-error platforming. Treat every death as a map note, and stay slow near spikes — the level is designed to punish a confident sprint.',
    name: "The World's Hardest Game",
    url: 'https://www.crazygames.com/embed/worlds-hardest-game',
    description:
      'The legendary precision challenge: dodge relentless blue balls with pixel-perfect timing and collect coins — deaths counted, pride optional.',
    genre: 'Arcade',
    rating: 4.3,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Arcade', 'Difficulty', 'Precision', 'Timing', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/worlds-hardest-game',
      approvedExternalUrl: 'https://www.crazygames.com/embed/worlds-hardest-game',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Precision Trial', accentStart: '#f87171', accentEnd: '#450a0a' },
  },
  {
    id: 'cg-murder',
    sessionObjectives: [
      'Eliminate the target unseen',
      'Escape the level clean',
      'Complete a stealth run with no witnesses',
    ],
    controlHints: [
      'Click the target to strike',
      'Hide behind objects to break sightlines',
    ],
    aiBriefing:
      'A stealth sandbox, not an action game. Watch patrol timings before you move — one witness near the exit turns a clean run into a chase.',
    name: 'Murder',
    url: 'https://www.crazygames.com/embed/murder',
    description:
      'The social-betrayal cycle everyone knows: stab the king to take the throne, then spin and catch the next assassin before they strike.',
    genre: 'Casual',
    rating: 4.4,
    playersOnline: 8000,
    availability: 'Online',
    tags: ['Casual', 'Social', 'Timing', 'Stealth', 'CrazyGames'],
    badgeIds: ['modern'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/murder',
      approvedExternalUrl: 'https://www.crazygames.com/embed/murder',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Throne of Betrayal', accentStart: '#94a3b8', accentEnd: '#1e293b' },
  },
  {
    id: 'cg-mutilate-a-doll-2',
    sessionObjectives: [
      'Find a hidden item combo',
      'Trigger a chained reaction',
      'Unlock a new weapon set',
    ],
    controlHints: [
      'Drag items onto the doll to apply them',
      'Chain fire with explosives for a bigger combo',
    ],
    aiBriefing:
      'A physics toybox rather than a score chase — experiment with item pairings, and the interesting results come from stacking effects.',
    name: 'Mutilate a Doll 2',
    url: 'https://www.crazygames.com/embed/mutilate-a-doll-2',
    description:
      'Physics sandbox with hundreds of weapons, hazards, and tools — build chaotic contraptions and let the ragdoll ragdoll.',
    genre: 'Casual',
    rating: 4.3,
    playersOnline: 9000,
    availability: 'Online',
    tags: ['Casual', 'Sandbox', 'Physics', 'Creative', 'CrazyGames'],
    badgeIds: ['modern'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/mutilate-a-doll-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/mutilate-a-doll-2',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Physics Sandbox', accentStart: '#a3e635', accentEnd: '#365314' },
  },
  {
    id: 'cg-knife-hit',
    sessionObjectives: [
      'Land a perfect centre strike',
      'Clear a level without a miss',
      'Pass speed tier five',
    ],
    controlHints: [
      'Tap to throw at the target',
      'Wait for the rotation to face you before releasing',
    ],
    aiBriefing:
      'A timing thrower: hit the blade at the slow point of its arc rather than aiming at the target centre. Patience is the whole skill curve.',
    name: 'Knife Hit',
    url: 'https://www.crazygames.com/embed/knife-hit',
    description:
      'Rhythm-based knife throwing: flick blades into the rotating log without clashing, break apples for bonuses, and face boss logs every fifth stage.',
    genre: 'Arcade',
    rating: 4.4,
    playersOnline: 8500,
    availability: 'Online',
    tags: ['Arcade', 'Timing', 'Precision', 'CrazyGames'],
    badgeIds: ['modern'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/knife-hit',
      approvedExternalUrl: 'https://www.crazygames.com/embed/knife-hit',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Blade Rhythm', accentStart: '#fda4af', accentEnd: '#881337' },
  },
  {
    id: 'cg-zombie-derby',
    sessionObjectives: [
      'Survive three waves',
      'Hold first place while shooting',
      'Upgrade a vehicle weapon',
    ],
    controlHints: [
      'WASD to drive, mouse to aim and fire',
      'Ram the horde when you run dry',
    ],
    aiBriefing:
      'Vehicular zombie survival: keep circling. A stationary car is a coffin — momentum is your only real defence in the later waves.',
    name: 'Zombie Derby',
    url: 'https://www.crazygames.com/embed/zombie-derby',
    description:
      'Muscle cars versus the undead horde: nitro-fueled distance runs, mowing down walkers, and garage upgrades between apocalyptic sprints.',
    genre: 'Racing',
    rating: 4.3,
    playersOnline: 7500,
    availability: 'Online',
    tags: ['Racing', 'Zombies', 'Action', 'Upgrade', 'CrazyGames'],
    badgeIds: ['modern'],
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/zombie-derby',
      approvedExternalUrl: 'https://www.crazygames.com/embed/zombie-derby',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Undead Horsepower', accentStart: '#4ade80', accentEnd: '#14532d' },
  },

  // ── Multiplayer, co-op & 2-player wave — verified inline cabinets ──
  {
    id: 'cg-tank-trouble',
    sessionObjectives: [
      'Outmanoeuvre a rival tank on one screen',
      'Win a round with a ricochet',
      'Take a round without being hit',
    ],
    controlHints: [
      'Player 1: WASD + Space — Player 2: arrows + Enter',
      'Shells bounce off walls — always fire for the bank',
    ],
    aiBriefing:
      'One-screen tank duels where the maze is the real opponent. Hold an angle and bank shells off the corner; flat shots are free dodges.',
    name: 'Tank Trouble',
    url: 'https://www.crazygames.com/embed/tank-trouble',
    description:
      'The legendary 2-3 player couch duel: bouncing bullets, maze walls, and one-hit kills — outmaneuver friends in chaotic tank battles.',
    genre: 'Action',
    rating: 4.6,
    playersOnline: 16000,
    availability: 'Online',
    tags: ['Action', 'Multiplayer', 'PvP', 'Local', 'Party', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/tank-trouble',
      approvedExternalUrl: 'https://www.crazygames.com/embed/tank-trouble',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Couch Duel', accentStart: '#4ade80', accentEnd: '#14532d' },
  },
  {
    id: 'cg-gun-mayhem-2',
    sessionObjectives: [
      'Control the arena with a full loadout',
      'Win a round without losing a life',
      'Score a double elimination with one explosive',
    ],
    controlHints: [
      'Pick up weapon crates to upgrade your kit',
      'Double-jump out of a corner instead of fighting uphill',
    ],
    aiBriefing:
      'Couch platform shooter. Whoever owns the weapon crates owns the round — rotate to pickups before chasing the knock-out.',
    name: 'Gun Mayhem 2',
    url: 'https://www.crazygames.com/embed/gun-mayhem-2',
    description:
      'Explosive 2-4 player platform fighter: double jumps, wild weapon drops, and ring-outs across destructible arenas with friends on one keyboard.',
    genre: 'Action',
    rating: 4.6,
    playersOnline: 14000,
    availability: 'Online',
    tags: ['Action', 'Multiplayer', 'PvP', 'Local', 'Platformer', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/gun-mayhem-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/gun-mayhem-2',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Arena Brawler', accentStart: '#fb923c', accentEnd: '#7c2d12' },
  },
  {
    id: 'cg-bomb-it-7',
    sessionObjectives: [
      'Trap a rival with a bomb',
      'Clear a board without taking a hit',
      'Win a three-round set',
    ],
    controlHints: [
      'Movement and bomb keys are shown per player at the start',
      'Place two bombs to seal a corner escape',
    ],
    aiBriefing:
      'Bomberman rules with a couch rival. Cut off the escape squares before you commit to a kill box, and never corner yourself in the same lane.',
    name: 'Bomb It 7',
    url: 'https://www.crazygames.com/embed/bomb-it-7',
    description:
      'Bomberman-style blowouts for up to 4 players: trap rivals in blast corridors, grab power-ups, and rule the maze in local versus or co-op story mode.',
    genre: 'Arcade',
    rating: 4.5,
    playersOnline: 11000,
    availability: 'Online',
    tags: ['Arcade', 'Multiplayer', 'PvP', 'Local', 'Party', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bomb-it-7',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bomb-it-7',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Local Co-op'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Blast Party', accentStart: '#facc15', accentEnd: '#854d0e' },
  },
  {
    id: 'cg-soccer-physics',
    sessionObjectives: [
      'Win a two-player physics football match',
      'Score with a bicycle kick',
      'Keep a clean sheet',
    ],
    controlHints: [
      'Each player has a jump and a kick key',
      'Lean into the ball before jumping to head it',
    ],
    aiBriefing:
      'Physics football chaos. Aim your body rather than the ball — a leaning header beats a flat kick every time.',
    name: 'Soccer Physics',
    url: 'https://www.crazygames.com/embed/soccer-physics',
    description:
      'Two-player ragdoll football mayhem: flailing kicks, impossible headers, and hilarious own goals in lightning-fast one-button matches.',
    genre: 'Sports',
    rating: 4.4,
    playersOnline: 10000,
    availability: 'Online',
    tags: ['Sports', 'Football', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/soccer-physics',
      approvedExternalUrl: 'https://www.crazygames.com/embed/soccer-physics',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Ragdoll Kickoff', accentStart: '#34d399', accentEnd: '#065f46' },
  },
  {
    id: 'cg-basketbros',
    sessionObjectives: [
      'Win a two-player arcade hoops match',
      'Land a slam dunk',
      'Hit a three-pointer',
    ],
    controlHints: [
      'Jump and shoot keys are shown per player',
      'Build momentum with a running start before you release',
    ],
    aiBriefing:
      'Two-on-two arcade hoops. Keep moving — a standing shot almost never falls, and a running release adds the arc you need.',
    name: 'BasketBros',
    url: 'https://www.crazygames.com/embed/basketbros',
    description:
      'Two-player arcade hoops: ridiculous dunks, dirty blocks, and buzzer-beaters in fast one-on-one basketball duels on one keyboard.',
    genre: 'Sports',
    rating: 4.5,
    playersOnline: 9500,
    availability: 'Online',
    tags: ['Sports', 'Basketball', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/basketbros',
      approvedExternalUrl: 'https://www.crazygames.com/embed/basketbros',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Hoop Duel', accentStart: '#fb923c', accentEnd: '#9a3412' },
  },
  {
    id: 'cg-rooftop-snipers-2',
    sessionObjectives: [
      'Knock a rival off the rooftop',
      'Win a best-of duel series',
      'Land a shot mid-jump',
    ],
    controlHints: [
      'One key jumps, one key fires',
      'Shoot the instant you touch down, when the sway is smallest',
    ],
    aiBriefing:
      'Wobble-physics duels. Fire on landing frames — the sway is at its minimum and the recoil still knocks your rival off the ledge.',
    name: 'Rooftop Snipers 2',
    url: 'https://www.crazygames.com/embed/rooftop-snipers-2',
    description:
      'The dueling sequel: wobble across rooftops, time your shots, and knock your rival off the ledge in tense two-player sniper showdowns.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Shooting', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/rooftop-snipers-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/rooftop-snipers-2',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Rooftop Rivalry', accentStart: '#94a3b8', accentEnd: '#0f172a' },
  },
  {
    id: 'cg-money-movers',
    sessionObjectives: [
      'Smuggle one money bag out',
      'Clear a floor without tripping the alarm',
      'Escape with both brothers alive',
    ],
    controlHints: [
      'Player 1: arrows — Player 2: WASD',
      'One brother holds a switch while the other advances',
    ],
    aiBriefing:
      'Designated-switch co-op: if a door is open, your partner is holding it. Never both advance — the heist fails when nobody is on the lever.',
    name: 'Money Movers',
    url: 'https://www.crazygames.com/embed/money-movers',
    description:
      'Two-player co-op heist platforming: swap between the brothers, trigger switches for each other, dodge guards, and smuggle the loot out together.',
    genre: 'Adventure',
    rating: 4.5,
    playersOnline: 9000,
    availability: 'Online',
    tags: ['Adventure', 'Puzzle', 'Platformer', 'Co-op', 'Multiplayer', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/money-movers',
      approvedExternalUrl: 'https://www.crazygames.com/embed/money-movers',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Co-op', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Heist Duo', accentStart: '#4ade80', accentEnd: '#166534' },
  },
  {
    id: 'cg-wrestle-jump',
    sessionObjectives: [
      'Win a first-to-five bout',
      'Land a slam',
      'Come back from match point down',
    ],
    controlHints: [
      'One lunge key per player',
      'Press as you land for a stronger flip',
    ],
    aiBriefing:
      'One-button wrestling. The timing of your lunge beats the direction — hit the key on the bounce, not before it.',
    name: 'Wrestle Jump',
    url: 'https://www.crazygames.com/embed/wrestle-jump',
    description:
      'Two-player wrestling flips: time your lunges, snap your opponent to the mat, and defend your crown in rapid-fire one-button bouts.',
    genre: 'Sports',
    rating: 4.4,
    playersOnline: 7000,
    availability: 'Online',
    tags: ['Sports', 'Fighting', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/wrestle-jump',
      approvedExternalUrl: 'https://www.crazygames.com/embed/wrestle-jump',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Ring Rumble', accentStart: '#f87171', accentEnd: '#7f1d1d' },
  },
  {
    id: 'cg-ping-pong-chaos',
    sessionObjectives: [
      'Win a table tennis match',
      'Score with a spin serve',
      'Take a sudden-death rally',
    ],
    controlHints: [
      'Paddle keys plus the vertical keys aim the return',
      'Moving while you swing changes the ball angle',
    ],
    aiBriefing:
      'Chaotic table tennis. Meet the ball early and let the wobble add spin — late swings send it wide every time.',
    name: 'Ping Pong Chaos',
    url: 'https://www.crazygames.com/embed/ping-pong-chaos',
    description:
      'Two-player table tennis gone sideways: wobbling paddles, spin shots, and sudden-death rallies in frantic head-to-head matches.',
    genre: 'Sports',
    rating: 4.3,
    playersOnline: 6500,
    availability: 'Online',
    tags: ['Sports', 'Multiplayer', 'PvP', 'Local', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/ping-pong-chaos',
      approvedExternalUrl: 'https://www.crazygames.com/embed/ping-pong-chaos',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Table Tennis Turmoil', accentStart: '#c084fc', accentEnd: '#581c87' },
  },
  {
    id: 'cg-bubble-trouble',
    sessionObjectives: [
      'Clear a full bubble field',
      'Split a bubble four times',
      'Survive a two-player run',
    ],
    controlHints: [
      'Fire the harpoon with your player shoot key',
      'Stand underneath a bubble and pop it upward',
    ],
    aiBriefing:
      'Split-screen arcade classic. Pop bubbles as high as possible so the fragments spread away from you instead of raining into your lane.',
    name: 'Bubble Trouble',
    url: 'https://www.crazygames.com/embed/bubble-trouble',
    description:
      'The split-screen classic: pop bouncing bubbles into smaller fragments with harpoon shots — solo or two-player co-op survival.',
    genre: 'Arcade',
    rating: 4.4,
    playersOnline: 8500,
    availability: 'Online',
    tags: ['Arcade', 'Multiplayer', 'Co-op', 'Local', 'Classic', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'P2P',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bubble-trouble',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bubble-trouble',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Co-op', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Split-Screen Classic', accentStart: '#67e8f9', accentEnd: '#155e75' },
  },
  {
    id: 'cg-bonk-io',
    sessionObjectives: [
      'Win a last-one-standing round',
      'Knock a rival off the edge',
      'Play a custom map round',
    ],
    controlHints: [
      'WASD to move, mouse for the boost direction',
      'Grab the map power-ups early',
    ],
    aiBriefing:
      'Physics brawler with live lobbies. Momentum is a weapon: approach with a run instead of standing still, and use the arena edges as your win condition.',
    name: 'Bonk.io',
    url: 'https://www.crazygames.com/embed/bonkio',
    description:
      'Multiplayer physics arena: bump rivals off ledges, craft custom maps, and out-momentum opponents in last-circle-of-hell showdowns.',
    genre: 'Casual',
    rating: 4.5,
    playersOnline: 13000,
    availability: 'Online',
    tags: ['Casual', 'Multiplayer', 'PvP', 'Physics', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bonkio',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bonkio',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Physics Arena', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  },
  {
    id: 'cg-territorial-io',
    sessionObjectives: [
      'Finish a match inside the top three',
      'Break an alliance by out-scaling it',
      'Survive a full-length map',
    ],
    controlHints: [
      'Click and drag to expand your border',
      'Attack with numbers — repeated taps on one square waste troops',
    ],
    aiBriefing:
      'Real-time map strategy. Expansion rate beats early aggression: greedy borders get punished in the late game, so grow toward open ground first.',
    name: 'Territorial.io',
    url: 'https://www.crazygames.com/embed/territorial-io',
    description:
      'Real-time strategy on a live world map: expand borders, forge and break alliances, and out-scale hundreds of simultaneous opponents.',
    genre: 'Strategy',
    rating: 4.4,
    playersOnline: 15000,
    availability: 'Online',
    tags: ['Strategy', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/territorial-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/territorial-io',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Map Domination', accentStart: '#a3e635', accentEnd: '#365314' },
  },
  {
    id: 'cg-voxiom-io',
    sessionObjectives: [
      'Reach the final storm circle',
      'Mine and build cover under fire',
      'Win a build-fight duel',
    ],
    controlHints: [
      'Mine blocks with one key, place them with the build key',
      'Take high ground before the storm closes',
    ],
    aiBriefing:
      'Voxel battle royale. Grab blocks early — cover decides late-game fights more than aim does, and the storm punishes anyone still looting.',
    name: 'Voxiom.io',
    url: 'https://www.crazygames.com/embed/voxiom-io',
    description:
      'Voxel battle royale: mine, build cover, swap weapons, and survive shrinking storms against a full lobby of live players.',
    genre: 'Shooting',
    rating: 4.4,
    playersOnline: 11000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Battle Royale', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/voxiom-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/voxiom-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Voxel Royale', accentStart: '#4ade80', accentEnd: '#14532d' },
  },
  {
    id: 'cg-madalin-cars-multiplayer',
    sessionObjectives: [
      'Beat a live lobby race',
      'Chain a drift around a roundabout',
      'Land a jump across the highway',
    ],
    controlHints: [
      'WASD to drive, Space for the handbrake',
      'Handbrake into a corner to hold a drift',
    ],
    aiBriefing:
      'Open-world supercar lobbies. Drift the roundabouts to keep speed, and stay off the wrong side of the highway — oncoming traffic ends runs faster than rivals do.',
    name: 'Madalin Cars Multiplayer',
    url: 'https://www.crazygames.com/embed/madalin-cars-multiplayer',
    description:
      'Open-world supercar playground with live lobbies: pick from dozens of hypercars, drift runways, and cruise or race friends in real time.',
    genre: 'Racing',
    rating: 4.6,
    playersOnline: 18000,
    availability: 'Online',
    tags: ['Racing', 'Multiplayer', 'Open World', 'Drifting', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/madalin-cars-multiplayer',
      approvedExternalUrl: 'https://www.crazygames.com/embed/madalin-cars-multiplayer',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Online Versus', 'Online Co-op'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Supercar Lobby', accentStart: '#f87171', accentEnd: '#450a0a' },
  },
  {
    id: 'cg-kart-wars',
    sessionObjectives: [
      'Win an arena round',
      'Take out a rival with a rocket',
      'Hold first place for a full lap',
    ],
    controlHints: [
      'Drift key to charge a boost',
      'Keep a shield pickup for the closing lap',
    ],
    aiBriefing:
      'Combat karting: spend offensive items early and save a defensive pickup for the final lap, when everyone else is also armed.',
    name: 'Kart Wars',
    url: 'https://www.crazygames.com/embed/kart-wars',
    description:
      'Multiplayer kart combat: rockets, shields, and drifting mayhem across arenas filled with live rival drivers.',
    genre: 'Racing',
    rating: 4.3,
    playersOnline: 8000,
    availability: 'Online',
    tags: ['Racing', 'Multiplayer', 'PvP', 'Combat', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/kart-wars',
      approvedExternalUrl: 'https://www.crazygames.com/embed/kart-wars',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Kart Combat', accentStart: '#fbbf24', accentEnd: '#92400e' },
  },
  {
    id: 'cg-winter-clash-3d',
    sessionObjectives: [
      'Win a team capture round',
      'Hold a point solo for thirty seconds',
      'Top the lobby scoreboard',
    ],
    controlHints: [
      'WASD to move, mouse to fire, a reload key between fights',
      'Use the snow cover to flank an occupied point',
    ],
    aiBriefing:
      'Team capture shooter. Push the point as a pair — solo approaches melt against a live team, so wait for a teammate before you commit.',
    name: 'Winter Clash 3D',
    url: 'https://www.crazygames.com/embed/winter-clash-3d',
    description:
      'Team-based holiday shooter: Santa-armed squad battles, capture-point objectives, and snow-covered arenas against live teams.',
    genre: 'Shooting',
    rating: 4.4,
    playersOnline: 9000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/winter-clash-3d',
      approvedExternalUrl: 'https://www.crazygames.com/embed/winter-clash-3d',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Snow Squad', accentStart: '#e0f2fe', accentEnd: '#0c4a6e' },
  },
  {
    id: 'cg-betrayal-io',
    sessionObjectives: [
      'Finish a full task set',
      'Survive a round as the traitor',
      'Vote out the impostor',
    ],
    controlHints: [
      'Use the task list to stay grouped',
      'Report positions over chat rather than accusing alone',
    ],
    aiBriefing:
      'Social deduction with live lobbies. Keep a mental log of who was seen where — behaviour patterns expose a traitor far faster than typing does.',
    name: 'Betrayal.io',
    url: 'https://www.crazygames.com/embed/betrayal-io',
    description:
      'Social deduction with live lobbies: complete tasks, spot the impostor, and survive betrayals in Among Us-style crew warfare.',
    genre: 'Casual',
    rating: 4.3,
    playersOnline: 8500,
    availability: 'Online',
    tags: ['Casual', 'Multiplayer', 'Social', 'Deduction', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/betrayal-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/betrayal-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Social Deduction', accentStart: '#f87171', accentEnd: '#1e293b' },
  },
  {
    id: 'cg-buildnow-gg',
    sessionObjectives: [
      'Win a build-fight duel',
      'Land a sniper shot from your own ramp',
      'Out-build a rival for the high ground',
    ],
    controlHints: [
      'Build key places walls and ramps, edit with the same key',
      'Always keep a wall between you and the shot',
    ],
    aiBriefing:
      'Build-fight shooter: cover first, aim second. A faster ramp wins against a faster reflex, so build before you peek.',
    name: 'BuildNow GG',
    url: 'https://www.crazygames.com/embed/buildnow-gg',
    description:
      'Build-and-battle shooter: wall up, edit, and outgun rivals in third-person PvP inspired by battle-royale construction duels.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 13500,
    availability: 'Online',
    tags: ['Shooting', 'Multiplayer', 'PvP', 'Building', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/buildnow-gg',
      approvedExternalUrl: 'https://www.crazygames.com/embed/buildnow-gg',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Build & Battle', accentStart: '#c084fc', accentEnd: '#581c87' },
  },
  {
    id: 'cg-drednot-io',
    sessionObjectives: [
      'Crew an airship through a full battle',
      'Board an enemy ship and take a system offline',
      'Destroy a rival turret',
    ],
    controlHints: [
      'WASD to move, click to interact or board',
      'Keep the boiler fuelled — an idle ship is a floating target',
    ],
    aiBriefing:
      'Crew co-op airship warfare where roles matter: someone has to hold the turret while others board, or you lose the exchange.',
    name: 'Drednot.io',
    url: 'https://www.crazygames.com/embed/drednot-io',
    description:
      'Multiplayer airship warfare: crew your flying fortress, load turrets, board enemies, and duel other ships in sky-high team battles.',
    genre: 'Action',
    rating: 4.4,
    playersOnline: 7000,
    availability: 'Online',
    tags: ['Action', 'Multiplayer', 'PvP', 'Teamwork', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/drednot-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/drednot-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus', 'Online Co-op'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Airship Armada', accentStart: '#94a3b8', accentEnd: '#1e293b' },
  },
  {
    id: 'cg-kour-io',
    sessionObjectives: [
      'Win a team deathmatch',
      'Build a kill streak',
      'Top the lobby scoreboard',
    ],
    controlHints: [
      'WASD to move, mouse to aim, click to fire',
      'Reload behind cover and rotate after a pick',
    ],
    aiBriefing:
      'Polished lobby FPS. Hold a lane with a teammate and rotate only after a clean pick — wandering mid-fight is how streaks end.',
    name: 'Kour.io',
    url: 'https://www.crazygames.com/embed/kour-io',
    description:
      'Slick browser FPS with ranked energy: crisp movement, weapon loadouts, and instant team deathmatch lobbies against live players.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 14500,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'Server',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/kour-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/kour-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Lobby FPS', accentStart: '#fb923c', accentEnd: '#7c2d12' },
  },

  // ── Second verified wave: couch co-op, party, and iconic classics ──
  {
    id: 'cg-bad-ice-cream-4',
    name: 'Bad Ice Cream 4',
    url: 'https://www.crazygames.com/embed/bad-ice-cream-4',
    description:
      'Co-op arcade maze survival: smash ice blocks, bait the fruit-hungry monsters, and guide two flavour heroes out together across frozen stages.',
    genre: 'Arcade',
    rating: 4.6,
    playersOnline: 14000,
    availability: 'Online',
    tags: ['Arcade', 'Multiplayer', 'Co-op', 'Local', 'Reflex', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    multiplayerType: 'P2P',
    sessionObjectives: [
      'Collect every fruit on the stage',
      'Shield your partner from the roaming monsters',
      'Chain ice-wall breaks to open safe lanes',
    ],
    controlHints: [
      'Player 1: arrow keys — Player 2: WASD',
      'Hold the action key to build an ice wall',
    ],
    aiBriefing:
      'Split-screen co-op tuned for one keyboard. Communicate wall placements: a blocked lane saves your partner and traps the monsters in the same move.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/bad-ice-cream-4',
      approvedExternalUrl: 'https://www.crazygames.com/embed/bad-ice-cream-4',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Local Co-op', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Frozen Co-op', accentStart: '#7dd3fc', accentEnd: '#1e3a8a' },
  },
  {
    id: 'cg-raft-wars',
    name: 'Raft Wars',
    url: 'https://www.crazygames.com/embed/raft-wars',
    description:
      'The turn-based artillery classic: lob projectiles across the water, bank shots off the shoreline, and blow your rival off their raft.',
    genre: 'Casual',
    rating: 4.5,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Casual', 'Multiplayer', 'PvP', 'Local', 'Classic', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'P2P',
    sessionObjectives: [
      'Sink the opposing raft before yours takes water',
      'Land a bank shot off the shoreline',
      'Spend earned coins on heavier ammunition',
    ],
    controlHints: [
      'Hold and release to set projectile power and angle',
      'Pass the controls after each shot in two-player mode',
    ],
    aiBriefing:
      'Physics artillery with a two-player head-to-head loop. Wind up the shot, watch the arc, and remember the terrain — the best players bank shots rather than firing flat.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/raft-wars',
      approvedExternalUrl: 'https://www.crazygames.com/embed/raft-wars',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Artillery Classic', accentStart: '#fbbf24', accentEnd: '#78350f' },
  },
  {
    id: 'cg-raft-wars-2',
    name: 'Raft Wars 2',
    url: 'https://www.crazygames.com/embed/raft-wars-2',
    description:
      'The bigger artillery sequel: new islands, tougher rafts, heavier weapons, and the same turn-based duel loop with a friend.',
    genre: 'Casual',
    rating: 4.5,
    playersOnline: 9500,
    availability: 'Online',
    tags: ['Casual', 'Multiplayer', 'PvP', 'Local', 'Classic', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'P2P',
    sessionObjectives: [
      'Clear all opponent rafts on the island chain',
      'Upgrade to the late-tier ammunition',
      'Finish the duel without losing a raft',
    ],
    controlHints: [
      'Drag to aim, release to fire',
      'Use the shop between waves to re-arm',
    ],
    aiBriefing:
      'A longer artillery campaign with a two-player duel mode. Terrain changes every island, so re-read the angle before you commit a shot.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/raft-wars-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/raft-wars-2',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Local Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Artillery Sequel', accentStart: '#fdba74', accentEnd: '#7c2d12' },
  },
  {
    id: 'cg-8-ball-billiards-classic',
    name: '8 Ball Billiards Classic',
    url: 'https://www.crazygames.com/embed/8-ball-billiards-classic',
    description:
      'Full-rules pool: call your shots, play solo against the house AI or challenge a friend in a proper two-player frame of eight-ball.',
    genre: 'Sports',
    rating: 4.6,
    playersOnline: 16000,
    availability: 'Online',
    tags: ['Sports', 'Multiplayer', 'PvP', 'Local', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'featured'],
    multiplayerType: 'P2P',
    sessionObjectives: [
      'Pot your full suit before the opponent clears theirs',
      'Call the pocket on the eight-ball finish',
      'Avoid the scratch — it hands over the table',
    ],
    controlHints: [
      'Drag from the cue ball to set power and spin',
      'Tap the cue-ball edge to add English',
    ],
    aiBriefing:
      'Real eight-ball rules with a clean two-player hand-off. Play safe when you have no percentage shot — giving up a foul beats leaving a straight-in look.',
    launchConfig: {
      approvedEmbedUrl:
        'https://www.crazygames.com/embed/8-ball-billiards-classic',
      approvedExternalUrl:
        'https://www.crazygames.com/embed/8-ball-billiards-classic',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Local Versus', 'Online Versus', 'Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Table Duel', accentStart: '#34d399', accentEnd: '#064e3b' },
  },
  {
    id: 'cg-haxball',
    name: 'Haxball',
    url: 'https://www.crazygames.com/embed/haxball',
    description:
      'The legendary browser football sim: join live rooms, hold your position, and pass, press, and volley in fast 2v2 to 4v4 matches.',
    genre: 'Sports',
    rating: 4.6,
    playersOnline: 17000,
    availability: 'Online',
    tags: ['Sports', 'Multiplayer', 'PvP', 'Teamwork', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending', 'featured'],
    multiplayerType: 'Server',
    sessionObjectives: [
      'Join a live room and cover your assigned lane',
      'Score from a one-touch pass combination',
      'Keep a clean sheet through a full match',
    ],
    controlHints: [
      'Arrow keys to move, X to kick',
      'Hold the kick key for a stronger strike',
    ],
    aiBriefing:
      'Online football with real teammates, so positioning beats ball-chasing. Hold shape, let the ball come to you, and use the wall bounce to reset the angle.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/haxball',
      approvedExternalUrl: 'https://www.crazygames.com/embed/haxball',
      embedMode: 'inline',
      controls: ['Keyboard'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Live Football', accentStart: '#a3e635', accentEnd: '#365314' },
  },
  {
    id: 'cg-kirka-io',
    name: 'Kirka.io',
    url: 'https://www.crazygames.com/embed/kirka-io',
    description:
      'Voxel FPS with teams, solo deathmatch, and parkour playlists — pick a loadout, learn the map lanes, and hold the objective with your squad.',
    genre: 'Shooting',
    rating: 4.5,
    playersOnline: 18000,
    availability: 'Online',
    tags: ['Shooting', 'FPS', 'Multiplayer', 'PvP', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'Server',
    sessionObjectives: [
      'Win a team match with your squad',
      'Post a positive kill-to-death spread',
      'Clear a parkour route without falling out',
    ],
    controlHints: [
      'WASD to move, mouse to aim, click to fire',
      'Shift to sprint into a jump for lane peeks',
    ],
    aiBriefing:
      'Fast voxel gunplay with real lobbies. Crosshair placement and lane awareness decide fights far more than loadout choice — pre-aim corners before you swing them.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/kirka-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/kirka-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Voxel FPS', accentStart: '#c084fc', accentEnd: '#4c1d95' },
  },
  {
    id: 'cg-copter-io',
    name: 'Copter.io',
    url: 'https://www.crazygames.com/embed/copter-io',
    description:
      'Helicopter arena warfare: out-fly rival pilots, land rockets on moving targets, and climb the live leaderboard before the sky fills up.',
    genre: 'Action',
    rating: 4.4,
    playersOnline: 9000,
    availability: 'Online',
    tags: ['Action', 'Multiplayer', 'PvP', 'Arena', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    sessionObjectives: [
      'Reach the top of a live leaderboard round',
      'Score a hit on a strafing rival',
      'Survive a full round without crashing',
    ],
    controlHints: [
      'A/D to strafe, W/S to adjust altitude',
      'Left click fires, space boosts',
    ],
    aiBriefing:
      'Air-to-air arena combat against live pilots. Momentum is your real enemy: feather the lift instead of holding it, or you drift into someone\u2019s firing line.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/copter-io',
      approvedExternalUrl: 'https://www.crazygames.com/embed/copter-io',
      embedMode: 'inline',
      controls: ['Keyboard', 'Mouse'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Air Arena', accentStart: '#38bdf8', accentEnd: '#0c4a6e' },
  },
  {
    id: 'cg-ludo-online',
    name: 'Ludo Online',
    url: 'https://www.crazygames.com/embed/ludo-online',
    description:
      'Four-player board night: roll, race, and knock rivals back to base in live online Ludo tables with quick-match lobbies.',
    genre: 'Casual',
    rating: 4.4,
    playersOnline: 10000,
    availability: 'Online',
    tags: ['Casual', 'Multiplayer', 'Party', 'Board', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'Server',
    sessionObjectives: [
      'Bring all four tokens home before the table does',
      'Send a rival token back to base',
      'Win a match without losing a token',
    ],
    controlHints: [
      'Tap the die to roll, then pick a token',
      'Sixes grant an extra roll — bank them',
    ],
    aiBriefing:
      'Classic Ludo against live tables. Protect a stacked pair on open lanes and keep one token deep as a comeback runner instead of racing everything at once.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/ludo-online',
      approvedExternalUrl: 'https://www.crazygames.com/embed/ludo-online',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Online Versus'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Board Night', accentStart: '#fb7185', accentEnd: '#881337' },
  },
  {
    id: 'cg-slice-master',
    name: 'Slice Master',
    url: 'https://www.crazygames.com/embed/slice-master',
    description:
      'One-button precision slicing: keep the blade moving, thread every gap, and chase the high score without clipping what you are not supposed to cut.',
    genre: 'Casual',
    rating: 4.5,
    playersOnline: 11000,
    availability: 'Online',
    tags: ['Casual', 'Arcade', 'Reflex', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Cut every permitted target in one clean pass',
      'Reach the next speed tier without a miss',
      'Bank a new personal high score',
    ],
    controlHints: [
      'Hold to keep the blade active',
      'Small taps beat wide sweeps on tight gaps',
    ],
    aiBriefing:
      'Precision over speed. Trace the safe path once with your eyes, then commit — panicked sweeping is what clips off-limit objects.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/slice-master',
      approvedExternalUrl: 'https://www.crazygames.com/embed/slice-master',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Blade Precision', accentStart: '#e2e8f0', accentEnd: '#334155' },
  },
  {
    id: 'cg-getting-over-it',
    name: 'Getting Over It',
    url: 'https://www.crazygames.com/embed/getting-over-it',
    description:
      'The infamous hammer climb: drag your way up a mountain of clutter, where one slip costs an entire run and every metre is earned.',
    genre: 'Casual',
    rating: 4.5,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Casual', 'Arcade', 'Physics', 'Classic', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'staff-pick'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Clear the first furniture wall',
      'Reach the mountain ridge checkpoint',
      'Finish a climb without a full reset',
    ],
    controlHints: [
      'Mouse moves the hammer, drag to swing',
      'Small corrections beat big swings near ledges',
    ],
    aiBriefing:
      'A patience test with no checkpoints to lean on. Set up each push before committing, and treat a near-miss as progress — this cabinet rewards calm retries.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/getting-over-it',
      approvedExternalUrl: 'https://www.crazygames.com/embed/getting-over-it',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Hammer Climb', accentStart: '#fcd34d', accentEnd: '#78350f' },
  },
  {
    id: 'cg-impossible-quiz',
    name: 'The Impossible Quiz',
    url: 'https://www.crazygames.com/embed/the-impossible-quiz',
    description:
      'The cult trick-question gauntlet: lateral thinking, puns, and outright traps across 110 questions where the obvious answer is always wrong.',
    genre: 'Puzzle',
    rating: 4.5,
    playersOnline: 13000,
    availability: 'Online',
    tags: ['Puzzle', 'Trivia', 'Classic', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Clear the first ten trick questions',
      'Beat a question without using a skip',
      'Reach the mid-run checkpoint',
    ],
    controlHints: [
      'Click an answer, or type where the question asks',
      'Read every word — the wording is the puzzle',
    ],
    aiBriefing:
      'A quiz built to punish assumptions. Slow down, take the question literally, and remember that skips are a resource you can only spend seven times.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/the-impossible-quiz',
      approvedExternalUrl: 'https://www.crazygames.com/embed/the-impossible-quiz',
      embedMode: 'inline',
      controls: ['Mouse', 'Keyboard'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Trick Quiz', accentStart: '#fde047', accentEnd: '#a16207' },
  },
  {
    id: 'cg-five-nights-at-freddys',
    name: "Five Nights at Freddy's",
    url: 'https://www.crazygames.com/embed/five-nights-at-freddys',
    description:
      'The original survival horror: hold the night shift, ration your power, and track the animatronics on cameras until 6 AM.',
    genre: 'Horror',
    rating: 4.6,
    playersOnline: 15000,
    availability: 'Online',
    tags: ['Horror', 'Survival', 'Strategy', 'Classic', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'trending'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Survive the first night without a breach',
      'Finish a night with power to spare',
      'Reach 6 AM on night three',
    ],
    controlHints: [
      'Move the cursor to the screen edge to open cameras',
      'Close the doors only when a hallway is occupied',
    ],
    aiBriefing:
      'A resource-management horror loop, not a reflex test. Every door light and camera flick costs power — check less often, and trust the audio tells.',
    launchConfig: {
      approvedEmbedUrl:
        'https://www.crazygames.com/embed/five-nights-at-freddys',
      approvedExternalUrl:
        'https://www.crazygames.com/embed/five-nights-at-freddys',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Night Shift', accentStart: '#f87171', accentEnd: '#111827' },
  },
  {
    id: 'cg-stick-war',
    name: 'Stick War',
    url: 'https://www.crazygames.com/embed/stick-war',
    description:
      'The 2009 strategy landmark, now playable in-browser: mine gold, raise an army of stick figures, and out-manoeuvre the Order empire campaign.',
    genre: 'Strategy',
    rating: 4.5,
    playersOnline: 12000,
    availability: 'Online',
    tags: ['Strategy', 'Classic', 'Modern', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Establish a stable gold income',
      'Field a mixed sword, spear, and archer line',
      'Capture an enemy territory',
    ],
    controlHints: [
      'Assign miners first — economy wins the long campaign',
      'Drag-select units to group a push',
    ],
    aiBriefing:
      'Classic economy-first real-time strategy. Never let your miner count flatline: a bigger bank converts straight into a bigger army at the next engagement.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/stick-war',
      approvedExternalUrl: 'https://www.crazygames.com/embed/stick-war',
      embedMode: 'inline',
      controls: ['Mouse'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'RTS Landmark', accentStart: '#94a3b8', accentEnd: '#0f172a' },
  },
  {
    id: 'cg-stick-war-2',
    name: 'Stick War 2',
    url: 'https://www.crazygames.com/embed/stick-war-2',
    description:
      'The bigger campaign sequel: new units, castle sieges, and a wider tech tree for pushing a stick-figure army across the map.',
    genre: 'Strategy',
    rating: 4.4,
    playersOnline: 8500,
    availability: 'Online',
    tags: ['Strategy', 'Classic', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Unlock a siege unit',
      'Break through a fortified castle line',
      'Hold a captured territory for a full wave',
    ],
    controlHints: [
      'Hotkeys queue unit production faster than clicking',
      'Scout before committing to a siege push',
    ],
    aiBriefing:
      'A longer strategy campaign than the original with real siege beats. Build the counter-unit before the push, not after the castle line breaks your first wave.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/stick-war-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/stick-war-2',
      embedMode: 'inline',
      controls: ['Mouse', 'Keyboard'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Siege Sequel', accentStart: '#cbd5e1', accentEnd: '#1e293b' },
  },
  {
    id: 'cg-sugar-sugar',
    name: 'Sugar, Sugar',
    url: 'https://www.crazygames.com/embed/sugar-sugar',
    description:
      'The beloved browser puzzle: draw lines to funnel falling sugar into every cup, then refine your route for a cleaner, faster pour.',
    genre: 'Puzzle',
    rating: 4.6,
    playersOnline: 11000,
    availability: 'Online',
    tags: ['Puzzle', 'Physics', 'Casual', 'Classic', 'CrazyGames'],
    badgeIds: ['modern', 'classic', 'staff-pick'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Fill every cup on the board',
      'Finish a level without wasting sugar',
      'Clear a level using fewer drawn lines',
    ],
    controlHints: [
      'Drag to draw a line, release to drop the sugar',
      'Use the eraser to redraw a bad funnel',
    ],
    aiBriefing:
      'A physics puzzle about routing, not speed. Sketch the whole path before releasing sugar — mid-level redraws usually cost more than a slow, deliberate funnel.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/sugar-sugar',
      approvedExternalUrl: 'https://www.crazygames.com/embed/sugar-sugar',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Pour Puzzle', accentStart: '#fda4af', accentEnd: '#9f1239' },
  },
  {
    id: 'cg-sugar-sugar-2',
    name: 'Sugar, Sugar 2',
    url: 'https://www.crazygames.com/embed/sugar-sugar-2',
    description:
      'The sequel adds colour-sorting: route matching sugar into matching cups and split streams before they mix.',
    genre: 'Puzzle',
    rating: 4.5,
    playersOnline: 8000,
    availability: 'Online',
    tags: ['Puzzle', 'Physics', 'Casual', 'Classic', 'CrazyGames'],
    badgeIds: ['modern', 'classic'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Fill every colour-matched cup',
      'Split a stream without cross-contaminating it',
      'Clear a colour-sorting board first try',
    ],
    controlHints: [
      'Draw ramps to separate colours before they merge',
      'Re-route from the top down, not the bottom up',
    ],
    aiBriefing:
      'Colour routing raises the stakes on the original. Plan the split in the top third of the board first; by the midpoint the streams are already too tangled to redirect.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/sugar-sugar-2',
      approvedExternalUrl: 'https://www.crazygames.com/embed/sugar-sugar-2',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Colour Sort', accentStart: '#f9a8d4', accentEnd: '#9d174d' },
  },
  {
    id: 'cg-sugar-sugar-3',
    name: 'Sugar, Sugar 3',
    url: 'https://www.crazygames.com/embed/sugar-sugar-3',
    description:
      'The most devious routing puzzle in the series: tighter boards, tighter timing, and funnels that punish a single wasted line.',
    genre: 'Puzzle',
    rating: 4.4,
    playersOnline: 7000,
    availability: 'Online',
    tags: ['Puzzle', 'Physics', 'Casual', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Clear an advanced routing board',
      'Solve a level with no wasted sugar',
      'Finish a level using a single continuous line',
    ],
    controlHints: [
      'Zoom the view before drawing tight funnels',
      'Undo early — late redraws cost the whole route',
    ],
    aiBriefing:
      'Precision routing with almost no margin. Draw the final segment first and work backwards to the source; the tight boards are solved from the cup, not the top.',
    launchConfig: {
      approvedEmbedUrl: 'https://www.crazygames.com/embed/sugar-sugar-3',
      approvedExternalUrl: 'https://www.crazygames.com/embed/sugar-sugar-3',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'Tight Routing', accentStart: '#fbcfe8', accentEnd: '#831843' },
  },
  {
    id: 'cg-table-tennis-world-tour',
    name: 'Table Tennis World Tour',
    url: 'https://www.crazygames.com/embed/table-tennis-world-tour',
    description:
      'Tour the globe of table tennis: pick your nation, sharpen spin and placement, and work through a ladder of increasingly sharp opponents.',
    genre: 'Sports',
    rating: 4.4,
    playersOnline: 7500,
    availability: 'Online',
    tags: ['Sports', 'Reflex', 'Modern', 'CrazyGames'],
    badgeIds: ['modern'],
    multiplayerType: 'None',
    sessionObjectives: [
      'Win a best-of match on the world tour',
      'Score with a spin serve',
      'Clear a tour stop without dropping a game',
    ],
    controlHints: [
      'Drag to swing — shorter drags place, longer drags power',
      'Move before the bounce to set your angle',
    ],
    aiBriefing:
      'Placement beats power every round of the tour. Aim at the corners and let the opponent chase; flat, powerful returns get countered as the ladder sharpens.',
    launchConfig: {
      approvedEmbedUrl:
        'https://www.crazygames.com/embed/table-tennis-world-tour',
      approvedExternalUrl:
        'https://www.crazygames.com/embed/table-tennis-world-tour',
      embedMode: 'inline',
      controls: ['Mouse', 'Touch'],
      modes: ['Solo'],
      trustNote:
        'CrazyGames first-party /embed/ endpoint verified 200 with no frame-blocking headers.',
    },
    art: { eyebrow: 'World Tour', accentStart: '#fb923c', accentEnd: '#9a3412' },
  },
];
