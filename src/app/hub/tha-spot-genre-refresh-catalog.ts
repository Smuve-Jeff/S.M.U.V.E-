import { Game } from "./game";

/**
 * Tha Spot next-wave catalogue.
 *
 * This wave replaces the retired Boardgames, Cooking, Dress-Up, Educational,
 * and Puzzle shelves with a deliberately different selection: multiplayer
 * shooters, online co-op, sports, fighting, adventure, open world, RPG,
 * racing, horror, action, and strategy.
 *
 * Every destination below is the title's official publisher or store page and
 * was status-checked before inclusion. These rows launch externally only:
 * opening a publisher page is not a claim that the title can be embedded or
 * redistributed. No game in this wave belongs to a retired genre.
 */
type Multiplayer = "None" | "Server" | "P2P";

interface RefreshRow {
  slug: string;
  name: string;
  url: string;
  genre: string;
  released: string;
  rating: number;
  multiplayer: Multiplayer;
  tags: string;
  description: string;
  objectives: string;
  controls: string;
  briefing: string;
}

const ROWS: RefreshRow[] = [
  // ── Multiplayer / shooters ────────────────────────────────────────────────
  {
    slug: "marvel-rivals",
    name: "Marvel Rivals",
    url: "https://www.marvelrivals.com/",
    genre: "Shooting",
    released: "2024-12-06",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Hero Shooter|Marvel|PC",
    description:
      "Six-versus-six team shooter built around Marvel heroes, destructible arenas, and role-based team-up abilities.",
    objectives:
      "Win a quick match|Try three different heroes|Complete a team-up ability",
    controls:
      "WASD to move; mouse to aim and fire|Q, E, and Shift for hero abilities|Tab for the scoreboard",
    briefing:
      "Marvel Rivals is won through hero synergy: lock a role, learn one team-up, and regroup before contesting the objective.",
  },
  {
    slug: "battlefield-6",
    name: "Battlefield 6",
    url: "https://www.ea.com/games/battlefield/battlefield-6",
    genre: "Shooting",
    released: "2025-10-10",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Warfare|PC",
    description:
      "Large-scale modern warfare with destructible maps, class-based squads, vehicles, and combined-arms objectives.",
    objectives:
      "Capture a contested point|Finish a match with your squad|Destroy a vehicle with engineer gear",
    controls:
      "WASD to move; mouse to aim and fire|Number keys for weapons and gadgets|Q to spot enemies",
    briefing:
      "Battlefield rewards squad play: spawn on your leader, hold cover between pushes, and use vehicles to break a stalled lane.",
  },
  {
    slug: "the-finals",
    name: "The Finals",
    url: "https://www.reachthefinals.com/",
    genre: "Shooting",
    released: "2023-12-07",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Destruction|PC",
    description:
      "Fast team shooter built around fully destructible arenas, cashout objectives, and light, medium, and heavy builds.",
    objectives:
      "Win a cashout round|Destroy a floor to open a route|Finish a match with a full squad",
    controls:
      "WASD to move; mouse to aim and fire|Q and E for build gadgets|F to use the vault and cashout",
    briefing:
      "The Finals is about map control, not raw kills: cut a new route with destruction, steal a cashout late, and protect the deposit.",
  },
  {
    slug: "delta-force",
    name: "Delta Force",
    url: "https://www.playdeltaforce.com/",
    genre: "Shooting",
    released: "2024-12-05",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Extraction|PC",
    description:
      "Modern tactical shooter with large-scale warfare, extraction raids, class gadgets, and vehicle combat.",
    objectives:
      "Extract with loot in a raid|Complete a warfare objective|Unlock a class gadget",
    controls:
      "WASD to move; mouse to aim and fire|Tab to inspect your raid inventory|G to use a gadget",
    briefing:
      "Delta Force asks you to choose a mode and commit: in raids, know your extraction before you loot; in warfare, play the objective with your squad.",
  },
  {
    slug: "overwatch-2",
    name: "Overwatch 2",
    url: "https://overwatch.blizzard.com/en-us/",
    genre: "Shooting",
    released: "2022-10-04",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Hero Shooter|Free to Play|PC",
    description:
      "Five-versus-five hero shooter with role queues, objective maps, and a deep roster of tank, damage, and support kits.",
    objectives:
      "Win a role-queue match|Complete a support match|Try a new hero in the practice range",
    controls:
      "WASD to move; mouse to aim and fire|Q for your ultimate|Shift for your movement ability",
    briefing:
      "Overwatch is a cooldown trade game: track the enemy ultimate, use cover while your kit is down, and group before every push.",
  },
  {
    slug: "halo-infinite",
    name: "Halo Infinite",
    url: "https://www.halowaypoint.com/halo-infinite",
    genre: "Shooting",
    released: "2021-12-08",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Sci-Fi|Xbox",
    description:
      "Spartan arena shooter with equipment pickups, vehicle sandbox maps, Big Team Battle, and the Master Chief campaign.",
    objectives:
      "Win an arena slayer match|Capture a stronghold|Try a vehicle in Big Team Battle",
    controls:
      "WASD to move; mouse or stick to aim|Q for equipment|Melee and grenade on their bound keys",
    briefing:
      "Halo Infinite is decided by map control: claim power weapons, save equipment for a fight you choose, and never chase a kill alone.",
  },
  {
    slug: "titanfall-2",
    name: "Titanfall 2",
    url: "https://www.ea.com/games/titanfall/titanfall-2",
    genre: "Shooting",
    released: "2016-10-28",
    rating: 4.7,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Mechs|PC",
    description:
      "Movement-first shooter combining wall-running pilots, grappling hooks, and summonable Titans with a celebrated campaign.",
    objectives:
      "Finish the campaign opening|Call in a Titan|Win a pilot-versus-pilot match",
    controls:
      "WASD to move; Space to jump and wall-run|Q for your tactical; G for a grenade|V to call your Titan",
    briefing:
      "Titanfall 2 is momentum: chain wall-runs into slides, keep height on pilots, and save your Titan until the enemy team commits.",
  },
  {
    slug: "hunt-showdown",
    name: "Hunt: Showdown 1896",
    url: "https://www.huntshowdown.com/",
    genre: "Shooting",
    released: "2024-08-15",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Extraction|Horror|PC",
    description:
      "Extraction shooter set in a gothic bayou, mixing monster hunting, bounty contracts, and tense player-versus-player ambushes.",
    objectives:
      "Ban a boss and extract with the bounty|Survive a gunfight|Extract with a partner",
    controls:
      "WASD to move; mouse to aim and fire|E to interact and banish|Shift to sprint; Ctrl to crouch",
    briefing:
      "Hunt is a sound game: sprint only to rotate, listen for gunfire and crows, and assume another team is already watching the boss lair.",
  },
  {
    slug: "fragpunk",
    name: "FragPunk",
    url: "https://www.fragpunk.com/",
    genre: "Shooting",
    released: "2025-03-06",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Hero Shooter|PC",
    description:
      "Five-versus-five hero shooter where shard cards rewrite each round with modifiers such as low gravity and ricochet.",
    objectives:
      "Win a shard-modified round|Try three lancers|Complete a ranked placement",
    controls:
      "WASD to move; mouse to aim and fire|Q and E for lancer abilities|Tab to review the active shards",
    briefing:
      "FragPunk is about reading the round modifier before the fight: pick a lancer and lane that exploit the active shard instead of forcing your default plan.",
  },
  {
    slug: "splitgate-2",
    name: "Splitgate 2",
    url: "https://www.splitgate.com/",
    genre: "Shooting",
    released: "2025-06-06",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Portals|PC",
    description:
      "Portal-powered arena shooter with factions, objective modes, and vertical maps that reward creative flanking.",
    objectives:
      "Win a portal kill|Capture an objective|Finish a match with a faction ability",
    controls:
      "WASD to move; mouse to aim and fire|Q and E to place portals|Space to jump; Shift to sprint",
    briefing:
      "Splitgate is a routing game: place one portal for escape and one for pressure, then use the pair to attack angles a normal shooter cannot reach.",
  },
  {
    slug: "supervive",
    name: "Supervive",
    url: "https://www.supervive.com/",
    genre: "Battle Royale",
    released: "2024-11-20",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Battle Royale|Multiplayer|PvP|MOBA|Action|PC",
    description:
      "Squad battle royale that blends hero kits, MOBA-style abilities, and a glider-driven map with shifting objectives.",
    objectives:
      "Survive the first storm|Win a squad fight|Finish a match with a full team",
    controls:
      "WASD to move; mouse to aim|Q, E, and R for hero abilities|Space to glide",
    briefing:
      "Supervive is a team-fight game first: land with your squad, chain crowd control, and take height before committing to a storm rotation.",
  },
  {
    slug: "the-first-descendant",
    name: "The First Descendant",
    url: "https://store.steampowered.com/app/2074920/The_First_Descendant/",
    genre: "Shooting",
    released: "2024-07-02",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Looter Shooter|Sci-Fi|PC",
    description:
      "Co-op looter shooter with unlockable Descendants, elemental kits, large bosses, and four-player missions.",
    objectives:
      "Complete a story mission|Defeat a Void boss|Unlock a new Descendant",
    controls:
      "WASD to move; mouse to aim and fire|Q, E, and C for abilities|R to reload",
    briefing:
      "The First Descendant is a build game: match your elemental damage to the boss, keep one crowd-control skill for the add wave, and upgrade modules before chasing new loot.",
  },
  {
    slug: "escape-from-tarkov",
    name: "Escape from Tarkov",
    url: "https://www.escapefromtarkov.com/",
    genre: "Shooting",
    released: "2017-07-27",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Extraction|Survival|PC",
    description:
      "Hardcore extraction shooter with realistic ballistics, persistent raids, hideout progression, and high-stakes loot.",
    objectives:
      "Extract with a full kit|Complete a trader task|Upgrade one hideout module",
    controls:
      "WASD to move; mouse to aim and fire|Tab to open inventory|O to inspect the raid map",
    briefing:
      "Tarkov punishes noise and greed: learn one extraction, insure nothing you cannot replace, and leave a fight you did not start on your terms.",
  },
  {
    slug: "squad",
    name: "Squad",
    url: "https://joinsquad.com/",
    genre: "Shooting",
    released: "2020-09-23",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Tactical|MilSim|PC",
    description:
      "Fifty-versus-fifty tactical shooter built on communication, spawn logistics, and combined-arms capture points.",
    objectives:
      "Join a squad with a microphone|Capture a flag|Build a forward spawn",
    controls:
      "WASD to move; mouse to aim and fire|B for the command menu|V for local voice; B for squad voice",
    briefing:
      "Squad is a logistics game: a spawn radio wins more fights than a good rifle, so follow the squad leader and keep the rally moving.",
  },
  {
    slug: "hell-let-loose",
    name: "Hell Let Loose",
    url: "https://www.hellletloose.com/",
    genre: "Shooting",
    released: "2021-07-27",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|WWII|Tactical|PC",
    description:
      "Fifty-versus-fifty World War II shooter with officer command, supply nodes, armor, and sector control.",
    objectives:
      "Capture a sector|Build a garrison|Play a full match with your squad",
    controls:
      "WASD to move; mouse to aim and fire|B for the command wheel|V for proximity voice",
    briefing:
      "Hell Let Loose is won by spawns: build garrisons behind the point, keep supply lines alive, and let the officer coordinate instead of trickling in.",
  },
  {
    slug: "insurgency-sandstorm",
    name: "Insurgency: Sandstorm",
    url: "https://www.insurgency-sandstorm.com/",
    genre: "Shooting",
    released: "2018-12-12",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|FPS|Tactical|PC",
    description:
      "Close-quarters tactical shooter with limited HUD, supply points, call-ins, and lethal cooperative and versus modes.",
    objectives:
      "Capture a point in a tactical match|Complete a co-op objective|Use a commander call-in",
    controls:
      "WASD to move; mouse to aim and fire|Ctrl to crouch; Z to go prone|B to open the command menu",
    briefing:
      "Sandstorm is about sightlines and sound: clear rooms from the doorway, save stamina for the push, and use smoke to cross open ground.",
  },
  {
    slug: "ready-or-not",
    name: "Ready or Not",
    url: "https://voidinteractive.net/ready-or-not/",
    genre: "Shooting",
    released: "2023-12-13",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Shooting|Multiplayer|PvP|Tactical|SWAT|PC",
    description:
      "SWAT tactical shooter with slow room clearing, suspect compliance, evidence handling, and five-player co-op.",
    objectives:
      "Clear a building with your team|Secure a suspect without lethal force|Complete a mission report",
    controls:
      "WASD to move; mouse to aim|C to crouch; Ctrl to low-ready|F to interact and secure evidence",
    briefing:
      "Ready or Not rewards patience: stack on the door, check your corners, and use compliance and less-lethal tools before opening fire.",
  },
  {
    slug: "teamfight-tactics",
    name: "Teamfight Tactics",
    url: "https://teamfighttactics.leagueoflegends.com/en-us/",
    genre: "Strategy",
    released: "2019-06-26",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Strategy|Multiplayer|PvP|Auto Battler|Fantasy|PC",
    description:
      "Eight-player auto battler with champion synergies, economy management, item builds, and ranked lobbies.",
    objectives:
      "Finish a game in the top four|Complete a three-item carry|Reach a new ranked tier",
    controls:
      "Mouse to buy, drag, and position champions|D to refresh the shop|F to buy experience",
    briefing:
      "Tactics is an economy game before it is a combat game: bank interest, commit to one contested carry only when the items fit, and scout before the final rounds.",
  },

  // ── Online co-op and survival ─────────────────────────────────────────────
  {
    slug: "helldivers-2",
    name: "Helldivers 2",
    url: "https://www.playstation.com/en-us/games/helldivers-2/",
    genre: "Co-op",
    released: "2024-02-08",
    rating: 4.7,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Shooter|Sci-Fi|PC",
    description:
      "Four-player co-op shooter with orbital stratagems, friendly fire, procedural planets, and escalating galactic war fronts.",
    objectives:
      "Complete a mission with your squad|Call in a stratagem|Extract with the squad intact",
    controls:
      "WASD to move; mouse to aim and fire|Ctrl to crouch; Space to dive|Hold the stratagem keys to call support",
    briefing:
      "Helldivers is a spacing game: keep your stratagem codes ready, call danger-close only when the squad is clear, and never split the team on extraction.",
  },
  {
    slug: "arc-raiders",
    name: "ARC Raiders",
    url: "https://arcraiders.com/",
    genre: "Co-op",
    released: "2025-10-30",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Extraction|Sci-Fi|PC",
    description:
      "Third-person extraction game where raiders combine against ARC machines, loot the surface, and choose whether to trust other players.",
    objectives:
      "Extract from a raid|Destroy an ARC machine|Upgrade a raider workshop",
    controls:
      "WASD to move; mouse to aim and fire|Q for quick items|Tab for inventory and objectives",
    briefing:
      "ARC Raiders is about risk budget: decide early whether a fight is worth the noise, bank loot at the first safe window, and treat every other raider as uncertain.",
  },
  {
    slug: "lethal-company",
    name: "Lethal Company",
    url: "https://store.steampowered.com/app/1966720/Lethal_Company/",
    genre: "Co-op",
    released: "2023-10-23",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Horror|Sci-Fi|PC",
    description:
      "Four-player co-op scavenging runs on abandoned moons, with quota pressure, proximity voice, and unpredictable monsters.",
    objectives:
      "Meet the quota|Bring scrap back to the ship|Survive a full day cycle",
    controls:
      "WASD to move; mouse to look|E to interact and grab scrap|Q to scan the room",
    briefing:
      "Lethal Company is a communication game: one player watches the terminal, the rest stay within voice range, and the quota is never worth a full wipe.",
  },
  {
    slug: "repo",
    name: "R.E.P.O.",
    url: "https://store.steampowered.com/app/3241660/REPO/",
    genre: "Co-op",
    released: "2025-02-26",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Horror|Physics|PC",
    description:
      "Six-player co-op physics horror about extracting fragile valuables from abandoned sites while monsters react to noise and movement.",
    objectives:
      "Extract a valuable intact|Complete a quota run|Survive with the full team",
    controls:
      "WASD to move; mouse to look|E to grab and carry|G to drop; Q to use the extraction tool",
    briefing:
      "R.E.P.O. turns carrying into the challenge: move slowly with high-value objects, share the cart, and never sprint through a dark room without a lookout.",
  },
  {
    slug: "peak",
    name: "Peak",
    url: "https://store.steampowered.com/app/3527290/PEAK/",
    genre: "Co-op",
    released: "2025-06-16",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Climbing|Survival|PC",
    description:
      "Four-player co-op climbing expedition with stamina management, equipment sharing, and a mountain that punishes every rushed hold.",
    objectives:
      "Reach the first checkpoint|Complete a climb with your team|Use a shared item to rescue a teammate",
    controls:
      "WASD to move; mouse to look|Space to jump|E to grab and use climbing gear",
    briefing:
      "Peak is a pacing game: share stamina items, rope up before the exposed section, and turn back early instead of risking the whole team on one hold.",
  },
  {
    slug: "palworld",
    name: "Palworld",
    url: "https://www.palworld.net/",
    genre: "Co-op",
    released: "2024-01-19",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Survival|Open World|Creature Collector|PC",
    description:
      "Open-world survival and creature-collecting sandbox with base building, automation, boss fights, and online co-op.",
    objectives: "Catch ten Pals|Build a working base|Defeat a tower boss",
    controls:
      "WASD to move; mouse to aim and throw a sphere|E to interact and gather|Q to send out a Pal",
    briefing:
      "Palworld rewards base planning: assign Pals to the jobs you actually need, keep food and sanity stable, and explore only after your first production loop runs itself.",
  },
  {
    slug: "enshrouded",
    name: "Enshrouded",
    url: "https://www.enshrouded.com/",
    genre: "Co-op",
    released: "2024-01-24",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Survival|Open World|Crafting|PC",
    description:
      "Voxel survival action RPG with base building, gliding, skill trees, and a deadly fog that hides high-value resources.",
    objectives: "Build a shelter|Explore the Shroud|Defeat an elixir well boss",
    controls:
      "WASD to move; mouse to aim and attack|Space to jump and glide|E to interact and gather",
    briefing:
      "Enshrouded is a preparation loop: set a respawn point before entering the Shroud, carry a way out, and upgrade gear before chasing deeper resources.",
  },
  {
    slug: "monster-hunter-wilds",
    name: "Monster Hunter Wilds",
    url: "https://www.monsterhunter.com/wilds/en-us/",
    genre: "Co-op",
    released: "2025-02-28",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Action|Hunting|Open World|PC",
    description:
      "Open-world Monster Hunter with seamless biomes, weapon mastery, mounted traversal, and four-player hunts.",
    objectives:
      "Complete a low-rank hunt|Craft a weapon upgrade|Hunt with a full party",
    controls:
      "WASD to move; mouse to attack|Space to dodge; Shift to sprint|Q to use the slinger",
    briefing:
      "Wilds is about the opening: learn the monster tell before committing a long combo, use the environment to close distance, and sharpen when the hunt tempo slows.",
  },
  {
    slug: "space-marine-2",
    name: "Warhammer 40,000: Space Marine 2",
    url: "https://www.focus-entmt.com/en/games/warhammer-40000-space-marine-2",
    genre: "Co-op",
    released: "2024-09-09",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Action|Shooter|Warhammer|PC",
    description:
      "Third-person action shooter with brutal melee, Tyranid hordes, a cinematic campaign, and three-player operations.",
    objectives:
      "Complete a campaign mission|Finish an operations run|Execute a major enemy",
    controls:
      "WASD to move; mouse to aim and fire|Space to dodge; F to execute|Q for the squad ability",
    briefing:
      "Space Marine 2 is a crowd-control game: parry the elite, thin the horde with ranged fire, and save executions for armor recovery when surrounded.",
  },
  {
    slug: "deep-rock-galactic",
    name: "Deep Rock Galactic",
    url: "https://www.deeprockgalactic.com/",
    genre: "Co-op",
    released: "2020-05-13",
    rating: 4.6,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Shooter|Mining|PC",
    description:
      "Four-player co-op mining shooter with fully destructible caves, class traversal tools, and procedural missions.",
    objectives:
      "Complete a mining mission|Use a traversal tool to reach a teammate|Promote a dwarf",
    controls:
      "WASD to move; mouse to aim and mine|E to interact|F to throw a flare",
    briefing:
      "DRG is a traversal game: the driller opens the path, the scout lights it, and the gunner keeps the team alive while the engineer builds the route.",
  },
  {
    slug: "darktide",
    name: "Warhammer 40,000: Darktide",
    url: "https://www.darktide.live/",
    genre: "Co-op",
    released: "2022-11-30",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Shooter|Warhammer|PC",
    description:
      "Four-player co-op action shooter with melee combat, class builds, and dense hive-city missions.",
    objectives:
      "Complete a mission|Finish a run with a full squad|Craft a weapon blessing",
    controls:
      "WASD to move; mouse to attack|Space to dodge; Shift to sprint|Q to tag an enemy",
    briefing:
      "Darktide is about holding a line: keep your back to a wall, use push attacks when the horde closes, and save grenades for the specialist wave.",
  },
  {
    slug: "gtfo",
    name: "GTFO",
    url: "https://store.steampowered.com/app/493520/GTFO/",
    genre: "Co-op",
    released: "2021-12-09",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|PvE|Horror|Shooter|PC",
    description:
      "Hardcore four-player co-op horror shooter built on stealth, resource scarcity, and coordinated room clears.",
    objectives:
      "Complete an expedition|Clear a room without waking the alarm|Finish a run with your team",
    controls:
      "WASD to move; mouse to aim|Ctrl to crouch; Shift to sneak|E to interact and ping",
    briefing:
      "GTFO is a stealth game first: mark every sleeper, decide the takedown order before the breach, and never start a fight without a fallback position.",
  },
  {
    slug: "payday-3",
    name: "Payday 3",
    url: "https://store.steampowered.com/app/1272080/PAYDAY_3/",
    genre: "Co-op",
    released: "2023-09-21",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Heist|Shooter|Crime|PC",
    description:
      "Four-player heist shooter with stealth setup, hostage negotiation, skill trees, and loud or quiet routes.",
    objectives:
      "Complete a heist|Finish a stealth route|Extract with the full crew",
    controls:
      "WASD to move; mouse to aim and fire|E to interact and mask up|Ctrl to crouch",
    briefing:
      "Payday is a plan game: case the objective before masking, keep one player on crowd control, and decide early whether the job stays quiet.",
  },
  {
    slug: "remnant-2",
    name: "Remnant II",
    url: "https://www.remnantgame.com/",
    genre: "Co-op",
    released: "2023-07-25",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Co-op|Multiplayer|Action RPG|Shooter|Dark Fantasy|PC",
    description:
      "Three-player co-op action RPG with procedural worlds, boss fights, archetype builds, and ranged and melee combat.",
    objectives:
      "Defeat a world boss|Unlock a second archetype|Complete a co-op run",
    controls:
      "WASD to move; mouse to aim and fire|Space to dodge|Q for the archetype skill",
    briefing:
      "Remnant II is a dodge-timing game: learn the boss pattern before burning cooldowns, keep one heal for the second phase, and share aggro with your partner.",
  },
  {
    slug: "valheim",
    name: "Valheim",
    url: "https://www.valheimgame.com/",
    genre: "Survival",
    released: "2021-02-02",
    rating: 4.6,
    multiplayer: "Server",
    tags: "Survival|Co-op|Multiplayer|Open World|Viking|PC",
    description:
      "Viking survival sandbox with base building, sailing, boss progression, and ten-player co-op worlds.",
    objectives:
      "Build a sheltered base|Defeat the first boss|Sail to a new biome",
    controls:
      "WASD to move; mouse to aim|E to interact|Shift to run; Ctrl to crouch",
    briefing:
      "Valheim is a preparation game: set a portal before every voyage, keep rested and fed, and never enter a new biome without a ranged option.",
  },
  {
    slug: "v-rising",
    name: "V Rising",
    url: "https://playvrising.com/",
    genre: "Survival",
    released: "2024-05-08",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Survival|Co-op|Multiplayer|Open World|Vampire|PC",
    description:
      "Vampire survival game with castle building, blood farming, boss hunts, and online clan play.",
    objectives:
      "Build a castle heart|Defeat a V Blood boss|Craft a tier-two weapon",
    controls:
      "WASD to move; mouse to aim and attack|Q and E for abilities|Shift to travel in bat form",
    briefing:
      "V Rising is a daylight-management game: plan castle upgrades around the sun, feed before a boss attempt, and keep a escape route from every fight.",
  },
  {
    slug: "grounded",
    name: "Grounded",
    url: "https://grounded.obsidian.net/",
    genre: "Survival",
    released: "2022-09-27",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Survival|Co-op|Multiplayer|Open World|Backyard|PC",
    description:
      "Four-player survival adventure shrunk to a backyard, with crafting, insect mounts, labs, and boss fights.",
    objectives: "Build a base|Analyze a resource|Defeat a lab boss",
    controls:
      "WASD to move; mouse to aim|E to interact and gather|Space to jump",
    briefing:
      "Grounded is a resource-routing game: set a respawn point, carry water before long trips, and upgrade tools before challenging a new insect.",
  },
  {
    slug: "dune-awakening",
    name: "Dune: Awakening",
    url: "https://duneawakening.com/",
    genre: "Survival",
    released: "2025-06-10",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Survival|Multiplayer|Open World|Sci-Fi|MMO|PC",
    description:
      "Open-world survival MMO on Arrakis with spice harvesting, base building, sandworms, and faction conflict.",
    objectives:
      "Build a desert shelter|Harvest spice|Complete a faction contract",
    controls:
      "WASD to move; mouse to aim|E to interact and harvest|Shift to sprint",
    briefing:
      "Dune is a heat and water game: travel at night, keep a shelter within reach, and never harvest spice without a plan for the sandworm.",
  },

  // ── Sports ────────────────────────────────────────────────────────────────
  {
    slug: "ea-sports-fc-26",
    name: "EA Sports FC 26",
    url: "https://www.ea.com/games/ea-sports-fc/fc-26",
    genre: "Sports",
    released: "2025-09-26",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Football|Competitive|PC",
    description:
      "Club football with Ultimate Team, manager and player careers, online seasons, and refreshed tactical gameplay.",
    objectives:
      "Win an online match|Complete a squad-building challenge|Score from a set piece",
    controls:
      "Left stick or WASD to move|A/X to pass; B/Circle to shoot|RT/R2 to sprint",
    briefing:
      "FC rewards patient build-up: keep your shape, switch the point of attack before the press arrives, and only sprint when the lane is open.",
  },
  {
    slug: "nba-2k26",
    name: "NBA 2K26",
    url: "https://nba.2k.com/2k26/",
    genre: "Sports",
    released: "2025-09-05",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Basketball|Competitive|PC",
    description:
      "Basketball simulation with MyCAREER, MyTEAM, online park and pro-am, and expanded shot mechanics.",
    objectives:
      "Win an online game|Complete a MyCAREER game|Finish a MyTEAM challenge",
    controls:
      "Left stick to move; right stick to dribble and shoot|A/X to pass|LT/L2 to sprint",
    briefing:
      "2K is a timing game: learn one release, use dribble moves to create space, and protect the ball instead of forcing a contested shot.",
  },
  {
    slug: "madden-nfl-26",
    name: "Madden NFL 26",
    url: "https://www.ea.com/games/madden-nfl/madden-nfl-26",
    genre: "Sports",
    released: "2025-08-14",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Football|Competitive|PC",
    description:
      "NFL simulation with Franchise, Ultimate Team, Superstar mode, and online head-to-head seasons.",
    objectives:
      "Win an online game|Complete a Franchise week|Score on a designed play",
    controls:
      "Left stick to move; A/X to snap and pass|B/Circle to spin or juke|RT/R2 to sprint",
    briefing:
      "Madden is a pre-snap game: read the coverage, check your hot route, and take the easy checkdown instead of forcing the deep ball.",
  },
  {
    slug: "mlb-the-show-25",
    name: "MLB The Show 25",
    url: "https://theshow.com/",
    genre: "Sports",
    released: "2025-03-18",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Baseball|Competitive|PlayStation",
    description:
      "Baseball simulation with Road to the Show, Diamond Dynasty, franchise mode, and online ranked play.",
    objectives:
      "Win an online game|Complete a Road to the Show series|Build a Diamond Dynasty lineup",
    controls:
      "Left stick to aim the PCI|A/X to swing; B/Circle to check swing|RT/R2 to throw a power pitch",
    briefing:
      "The Show is a discipline test: track the pitch out of the hand, protect the plate with two strikes, and do not chase a breaking ball below the zone.",
  },
  {
    slug: "efootball",
    name: "eFootball",
    url: "https://www.konami.com/efootball/",
    genre: "Sports",
    released: "2023-09-07",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Football|Free to Play|PC",
    description:
      "Free-to-play football with online divisions, squad building, events, and cross-platform matches.",
    objectives:
      "Win an online division match|Complete an event|Sign a player to your squad",
    controls:
      "Left stick or WASD to move|A/X to pass; B/Circle to shoot|RT/R2 to sprint",
    briefing:
      "eFootball is about first touch: receive with space, play the safe pass when pressed, and keep your defensive line compact before chasing the ball.",
  },
  {
    slug: "rematch",
    name: "Rematch",
    url: "https://store.steampowered.com/app/2138720/Rematch/",
    genre: "Sports",
    released: "2025-06-19",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Football|Skill-Based|PC",
    description:
      "Five-a-side football with third-person control, precise passing, and a competitive online ranked ladder.",
    objectives:
      "Win an online match|Score a team goal|Complete a ranked placement",
    controls:
      "WASD to move; mouse to aim|Left click to pass or shoot|Space to jump; Shift to sprint",
    briefing:
      "Rematch is a passing game: face the receiver before releasing, use the wall for one-twos, and recover into shape instead of chasing the ball.",
  },
  {
    slug: "thps-3-4",
    name: "Tony Hawk's Pro Skater 3 + 4",
    url: "https://store.steampowered.com/app/2918860/Tony_Hawks_Pro_Skater_3_4/",
    genre: "Sports",
    released: "2025-07-11",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Skateboarding|Arcade|PC",
    description:
      "Remastered skateboarding classics with combo-driven parks, online multiplayer, and the returning create-a-skater.",
    objectives:
      "Complete a level goal|Land a combo over 50,000|Finish an online session",
    controls:
      "Arrow keys or left stick to steer|A/X to ollie; face buttons for tricks|Hold grind to lock a rail",
    briefing:
      "THPS is a combo game: keep the manual alive between tricks, use reverts to link vert lines, and save the special for the multiplier.",
  },

  {
    slug: "wwe-2k25",
    name: "WWE 2K25",
    url: "https://wwe.2k.com/2k25/",
    genre: "Sports",
    released: "2025-03-14",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Wrestling|Fighting|PC",
    description:
      "Wrestling sim with Showcase, MyRISE, MyGM, and online matches across a large roster and arena set.",
    objectives:
      "Win an online match|Complete a Showcase match|Build a MyGM show",
    controls:
      "Left stick to move; face buttons to strike and grapple|RT/R2 to run|LB/L1 to reverse",
    briefing:
      "WWE is a reversal and stamina game: do not empty your meter on a combo, save a reversal for the comeback, and use the ropes to reset position.",
  },
  {
    slug: "college-football-26",
    name: "EA Sports College Football 26",
    url: "https://www.ea.com/games/ea-sports-college-football/college-football-26",
    genre: "Sports",
    released: "2025-07-10",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Football|College|Console",
    description:
      "College football with Dynasty mode, Road to Glory, Team Builder, and online head-to-head play.",
    objectives:
      "Win a Dynasty game|Complete a recruiting week|Win an online match",
    controls:
      "Left stick to move; A/X to snap and pass|B/Circle to juke or spin|RT/R2 to sprint",
    briefing:
      "College Football is a tempo game: use the no-huddle to stress a defense, protect the ball on the option, and recruit to your scheme instead of stacking stars.",
  },
  {
    slug: "nhl-26",
    name: "NHL 26",
    url: "https://www.ea.com/games/nhl/nhl-26",
    genre: "Sports",
    released: "2025-09-12",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Hockey|Competitive|Console",
    description:
      "Hockey simulation with franchise, Hockey Ultimate Team, World of Chel, and online competitive play.",
    objectives:
      "Win an online match|Score a power-play goal|Complete a franchise week",
    controls:
      "Left stick to skate; right stick to shoot|A/X to pass|LT/L2 to hustle",
    briefing:
      "NHL is a spacing game: cycle the puck low, keep the point open for one-timers, and retreat into lanes instead of chasing the carrier.",
  },
  {
    slug: "pga-tour-2k25",
    name: "PGA Tour 2K25",
    url: "https://pgatour.2k.com/2k25/",
    genre: "Sports",
    released: "2025-02-28",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Golf|Competitive|PC",
    description:
      "Golf simulation with MyCAREER, online societies, course designer, and ranked match play.",
    objectives:
      "Finish a round under par|Complete a society event|Win an online match",
    controls:
      "Left stick to aim; right stick to swing|A/X to confirm the shot|LB/L1 to shape the ball",
    briefing:
      "PGA Tour is a course-management game: club down in the wind, aim at the safe side of the pin, and accept a two-putt instead of chasing a miracle shot.",
  },
  {
    slug: "topspin-2k25",
    name: "TopSpin 2K25",
    url: "https://topspin.2k.com/2k25/",
    genre: "Sports",
    released: "2024-04-26",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Tennis|Competitive|PC",
    description:
      "Tennis simulation with career mode, online tournaments, and Grand Slam venues.",
    objectives:
      "Win an online match|Complete a career tournament|Win a point at the net",
    controls:
      "Left stick to move; face buttons to choose the shot|RT/R2 for topspin|LT/L2 for slice",
    briefing:
      "TopSpin is a court-position game: recover to the middle after every shot, vary spin to move the opponent, and approach the net behind a deep ball.",
  },
  {
    slug: "ufc-5",
    name: "EA Sports UFC 5",
    url: "https://www.ea.com/games/ufc/ufc-5",
    genre: "Sports",
    released: "2023-10-27",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|MMA|Fighting|Console",
    description:
      "MMA simulation with career mode, online championships, realistic damage, and a deep ground game.",
    objectives:
      "Win an online fight|Finish a career fight|Complete a training camp",
    controls:
      "Left stick to move; face buttons to strike|RT/R2 to block|LT/L2 to grapple",
    briefing:
      "UFC is a stamina fight: do not chase a finish with an empty tank, defend the takedown before countering, and target the body when the head is covered.",
  },
  {
    slug: "riders-republic",
    name: "Riders Republic",
    url: "https://www.ubisoft.com/en-us/game/riders-republic",
    genre: "Sports",
    released: "2021-10-28",
    rating: 4.0,
    multiplayer: "Server",
    tags: "Sports|Multiplayer|Extreme Sports|Open World|PC",
    description:
      "Open-world extreme sports playground with skiing, snowboarding, biking, wingsuiting, and mass races.",
    objectives: "Finish a mass race|Complete a career event|Land a trick combo",
    controls:
      "Left stick to steer; right stick to trick|RT/R2 to accelerate|LT/L2 to brake",
    briefing:
      "Riders Republic is about line choice: read the terrain before the drop, carry speed through the transition, and bail early rather than fighting a bad landing.",
  },

  // ── Racing ────────────────────────────────────────────────────────────────
  {
    slug: "forza-horizon-5",
    name: "Forza Horizon 5",
    url: "https://forza.net/horizon5",
    genre: "Racing",
    released: "2021-11-09",
    rating: 4.7,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Open World|Cars|PC",
    description:
      "Open-world racing in Mexico with seasonal festivals, online convoys, and a huge tunable car roster.",
    objectives:
      "Win a road race|Complete a seasonal championship|Join an online convoy",
    controls:
      "Left stick or WASD to steer|RT/R2 to accelerate; LT/L2 to brake|Y/Tab for the map",
    briefing:
      "Horizon is a momentum game: brake before the corner, use the whole road on exit, and tune gearing before chasing a leaderboard time.",
  },
  {
    slug: "f1-25",
    name: "F1 25",
    url: "https://www.ea.com/games/f1/f1-25",
    genre: "Racing",
    released: "2025-05-30",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Formula 1|Competitive|PC",
    description:
      "Official Formula 1 racing with career, online ranked, and the Braking Point story mode.",
    objectives:
      "Finish a race|Complete a qualifying session|Score points in a career round",
    controls:
      "Left stick to steer|RT/R2 to accelerate; LT/L2 to brake|LB/L1 to change ERS mode",
    briefing:
      "F1 is a tyre and fuel game: lift and coast before the braking zone, protect the front tyres in traffic, and use ERS on the straight, not the corner exit.",
  },
  {
    slug: "ea-sports-wrc",
    name: "EA Sports WRC",
    url: "https://www.ea.com/games/ea-sports-wrc",
    genre: "Racing",
    released: "2023-11-03",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Rally|Competitive|PC",
    description:
      "Official WRC rally game with stage racing, a car builder, online clubs, and changing surface conditions.",
    objectives:
      "Finish a rally stage|Complete a club event|Set a clean stage time",
    controls:
      "Left stick to steer|RT/R2 to accelerate; LT/L2 to brake|A/X for handbrake",
    briefing:
      "WRC is a pace-note game: brake in a straight line, rotate with the handbrake, and sacrifice entry speed for a clean exit on loose surfaces.",
  },
  {
    slug: "mario-kart-world",
    name: "Mario Kart World",
    url: "https://www.nintendo.com/us/store/products/mario-kart-world-switch-2/",
    genre: "Racing",
    released: "2025-06-05",
    rating: 4.6,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Kart|Nintendo|Switch 2",
    description:
      "Kart racing across connected open-world routes with 24-player races, rail grinding, and battle modes.",
    objectives:
      "Win a Grand Prix|Finish a 24-player online race|Complete a knockout tour",
    controls:
      "Left stick to steer|A/X to accelerate; B/Circle to brake|Hold drift and hop to charge a mini-turbo",
    briefing:
      "Mario Kart is a drift and item game: hold the drift line through the corner, save the shell for the final straight, and take the outside line when the pack is item-heavy.",
  },
  {
    slug: "le-mans-ultimate",
    name: "Le Mans Ultimate",
    url: "https://lemansultimate.com/",
    genre: "Racing",
    released: "2024-02-20",
    rating: 4.1,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Endurance|Simulation|PC",
    description:
      "Endurance racing simulation with WEC cars, hypercars, online races, and co-op driver swaps.",
    objectives:
      "Finish an endurance stint|Complete a co-op driver swap|Set a clean qualifying lap",
    controls:
      "Left stick or wheel to steer|RT/R2 to accelerate; LT/L2 to brake|Face buttons for brake bias and hybrid",
    briefing:
      "Le Mans is a tyre and traffic game: manage the hybrid deployment, brake earlier on cold tyres, and lose less time in traffic than the car ahead.",
  },
  {
    slug: "trackmania",
    name: "Trackmania",
    url: "https://www.trackmania.com/",
    genre: "Racing",
    released: "2020-07-01",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Racing|Multiplayer|Time Trial|Arcade|PC",
    description:
      "Arcade time-trial racing with user-made tracks, online rooms, seasonal campaigns, and precision ghost lines.",
    objectives:
      "Set a personal best|Complete a campaign track|Race a live server",
    controls:
      "Arrow keys or left stick to steer|Up/W to accelerate; Down/S to brake|R to restart a run",
    briefing:
      "Trackmania is a repetition game: learn the first corner before optimising the straight, copy the fastest ghost line, and restart early instead of salvaging a bad run.",
  },

  // ── Fighting ──────────────────────────────────────────────────────────────
  {
    slug: "tekken-8",
    name: "Tekken 8",
    url: "https://tekken.com/",
    genre: "Fighting",
    released: "2024-01-26",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|3D Fighter|Competitive|PC",
    description:
      "Three-dimensional fighting with Heat mechanics, destructible stages, a cinematic story, and online ranked play.",
    objectives:
      "Win an online match|Complete a character episode|Land a Heat Smash",
    controls:
      "Left stick or WASD to move|Face buttons for punches and kicks|Hold back to block; forward to sidestep",
    briefing:
      "Tekken is a movement game: sidestep linear pressure, punish with your fastest launcher, and use Heat to force a mix-up instead of mashing.",
  },
  {
    slug: "street-fighter-6",
    name: "Street Fighter 6",
    url: "https://www.streetfighter.com/6/",
    genre: "Fighting",
    released: "2023-06-02",
    rating: 4.6,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Competitive|PC",
    description:
      "Two-dimensional fighting with Drive mechanics, a world tour, modern controls, and a robust online hub.",
    objectives:
      "Win an online match|Complete a character guide|Land a Drive Impact",
    controls:
      "Left stick or WASD to move|Six-button layout for punches and kicks|Drive Parry and Drive Impact on their bound keys",
    briefing:
      "Street Fighter 6 is a resource game: spend Drive on pressure only when the corner is available, and save a bar for the Drive Reversal escape.",
  },
  {
    slug: "mortal-kombat-1",
    name: "Mortal Kombat 1",
    url: "https://www.mortalkombat.com/",
    genre: "Fighting",
    released: "2023-09-19",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Fatality|PC",
    description:
      "Two-dimensional fighting with Kameo assists, a rebooted story, Invasions mode, and online kombat league.",
    objectives:
      "Win an online match|Complete a Kameo trial|Finish a story chapter",
    controls:
      "Left stick or WASD to move|Face buttons for attacks|LT/L2 to call the Kameo",
    briefing:
      "MK1 is a Kameo timing game: use the assist to extend pressure or cover a gap, and never spend both meters before the opponent commits.",
  },
  {
    slug: "fatal-fury-cotw",
    name: "Fatal Fury: City of the Wolves",
    url: "https://www.snk-corp.co.jp/us/games/fatalfury-cotw/",
    genre: "Fighting",
    released: "2025-04-24",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|SNK|PC",
    description:
      "SNK fighting with REV Blow, feints, a modern control option, and a roster of returning Fatal Fury icons.",
    objectives: "Win an online match|Complete a combo trial|Land a REV Blow",
    controls:
      "Left stick or WASD to move|Four-button layout for punches and kicks|REV Blow and feint on their bound keys",
    briefing:
      "City of the Wolves is a neutral game: use feints to bait a reaction, conserve REV meter for the punish, and control the mid-range with long pokes.",
  },
  {
    slug: "2xko",
    name: "2XKO",
    url: "https://2xko.riotgames.com/",
    genre: "Fighting",
    released: "2025-10-07",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|Tag Fighter|League of Legends|PC",
    description:
      "Two-versus-two tag fighting set in the League of Legends universe, with assists, fuse mechanics, and online lobbies.",
    objectives: "Win an online match|Complete a tag combo|Try every fuse style",
    controls:
      "Left stick or WASD to move|Light, medium, heavy, and special buttons|Tag and assist on their bound keys",
    briefing:
      "2XKO is a tag-management game: keep the point character healthy, use assists to extend pressure, and tag only when the incoming character has a safe entry.",
  },
  {
    slug: "virtua-fighter-5-revo",
    name: "Virtua Fighter 5 R.E.V.O.",
    url: "https://store.steampowered.com/app/3114770/Virtua_Fighter_5_REVO/",
    genre: "Fighting",
    released: "2025-01-28",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|3D Fighter|Sega|PC",
    description:
      "Refined 3D fighting with rollback netcode, a deep training mode, and the classic Virtua Fighter roster.",
    objectives:
      "Win an online match|Complete a command lesson|Clear arcade mode",
    controls:
      "Left stick or WASD to move|Three-button layout for punch, kick, and guard|Down-back to block low",
    briefing:
      "Virtua Fighter is a frame game: learn the safe pokes first, punish with the guaranteed option, and use the training mode to check every losing exchange.",
  },
  {
    slug: "guilty-gear-strive",
    name: "Guilty Gear Strive",
    url: "https://www.guiltygear.com/ggst/en/",
    genre: "Fighting",
    released: "2021-06-11",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Anime|PC",
    description:
      "Stylish anime fighting with a wall-break system, Roman Cancels, rollback netcode, and a large roster.",
    objectives:
      "Win an online match|Complete a mission trial|Land a wall break",
    controls:
      "Left stick or WASD to move|Five-button layout for attacks|Roman Cancel on its bound key",
    briefing:
      "Strive is a pressure game: use the wall to convert a hit into a full combo, save Roman Cancel for defence, and do not overextend without meter.",
  },
  {
    slug: "granblue-fantasy-versus-rising",
    name: "Granblue Fantasy Versus: Rising",
    url: "https://store.steampowered.com/app/2156160/Granblue_Fantasy_Versus_Rising/",
    genre: "Fighting",
    released: "2023-12-14",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Anime|PC",
    description:
      "Accessible anime fighting with cooldown abilities, a party mode, and a large single-player RPG story.",
    objectives:
      "Win an online match|Complete a story chapter|Land a Skybound Art",
    controls:
      "Left stick or WASD to move|Four-button layout for attacks|Skill and Skybound Art on their bound keys",
    briefing:
      "Granblue is a cooldown game: use skills to cover a gap, not to open a round, and save the Skybound Art for a guaranteed punish.",
  },
  {
    slug: "kof-xv",
    name: "The King of Fighters XV",
    url: "https://store.steampowered.com/app/1498570/THE_KING_OF_FIGHTERS_XV/",
    genre: "Fighting",
    released: "2022-02-17",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|SNK|PC",
    description:
      "Three-on-three team fighting with a large roster, MAX mode, and rollback online play.",
    objectives:
      "Win an online team match|Complete a combo trial|Clear arcade mode",
    controls:
      "Left stick or WASD to move|Four-button layout for punches and kicks|MAX mode on its bound keys",
    briefing:
      "KOF is a team-order game: save your anchor for the last slot, use the point character to scout, and convert MAX mode only when the combo is guaranteed.",
  },
  {
    slug: "under-night-2",
    name: "Under Night In-Birth II Sys:Celes",
    url: "https://store.steampowered.com/app/2076010/UNDER_NIGHT_INBIRTH_II_SysCeles/",
    genre: "Fighting",
    released: "2024-01-25",
    rating: 4.2,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Anime|PC",
    description:
      "Fast anime fighting with the GRD resource system, chain shifts, and a focused competitive roster.",
    objectives:
      "Win an online match|Complete a mission trial|Win a round with GRD advantage",
    controls:
      "Left stick or WASD to move|Four-button layout for attacks|Force Function on its bound key",
    briefing:
      "Under Night is a resource game: hold the GRD cycle, force the opponent to approach, and spend your chain shift only on a confirmed hit.",
  },
  {
    slug: "dragon-ball-fighterz",
    name: "Dragon Ball FighterZ",
    url: "https://store.steampowered.com/app/678950/DRAGON_BALL_FighterZ/",
    genre: "Fighting",
    released: "2018-01-26",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|2D Fighter|Anime|PC",
    description:
      "Three-on-three anime fighting with assists, air combos, dramatic finishers, and rollback online play.",
    objectives: "Win an online match|Complete a combo trial|Finish a story arc",
    controls:
      "Left stick or WASD to move|Three attack buttons plus assist|Dragon Rush and Vanish on their bound keys",
    briefing:
      "FighterZ is an assist game: use the beam assist to cover your approach, keep one character healthy for the anchor, and do not burn sparking early.",
  },
  {
    slug: "smash-ultimate",
    name: "Super Smash Bros. Ultimate",
    url: "https://www.smashbros.com/",
    genre: "Fighting",
    released: "2018-12-07",
    rating: 4.7,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|Platform Fighter|Nintendo|Switch",
    description:
      "Platform fighting with a massive crossover roster, stage hazards, and local or online battles.",
    objectives: "Win a versus match|Complete a classic run|Try a new fighter",
    controls:
      "Left stick to move|A/B for attacks and specials|Shield and grab on their bound buttons",
    briefing:
      "Smash is a stage-control game: claim centre stage, use shield and grab to beat a defensive opponent, and recover early instead of burning your double jump.",
  },
  {
    slug: "rivals-of-aether-2",
    name: "Rivals of Aether II",
    url: "https://rivalsofaether.com/",
    genre: "Fighting",
    released: "2024-10-23",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|Platform Fighter|Indie|PC",
    description:
      "Precision platform fighting with shields, ledges, wavedashing, and rollback online play.",
    objectives:
      "Win an online match|Complete a character trial|Land a ledge trump",
    controls:
      "Left stick or WASD to move|Attack and special buttons|Shield and wavedash on their bound keys",
    briefing:
      "Rivals is a movement game: dash-dance in neutral, use shield to punish an overextension, and recover to the ledge instead of challenging offstage.",
  },
  {
    slug: "brawlhalla",
    name: "Brawlhalla",
    url: "https://www.brawlhalla.com/",
    genre: "Fighting",
    released: "2017-10-17",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Fighting|Multiplayer|PvP|Platform Fighter|Free to Play|PC",
    description:
      "Free-to-play platform fighting with weapon pairs, signature moves, ranked queues, and cross-play.",
    objectives:
      "Win an online match|Complete a legend trial|Reach a new ranked tier",
    controls:
      "Left stick or WASD to move|Light and heavy attack buttons|Dodge and gravity cancel on their bound keys",
    briefing:
      "Brawlhalla is a weapon and dodge game: learn both weapon kits, save your dodge for the kill confirm, and edge-guard with a safe option.",
  },

  // ── Adventure, action, and platforming ────────────────────────────────────
  {
    slug: "indiana-jones-great-circle",
    name: "Indiana Jones and the Great Circle",
    url: "https://indianajones.bethesda.net/",
    genre: "Adventure",
    released: "2024-12-09",
    rating: 4.5,
    multiplayer: "None",
    tags: "Adventure|Action|Single Player|Cinematic|PC",
    description:
      "First-person adventure with immersive exploration, stealth, hand-to-hand combat, and a globe-spanning mystery.",
    objectives:
      "Complete the prologue|Solve a tomb route|Finish a disguise infiltration",
    controls:
      "WASD to move; mouse to look|Left click to attack; right click to block|E to interact and pick up items",
    briefing:
      "Indiana Jones rewards observation: read the room before the fight, use a disguise to cross a checkpoint, and keep a improvised weapon within reach.",
  },
  {
    slug: "astro-bot",
    name: "Astro Bot",
    url: "https://www.playstation.com/en-us/games/astro-bot/",
    genre: "Adventure",
    released: "2024-09-06",
    rating: 4.8,
    multiplayer: "None",
    tags: "Adventure|Platformer|Single Player|PlayStation|PS5",
    description:
      "Creative 3D platformer with DualSense feedback, inventive power-ups, and dense worlds full of secrets.",
    objectives:
      "Rescue a bot crew|Complete a secret level|Collect a special bot",
    controls:
      "Left stick to move; right stick to look|Cross/A to jump; Square/X to punch|L2/R2 for power-up actions",
    briefing:
      "Astro Bot is a curiosity game: look behind every landmark, test each power-up on the environment, and slow down before a hidden platform chain.",
  },
  {
    slug: "hollow-knight-silksong",
    name: "Hollow Knight: Silksong",
    url: "https://hollowknightsilksong.com/",
    genre: "Adventure",
    released: "2025-09-04",
    rating: 4.7,
    multiplayer: "None",
    tags: "Adventure|Metroidvania|Action|Indie|PC",
    description:
      "Fast metroidvania with silk-based movement, tool crafting, layered boss fights, and a vast hand-drawn kingdom.",
    objectives:
      "Defeat a boss|Unlock a new movement ability|Complete a tool loadout",
    controls:
      "WASD or left stick to move|A/X to jump; B/Circle to attack|R1/RB to dash",
    briefing:
      "Silksong is a movement game: learn the boss rhythm before trading hits, use the dash for position rather than damage, and spend silk on healing only when safe.",
  },
  {
    slug: "sea-of-stars",
    name: "Sea of Stars",
    url: "https://seaofstarsgame.com/",
    genre: "Adventure",
    released: "2023-08-29",
    rating: 4.5,
    multiplayer: "None",
    tags: "Adventure|RPG|Turn-Based|Indie|PC",
    description:
      "Turn-based adventure RPG with timed attacks, combo moves, environmental traversal, and a lush pixel-art world.",
    objectives:
      "Recruit a party member|Complete a combo attack|Finish a dungeon boss",
    controls:
      "WASD to move|A/X to confirm; B/Circle to cancel|Space or confirm at the timed hit window",
    briefing:
      "Sea of Stars lives on timing: hold the attack for the bonus hit, use the lock system to break enemy casts, and save combo points for the boss turn.",
  },
  {
    slug: "prince-of-persia-lost-crown",
    name: "Prince of Persia: The Lost Crown",
    url: "https://www.ubisoft.com/en-us/game/prince-of-persia/the-lost-crown",
    genre: "Adventure",
    released: "2024-01-18",
    rating: 4.4,
    multiplayer: "None",
    tags: "Adventure|Action|Metroidvania|Platformer|PC",
    description:
      "Side-scrolling metroidvania with time powers, precise platforming, athletic combat, and a large interconnected citadel.",
    objectives:
      "Unlock a time power|Defeat a boss|Complete a platforming trial",
    controls:
      "Left stick or WASD to move|A/X to jump; X/Square to attack|L1/LB to use the time power",
    briefing:
      "Lost Crown is a traversal game: mark locked routes on the map, practise the hazard before the long jump, and use the time shadow to recover a missed input.",
  },
  {
    slug: "death-stranding-2",
    name: "Death Stranding 2: On the Beach",
    url: "https://www.playstation.com/en-us/games/death-stranding-2-on-the-beach/",
    genre: "Adventure",
    released: "2025-06-26",
    rating: 4.4,
    multiplayer: "None",
    tags: "Adventure|Open World|Cinematic|Sci-Fi|PS5",
    description:
      "Cinematic open-world delivery adventure with terrain routing, shared structures, stealth, and a surreal story.",
    objectives:
      "Complete a delivery|Build a route across rough terrain|Connect a new facility",
    controls:
      "Left stick to move; right stick to balance|L2/R2 to steady the load|Cross/A to jump; Square/X to interact",
    briefing:
      "Death Stranding is a planning game: carry only what the route needs, use shared structures, and avoid a fight when the cargo matters more than the win.",
  },
  {
    slug: "plucky-squire",
    name: "The Plucky Squire",
    url: "https://www.thepluckysquire.com/",
    genre: "Adventure",
    released: "2024-09-17",
    rating: 4.4,
    multiplayer: "None",
    tags: "Adventure|Action|Storybook|Indie|PC",
    description:
      "Storybook adventure that moves between illustrated pages and a three-dimensional desk world with playful genre shifts.",
    objectives:
      "Complete a storybook chapter|Solve a page transition|Defeat a boss",
    controls:
      "WASD or left stick to move|A/X to jump; X/Square to attack|E or Y/Triangle to interact",
    briefing:
      "The Plucky Squire is a perspective game: look for the page edge that changes the rules, and use the desk objects when the storybook path closes.",
  },
  {
    slug: "hades-2",
    name: "Hades II",
    url: "https://www.supergiantgames.com/games/hades-ii/",
    genre: "Action",
    released: "2025-09-17",
    rating: 4.7,
    multiplayer: "None",
    tags: "Action|Roguelike|Mythology|Indie|PC",
    description:
      "Roguelike action with witchcraft, weapon aspects, boon builds, and a evolving narrative across repeated runs.",
    objectives: "Clear a run|Unlock a weapon aspect|Defeat a region boss",
    controls:
      "WASD to move; mouse to aim and attack|Space to dash|Q/E for casts and calls",
    briefing:
      "Hades II is a build game: commit to one god pool early, keep a dash for the boss tell, and spend meta-currency on the upgrade that fixes your worst matchup.",
  },
  {
    slug: "hades",
    name: "Hades",
    url: "https://www.supergiantgames.com/games/hades/",
    genre: "Action",
    released: "2020-09-17",
    rating: 4.8,
    multiplayer: "None",
    tags: "Action|Roguelike|Mythology|Indie|PC",
    description:
      "Roguelike action with god boons, weapon aspects, fast chamber combat, and a story that advances on every escape.",
    objectives:
      "Escape the underworld|Unlock a weapon aspect|Complete a pact run",
    controls:
      "WASD to move; mouse to aim and attack|Space to dash|Q/E for cast and call",
    briefing:
      "Hades is a synergy game: pick a core boon and build around its duo, use dash-strikes for safety, and do not hoard a call through a boss phase.",
  },

  {
    slug: "ori-will-of-the-wisps",
    name: "Ori and the Will of the Wisps",
    url: "https://www.orithegame.com/",
    genre: "Platformer",
    released: "2020-03-11",
    rating: 4.8,
    multiplayer: "None",
    tags: "Platformer|Metroidvania|Indie|Emotional|PC",
    description:
      "Hand-painted metroidvania platformer with fluid movement, spirit abilities, escape sequences, and a moving score.",
    objectives:
      "Unlock a movement ability|Defeat a boss|Complete a spirit trial",
    controls:
      "WASD or left stick to move|A/X to jump; B/Circle to attack|L1/LB to dash",
    briefing:
      "Ori is a momentum game: chain wall jumps and dashes, keep a safe route back, and use the spirit edge for crowd control before the escape sequence.",
  },
  {
    slug: "cuphead",
    name: "Cuphead",
    url: "https://www.cupheadgame.com/",
    genre: "Platformer",
    released: "2017-09-29",
    rating: 4.6,
    multiplayer: "None",
    tags: "Platformer|Run and Gun|Boss Rush|Indie|PC",
    description:
      "Run-and-gun boss-rush platformer with hand-drawn animation, parries, and tightly choreographed fights.",
    objectives: "Defeat a boss|Complete a run-and-gun level|Land a parry",
    controls:
      "WASD to move|Space to jump; Shift to dash|X/Square to shoot; A/X to parry",
    briefing:
      "Cuphead is pattern recognition: learn the first phase before chasing damage, stay airborne for the low sweep, and parry pink objects for the super meter.",
  },
  {
    slug: "celeste",
    name: "Celeste",
    url: "https://www.celestegame.com/",
    genre: "Platformer",
    released: "2018-01-25",
    rating: 4.8,
    multiplayer: "None",
    tags: "Platformer|Precision|Indie|Story|PC",
    description:
      "Precision platformer with air dashes, stamina routing, short retry loops, and a story about climbing anyway.",
    objectives: "Clear a chapter|Collect a strawberry|Finish a B-side route",
    controls:
      "WASD or left stick to move|A/X to jump; B/Circle to dash|Hold grab to cling to walls",
    briefing:
      "Celeste is a routing game: plan the dash before the jump, use the retry loop as practice, and do not spend stamina on a wall you can leave immediately.",
  },
  {
    slug: "dead-cells",
    name: "Dead Cells",
    url: "https://dead-cells.com/",
    genre: "Action",
    released: "2018-08-07",
    rating: 4.6,
    multiplayer: "None",
    tags: "Action|Roguelike|Metroidvania|Indie|PC",
    description:
      "Fast roguelike action with weapon combos, permanent unlocks, branching routes, and fluid 2D combat.",
    objectives: "Clear a biome|Defeat a boss|Unlock a new weapon",
    controls:
      "WASD or left stick to move|A/X to jump; X/Square to attack|L1/LB to roll",
    briefing:
      "Dead Cells is a tempo game: keep the kill streak alive, use the roll through attacks instead of away, and commit to one damage colour per run.",
  },
  {
    slug: "psychonauts-2",
    name: "Psychonauts 2",
    url: "https://store.steampowered.com/app/607080/Psychonauts_2/",
    genre: "Adventure",
    released: "2021-08-25",
    rating: 4.6,
    multiplayer: "None",
    tags: "Adventure|Platformer|Comedy|Indie|PC",
    description:
      "Comedic platforming adventure set inside minds, with psychic powers, inventive levels, and a warm story.",
    objectives:
      "Complete a mind level|Unlock a psychic power|Collect a memory vault",
    controls:
      "WASD or left stick to move|A/X to jump; X/Square to attack|L1/LB to use the psychic power",
    briefing:
      "Psychonauts 2 is an observation game: every mind has its own rules, so test the environment before the collectible, and use levitation to reach the high path.",
  },
  {
    slug: "ratchet-rift-apart",
    name: "Ratchet & Clank: Rift Apart",
    url: "https://www.playstation.com/en-us/games/ratchet-and-clank-rift-apart/",
    genre: "Adventure",
    released: "2021-06-11",
    rating: 4.6,
    multiplayer: "None",
    tags: "Adventure|Platformer|Action|Sci-Fi|PS5",
    description:
      "Dimension-hopping action platformer with rift traversal, inventive weapons, and cinematic set pieces.",
    objectives: "Complete a rift sequence|Upgrade a weapon|Defeat a boss",
    controls:
      "Left stick to move; right stick to aim|R2 to fire; L2 to strafe|Cross/A to jump; R1 to dash",
    briefing:
      "Rift Apart is a movement shooter: keep strafing, swap weapons for the enemy type, and use the rift to reset a bad angle instead of reloading in the open.",
  },
  {
    slug: "god-of-war-ragnarok",
    name: "God of War Ragnarok",
    url: "https://www.playstation.com/en-us/games/god-of-war-ragnarok/",
    genre: "Adventure",
    released: "2022-11-09",
    rating: 4.8,
    multiplayer: "None",
    tags: "Adventure|Action|Mythology|Cinematic|PlayStation",
    description:
      "Norse action adventure with brutal combat, companion synergy, realm exploration, and a cinematic story.",
    objectives: "Complete a story chapter|Defeat a boss|Unlock a runic attack",
    controls:
      "Left stick to move; right stick to look|R1/R2 to attack; L1 to block|Square/X to use the companion",
    briefing:
      "Ragnarok is a crowd-control game: use the companion to interrupt a ranged threat, save the runic for the armored phase, and block instead of rolling when the guard is up.",
  },
  {
    slug: "stellar-blade",
    name: "Stellar Blade",
    url: "https://www.playstation.com/en-us/games/stellar-blade/",
    genre: "Action",
    released: "2024-04-26",
    rating: 4.4,
    multiplayer: "None",
    tags: "Action|Adventure|Sci-Fi|PlayStation|PS5",
    description:
      "Stylish action adventure with parry timing, combo chains, boss spectacle, and a post-apocalyptic world.",
    objectives: "Defeat a boss|Complete a side mission|Land a perfect parry",
    controls:
      "Left stick to move; right stick to look|Square/X to attack; L1 to parry|R1 to use a skill",
    briefing:
      "Stellar Blade is a timing game: hold the parry until the last frames, use the dodge for the unblockable, and save burst skills for the stagger window.",
  },
  {
    slug: "sifu",
    name: "Sifu",
    url: "https://www.sifugame.com/",
    genre: "Action",
    released: "2022-02-08",
    rating: 4.4,
    multiplayer: "None",
    tags: "Action|Martial Arts|Roguelike|Indie|PC",
    description:
      "Martial-arts roguelike with stance switching, environmental combat, and an age-advancing death loop.",
    objectives: "Clear a club floor|Defeat a boss|Complete a shortcut",
    controls:
      "Left stick or WASD to move|Square/X to attack; L1 to block|Circle/B to dodge; R1 for a finisher",
    briefing:
      "Sifu is a crowd-reading game: isolate one enemy with a wall, block the low-high mix, and use the environment before the group surrounds you.",
  },

  // ── Open world and RPG ────────────────────────────────────────────────────
  {
    slug: "kingdom-come-2",
    name: "Kingdom Come: Deliverance II",
    url: "https://www.kingdomcomerpg.com/",
    genre: "Open World",
    released: "2025-02-04",
    rating: 4.6,
    multiplayer: "None",
    tags: "Open World|RPG|Historical|Medieval|PC",
    description:
      "Historical open-world RPG with swordplay, stealth, reputation, and a reactive medieval sandbox.",
    objectives: "Complete the prologue|Win a duel|Finish a side quest",
    controls:
      "WASD to move; mouse to look|Left click to attack; right click to block|E to interact",
    briefing:
      "Kingdom Come is a preparation RPG: eat, sleep, and repair before the mission, fight only on your terms, and use speech or stealth when the odds are bad.",
  },
  {
    slug: "ac-shadows",
    name: "Assassin's Creed Shadows",
    url: "https://www.ubisoft.com/en-us/game/assassins-creed/shadows",
    genre: "Open World",
    released: "2025-03-20",
    rating: 4.2,
    multiplayer: "None",
    tags: "Open World|Action|Stealth|Historical|PC",
    description:
      "Feudal Japan open-world adventure with two protagonists, stealth routes, seasonal cover, and castle infiltration.",
    objectives:
      "Complete a castle infiltration|Recruit an ally|Defeat a target",
    controls:
      "WASD to move; mouse to look|Left click to attack; right click to aim|C to crouch; E to interact",
    briefing:
      "Shadows is a route game: scout the compound with the eagle, use the season and rooftops for cover, and leave a clear escape before striking the target.",
  },
  {
    slug: "ghost-of-yotei",
    name: "Ghost of Yotei",
    url: "https://www.playstation.com/en-us/games/ghost-of-yotei/",
    genre: "Open World",
    released: "2025-10-02",
    rating: 4.6,
    multiplayer: "None",
    tags: "Open World|Action|Samurai|PlayStation|PS5",
    description:
      "Open-world samurai adventure with stance-based swordplay, tracking, and a revenge-driven frontier story.",
    objectives: "Defeat a camp leader|Upgrade a weapon|Complete a bounty",
    controls:
      "Left stick to move; right stick to look|R1 to attack; L1 to block|R2 to use a tool; Cross/A to dodge",
    briefing:
      "Yotei is a stance game: switch to the counter for the enemy weapon, use the wind to track a target, and clear the archers before the duel.",
  },
  {
    slug: "avowed",
    name: "Avowed",
    url: "https://www.obsidian.net/games/avowed",
    genre: "Open World",
    released: "2025-02-18",
    rating: 4.2,
    multiplayer: "None",
    tags: "Open World|RPG|Fantasy|First Person|PC",
    description:
      "First-person fantasy RPG with dual-wielded combat, companion choices, and a handcrafted living-lands setting.",
    objectives:
      "Complete a companion quest|Defeat a boss|Upgrade a unique weapon",
    controls:
      "WASD to move; mouse to look|Left click to attack; right click to block or aim|Q/E for abilities",
    briefing:
      "Avowed is a build game: pair a ranged and melee option, keep a companion ability for the elite, and explore the side path before the main gate.",
  },
  {
    slug: "stalker-2",
    name: "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
    url: "https://www.stalker2.com/",
    genre: "Open World",
    released: "2024-11-20",
    rating: 4.2,
    multiplayer: "None",
    tags: "Open World|Survival|Horror|Shooter|PC",
    description:
      "Open-world survival shooter in the Chornobyl Exclusion Zone with anomalies, factions, and scarce resources.",
    objectives:
      "Reach a safe settlement|Complete a stash run|Survive an emission",
    controls:
      "WASD to move; mouse to aim and fire|Tab for inventory|G to throw a grenade",
    briefing:
      "STALKER is an attrition game: carry food, ammo, and a route out, avoid anomalies by reading the detector, and do not fight every mutant you hear.",
  },
  {
    slug: "star-wars-outlaws",
    name: "Star Wars Outlaws",
    url: "https://www.ubisoft.com/en-us/game/star-wars/outlaws",
    genre: "Open World",
    released: "2024-08-30",
    rating: 4.0,
    multiplayer: "None",
    tags: "Open World|Adventure|Sci-Fi|Stealth|PC",
    description:
      "Scoundrel open-world adventure with syndicate reputation, stealth, speeder traversal, and space contracts.",
    objectives:
      "Complete a syndicate job|Upgrade the speeder|Finish a stealth outpost",
    controls:
      "WASD to move; mouse to look|Left click to shoot; right click to aim|C to crouch; E to interact",
    briefing:
      "Outlaws is a reputation game: pick a syndicate to please, use Nix to scout and distract, and avoid a loud fight inside a restricted outpost.",
  },
  {
    slug: "dragons-dogma-2",
    name: "Dragon's Dogma 2",
    url: "https://www.dragonsdogma.com/2/",
    genre: "Open World",
    released: "2024-03-22",
    rating: 4.3,
    multiplayer: "None",
    tags: "Open World|Action RPG|Fantasy|Pawn System|PC",
    description:
      "Open-world action RPG with pawn companions, emergent monster encounters, and physical climbing combat.",
    objectives: "Hire a pawn|Defeat a cyclops|Complete a riftstone quest",
    controls:
      "WASD to move; mouse to attack|Space to jump; Shift to sprint|E to interact; Q for pawn commands",
    briefing:
      "Dragon's Dogma is a journey game: hire pawns that cover your weaknesses, carry camping gear, and climb the large monster instead of chipping its legs.",
  },
  {
    slug: "infinite-wealth",
    name: "Like a Dragon: Infinite Wealth",
    url: "https://store.steampowered.com/app/2072450/Like_a_Dragon_Infinite_Wealth/",
    genre: "Open World",
    released: "2024-01-26",
    rating: 4.6,
    multiplayer: "None",
    tags: "Open World|RPG|Crime|Turn-Based|PC",
    description:
      "Turn-based crime RPG with dual protagonists, job systems, city exploration, and a huge side-story sandbox.",
    objectives:
      "Recruit a party member|Complete a job change|Finish a substory",
    controls:
      "WASD to move; mouse to look|A/X to confirm; B/Circle to cancel|Space or confirm to attack",
    briefing:
      "Infinite Wealth is a positioning RPG: move behind an enemy for bonus damage, use the environment, and keep one healer job in the party.",
  },
  {
    slug: "black-myth-wukong",
    name: "Black Myth: Wukong",
    url: "https://www.blackmythwukong.com/",
    genre: "Action",
    released: "2024-08-20",
    rating: 4.5,
    multiplayer: "None",
    tags: "Action|RPG|Mythology|Soulslike|PC",
    description:
      "Mythological action RPG with staff combos, transformations, spell loadouts, and demanding boss fights.",
    objectives: "Defeat a boss|Unlock a transformation|Complete a shrine route",
    controls:
      "WASD to move; mouse to attack|Space to dodge; Shift to sprint|Q/E/R for spells and transformations",
    briefing:
      "Wukong is a stamina game: dodge through the combo instead of away, save the transformation for the second phase, and use the staff range to punish a whiff.",
  },
  {
    slug: "clair-obscur",
    name: "Clair Obscur: Expedition 33",
    url: "https://www.expedition33.com/",
    genre: "RPG",
    released: "2025-04-24",
    rating: 4.8,
    multiplayer: "None",
    tags: "RPG|Turn-Based|Fantasy|Story|PC",
    description:
      "Turn-based RPG with real-time dodge and parry windows, painterly art, and a focused party-driven story.",
    objectives: "Complete an expedition zone|Land a parry|Defeat a boss",
    controls:
      "WASD to move; mouse to look|Space or confirm to attack|Dodge and parry on their bound keys",
    briefing:
      "Expedition 33 is a rhythm RPG: learn the enemy tell for the parry, spend action points on the break window, and keep a revive resource for the second phase.",
  },

  {
    slug: "ff7-rebirth",
    name: "Final Fantasy VII Rebirth",
    url: "https://store.steampowered.com/app/2909400/FINAL_FANTASY_VII_REBIRTH/",
    genre: "RPG",
    released: "2024-02-29",
    rating: 4.7,
    multiplayer: "None",
    tags: "RPG|Action RPG|Fantasy|Open World|PS5",
    description:
      "Action RPG with party synergy, open-region exploration, minigames, and a retelling of the middle chapter.",
    objectives:
      "Recruit a party member|Complete a region quest|Defeat a summon",
    controls:
      "Left stick to move; right stick to look|Square/X to attack; R1 to use an ability|L1 to block",
    briefing:
      "Rebirth is a pressure-and-stagger RPG: build stagger with the right element, switch characters to keep the gauge moving, and save the limit for the stagger window.",
  },
  {
    slug: "elden-ring",
    name: "Elden Ring",
    url: "https://en.bandainamcoent.eu/elden-ring/elden-ring",
    genre: "RPG",
    released: "2022-02-25",
    rating: 4.8,
    multiplayer: "None",
    tags: "RPG|Soulslike|Open World|Dark Fantasy|PC",
    description:
      "Open-world soulslike with legacy dungeons, build-defining weapons, and demanding bosses.",
    objectives:
      "Defeat a shardbearer|Upgrade a weapon|Complete a legacy dungeon",
    controls:
      "WASD to move; mouse to attack|Space to dodge; Shift to sprint|Q for the flask; E to interact",
    briefing:
      "Elden Ring is a build and exploration game: level vigor first, leave a boss you cannot read and explore for upgrades, and fight with the camera unlocked in a crowd.",
  },
  {
    slug: "baldurs-gate-3",
    name: "Baldur's Gate 3",
    url: "https://baldursgate3.game/",
    genre: "RPG",
    released: "2023-08-03",
    rating: 4.9,
    multiplayer: "Server",
    tags: "RPG|Turn-Based|D&D|Co-op|Multiplayer|PC",
    description:
      "Turn-based Dungeons & Dragons RPG with deep party builds, branching choices, and four-player co-op.",
    objectives:
      "Recruit a companion|Win a tactical fight|Complete a companion quest",
    controls:
      "WASD to move; mouse to select|Left click to move or attack|Space to end the turn; Tab for party inventory",
    briefing:
      "BG3 is a positioning game: use height, shove enemies into hazards, and spend your action on the control spell before the damage spell.",
  },
  {
    slug: "cyberpunk-2077",
    name: "Cyberpunk 2077",
    url: "https://www.cyberpunk.net/us/en/",
    genre: "Open World",
    released: "2020-12-10",
    rating: 4.5,
    multiplayer: "None",
    tags: "Open World|RPG|Sci-Fi|First Person|PC",
    description:
      "Open-world sci-fi RPG with build-defining cyberware, first-person combat, and a dense neon city.",
    objectives: "Complete a main job|Install a cyberware upgrade|Finish a gig",
    controls:
      "WASD to move; mouse to look|Left click to shoot; right click to aim|Q for quickhacks; E to interact",
    briefing:
      "Cyberpunk is a build game: pick one combat lane and invest, use quickhacks to open a fight, and keep cover between you and the sniper.",
  },
  {
    slug: "witcher-3",
    name: "The Witcher 3: Wild Hunt",
    url: "https://thewitcher.com/en/witcher3",
    genre: "Open World",
    released: "2015-05-19",
    rating: 4.9,
    multiplayer: "None",
    tags: "Open World|RPG|Fantasy|Story|PC",
    description:
      "Story-driven open-world RPG with monster contracts, alchemy, meaningful choices, and two acclaimed expansions.",
    objectives: "Complete a contract|Craft a witcher set|Finish a main quest",
    controls:
      "WASD to move; mouse to attack|Space to dodge; Alt to sprint|Q for signs; E to interact",
    briefing:
      "The Witcher is a preparation game: read the bestiary, brew the oil and potion for the hunt, and use signs to control the fight before the heavy attack.",
  },
  {
    slug: "rdr2",
    name: "Red Dead Redemption 2",
    url: "https://www.rockstargames.com/reddeadredemption2",
    genre: "Open World",
    released: "2018-10-26",
    rating: 4.9,
    multiplayer: "None",
    tags: "Open World|Action|Western|Story|PC",
    description:
      "Western open-world epic with deliberate pacing, hunting, camp life, and a landmark narrative.",
    objectives:
      "Complete a story mission|Upgrade the camp|Bring a perfect pelt to the trapper",
    controls:
      "WASD to move; mouse to look|Left click to shoot; right click to aim|E to interact; Tab for the satchel",
    briefing:
      "RDR2 is a pacing game: keep your horse fed and your cores up, use cover instead of standing in the open, and let the world slow you down between missions.",
  },
  {
    slug: "hogwarts-legacy",
    name: "Hogwarts Legacy",
    url: "https://www.hogwartslegacy.com/",
    genre: "Open World",
    released: "2023-02-10",
    rating: 4.5,
    multiplayer: "None",
    tags: "Open World|RPG|Magic|Fantasy|PC",
    description:
      "Open-world wizarding adventure with spell combos, room customization, and school-life exploration.",
    objectives:
      "Learn a spell|Complete a class assignment|Defeat a dark wizard camp",
    controls:
      "WASD to move; mouse to look|Left click to cast; right click to aim|Q/E/R for spell sets",
    briefing:
      "Hogwarts Legacy is a combo game: chain a control spell into damage, keep the shield colour in mind, and use stealth before a crowded camp.",
  },
  {
    slug: "starfield",
    name: "Starfield",
    url: "https://bethesda.net/en/game/starfield",
    genre: "Open World",
    released: "2023-09-06",
    rating: 4.1,
    multiplayer: "None",
    tags: "Open World|RPG|Sci-Fi|Space|PC",
    description:
      "Space RPG with ship building, faction quests, planetary exploration, and a grounded science-fiction tone.",
    objectives:
      "Complete a faction mission|Upgrade a ship system|Survey a planet",
    controls:
      "WASD to move; mouse to look|Left click to shoot; right click to aim|Tab for inventory; E to interact",
    briefing:
      "Starfield is a systems game: invest in one weapon class, keep ship parts for the jump range you need, and use the scanner before landing blind.",
  },
  {
    slug: "no-mans-sky",
    name: "No Man's Sky",
    url: "https://www.nomanssky.com/",
    genre: "Open World",
    released: "2016-08-09",
    rating: 4.4,
    multiplayer: "Server",
    tags: "Open World|Survival|Space|Exploration|Multiplayer|PC",
    description:
      "Procedural space exploration with base building, ship upgrades, multiplayer expeditions, and endless planets.",
    objectives:
      "Repair your ship|Build a base terminal|Complete a nexus mission",
    controls:
      "WASD to move; mouse to look|Left click to use the mining beam|E to interact; Tab for inventory",
    briefing:
      "No Man's Sky is a resource loop: recharge hazard protection before a storm, keep launch fuel, and follow one objective instead of chasing every signal.",
  },
  {
    slug: "persona-5-royal",
    name: "Persona 5 Royal",
    url: "https://store.steampowered.com/app/1687950/Persona_5_Royal/",
    genre: "RPG",
    released: "2020-03-31",
    rating: 4.8,
    multiplayer: "None",
    tags: "RPG|Turn-Based|JRPG|Social Sim|PC",
    description:
      "Stylish turn-based JRPG with social links, dungeon crawling, persona fusion, and a calendar-driven story.",
    objectives: "Clear a palace|Raise a confidant rank|Fuse a new persona",
    controls:
      "WASD to move; mouse to look|A/X to confirm; B/Circle to cancel|Tab for the menu",
    briefing:
      "Persona is a calendar game: bank social time before a palace deadline, exploit enemy weaknesses for the extra turn, and fuse rather than hoard personas.",
  },

  // ── Horror ────────────────────────────────────────────────────────────────
  {
    slug: "phasmophobia",
    name: "Phasmophobia",
    url: "https://www.phasmophobia.com/",
    genre: "Horror",
    released: "2020-09-18",
    rating: 4.5,
    multiplayer: "Server",
    tags: "Horror|Co-op|Multiplayer|Ghost Hunting|PC",
    description:
      "Four-player ghost-hunting investigation with evidence tools, voice recognition, and escalating hauntings.",
    objectives: "Identify a ghost|Complete an evidence set|Survive a hunt",
    controls:
      "WASD to move; mouse to look|E to interact; F to use the flashlight|V for local voice",
    briefing:
      "Phasmophobia is a process game: set up the evidence tools before provoking, watch sanity and the fuse box, and call the hunt direction instead of running blind.",
  },
  {
    slug: "outlast-trials",
    name: "The Outlast Trials",
    url: "https://www.redbarrelsgames.com/games/the-outlast-trials/",
    genre: "Horror",
    released: "2024-03-05",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Horror|Co-op|Multiplayer|Survival|PC",
    description:
      "Co-op survival horror set in Cold War trials, with stealth routes, scarce resources, and pursuit encounters.",
    objectives: "Complete a trial|Revive a teammate|Escape a pursuer",
    controls:
      "WASD to move; mouse to look|Shift to sprint; Ctrl to crouch|E to interact; Q to use an item",
    briefing:
      "Outlast Trials is a route game: learn one escape path per room, split objectives so one player keeps the pursuer busy, and conserve the healing item for the exit.",
  },
  {
    slug: "alan-wake-2",
    name: "Alan Wake 2",
    url: "https://www.alanwake.com/",
    genre: "Horror",
    released: "2023-10-27",
    rating: 4.6,
    multiplayer: "None",
    tags: "Horror|Action|Story|Cinematic|PC",
    description:
      "Survival-horror sequel with dual protagonists, flashlight-and-gun combat, and a metafictional detective story.",
    objectives: "Complete a chapter|Solve a case board|Defeat a boss",
    controls:
      "WASD to move; mouse to look|Left click to shoot; right click to aim|F to use the flashlight; E to interact",
    briefing:
      "Alan Wake 2 is a resource game: burn the shield before spending bullets, keep a flare for the ambush, and use the case board when the objective is unclear.",
  },
  {
    slug: "resident-evil-4",
    name: "Resident Evil 4",
    url: "https://www.residentevil.com/4/",
    genre: "Horror",
    released: "2023-03-24",
    rating: 4.8,
    multiplayer: "None",
    tags: "Horror|Action|Survival|Third Person|PC",
    description:
      "Survival-horror remake with precise shooting, knife parries, resource management, and relentless pacing.",
    objectives: "Survive a village encounter|Upgrade a weapon|Defeat a boss",
    controls:
      "WASD to move; mouse to aim and fire|Space to dodge; Shift to sprint|E to interact; R to reload",
    briefing:
      "Resident Evil 4 is a crowd-control game: shoot the legs to stagger, use the knife parry for the grab, and save the heavy ammo for the elite.",
  },
  {
    slug: "silent-hill-2",
    name: "Silent Hill 2",
    url: "https://www.konami.com/games/silenthill/2r/",
    genre: "Horror",
    released: "2024-10-08",
    rating: 4.6,
    multiplayer: "None",
    tags: "Horror|Survival|Story|Psychological|PC",
    description:
      "Psychological survival-horror remake with fog-bound exploration, deliberate combat, and a landmark story.",
    objectives:
      "Explore an apartment block|Solve a building route|Defeat a boss",
    controls:
      "WASD to move; mouse to look|Left click to attack; right click to aim|Shift to sprint; E to interact",
    briefing:
      "Silent Hill is a tension game: listen for the enemy before entering a room, save the healing item, and use the map to plan a route back to safety.",
  },
  {
    slug: "dead-by-daylight",
    name: "Dead by Daylight",
    url: "https://deadbydaylight.com/",
    genre: "Horror",
    released: "2016-06-14",
    rating: 4.3,
    multiplayer: "Server",
    tags: "Horror|Multiplayer|PvP|Asymmetric|PC",
    description:
      "Asymmetric horror multiplayer with one killer against four survivors, generators, chases, and perk builds.",
    objectives:
      "Repair a generator|Escape a trial|Complete a survivor challenge",
    controls:
      "WASD to move; mouse to look|Shift to sprint|E to interact; Space to vault",
    briefing:
      "Dead by Daylight is a time game: spread generator pressure, loop the killer around a strong tile, and leave the trial when the exit is open.",
  },
  {
    slug: "dead-space",
    name: "Dead Space",
    url: "https://www.ea.com/games/dead-space/dead-space",
    genre: "Horror",
    released: "2023-01-27",
    rating: 4.7,
    multiplayer: "None",
    tags: "Horror|Sci-Fi|Survival|Third Person|PC",
    description:
      "Sci-fi survival-horror remake with strategic dismemberment, zero-gravity sections, and a derelict ship.",
    objectives:
      "Complete a ship sector|Upgrade the plasma cutter|Defeat a necromorph boss",
    controls:
      "WASD to move; mouse to aim and fire|Space to stomp; Shift to sprint|E to interact",
    briefing:
      "Dead Space is an ammo game: cut the limbs instead of the torso, use stasis before a crowd, and keep one node for the weapon you actually use.",
  },
];

const GENRE_ART: Record<
  string,
  { eyebrow: string; accentStart: string; accentEnd: string }
> = {
  Shooting: {
    eyebrow: "Next-Gen Arena",
    accentStart: "#fb923c",
    accentEnd: "#7c2d12",
  },
  "Battle Royale": {
    eyebrow: "Last Squad Standing",
    accentStart: "#f472b6",
    accentEnd: "#831843",
  },
  Strategy: {
    eyebrow: "Command Layer",
    accentStart: "#38bdf8",
    accentEnd: "#0c4a6e",
  },
  "Co-op": {
    eyebrow: "Squad Link",
    accentStart: "#22d3ee",
    accentEnd: "#0e7490",
  },
  Survival: {
    eyebrow: "Wildlands",
    accentStart: "#84cc16",
    accentEnd: "#1a2e05",
  },
  Sports: {
    eyebrow: "Live Sports",
    accentStart: "#4ade80",
    accentEnd: "#14532d",
  },
  Racing: {
    eyebrow: "Racing Line",
    accentStart: "#facc15",
    accentEnd: "#713f12",
  },
  Fighting: {
    eyebrow: "Fight Night",
    accentStart: "#fb7185",
    accentEnd: "#881337",
  },
  Adventure: {
    eyebrow: "Adventure Drop",
    accentStart: "#a78bfa",
    accentEnd: "#4c1d95",
  },
  Action: {
    eyebrow: "Action Signal",
    accentStart: "#f97316",
    accentEnd: "#7c2d12",
  },
  Platformer: {
    eyebrow: "Precision Run",
    accentStart: "#fbbf24",
    accentEnd: "#78350f",
  },
  "Open World": {
    eyebrow: "Open World",
    accentStart: "#38bdf8",
    accentEnd: "#075985",
  },
  RPG: { eyebrow: "RPG Depth", accentStart: "#e879f9", accentEnd: "#701a75" },
  Horror: {
    eyebrow: "After Dark",
    accentStart: "#94a3b8",
    accentEnd: "#1e293b",
  },
};

const split = (value: string): string[] =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

/** Curated non-swapped-genre wave; every row uses an explicit external launch. */
export const GENRE_REFRESH_GAMES: Game[] = ROWS.map((row): Game => {
  const controls = split(row.controls);
  const art = GENRE_ART[row.genre] ?? {
    eyebrow: "Next Wave",
    accentStart: "#a855f7",
    accentEnd: "#3b0764",
  };
  return {
    id: `spot-${row.slug}`,
    name: row.name,
    url: row.url,
    description: row.description,
    genre: row.genre,
    tags: split(row.tags),
    releaseDate: row.released,
    rating: row.rating,
    availability: "Online",
    playersOnline: 0,
    multiplayerType: row.multiplayer,
    badgeIds: ["modern", "featured"],
    sessionObjectives: split(row.objectives),
    controlHints: controls,
    aiBriefing: row.briefing,
    launchConfig: {
      approvedExternalUrl: row.url,
      embedMode: "external-only",
      telemetryMode: "none",
      controls,
      modes: [row.multiplayer === "None" ? "Solo" : "Online Multiplayer"],
      trustNote:
        "Official publisher destination reviewed 2026-10-23. Opens externally after the domain confirmation; no embed or redistribution is assumed.",
    },
    art,
  };
});
