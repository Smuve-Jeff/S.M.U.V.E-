import { ThaSpotFeed } from './game';

export const THA_SPOT_FALLBACK_FEED: ThaSpotFeed = {
  "badges": [
    {
      "id": "featured",
      "label": "Featured",
      "tone": "primary"
    },
    {
      "id": "trending",
      "label": "Trending",
      "tone": "secondary"
    },
    {
      "id": "new-drop",
      "label": "New Drop",
      "tone": "warning"
    },
    {
      "id": "tournament-live",
      "label": "Tournament Live",
      "tone": "secondary"
    },
    {
      "id": "staff-pick",
      "label": "Staff Pick",
      "tone": "accent"
    },
    {
      "id": "elite",
      "label": "ELITE TIER",
      "tone": "accent"
    },
    {
      "id": "classic",
      "label": "Classic",
      "tone": "primary"
    },
    {
      "id": "next-gen",
      "label": "NEXT-GEN",
      "tone": "accent"
    },
    {
      "id": "modern",
      "label": "MODERN",
      "tone": "secondary"
    }
  ],
  "rooms": [
    {
      "id": "all",
      "name": "All Games",
      "icon": "grid_view",
      "description": "Dynamic command deck for every active Tha Spot cabinet and live floor."
    },
    {
      "id": "producer-lounge",
      "name": "Producer Lounge",
      "icon": "music_note",
      "description": "Music-first picks for creators moving between beats, sessions, and challenges.",
      "spotlight": "Best for artists coming straight from Studio.",
      "rules": {
        "genres": [
          "Music Battle",
          "Rhythm"
        ],
        "tags": [
          "Original",
          "Rhythm",
          "AI"
        ]
      }
    },
    {
      "id": "arcade",
      "name": "Arcade",
      "icon": "joystick",
      "description": "Fast rotations, reflex-first play, and short-session focus runs.",
      "rules": {
        "tags": [
          "Arcade",
          "Reflex",
          "Retro"
        ]
      }
    },
    {
      "id": "versus-night",
      "name": "Versus Night",
      "icon": "sports_kabaddi",
      "description": "Competitive rooms with PvP, bracket pressure, and live match queues.",
      "spotlight": "Queue times update from active multiplayer titles.",
      "rules": {
        "tags": [
          "PvP",
          "Combat",
          "Multiplayer",
          "Versus"
        ],
        "badgeIds": [
          "tournament-live"
        ]
      }
    },
    {
      "id": "sports",
      "name": "Sports",
      "icon": "sports_basketball",
      "description": "Athletic sims, head-to-head runs, and tournament ladders.",
      "rules": {
        "genres": [
          "Sports"
        ],
        "tags": [
          "Basketball",
          "Soccer",
          "Football"
        ]
      }
    },
    {
      "id": "fighting-pit",
      "name": "Fighting",
      "icon": "sports_mma",
      "description": "Combo-first cabinets, bracket tension, and head-to-head pressure sets.",
      "spotlight": "Built for versus specialists and live fight-night rotations.",
      "rules": {
        "genres": [
          "Fighting"
        ]
      }
    },
    {
      "id": "shooting-range",
      "name": "Shooting",
      "icon": "my_location",
      "description": "Aim drills, tactical firefights, and high-pressure ranged runs.",
      "spotlight": "Highlights tactical shooters, squad lanes, and live-fire rotations.",
      "rules": {
        "genres": [
          "Shooting"
        ]
      }
    },
    {
      "id": "rpg-vault",
      "name": "RPG",
      "icon": "shield",
      "description": "Progression-heavy adventures, hero builds, raids, and campaign depth.",
      "spotlight": "Curates every cabinet tagged for RPG progression and boss-run depth.",
      "rules": {
        "tags": [
          "RPG"
        ]
      }
    },
    {
      "id": "co-op-link",
      "name": "Online Co-op",
      "icon": "groups",
      "description": "Squad-first cabinets tuned for online co-op, raids, and shared objectives.",
      "spotlight": "Live squad matchmaking prioritizes shared online objectives.",
      "rules": {
        "tags": [
          "Co-op"
        ]
      }
    },
    {
      "id": "strategy",
      "name": "Strategy",
      "icon": "psychology",
      "description": "High-IQ play, puzzle solving, and room-based mind games.",
      "rules": {
        "genres": [
          "Strategy",
          "Puzzle",
          "Classic"
        ]
      }
    },
    {
      "id": "weekend-clash",
      "name": "Weekend Clash",
      "icon": "bolt",
      "description": "Limited-time event room rotating around featured and live tournament games.",
      "limitedTime": true,
      "spotlight": "Rotates with live events and staff promotions.",
      "rules": {
        "badgeIds": [
          "featured",
          "tournament-live"
        ]
      }
    },
    {
      "id": "neo-zone",
      "name": "NEO_ZONE",
      "description": "Next-Gen execution. High-fidelity WebGL and Cloud-linked cabinets.",
      "icon": "auto_awesome"
    }
  ],
  "liveEvents": [
    {
      "id": "event-1",
      "title": "Tha Battlefield Friday Bracket",
      "description": "Live matchmaking ladder with featured room drops for every completed round.",
      "roomId": "versus-night",
      "reward": "Clash Banner Drop",
      "status": "live",
      "windowLabel": "Live now",
      "featuredGameId": "battlefield",
      "badgeId": "tournament-live",
      "schedule": {
        "startAt": "2026-04-04T20:00:00.000Z",
        "endAt": "2026-04-07T05:00:00.000Z",
        "recurrence": "weekend",
        "eligibilityTags": [
          "Multiplayer",
          "PvP"
        ],
        "rewardType": "cosmetic"
      }
    },
    {
      "id": "event-2",
      "title": "Producer Lounge Daily Challenge",
      "description": "Hold a clean 30-note run across rhythm picks to secure a fresh badge.",
      "roomId": "producer-lounge",
      "reward": "Studio skin drop",
      "status": "upcoming",
      "windowLabel": "Starts in 2h",
      "featuredGameId": "remix-arena",
      "badgeId": "new-drop",
      "schedule": {
        "startAt": "2026-04-06T20:00:00.000Z",
        "endAt": "2026-04-07T20:00:00.000Z",
        "recurrence": "daily",
        "eligibilityTags": [
          "Rhythm",
          "Original"
        ],
        "rewardType": "cosmetic"
      }
    },
    {
      "id": "event-3",
      "title": "Weekend Clash Spotlight",
      "description": "Staff-curated rotation of featured rooms, promos, and limited cabinet drops.",
      "roomId": "weekend-clash",
      "reward": "Weekend tokens",
      "status": "ending-soon",
      "windowLabel": "Ends tonight",
      "featuredGameId": "hextris",
      "badgeId": "featured",
      "schedule": {
        "startAt": "2026-04-05T00:00:00.000Z",
        "endAt": "2026-04-07T12:00:00.000Z",
        "recurrence": "weekend",
        "eligibilityTags": [
          "Featured"
        ],
        "rewardType": "token"
      }
    },
    {
      "id": "event-4",
      "title": "Fight Night Ladder",
      "description": "Live bracket surge across the Fighting room with combo-driven seeding and fast rematches.",
      "roomId": "fighting-pit",
      "reward": "Arena title card",
      "status": "live",
      "windowLabel": "Live now",
      "featuredGameId": "arena-clash",
      "badgeId": "tournament-live",
      "schedule": {
        "startAt": "2026-04-11T20:00:00.000Z",
        "endAt": "2026-04-14T04:00:00.000Z",
        "recurrence": "weekend",
        "eligibilityTags": [
          "Fighting",
          "Multiplayer"
        ],
        "rewardType": "cosmetic"
      }
    },
    {
      "id": "event-5",
      "title": "Co-op Raid Window",
      "description": "Squad up for shared objective bonuses across the Online Co-op rotation.",
      "roomId": "co-op-link",
      "reward": "Squad token cache",
      "status": "upcoming",
      "windowLabel": "Starts soon",
      "featuredGameId": "mythic-raid-online",
      "badgeId": "featured",
      "schedule": {
        "startAt": "2026-04-12T18:00:00.000Z",
        "endAt": "2026-04-13T06:00:00.000Z",
        "recurrence": "daily",
        "eligibilityTags": [
          "Co-op",
          "Multiplayer"
        ],
        "rewardType": "token"
      }
    }
  ],
  "socialPresence": [
    {
      "id": "presence-1",
      "name": "MixMaven",
      "status": "hosting",
      "activity": "Hosting a remix lobby in Tha Battlefield",
      "roomId": "versus-night",
      "gameId": "1",
      "relationship": "party",
      "joinable": true,
      "partySize": 3,
      "cta": "Join party",
      "alert": "Party chat is live."
    },
    {
      "id": "presence-2",
      "name": "GridWalker",
      "status": "queueing",
      "activity": "Queued for the Friday bracket",
      "roomId": "versus-night",
      "gameId": "1",
      "relationship": "rival",
      "joinable": true,
      "cta": "Track rival",
      "alert": "Bracket rival on a win streak."
    },
    {
      "id": "presence-3",
      "name": "ChessExecutive",
      "status": "in-match",
      "activity": "Closing an endgame on Grandmaster Chess",
      "roomId": "strategy",
      "gameId": "11",
      "relationship": "friend",
      "joinable": true,
      "cta": "Watch friend"
    },
    {
      "id": "presence-4",
      "name": "StudioGhost",
      "status": "invited",
      "activity": "Browsing staff picks after a Studio export",
      "roomId": "producer-lounge",
      "gameId": "2",
      "relationship": "invite",
      "pendingInvite": true,
      "partySize": 2,
      "cta": "Accept invite",
      "alert": "Invite expires in 12m."
    },
    {
      "id": "presence-5",
      "name": "ComboSage",
      "status": "queueing",
      "activity": "Queued for an Arena Clash X ladder set",
      "roomId": "fighting-pit",
      "gameId": "38",
      "relationship": "rival",
      "joinable": true,
      "cta": "Track rival",
      "alert": "Rival is warming up on the fight card."
    },
    {
      "id": "presence-6",
      "name": "SniperLoop",
      "status": "hosting",
      "activity": "Hosting a Squad Ops breach room",
      "roomId": "shooting-range",
      "gameId": "42",
      "relationship": "party",
      "joinable": true,
      "partySize": 4,
      "cta": "Join squad",
      "alert": "Voice sync is live for the next breach."
    },
    {
      "id": "presence-7",
      "name": "LootOracle",
      "status": "in-match",
      "activity": "Deep in a Mythic Raid Online boss phase",
      "roomId": "rpg-vault",
      "gameId": "44",
      "relationship": "friend",
      "joinable": true,
      "cta": "Watch raid"
    },
    {
      "id": "presence-8",
      "name": "PartyBeacon",
      "status": "invited",
      "activity": "Squad invite waiting in Raid Fireteam Z",
      "roomId": "co-op-link",
      "gameId": "43",
      "relationship": "invite",
      "pendingInvite": true,
      "partySize": 3,
      "cta": "Accept invite",
      "alert": "Squad slot closes in 8m."
    }
  ],
  "promotions": [
    {
      "id": "promo-1",
      "title": "Carry the rhythm into Studio",
      "description": "Flip a hot streak from Tha Spot into a new session with the DJ deck and sequencer.",
      "route": "/studio",
      "icon": "tune",
      "cta": "Open Studio",
      "roomIds": [
        "producer-lounge"
      ],
      "audienceTags": [
        "producer",
        "returning"
      ],
      "priority": 10,
      "campaignType": "studio",
      "gameIds": [
        "2",
        "5"
      ]
    },
    {
      "id": "promo-2",
      "title": "Launch Remix Arena",
      "description": "Move from gaming collabs into live remix competition without leaving the shell.",
      "route": "/remix-arena",
      "icon": "equalizer",
      "cta": "Go to Remix Arena",
      "roomIds": [
        "versus-night",
        "weekend-clash"
      ],
      "audienceTags": [
        "competitive",
        "social"
      ],
      "priority": 9,
      "campaignType": "arena",
      "gameIds": [
        "1",
        "super-street-fighter",
        "13"
      ]
    },
    {
      "id": "promo-3",
      "title": "Read the Intel Lab",
      "description": "Use performance data from Tha Spot to plan the next campaign move.",
      "route": "/strategy",
      "icon": "analytics",
      "cta": "Open Intel",
      "roomIds": [
        "strategy",
        "sports"
      ],
      "audienceTags": [
        "competitive",
        "returning"
      ],
      "priority": 8,
      "campaignType": "intel"
    }
  ],
  "games": [
    {
      "id": "cyberpunk-2077-cloud",
      "name": "Cyberpunk 2077 (Cloud-Link)",
      "url": "https://www.xbox.com/en-US/play/games/cyberpunk-2077/BW7RDRL3N7BD",
      "description": "Night City awaits. Absolute high-fidelity future simulation.",
      "genre": "RPG",
      "rating": 4.9,
      "playersOnline": 65000,
      "availability": "Online",
      "tags": [
        "RPG",
        "Cloud",
        "Next-Gen",
        "Elite"
      ],
      "badgeIds": [
        "next-gen",
        "elite"
      ],
      "launchConfig": {
        "approvedExternalUrl": "https://www.xbox.com/en-US/play/games/cyberpunk-2077/BW7RDRL3N7BD",
        "embedMode": "external-only"
      }
    },
    {
      "id": "elden-ring-cloud",
      "name": "Elden Ring (Cloud-Link)",
      "url": "https://www.xbox.com/en-US/play/games/elden-ring/9P3J32CTXLRZ",
      "description": "Rise, Tarnished. Absolute next-gen open world mastery.",
      "genre": "RPG",
      "rating": 5.0,
      "playersOnline": 120000,
      "availability": "Online",
      "tags": [
        "RPG",
        "Cloud",
        "Next-Gen",
        "Elite"
      ],
      "badgeIds": [
        "next-gen",
        "elite"
      ],
      "launchConfig": {
        "approvedExternalUrl": "https://www.xbox.com/en-US/play/games/elden-ring/9P3J32CTXLRZ",
        "embedMode": "external-only"
      }
    },
    {
      "id": "halo-3-cloud-elite",
      "name": "Halo 3 (Cloud-Link)",
      "url": "https://www.xbox.com/en-US/play/games/halo-the-master-chief-collection/BPNDH6RLGZ66",
      "description": "Finish the fight. Absolute 360-era dominance via high-fidelity cloud link.",
      "genre": "FPS",
      "rating": 5.0,
      "playersOnline": 45000,
      "availability": "Online",
      "tags": [
        "FPS",
        "Cloud",
        "Xbox 360",
        "Elite",
        "Sequel"
      ],
      "badgeIds": [
        "next-gen",
        "elite"
      ],
      "launchConfig": {
        "approvedExternalUrl": "https://www.xbox.com/en-US/play/games/halo-the-master-chief-collection/BPNDH6RLGZ66",
        "embedMode": "external-only"
      }
    },
    {
      "id": "venge-io-webgl",
      "name": "Venge.io (Next-Gen)",
      "url": "https://venge.io/",
      "description": "High-octane WebGL tactical shooter. Absolute precision required.",
      "genre": "FPS",
      "rating": 4.7,
      "playersOnline": 8900,
      "availability": "Online",
      "tags": [
        "FPS",
        "Multiplayer",
        "WebGL",
        "Modern"
      ],
      "badgeIds": [
        "modern"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://venge.io/",
        "embedMode": "inline"
      }
    },
    {
      "id": "slow-roads-webgl",
      "name": "Slow Roads (WebGL)",
      "url": "https://slowroads.io/",
      "description": "Absolute high-fidelity procedural driving. S.M.U.V.E. relaxation protocols enabled.",
      "genre": "Racing",
      "rating": 4.8,
      "playersOnline": 5400,
      "availability": "Online",
      "tags": [
        "WebGL",
        "Simulation",
        "Modern"
      ],
      "badgeIds": [
        "modern",
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://slowroads.io/",
        "embedMode": "inline"
      }
    },
    {
      "id": "battlefield",
      "name": "Battlefield",
      "url": "/assets/games/battlefield/battlefield.html",
      "description": "Executive rap battle arena with live bracket energy and hybrid queue support.",
      "genre": "Music Battle",
      "rating": 4.9,
      "playersOnline": 1250,
      "availability": "Online",
      "tags": [
        "Multiplayer",
        "Original",
        "PvP",
        "Combat",
        "Elite",
        "Internal",
        "WASM"
      ],
      "multiplayerType": "Server",
      "aiSupportLevel": "Advanced",
      "aiBriefing": "Establish dominance in the rap battle arena. Neural sync is tuned for rhythm precision.",
      "badgeIds": [
        "featured",
        "tournament-live",
        "elite",
        "internal"
      ],
      "queueEstimateMinutes": 3,
      "sessionObjectives": [
        "Win two call-and-response rounds",
        "Hold a perfect timing chain"
      ],
      "controlHints": [
        "Use lane prompts to answer bars",
        "Save your boost for chorus clashes"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Keyboard lanes",
          "Space to trigger boosts"
        ],
        "objectives": [
          "Finish top 3 in the lobby",
          "Maintain 90% rhythm accuracy"
        ],
        "modes": [
          "Solo",
          "Versus",
          "Tournament"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Hybrid internal cabinet with live bracket telemetry.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/battlefield/battlefield.html",
        "approvedEmbedUrl": "/assets/games/battlefield/battlefield.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#10b981",
        "accentEnd": "#064e3b"
      },
      "image": "assets/games/battlefield.png"
    },
    {
      "id": "remix-arena",
      "name": "Remix Arena",
      "url": "/assets/games/remix-arena/remixarena.html",
      "description": "Collaborative sequencing challenge where crews race to flip stems in real time.",
      "genre": "Rhythm",
      "rating": 4.7,
      "playersOnline": 850,
      "availability": "Online",
      "tags": [
        "Multiplayer",
        "Original",
        "Co-op",
        "Rhythm",
        "Elite",
        "Internal",
        "WASM"
      ],
      "multiplayerType": "Server",
      "aiSupportLevel": "Neural",
      "aiBriefing": "Collaborative remix engine is live. S.M.U.V.E. is balancing the sonic stems.",
      "badgeIds": [
        "elite",
        "internal"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Land 3 clean transitions",
        "Chain a team combo"
      ],
      "controlHints": [
        "Swap stems before tension peaks",
        "Watch teammate cue indicators"
      ],
      "launchConfig": {
        "difficulty": "Crew",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Keep crowd energy above 80%",
          "Hit one perfect drop"
        ],
        "modes": [
          "Co-op",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Internal remix cabinet with shared beat telemetry.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/remix-arena/remixarena.html",
        "approvedEmbedUrl": "/assets/games/remix-arena/remixarena.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#22c55e",
        "accentEnd": "#14532d"
      },
      "image": "assets/games/remix-arena.png"
    },
    {
      "id": "neon-drift",
      "name": "Neon Drift",
      "url": "/assets/games/neon-drift/neon-drift.html",
      "description": "Precision lane swaps through a neon expressway tuned for instant offline retries.",
      "genre": "Racing",
      "rating": 4.8,
      "playersOnline": 420,
      "availability": "Online",
      "tags": [
        "Arcade",
        "Offline",
        "Reflex",
        "Elite",
        "Internal",
        "WASM"
      ],
      "badgeIds": [
        "elite",
        "trending",
        "internal"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Survive 90 seconds",
        "Complete a 12-lane chain"
      ],
      "controlHints": [
        "Feather turns early",
        "Stay centered before boosts"
      ],
      "launchConfig": {
        "difficulty": "Medium",
        "controls": [
          "Arrow keys"
        ],
        "objectives": [
          "Finish the first sector clean",
          "Hold one flawless boost chain"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Offline cabinet validated for embedded launch.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/neon-drift/neon-drift.html",
        "approvedEmbedUrl": "/assets/games/neon-drift/neon-drift.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#38bdf8",
        "accentEnd": "#0c4a6e"
      },
      "image": "assets/games/neon-drift.png"
    },
    {
      "id": "vinyl-vault",
      "name": "Vinyl Vault",
      "url": "/assets/games/vinyl-vault/vinyl-vault.html",
      "description": "Crate-digging memory board with quick restarts and staff-curated puzzle loops.",
      "genre": "Puzzle",
      "rating": 4.7,
      "playersOnline": 260,
      "availability": "Online",
      "tags": [
        "Puzzle",
        "Offline",
        "Memory",
        "Elite",
        "Internal",
        "WASM"
      ],
      "badgeIds": [
        "elite",
        "internal"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Clear the board in under 2 minutes",
        "Miss fewer than 3 flips"
      ],
      "controlHints": [
        "Map card clusters before flipping",
        "Work outer lanes first"
      ],
      "launchConfig": {
        "difficulty": "Accessible",
        "controls": [
          "Mouse"
        ],
        "objectives": [
          "Land a clean memory cycle",
          "Reveal every pair without rushing"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Offline cabinet with direct local launch.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/vinyl-vault/vinyl-vault.html",
        "approvedEmbedUrl": "/assets/games/vinyl-vault/vinyl-vault.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#f59e0b",
        "accentEnd": "#78350f"
      },
      "image": "assets/games/vinyl-vault.png"
    },
    {
      "id": "tempo-lockdown",
      "name": "Tempo Lockdown",
      "url": "/assets/games/tempo-lockdown/tempo-lockdown.html",
      "description": "Responsive rhythm lane built for short focus sprints between sessions.",
      "genre": "Rhythm",
      "rating": 4.8,
      "playersOnline": 390,
      "availability": "Online",
      "tags": [
        "Rhythm",
        "Arcade",
        "Original",
        "Elite",
        "Internal",
        "WASM"
      ],
      "badgeIds": [
        "elite",
        "new-drop",
        "internal"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Hold a clean 25-note run",
        "Stay above 95% timing"
      ],
      "controlHints": [
        "Watch the lane color shifts",
        "Trigger boosts on downbeats"
      ],
      "launchConfig": {
        "difficulty": "Adaptive",
        "controls": [
          "Lane keys"
        ],
        "objectives": [
          "Keep the pulse meter green",
          "Finish one perfect chorus"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Internal rhythm cabinet with fast recovery.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/tempo-lockdown/tempo-lockdown.html",
        "approvedEmbedUrl": "/assets/games/tempo-lockdown/tempo-lockdown.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#34d399",
        "accentEnd": "#065f46"
      },
      "image": "assets/games/tempo-lockdown.png"
    },
    {
      "id": "hextris",
      "name": "Hextris",
      "url": "https://hextris.github.io/hextris/",
      "description": "Trusted online arcade puzzler with premium hex-stack gameplay.",
      "genre": "Classic",
      "rating": 4.8,
      "playersOnline": 5200,
      "availability": "Online",
      "tags": [
        "Classic",
        "Arcade",
        "Retro"
      ],
      "badgeIds": [
        "trending"
      ],
      "queueEstimateMinutes": 1,
      "sessionObjectives": [
        "Hold the ring for 4 minutes",
        "Clear one high-speed cycle"
      ],
      "controlHints": [
        "Rotate early",
        "Keep two lanes open for recovery"
      ],
      "launchConfig": {
        "difficulty": "Reflex",
        "controls": [
          "Left / Right arrows"
        ],
        "objectives": [
          "Beat the daily board",
          "Stabilize after speed spikes"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Embedded from an allowlisted partner domain.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://hextris.github.io/hextris/",
        "approvedEmbedUrl": "https://hextris.github.io/hextris/",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://hextris.github.io"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Online",
        "accentStart": "#06b6d4",
        "accentEnd": "#2563eb"
      },
      "image": "assets/games/hextris.png"
    },
    {
      "id": "game-2048",
      "name": "2048",
      "url": "https://play2048.co/",
      "description": "Reliable number-combo classic for quick logic resets between creative work.",
      "genre": "Puzzle",
      "rating": 4.7,
      "playersOnline": 6300,
      "availability": "Online",
      "tags": [
        "Classic",
        "AI",
        "Logic"
      ],
      "aiSupportLevel": "Neural",
      "aiBriefing": "S.M.U.V.E. is analyzing the logic matrix for optimal number combination strategies.",
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Hit 2048 in under 10 minutes",
        "Finish with fewer than 5 dead turns"
      ],
      "controlHints": [
        "Build from one corner",
        "Avoid vertical resets too early"
      ],
      "launchConfig": {
        "difficulty": "Thinking",
        "controls": [
          "Arrow keys"
        ],
        "objectives": [
          "Protect one anchor lane",
          "Finish a clean merge path"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted logic partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://play2048.co/",
        "approvedEmbedUrl": "https://play2048.co/",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://play2048.co"
        ]
      },
      "art": {
        "eyebrow": "Online",
        "accentStart": "#f97316",
        "accentEnd": "#ea580c"
      },
      "image": "assets/games/game-2048.png"
    },
    {
      "id": "music-rush",
      "name": "Music Rush",
      "url": "https://www.gamepix.com/play/music-rush",
      "description": "Sprint through glow landscapes synced to the beat with lightweight online launch.",
      "genre": "Runner",
      "rating": 4.5,
      "playersOnline": 2100,
      "availability": "Online",
      "tags": [
        "Arcade",
        "Reflex",
        "Rhythm"
      ],
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Hold a clean combo for 60 seconds",
        "Clear one hazard rush"
      ],
      "controlHints": [
        "Jump on offbeats",
        "Use slides to reset timing"
      ],
      "launchConfig": {
        "difficulty": "Fast",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Protect your streak",
          "Stay centered during doubles"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted arcade partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/music-rush",
        "approvedEmbedUrl": "https://www.gamepix.com/play/music-rush",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Online",
        "accentStart": "#ec4899",
        "accentEnd": "#db2777"
      },
      "image": "assets/games/music-rush.png"
    },
    {
      "id": "pac-man-elite",
      "name": "Pac-Man",
      "url": "https://www.retrogames.cc/embed/10002-pac-man-midway.html",
      "genre": "Arcade Classic",
      "description": "The most iconic arcade game in history. High-speed ghost chasing logic.",
      "availability": "Online",
      "playersOnline": 32000,
      "rating": 4.8,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Arcade",
        "Retro",
        "WASM"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10002-pac-man-midway.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Namco Elite",
        "accentStart": "#facc15",
        "accentEnd": "#a16207"
      },
      "image": "assets/games/pac-man-elite.png"
    },
    {
      "id": "super-street-fighter",
      "name": "Super Street Fighter II",
      "url": "https://www.retrogames.cc/embed/23550-super-street-fighter-ii-the-new-challengers-usa.html",
      "description": "The legendary world warrior tournament returns with the New Challengers. Master the classic combat that defined a generation.",
      "genre": "Fighting",
      "rating": 4.7,
      "playersOnline": 4500,
      "availability": "Online",
      "tags": [
        "Combat",
        "Arcade",
        "Classic",
        "Fighting",
        "station-cabinet"
      ],
      "badgeIds": [
        "tournament-live"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Defeat 4 opponents in arcade mode",
        "Land a Super Combo finisher"
      ],
      "controlHints": [
        "Master the quarter-circle forward motion",
        "Use heavy attacks to break high guards"
      ],
      "launchConfig": {
        "difficulty": "Bracket",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Survive the first bracket round",
          "Convert one punish cleanly"
        ],
        "modes": [
          "Solo",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Executive-grade retro combat cabinet.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.retrogames.cc/embed/23550-super-street-fighter-ii-the-new-challengers-usa.html",
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/23550-super-street-fighter-ii-the-new-challengers-usa.html",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.retrogames.cc"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Combat",
        "accentStart": "#f97316",
        "accentEnd": "#c2410c"
      },
      "multiplayerType": "Server",
      "image": "assets/games/super-street-fighter.png"
    },
    {
      "id": "chess-classic",
      "name": "Chess Classic",
      "url": "https://www.gamepix.com/play/chess-classic",
      "description": "The ultimate strategy board with steady queues and deep tactical play.",
      "genre": "Strategy",
      "rating": 4.9,
      "playersOnline": 32400,
      "availability": "Online",
      "tags": [
        "Strategy",
        "Logic",
        "Classic",
        "station-pod"
      ],
      "badgeIds": [
        "trending"
      ],
      "queueEstimateMinutes": 1,
      "sessionObjectives": [
        "Win material by move 15",
        "Close one endgame cleanly"
      ],
      "controlHints": [
        "Review checks, captures, threats",
        "Protect your king before expanding"
      ],
      "launchConfig": {
        "difficulty": "Ranked",
        "controls": [
          "Mouse"
        ],
        "objectives": [
          "Hold tempo",
          "Convert one structural edge"
        ],
        "modes": [
          "Solo",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted strategy partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/chess-classic",
        "approvedEmbedUrl": "https://www.gamepix.com/play/chess-classic",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Strategy",
        "accentStart": "#f8fafc",
        "accentEnd": "#1e293b"
      },
      "image": "assets/games/chess-classic.png"
    },
    {
      "id": "basket-random",
      "name": "Basket Random",
      "url": "https://www.gamepix.com/play/basket-random",
      "description": "Step onto the court for fast high-energy basketball runs.",
      "genre": "Sports",
      "rating": 4.5,
      "playersOnline": 7800,
      "availability": "Online",
      "tags": [
        "Sports",
        "Basketball",
        "Competitive",
        "station-pod"
      ],
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 1,
      "sessionObjectives": [
        "Win by 5",
        "Land three clean possessions in a row"
      ],
      "controlHints": [
        "Save boost for fast breaks",
        "Defend the paint first"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Control tempo",
          "Close the game in the final minute"
        ],
        "modes": [
          "Solo",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted sports partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/basket-random",
        "approvedEmbedUrl": "https://www.gamepix.com/play/basket-random",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Sports",
        "accentStart": "#f97316",
        "accentEnd": "#7c2d12"
      },
      "image": "assets/games/basket-random.png"
    },
    {
      "id": "soccer-random",
      "name": "Soccer Random",
      "url": "https://www.gamepix.com/play/soccer-random",
      "description": "Global tournament energy with high player counts and quick rematches.",
      "genre": "Sports",
      "rating": 4.8,
      "playersOnline": 42000,
      "availability": "Online",
      "tags": [
        "Sports",
        "Soccer",
        "Tournament",
        "Multiplayer",
        "station-pod"
      ],
      "badgeIds": [
        "tournament-live",
        "trending"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Keep a clean sheet",
        "Finish two fast breaks"
      ],
      "controlHints": [
        "Switch fields early",
        "Exploit wide channels on counters"
      ],
      "launchConfig": {
        "difficulty": "Tournament",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Survive extra time",
          "Hold your lead under pressure"
        ],
        "modes": [
          "Solo",
          "Versus",
          "Tournament"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted tournament partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/soccer-random",
        "approvedEmbedUrl": "https://www.gamepix.com/play/soccer-random",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Sports",
        "accentStart": "#10b981",
        "accentEnd": "#064e3b"
      },
      "multiplayerType": "Server",
      "image": "assets/games/soccer-random.png"
    },
    {
      "id": "solitaire-classic",
      "name": "Solitaire Classic",
      "url": "https://www.gamepix.com/play/solitaire-classic",
      "description": "Classic card patience run for low-pressure recovery between bigger sessions.",
      "genre": "Strategy",
      "rating": 4.8,
      "playersOnline": 45000,
      "availability": "Online",
      "tags": [
        "Cards",
        "Logic",
        "Classic",
        "station-pod"
      ],
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Finish one clean board",
        "Beat your last completion time"
      ],
      "controlHints": [
        "Expose hidden stacks early",
        "Save kings for flexible columns"
      ],
      "launchConfig": {
        "difficulty": "Calm",
        "controls": [
          "Mouse"
        ],
        "objectives": [
          "Finish under par",
          "Keep the board open"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted classic partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/solitaire-classic",
        "approvedEmbedUrl": "https://www.gamepix.com/play/solitaire-classic",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Cards",
        "accentStart": "#ef4444",
        "accentEnd": "#b91c1c"
      },
      "image": "assets/games/solitaire-classic.png"
    },
    {
      "id": "cipher-surge",
      "name": "Cipher Surge",
      "url": "/assets/games/cipher-surge/cipher-surge.html",
      "description": "Neural pattern-defense cabinet with polished offline AI memory rounds and fast replay loops.",
      "genre": "Puzzle",
      "rating": 4.8,
      "playersOnline": 510,
      "availability": "Online",
      "tags": [
        "Puzzle",
        "AI",
        "Original",
        "Logic",
        "station-pod",
        "Elite",
        "Internal",
        "WASM"
      ],
      "aiSupportLevel": "Advanced",
      "aiBriefing": "Adaptive sequence logic sharpens each round and rewards clean recall under pressure.",
      "badgeIds": [
        "elite",
        "internal"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Clear five neural rounds",
        "Finish with at least 70% integrity"
      ],
      "controlHints": [
        "Watch the full sequence before reacting",
        "Prioritize rhythm over speed on longer chains"
      ],
      "launchConfig": {
        "difficulty": "Adaptive",
        "controls": [
          "Mouse or touch"
        ],
        "objectives": [
          "Hold integrity above 70%",
          "Perfect one full pattern chain"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Internal AI puzzle cabinet tuned for embedded offline play.",
        "embedMode": "inline",
        "approvedExternalUrl": "/assets/games/cipher-surge/cipher-surge.html",
        "approvedEmbedUrl": "/assets/games/cipher-surge/cipher-surge.html",
        "telemetryMode": "origin",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Elite Internal",
        "accentStart": "#8b5cf6",
        "accentEnd": "#4c1d95"
      },
      "image": "assets/games/cipher-surge.png"
    },
    {
      "id": "kart-fight",
      "name": "Kart Fight",
      "url": "https://www.gamepix.com/play/kart-fight",
      "description": "High-speed multiplayer kart combat with premium arena flow, powerups, and replay-ready matches.",
      "genre": "Racing",
      "rating": 4.8,
      "playersOnline": 28000,
      "availability": "Online",
      "tags": [
        "Multiplayer",
        "Versus",
        "Combat",
        "Arcade",
        "station-pod"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "featured",
        "tournament-live"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Win one arena set",
        "Land three clean powerup eliminations"
      ],
      "controlHints": [
        "Save rockets for straightaways",
        "Drift out of crowded corners early"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Stay alive for the full round",
          "Chain one clean boost finish"
        ],
        "modes": [
          "Solo",
          "Versus",
          "Tournament"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted competitive kart partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/kart-fight",
        "approvedEmbedUrl": "https://www.gamepix.com/play/kart-fight",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Kart Combat",
        "accentStart": "#fb7185",
        "accentEnd": "#be123c"
      },
      "image": "assets/games/kart-fight.png"
    },
    {
      "id": "rail-surfers",
      "name": "Rail Surfers",
      "url": "https://www.gamepix.com/play/temple-run-2",
      "description": "A polished endless runner with top-tier flow, vivid presentation, and instant arcade momentum.",
      "genre": "Runner",
      "rating": 4.8,
      "playersOnline": 47000,
      "availability": "Online",
      "tags": [
        "Arcade",
        "Reflex",
        "Trending",
        "station-pod"
      ],
      "badgeIds": [
        "trending"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Hold one clean streak for 90 seconds",
        "Recover from a near miss without dropping pace"
      ],
      "controlHints": [
        "Read lane changes early",
        "Jump late to keep coin lines active"
      ],
      "launchConfig": {
        "difficulty": "Fast",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Beat your last distance",
          "Hold a stable combo through traffic spikes"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted premium runner partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/temple-run-2",
        "approvedEmbedUrl": "https://www.gamepix.com/play/temple-run-2",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Runner",
        "accentStart": "#22c55e",
        "accentEnd": "#0f766e"
      },
      "image": "assets/games/rail-surfers.png"
    },
    {
      "id": "moto-x3m",
      "name": "Moto X3M",
      "url": "https://www.gamepix.com/play/moto-x3m",
      "description": "Precision stunt racing with highly polished track design, strong readability, and fast restart loops.",
      "genre": "Racing",
      "rating": 4.8,
      "playersOnline": 18500,
      "availability": "Online",
      "tags": [
        "Arcade",
        "Reflex",
        "Stunts",
        "station-pod"
      ],
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Clear one stunt run without crashing",
        "Bank a perfect landing chain"
      ],
      "controlHints": [
        "Feather acceleration before jumps",
        "Rotate early to set up clean landings"
      ],
      "launchConfig": {
        "difficulty": "Skill",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Finish clean under par time",
          "Reset quickly after failed landings"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted stunt racing partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/moto-x3m",
        "approvedEmbedUrl": "https://www.gamepix.com/play/moto-x3m",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Stunt Racing",
        "accentStart": "#f97316",
        "accentEnd": "#9a3412"
      },
      "image": "assets/games/moto-x3m.png"
    },
    {
      "id": "tomb-runner",
      "name": "Tomb Runner",
      "url": "https://www.gamepix.com/play/tomb-runner",
      "description": "Cinematic chase runner with premium pacing, polished traversal, and repeat-play flow.",
      "genre": "Runner",
      "rating": 4.7,
      "playersOnline": 39500,
      "availability": "Online",
      "tags": [
        "Arcade",
        "Reflex",
        "Adventure",
        "station-pod"
      ],
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Survive the opening chase cleanly",
        "Hold one long coin lane through a hazard section"
      ],
      "controlHints": [
        "Swipe-equivalent inputs work best before corners",
        "Commit to one lane before bridge gaps"
      ],
      "launchConfig": {
        "difficulty": "Endless",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Beat your previous run distance",
          "Keep momentum through one full hazard cycle"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted endless runner partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/tomb-runner",
        "approvedEmbedUrl": "https://www.gamepix.com/play/tomb-runner",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Adventure Runner",
        "accentStart": "#14b8a6",
        "accentEnd": "#155e75"
      },
      "image": "assets/games/tomb-runner.png"
    },
    {
      "id": "tower-build",
      "name": "Tower Build",
      "url": "https://www.gamepix.com/play/tower-build",
      "description": "Physics-first skyline builder with quick retries and steady score-chasing loops.",
      "genre": "Puzzle",
      "rating": 4.6,
      "playersOnline": 9600,
      "availability": "Online",
      "tags": [
        "Puzzle",
        "Arcade",
        "Physics",
        "station-pod"
      ],
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Hold a balanced tower through 12 drops",
        "Beat your highest skyline height"
      ],
      "controlHints": [
        "Release blocks late to reduce drift",
        "Build a stable center before chasing width"
      ],
      "launchConfig": {
        "difficulty": "Focus",
        "controls": [
          "Mouse or touch"
        ],
        "objectives": [
          "Finish one clean tower run",
          "Recover after one risky placement"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted arcade builder partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/tower-build",
        "approvedEmbedUrl": "https://www.gamepix.com/play/tower-build",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Skyline Builder",
        "accentStart": "#38bdf8",
        "accentEnd": "#0f172a"
      },
      "image": "assets/games/tower-build.png"
    },
    {
      "id": "8-ball-billiards",
      "name": "8-Ball Billiards",
      "url": "https://www.gamepix.com/play/8-ball-billiards-classic",
      "description": "Precision cue-sport cabinet with smooth pacing, clean bank shots, and quick rematches.",
      "genre": "Sports",
      "rating": 4.7,
      "playersOnline": 12800,
      "availability": "Online",
      "tags": [
        "Sports",
        "Pool",
        "Precision",
        "Classic",
        "station-pod"
      ],
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 1,
      "sessionObjectives": [
        "Clear solids or stripes without a scratch",
        "Close one rack with a clean 8-ball finish"
      ],
      "controlHints": [
        "Feather power on long bank attempts",
        "Set up the next ball before calling the pocket"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Mouse"
        ],
        "objectives": [
          "Win one full rack",
          "Protect cue-ball position after contact"
        ],
        "modes": [
          "Solo",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted precision sports partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/8-ball-billiards-classic",
        "approvedEmbedUrl": "https://www.gamepix.com/play/8-ball-billiards-classic",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Cue Sports",
        "accentStart": "#14b8a6",
        "accentEnd": "#164e63"
      },
      "image": "assets/games/8-ball-billiards.png"
    },
    {
      "id": "mahjong",
      "name": "Mahjong",
      "url": "https://www.gamepix.com/play/mahjong-classic",
      "description": "Late-night tile strategy with clean board readability and calm focus-session pacing.",
      "genre": "Puzzle",
      "rating": 4.7,
      "playersOnline": 8400,
      "availability": "Online",
      "tags": [
        "Puzzle",
        "Classic",
        "Logic",
        "Strategy",
        "station-pod"
      ],
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Clear the outer rows first",
        "Finish a board without using hints"
      ],
      "controlHints": [
        "Expose stacked matches early",
        "Track duplicate tiles before opening the center"
      ],
      "launchConfig": {
        "difficulty": "Thinking",
        "controls": [
          "Mouse or touch"
        ],
        "objectives": [
          "Finish one clean board",
          "Keep two match options available"
        ],
        "modes": [
          "Solo"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted puzzle partner with inline launch support.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/mahjong-classic",
        "approvedEmbedUrl": "https://www.gamepix.com/play/mahjong-classic",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Logic Tiles",
        "accentStart": "#a855f7",
        "accentEnd": "#312e81"
      },
      "image": "assets/games/mahjong.png"
    },
    {
      "id": "tactical-squad",
      "name": "Tactical Squad",
      "url": "https://www.gamepix.com/play/special-strike-operations",
      "description": "First-person shooting precision with high-stakes tactical deployments.",
      "genre": "Shooting",
      "rating": 4.8,
      "playersOnline": 15000,
      "availability": "Online",
      "tags": [
        "Shooting",
        "Action",
        "Tactical",
        "Multiplayer",
        "station-pod"
      ],
      "badgeIds": [
        "featured"
      ],
      "launchConfig": {
        "difficulty": "Hard",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/special-strike-operations",
        "approvedExternalUrl": "https://www.gamepix.com/play/special-strike-operations",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "multiplayerType": "Server",
      "queueEstimateMinutes": 3,
      "sessionObjectives": [
        "Hold a clean extraction lane",
        "Clear one tactical breach without losing momentum"
      ],
      "controlHints": [
        "Slice corners before crossing open lanes",
        "Reload on cover transitions"
      ],
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/tactical-squad.png"
    },
    {
      "id": "hero-adventure",
      "name": "Hero Adventure",
      "url": "https://www.gamepix.com/play/hero-adventure",
      "description": "Deep RPG adventure with character progression and boss encounters.",
      "genre": "RPG",
      "rating": 4.7,
      "playersOnline": 9200,
      "availability": "Online",
      "tags": [
        "RPG",
        "Adventure",
        "Progressive",
        "Solo",
        "station-pod"
      ],
      "badgeIds": [
        "staff-pick"
      ],
      "launchConfig": {
        "difficulty": "Moderate",
        "controls": [
          "Touch",
          "Keyboard"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/hero-adventure",
        "approvedExternalUrl": "https://www.gamepix.com/play/hero-adventure",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/hero-adventure.png"
    },
    {
      "id": "battle-city",
      "name": "Battle City",
      "url": "https://www.retrogames.cc/embed/18785-battle-city-japan.html",
      "genre": "Arcade Classic",
      "description": "Defend your base and destroy enemy tanks in this quintessential multi-directional shooter.",
      "availability": "Online",
      "playersOnline": 15000,
      "rating": 4.8,
      "badgeIds": [
        "classic"
      ],
      "tags": [
        "Arcade",
        "Retro",
        "NES",
        "Shooting"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/18785-battle-city-japan.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Namco Elite",
        "accentStart": "#fbbf24",
        "accentEnd": "#78350f"
      },
      "image": "assets/games/battle-city.png"
    },
    {
      "id": "league-bowling",
      "name": "League Bowling",
      "url": "https://www.retrogames.cc/embed/10078-league-bowling-ngm-019.html",
      "genre": "Sports",
      "description": "The most addictive bowling sim ever made. Elite Neo Geo performance with rhythmic physics.",
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.7,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Sports",
        "Retro",
        "Neo Geo",
        "Arcade"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10078-league-bowling-ngm-019.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "SNK Elite",
        "accentStart": "#60a5fa",
        "accentEnd": "#1d4ed8"
      },
      "image": "assets/games/league-bowling.png"
    },
    {
      "id": "dungeon-fury",
      "name": "Dungeon Fury",
      "url": "https://www.gamepix.com/play/dungeon-field",
      "description": "Fast-paced action RPG through procedurally generated lethal corridors.",
      "genre": "RPG",
      "rating": 4.7,
      "playersOnline": 11000,
      "availability": "Online",
      "tags": [
        "RPG",
        "Action",
        "Adventure",
        "Solo",
        "station-pod"
      ],
      "badgeIds": [
        "trending"
      ],
      "launchConfig": {
        "difficulty": "Hard",
        "controls": [
          "Touch",
          "Keyboard"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/dungeon-field",
        "approvedExternalUrl": "https://www.gamepix.com/play/dungeon-field",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/dungeon-fury.png"
    },
    {
      "id": "special-strike",
      "name": "Special Strike",
      "url": "https://www.gamepix.com/play/special-strike",
      "description": "Multiplayer shooting arena with customized loadouts and team-based objectives.",
      "genre": "Shooting",
      "rating": 4.8,
      "playersOnline": 22000,
      "availability": "Online",
      "tags": [
        "Shooting",
        "Multiplayer",
        "Co-op",
        "Action",
        "station-pod"
      ],
      "badgeIds": [
        "featured"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/special-strike",
        "approvedExternalUrl": "https://www.gamepix.com/play/special-strike",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "multiplayerType": "Server",
      "queueEstimateMinutes": 4,
      "sessionObjectives": [
        "Win one objective round with your squad",
        "Stack two loadout streaks in a single session"
      ],
      "controlHints": [
        "Rotate with team pings before flanks collapse",
        "Build around one reliable mid-range weapon"
      ],
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/special-strike.png"
    },
    {
      "id": "retro-space-invaders",
      "name": "Retro Space Invaders",
      "url": "https://www.gamepix.com/play/space-invaders",
      "description": "Authentic classic arcade shooter with escalating wave intensity.",
      "genre": "Classic",
      "rating": 4.5,
      "playersOnline": 5400,
      "availability": "Online",
      "tags": [
        "Classic",
        "Shooting",
        "Arcade",
        "Solo",
        "station-cabinet"
      ],
      "launchConfig": {
        "difficulty": "Moderate",
        "controls": [
          "Touch",
          "Keyboard"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/space-invaders",
        "approvedExternalUrl": "https://www.gamepix.com/play/space-invaders",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/retro-space-invaders.png"
    },
    {
      "id": "basketball-master",
      "name": "Basketball Master",
      "url": "https://www.gamepix.com/play/basketball-master",
      "description": "Precision shooting sports challenge with global leaderboards.",
      "genre": "Sports",
      "rating": 4.6,
      "playersOnline": 7200,
      "availability": "Online",
      "tags": [
        "Sports",
        "Basketball",
        "Solo",
        "Competitive",
        "station-pod"
      ],
      "launchConfig": {
        "difficulty": "Moderate",
        "controls": [
          "Touch",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/basketball-master",
        "approvedExternalUrl": "https://www.gamepix.com/play/basketball-master",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/basketball-master.png"
    },
    {
      "id": "cyber-adventure",
      "name": "Cyber Adventure",
      "url": "https://www.gamepix.com/play/cyber-cars-punk-racing",
      "description": "Epic cyberpunk adventure with deep RPG mechanics and offline-first persistence.",
      "genre": "RPG",
      "rating": 4.9,
      "playersOnline": 12000,
      "availability": "Online",
      "tags": [
        "RPG",
        "Adventure",
        "Cyberpunk",
        "Solo",
        "station-pod"
      ],
      "launchConfig": {
        "difficulty": "Hard",
        "controls": [
          "Touch",
          "Keyboard"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/cyber-cars-punk-racing",
        "approvedExternalUrl": "https://www.gamepix.com/play/cyber-cars-punk-racing",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink."
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/cyber-adventure.png"
    },
    {
      "id": "sniper-mission",
      "name": "Sniper Mission",
      "url": "https://www.gamepix.com/play/sniper-clash-3d",
      "description": "Long-range tactical shooting missions with ballistics.",
      "genre": "Shooting",
      "rating": 4.7,
      "playersOnline": 8000,
      "availability": "Online",
      "tags": [
        "Shooting",
        "Action",
        "Tactical",
        "station-pod"
      ],
      "launchConfig": {
        "difficulty": "Hard",
        "controls": [
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/sniper-clash-3d",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "approvedExternalUrl": "https://www.gamepix.com/play/sniper-clash-3d",
        "telemetryMode": "origin"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/sniper-mission.png"
    },
    {
      "id": "tower-defense",
      "name": "Tower Defense",
      "url": "https://www.gamepix.com/play/tower-defense",
      "description": "Strategic RPG defense with hero management and spell casting.",
      "genre": "RPG",
      "rating": 4.8,
      "playersOnline": 14000,
      "availability": "Online",
      "tags": [
        "RPG",
        "Strategy",
        "Adventure",
        "station-pod"
      ],
      "launchConfig": {
        "difficulty": "Moderate",
        "controls": [
          "Touch",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/tower-defense",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "telemetryMode": "origin"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/tower-defense.png"
    },
    {
      "id": "ludo-legend",
      "name": "Ludo Legend",
      "url": "https://www.gamepix.com/play/ludo-legend",
      "description": "Global board battle with real-time multiplayer and co-op social play.",
      "genre": "Classic",
      "rating": 4.6,
      "playersOnline": 25000,
      "availability": "Online",
      "tags": [
        "Classic",
        "Multiplayer",
        "Co-op",
        "Strategy",
        "station-cabinet"
      ],
      "launchConfig": {
        "difficulty": "Easy",
        "controls": [
          "Touch",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/ludo-legend",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "telemetryMode": "origin"
      },
      "multiplayerType": "Server",
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/ludo-legend.png"
    },
    {
      "id": "zombie-idle-defense",
      "name": "Zombie Idle Defense",
      "url": "https://www.gamepix.com/play/zombie-idle-defense",
      "description": "Intense shooting defense RPG with survivor squads and tech upgrades.",
      "genre": "Shooting",
      "rating": 4.7,
      "playersOnline": 19000,
      "availability": "Online",
      "tags": [
        "Shooting",
        "RPG",
        "Action",
        "Multiplayer",
        "station-pod"
      ],
      "launchConfig": {
        "difficulty": "Moderate",
        "controls": [
          "Touch",
          "Mouse"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline",
        "approvedEmbedUrl": "https://www.gamepix.com/play/zombie-idle-defense",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "telemetryMode": "origin"
      },
      "multiplayerType": "Server",
      "queueEstimateMinutes": 3,
      "sessionObjectives": [
        "Survive two elite waves with the squad alive",
        "Upgrade one survivor lane before the boss push"
      ],
      "controlHints": [
        "Balance barricade repairs with tech upgrades",
        "Keep ranged units behind your tank lane"
      ],
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/zombie-idle-defense.png"
    },
    {
      "id": "arena-clash",
      "name": "Arena Clash",
      "url": "https://www.gamepix.com/play/clash-of-armour",
      "description": "Neon tournament fighter with high-speed strings, ranked ladders, and online rematches.",
      "genre": "Fighting",
      "rating": 4.8,
      "playersOnline": 16800,
      "availability": "Online",
      "tags": [
        "Fighting",
        "Combat",
        "Versus",
        "Multiplayer",
        "station-cabinet"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "featured",
        "trending"
      ],
      "queueEstimateMinutes": 3,
      "sessionObjectives": [
        "Win a best-of-three set",
        "Confirm one punish combo off a counter-hit"
      ],
      "controlHints": [
        "Spend meter to close rounds, not to start them",
        "Watch wake-up spacing before pressing forward"
      ],
      "launchConfig": {
        "difficulty": "Tournament",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Climb one ranked division",
          "Finish a set without dropping neutral control"
        ],
        "modes": [
          "Versus",
          "Ranked",
          "Tournament"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted fight-night partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/clash-of-armour",
        "approvedEmbedUrl": "https://www.gamepix.com/play/clash-of-armour",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Fight Night",
        "accentStart": "#ef4444",
        "accentEnd": "#7f1d1d"
      },
      "image": "assets/games/arena-clash.png"
    },
    {
      "id": "tag-team-titans",
      "name": "Tag Team Titans",
      "url": "https://www.gamepix.com/play/teen-titans-go-jump-jousts",
      "description": "Squad-based fighting cabinet where tag timing and assist pressure decide every round.",
      "genre": "Fighting",
      "rating": 4.7,
      "playersOnline": 11200,
      "availability": "Online",
      "tags": [
        "Fighting",
        "Co-op",
        "Multiplayer",
        "Combat",
        "station-cabinet"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "staff-pick"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Land one assist extension cleanly",
        "Win a round after a mid-fight tag swap"
      ],
      "controlHints": [
        "Tag before your lead fighter burns out",
        "Use assist calls to trap corners"
      ],
      "launchConfig": {
        "difficulty": "Squad",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Coordinate one perfect tag finish",
          "Protect both fighters through the final round"
        ],
        "modes": [
          "Co-op",
          "Versus"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted tag-fighter partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/teen-titans-go-jump-jousts",
        "approvedEmbedUrl": "https://www.gamepix.com/play/teen-titans-go-jump-jousts",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Tag Battle",
        "accentStart": "#fb7185",
        "accentEnd": "#9f1239"
      },
      "image": "assets/games/tag-team-titans.png"
    },
    {
      "id": "gridiron-drive",
      "name": "Gridiron Drive",
      "url": "https://www.gamepix.com/play/gridiron-drive",
      "description": "Prime-time football rushes with season ladders, red-zone decisions, and versus play.",
      "genre": "Sports",
      "rating": 4.7,
      "playersOnline": 13400,
      "availability": "Online",
      "tags": [
        "Sports",
        "Football",
        "Multiplayer",
        "Competitive",
        "station-pod"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Convert two third downs in one drive",
        "Hold a late-game lead inside the red zone"
      ],
      "controlHints": [
        "Save your sprint for broken-field cuts",
        "Read the blitz before snapping the ball"
      ],
      "launchConfig": {
        "difficulty": "Competitive",
        "controls": [
          "Keyboard"
        ],
        "objectives": [
          "Finish a drive without a turnover",
          "Control the fourth quarter clock"
        ],
        "modes": [
          "Versus",
          "Season"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted football partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/gridiron-drive",
        "approvedEmbedUrl": "https://www.gamepix.com/play/gridiron-drive",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Prime Sports",
        "accentStart": "#22c55e",
        "accentEnd": "#14532d"
      },
      "image": "assets/games/gridiron-drive.png"
    },
    {
      "id": "rally-racquet-tour",
      "name": "Rally Racquet Tour",
      "url": "https://www.gamepix.com/play/rally-racquet-tour",
      "description": "Fast tennis rallies with tournament brackets, precision returns, and court-speed control.",
      "genre": "Sports",
      "rating": 4.6,
      "playersOnline": 9600,
      "availability": "Online",
      "tags": [
        "Sports",
        "Tennis",
        "Competitive",
        "Solo",
        "station-pod"
      ],
      "multiplayerType": "None",
      "badgeIds": [
        "new-drop"
      ],
      "queueEstimateMinutes": 1,
      "sessionObjectives": [
        "Break serve once per set",
        "Win a rally with a clean cross-court finish"
      ],
      "controlHints": [
        "Charge early on baseline returns",
        "Pull opponents wide before attacking the net"
      ],
      "launchConfig": {
        "difficulty": "Tour",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Advance one round in the bracket",
          "Close a deuce game without errors"
        ],
        "modes": [
          "Solo",
          "Tournament"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted court-sports partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/rally-racquet-tour",
        "approvedEmbedUrl": "https://www.gamepix.com/play/rally-racquet-tour",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Court Tour",
        "accentStart": "#38bdf8",
        "accentEnd": "#0f766e"
      },
      "image": "assets/games/rally-racquet-tour.png"
    },
    {
      "id": "squad-ops-ghost-protocol",
      "name": "Squad Ops: Ghost Protocol",
      "url": "https://www.gamepix.com/play/special-strike-operations",
      "description": "Online tactical shooting missions built around overwatch lanes, breach timing, and squad calls.",
      "genre": "Shooting",
      "rating": 4.8,
      "playersOnline": 21400,
      "availability": "Online",
      "tags": [
        "Shooting",
        "Tactical",
        "Multiplayer",
        "Co-op",
        "station-pod"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "featured",
        "staff-pick"
      ],
      "queueEstimateMinutes": 4,
      "sessionObjectives": [
        "Secure one objective room without losing the squad lead",
        "Land a clean breach-and-clear cycle"
      ],
      "controlHints": [
        "Stack on doors before forcing entry",
        "Hold crossfires instead of chasing picks"
      ],
      "launchConfig": {
        "difficulty": "Elite",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Extract with the full squad alive",
          "Chain two objective clears in one run"
        ],
        "modes": [
          "Co-op",
          "Squad Ops"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted squad-ops partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/special-strike-operations",
        "approvedEmbedUrl": "https://www.gamepix.com/play/special-strike-operations",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Squad Fire",
        "accentStart": "#06b6d4",
        "accentEnd": "#164e63"
      },
      "image": "assets/games/squad-ops-ghost-protocol.png"
    },
    {
      "id": "raid-fireteam-z",
      "name": "Raid Fireteam Z",
      "url": "https://www.gamepix.com/play/raid-fireteam-z",
      "description": "Four-player survival shooting raid with online co-op drops, boss waves, and evac pressure.",
      "genre": "Shooting",
      "rating": 4.7,
      "playersOnline": 17800,
      "availability": "Online",
      "tags": [
        "Shooting",
        "Action",
        "Co-op",
        "Multiplayer",
        "RPG",
        "station-pod"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "trending"
      ],
      "queueEstimateMinutes": 3,
      "sessionObjectives": [
        "Complete one raid phase without a downed teammate",
        "Hold the evac lane through the final swarm"
      ],
      "controlHints": [
        "Rotate utility before elite waves stack",
        "Focus the same target to burn bosses faster"
      ],
      "launchConfig": {
        "difficulty": "Raid",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Survive the final extraction",
          "Upgrade one squad role before the boss room"
        ],
        "modes": [
          "Co-op",
          "Survival"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted online raid partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/raid-fireteam-z",
        "approvedEmbedUrl": "https://www.gamepix.com/play/raid-fireteam-z",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Raid Ops",
        "accentStart": "#f97316",
        "accentEnd": "#7c2d12"
      },
      "image": "assets/games/raid-fireteam-z.png"
    },
    {
      "id": "mythic-raid-online",
      "name": "Mythic Raid Online",
      "url": "https://www.gamepix.com/play/raid-heroes-total-war",
      "description": "Party-based action RPG with online dungeon runs, loot drops, and healer-tank-DPS squad loops.",
      "genre": "RPG",
      "rating": 4.8,
      "playersOnline": 14600,
      "availability": "Online",
      "tags": [
        "RPG",
        "Adventure",
        "Co-op",
        "Multiplayer",
        "station-pod"
      ],
      "multiplayerType": "Server",
      "badgeIds": [
        "featured"
      ],
      "queueEstimateMinutes": 2,
      "sessionObjectives": [
        "Clear one raid wing without losing the support lane",
        "Equip one upgraded relic before the boss"
      ],
      "controlHints": [
        "Ping boss mechanics before they rotate",
        "Anchor your squad around one clean cooldown cycle"
      ],
      "launchConfig": {
        "difficulty": "Raid",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Finish one online dungeon",
          "Keep the party alive through the final phase"
        ],
        "modes": [
          "Co-op",
          "Raid",
          "Adventure"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted co-op RPG partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/raid-heroes-total-war",
        "approvedEmbedUrl": "https://www.gamepix.com/play/raid-heroes-total-war",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Raid RPG",
        "accentStart": "#8b5cf6",
        "accentEnd": "#4c1d95"
      },
      "image": "assets/games/mythic-raid-online.png"
    },
    {
      "id": "legends-of-the-rift",
      "name": "Legends of the Rift",
      "url": "https://www.gamepix.com/play/hero-tower-wars",
      "description": "Campaign RPG built around hero progression, boss routing, and long-form world exploration.",
      "genre": "RPG",
      "rating": 4.9,
      "playersOnline": 12500,
      "availability": "Online",
      "tags": [
        "RPG",
        "Adventure",
        "Progressive",
        "Solo",
        "station-pod"
      ],
      "multiplayerType": "None",
      "badgeIds": [
        "staff-pick",
        "new-drop"
      ],
      "queueEstimateMinutes": 0,
      "sessionObjectives": [
        "Unlock one class upgrade path",
        "Defeat a boss without using emergency items"
      ],
      "controlHints": [
        "Bank healing items before elite rooms",
        "Spec your build around one primary damage type"
      ],
      "launchConfig": {
        "difficulty": "Epic",
        "controls": [
          "Keyboard",
          "Mouse"
        ],
        "objectives": [
          "Finish one campaign chapter",
          "Unlock one legendary loadout bonus"
        ],
        "modes": [
          "Solo",
          "Adventure"
        ],
        "inlinePolicy": "trusted",
        "trustNote": "Allowlisted campaign RPG partner.",
        "embedMode": "inline",
        "approvedExternalUrl": "https://www.gamepix.com/play/hero-tower-wars",
        "approvedEmbedUrl": "https://www.gamepix.com/play/hero-tower-wars",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Campaign RPG",
        "accentStart": "#6366f1",
        "accentEnd": "#312e81"
      },
      "image": "assets/games/legends-of-the-rift.png"
    },
    {
      "id": "sonic-racing",
      "name": "Sonic Racing",
      "url": "https://www.gamepix.com/play/sonic-racing",
      "genre": "Racing",
      "description": "High-velocity hedgehog racing with drift-enabled controls and tactical loop shortcuts.",
      "availability": "Online",
      "playersOnline": 15200,
      "rating": 4.9,
      "badgeIds": [
        "featured",
        "trending"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/sonic-racing",
        "telemetryMode": "none",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "inlinePolicy": "trusted",
        "embedMode": "inline"
      },
      "tags": [
        "station-pod"
      ],
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/sonic-racing.png"
    },
    {
      "id": "doom",
      "name": "DOOM (1993)",
      "url": "https://www.retrogames.cc/embed/41695-doom-v1-1.html",
      "genre": "Shooting",
      "description": "The absolute foundation of tactical FPS. Brutal, fast, and legendary.",
      "availability": "Online",
      "playersOnline": 8900,
      "rating": 5,
      "badgeIds": [
        "staff-pick",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41695-doom-v1-1.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "approvedExternalUrl": "https://www.retrogames.cc/embed/41695-doom-v1-1.html",
        "secure_mode": "wasm"
      },
      "tags": [
        "station-pod",
        "Retro",
        "Classic"
      ],
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/doom.png"
    },
    {
      "id": "mario-classic",
      "name": "Super Mario Bros.",
      "url": "https://www.retrogames.cc/embed/16847-super-mario-bros-japan-usa.html",
      "genre": "Classic",
      "description": "The definitive platformer experience. Run, jump, and save the kingdom in this high-fidelity retro emulation.",
      "availability": "Online",
      "playersOnline": 25400,
      "rating": 5,
      "badgeIds": [
        "featured",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Classic",
        "Platformer",
        "Retro",
        "station-cabinet",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/16847-super-mario-bros-japan-usa.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Nintendo Elite",
        "accentStart": "#ef4444",
        "accentEnd": "#7f1d1d"
      },
      "image": "assets/games/mario-classic.png"
    },
    {
      "id": "gta-elite-wasm",
      "name": "Grand Theft Auto (1997)",
      "url": "https://www.retrogames.cc/embed/41727-grand-theft-auto.html",
      "genre": "Action",
      "description": "Top-down urban chaos. High-speed chases and tactical missions in the original open-world criminal simulator.",
      "availability": "Online",
      "playersOnline": 12800,
      "rating": 4.9,
      "badgeIds": [
        "featured",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Action",
        "Open World",
        "Retro",
        "station-pod",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41727-grand-theft-auto.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite open-world WASM protocol verified.",
        "approvedExternalUrl": "https://www.retrogames.cc/embed/41727-grand-theft-auto.html",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Rockstar Legacy",
        "accentStart": "#facc15",
        "accentEnd": "#713f12"
      },
      "image": "assets/games/gta-elite-wasm.png"
    },
    {
      "id": "nba-pro-3d",
      "name": "Basketball Stars",
      "url": "https://www.gamepix.com/play/basketball-stars",
      "genre": "Sports",
      "description": "WebGL basketball with fluid 3D animations, shot timing, and competitive street-ball mechanics.",
      "availability": "Online",
      "playersOnline": 45000,
      "rating": 4.8,
      "badgeIds": [
        "featured",
        "staff-pick"
      ],
      "tags": [
        "Sports",
        "Basketball",
        "3D",
        "station-pod"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/basketball-stars",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Pro League",
        "accentStart": "#ea580c",
        "accentEnd": "#7c2d12"
      },
      "image": "assets/games/nba-pro-3d.png"
    },
    {
      "id": "nfl-redzone-rush",
      "name": "Touchdown Rush",
      "url": "https://www.gamepix.com/play/touchdown-rush",
      "genre": "Sports",
      "description": "High-intensity gridiron action. Manage the clock and execute perfect plays in this premium football simulator.",
      "availability": "Online",
      "playersOnline": 32000,
      "rating": 4.7,
      "badgeIds": [
        "featured",
        "staff-pick"
      ],
      "tags": [
        "Sports",
        "Football",
        "Action",
        "station-pod"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/touchdown-rush",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Gridiron Elite",
        "accentStart": "#2563eb",
        "accentEnd": "#1e3a8a"
      },
      "image": "assets/games/nfl-redzone-rush.png"
    },
    {
      "id": "dbz-elite-wasm",
      "name": "Dragon Ball Z: Buyuu Retsuden",
      "url": "https://www.retrogames.cc/embed/20261-dragon-ball-z-buyuu-retsuden-japan.html",
      "genre": "Fighting",
      "description": "Legendary Saiyan combat. High-speed martial arts and energy blasts in this classic fighting emulation.",
      "availability": "Online",
      "playersOnline": 18500,
      "rating": 4.9,
      "badgeIds": [
        "featured",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Anime",
        "Retro",
        "station-cabinet",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/20261-dragon-ball-z-buyuu-retsuden-japan.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Saiyan Saga",
        "accentStart": "#f97316",
        "accentEnd": "#7c2d12"
      },
      "image": "assets/games/dbz-elite-wasm.png"
    },
    {
      "id": "halo-combat-evolved",
      "name": "Halo: Combat Evolved (WASM)",
      "url": "https://www.gamepix.com/play/alien-galaxy-war",
      "genre": "Shooting",
      "description": "High-fidelity Spartan combat. Experience the legendary FPS in a stabilized WASM environment.",
      "availability": "Online",
      "playersOnline": 15000,
      "rating": 4.6,
      "badgeIds": [
        "featured",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Shooting",
        "Sci-Fi",
        "Action",
        "station-pod",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/alien-galaxy-war",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "approvedExternalUrl": "https://www.gamepix.com/play/alien-galaxy-war",
        "secure_mode": "wasm",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "UNSC Command",
        "accentStart": "#16a34a",
        "accentEnd": "#14532d"
      },
      "image": "assets/games/halo-combat-evolved.png"
    },
    {
      "id": "boxing-heavyweight",
      "name": "Boxing Stars",
      "url": "https://www.gamepix.com/play/boxing-stars",
      "genre": "Fighting",
      "description": "Heavyweight boxing. Master the sweet science with realistic 3D WebGL physics and career depth.",
      "availability": "Online",
      "playersOnline": 21000,
      "rating": 4.8,
      "badgeIds": [
        "featured",
        "staff-pick"
      ],
      "tags": [
        "Fighting",
        "Sports",
        "3D",
        "station-pod"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/boxing-stars",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Main Event",
        "accentStart": "#dc2626",
        "accentEnd": "#7f1d1d"
      },
      "image": "assets/games/boxing-heavyweight.png"
    },
    {
      "id": "tekken-3-elite",
      "name": "Tekken 3",
      "url": "https://www.retrogames.cc/embed/40238-tekken-3.html",
      "genre": "Fighting",
      "description": "The king of iron fist tournament. High-fidelity PS1 emulation with buttery smooth 60fps combat.",
      "availability": "Online",
      "playersOnline": 15600,
      "rating": 5,
      "badgeIds": [
        "featured",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "PS1",
        "Multiplayer",
        "Controller"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/40238-tekken-3.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Namco Elite",
        "accentStart": "#ef4444",
        "accentEnd": "#7f1d1d"
      },
      "image": "assets/games/tekken-3-elite.png"
    },
    {
      "id": "smash-bros-elite",
      "name": "Super Smash Bros.",
      "url": "https://www.retrogames.cc/embed/32117-super-smash-bros-usa.html",
      "genre": "Fighting",
      "description": "Original N64 crossover chaos. Pixel-perfect emulation with enhanced controller mapping.",
      "availability": "Online",
      "playersOnline": 22400,
      "rating": 5,
      "badgeIds": [
        "featured",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "N64",
        "Multiplayer",
        "Controller"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/32117-super-smash-bros-usa.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Nintendo Elite",
        "accentStart": "#3b82f6",
        "accentEnd": "#1e3a8a"
      },
      "image": "assets/games/smash-bros-elite.png"
    },
    {
      "id": "ctr-ps1-elite",
      "name": "Crash Team Racing",
      "url": "https://www.retrogames.cc/embed/41687-crash-team-racing.html",
      "genre": "Racing",
      "description": "High-octane marsupial racing. PS1 speed with precision touch controls.",
      "availability": "Online",
      "playersOnline": 14200,
      "rating": 4.9,
      "badgeIds": [
        "elite"
      ],
      "tags": [
        "Racing",
        "Retro",
        "PS1",
        "Controller"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41687-crash-team-racing.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Naughty Dog Legacy",
        "accentStart": "#f97316",
        "accentEnd": "#7c2d12"
      },
      "image": "assets/games/ctr-ps1-elite.png"
    },
    {
      "id": "zelda-oot-elite",
      "name": "The Legend of Zelda: Ocarina of Time",
      "url": "https://www.retrogames.cc/embed/32331-legend-of-zelda-the-ocarina-of-time-usa.html",
      "genre": "RPG",
      "description": "The masterpiece redefined. N64 RPG excellence with saved-state cloud sync support.",
      "availability": "Online",
      "playersOnline": 31000,
      "rating": 5,
      "badgeIds": [
        "featured",
        "elite"
      ],
      "tags": [
        "RPG",
        "Retro",
        "N64",
        "Adventure",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/32331-legend-of-zelda-the-ocarina-of-time-usa.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Hyrule Command",
        "accentStart": "#16a34a",
        "accentEnd": "#14532d"
      },
      "image": "assets/games/zelda-oot-elite.png"
    },
    {
      "id": "sfii-world-warrior",
      "name": "Street Fighter II: The World Warrior",
      "url": "https://www.retrogames.cc/embed/19018-street-fighter-ii-the-world-warrior-usa.html",
      "genre": "Fighting",
      "description": "The foundational masterpiece of the fighting genre. Master Ryu, Ken, and Chun-Li in Elite WASM.",
      "availability": "Online",
      "playersOnline": 35000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite",
        "staff-pick"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "SNES",
        "WASM"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/19018-street-fighter-ii-the-world-warrior-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Capcom Elite",
        "accentStart": "#f87171",
        "accentEnd": "#b91c1c"
      },
      "image": "assets/games/sfii-world-warrior.png"
    },
    {
      "id": "moto-x3m-3d",
      "name": "Moto X3M: Pool Party",
      "url": "https://www.gamepix.com/play/moto-x3m",
      "genre": "Racing",
      "description": "High-fidelity bike stunts with fluid 60fps physics and responsive touch zones.",
      "availability": "Online",
      "playersOnline": 52000,
      "rating": 4.8,
      "badgeIds": [
        "trending"
      ],
      "tags": [
        "Racing",
        "Sports",
        "Action"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/moto-x3m",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "approvedExternalUrl": "https://www.gamepix.com/play/moto-x3m",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/moto-x3m-3d.png"
    },
    {
      "id": "3d-chess-elite",
      "name": "Chess Grandmaster",
      "url": "https://www.gamepix.com/play/chess-grandmaster",
      "genre": "Strategy",
      "description": "Tactical intelligence. Advanced AI opponents in a high-fidelity 3D environment.",
      "availability": "Online",
      "playersOnline": 8500,
      "rating": 4.9,
      "badgeIds": [
        "staff-pick"
      ],
      "tags": [
        "Strategy",
        "Puzzle",
        "3D"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/chess-grandmaster",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/3d-chess-elite.png"
    },
    {
      "id": "goldeneye-007-elite",
      "name": "GoldenEye 007",
      "url": "https://www.retrogames.cc/embed/32197-007-goldeneye-usa.html",
      "genre": "Shooting",
      "description": "The definitive N64 shooter. High-fidelity emulation with optimized mouse/touch mapping for runs.",
      "availability": "Online",
      "playersOnline": 28400,
      "rating": 5,
      "badgeIds": [
        "featured",
        "elite"
      ],
      "tags": [
        "Shooting",
        "Retro",
        "N64",
        "Multiplayer",
        "Controller"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/32197-007-goldeneye-usa.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "MI6 Command",
        "accentStart": "#fbbf24",
        "accentEnd": "#92400e"
      },
      "image": "assets/games/goldeneye-007-elite.png"
    },
    {
      "id": "thps2-ps1-elite",
      "name": "Tony Hawk's Pro Skater 2",
      "url": "https://www.retrogames.cc/embed/41029-tony-hawk-s-pro-skater-2.html",
      "genre": "Sports",
      "description": "Skating excellence. PS1 legend with stabilized frame rates and high-fidelity textures.",
      "availability": "Online",
      "playersOnline": 19500,
      "rating": 5,
      "badgeIds": [
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Sports",
        "Retro",
        "PS1",
        "Controller"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41029-tony-hawk-s-pro-skater-2.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Neversoft Legacy",
        "accentStart": "#8b5cf6",
        "accentEnd": "#4c1d95"
      },
      "image": "assets/games/thps2-ps1-elite.png"
    },
    {
      "id": "parappa-ps1-elite",
      "name": "PaRappa the Rapper",
      "url": "https://www.retrogames.cc/embed/40662-parappa-the-rapper.html",
      "genre": "Rhythm",
      "description": "I gotta believe! Original PS1 rhythm mastery with low-latency audio sync.",
      "availability": "Online",
      "playersOnline": 11000,
      "rating": 4.8,
      "badgeIds": [
        "elite"
      ],
      "tags": [
        "Rhythm",
        "Retro",
        "PS1",
        "Music"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/40662-parappa-the-rapper.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Rhythm Elite",
        "accentStart": "#ec4899",
        "accentEnd": "#831843"
      },
      "image": "assets/games/parappa-ps1-elite.png"
    },
    {
      "id": "sonic-genesis-elite",
      "name": "Sonic the Hedgehog",
      "url": "https://www.retrogames.cc/embed/18847-sonic-the-hedgehog-usa-europe.html",
      "genre": "Classic",
      "description": "The Blue Blur at his best. High-speed Genesis emulation with perfect touch responsiveness.",
      "availability": "Online",
      "playersOnline": 34000,
      "rating": 4.9,
      "badgeIds": [
        "trending",
        "elite"
      ],
      "tags": [
        "Classic",
        "Platformer",
        "Retro",
        "Genesis",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/18847-sonic-the-hedgehog-usa-europe.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Sega Speed",
        "accentStart": "#3b82f6",
        "accentEnd": "#1e3a8a"
      },
      "image": "assets/games/sonic-genesis-elite.png"
    },
    {
      "id": "fnf-music-battle",
      "name": "Friday Night Funkin'",
      "url": "https://www.gamepix.com/play/friday-night-funkin",
      "genre": "Music Battle",
      "description": "High-intensity rap battles with precision timing and soundtrack depth.",
      "availability": "Online",
      "playersOnline": 42000,
      "rating": 4.8,
      "badgeIds": [
        "trending"
      ],
      "tags": [
        "Music Battle",
        "Rhythm",
        "Multiplayer"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/friday-night-funkin",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "approvedExternalUrl": "https://www.gamepix.com/play/friday-night-funkin",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/fnf-music-battle.png"
    },
    {
      "id": "tetris-classic-elite",
      "name": "Tetris",
      "url": "https://www.retrogames.cc/embed/18814-tetris-usa.html",
      "genre": "Puzzle",
      "description": "The definitive puzzle experience. Classic NES logic with tier-responsive input.",
      "availability": "Online",
      "playersOnline": 28000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Puzzle",
        "Classic",
        "Retro",
        "NES"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/18814-tetris-usa.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Auto-save states enabled via cloud uplink.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Executive Cabinet",
        "accentStart": "#ec5b13",
        "accentEnd": "#a855f7"
      },
      "image": "assets/games/tetris-classic-elite.png"
    },
    {
      "id": "castlevania-sotn-elite",
      "name": "Castlevania: Symphony of the Night",
      "url": "https://www.retrogames.cc/embed/40194-castlevania-symphony-of-the-night.html",
      "genre": "Action RPG",
      "description": "The definitive Gothic masterpiece. PS1 exploration with a legendary soundtrack.",
      "availability": "Online",
      "playersOnline": 8500,
      "rating": 5,
      "badgeIds": [
        "elite",
        "staff-pick"
      ],
      "tags": [
        "Action",
        "RPG",
        "Retro",
        "PS1",
        "Music"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/40194-castlevania-symphony-of-the-night.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Atmospheric audio link established.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Konami Elite",
        "accentStart": "#7f1d1d",
        "accentEnd": "#450a0a"
      },
      "image": "assets/games/castlevania-sotn-elite.png"
    },
    {
      "id": "wipeout-ps1-elite",
      "name": "Wipeout XL",
      "url": "https://www.retrogames.cc/embed/40597-wipeout-xl.html",
      "genre": "Racing",
      "description": "Anti-gravity racing at its peak. High-energy electronic soundtrack and tech-noir visuals.",
      "availability": "Online",
      "playersOnline": 4200,
      "rating": 4.9,
      "badgeIds": [
        "elite"
      ],
      "tags": [
        "Racing",
        "Retro",
        "PS1",
        "Electronic"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/40597-wipeout-xl.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Neural link synced to soundtrack.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Psygnosis Elite",
        "accentStart": "#0ea5e9",
        "accentEnd": "#0c4a6e"
      },
      "image": "assets/games/wipeout-ps1-elite.png"
    },
    {
      "id": "sf2-genesis-elite",
      "name": "Street Fighter II: Special Champion Edition",
      "url": "https://www.retrogames.cc/embed/19001-street-fighter-ii-special-champion-edition-usa.html",
      "genre": "Fighting",
      "description": "The foundation of competitive fighting. Genesis combat with perfect frame data.",
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "badgeIds": [
        "elite",
        "classic"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "Genesis",
        "Versus"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/19001-street-fighter-ii-special-champion-edition-usa.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite emulation verified. Tournament-grade responsiveness.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Capcom Elite",
        "accentStart": "#fbbf24",
        "accentEnd": "#b45309"
      },
      "image": "assets/games/sf2-genesis-elite.png"
    },
    {
      "id": "wolf3d-inline-elite",
      "name": "Wolfenstein 3D",
      "url": "https://www.retrogames.cc/embed/41724-wolfenstein-3d-v1-4.html",
      "genre": "Shooting",
      "description": "The grandfather of FPS. High-speed escape from Castle Wolfenstein. Fully stabilized inline execution.",
      "availability": "Online",
      "playersOnline": 7200,
      "rating": 4.8,
      "badgeIds": [
        "elite",
        "classic"
      ],
      "tags": [
        "Shooting",
        "Action",
        "Retro",
        "DOS"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41724-wolfenstein-3d-v1-4.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite DOS evacuation protocol verified.",
        "approvedExternalUrl": "https://www.retrogames.cc/embed/41724-wolfenstein-3d-v1-4.html",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "id Software Elite",
        "accentStart": "#4ade80",
        "accentEnd": "#166534"
      },
      "image": "assets/games/wolf3d-inline-elite.png"
    },
    {
      "id": "double-dragon-nes",
      "name": "Double Dragon",
      "url": "https://www.retrogames.cc/embed/19139-double-dragon-usa.html",
      "genre": "Beat 'em up",
      "description": "The quintessential co-op brawler. Fight through the streets to rescue Marian in this NES classic.",
      "availability": "Online",
      "playersOnline": 15000,
      "rating": 4.8,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Action",
        "Retro",
        "NES",
        "Co-op",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/19139-double-dragon-usa.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Classic NES emulation verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Technos Elite",
        "accentStart": "#b91c1c",
        "accentEnd": "#7f1d1d"
      },
      "image": "assets/games/double-dragon-nes.png"
    },
    {
      "id": "dominoes-classic",
      "name": "Dominoes",
      "url": "https://www.gamepix.com/play/dominoes",
      "genre": "Board Game",
      "description": "Classic logic and strategy. Test your skills against AI in this high-fidelity dominoes simulation.",
      "availability": "Online",
      "playersOnline": 42000,
      "rating": 4.6,
      "badgeIds": [
        "trending"
      ],
      "tags": [
        "Logic",
        "Board Game",
        "Puzzle"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/dominoes",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ],
        "embedMode": "inline",
        "controls": [
          "Mouse"
        ],
        "trustNote": "Allowlisted logic partner.",
        "approvedExternalUrl": "https://www.gamepix.com/play/dominoes",
        "inlinePolicy": "trusted"
      },
      "art": {
        "eyebrow": "Board Elite",
        "accentStart": "#4b5563",
        "accentEnd": "#1f2937"
      },
      "image": "assets/games/dominoes-classic.png"
    },
    {
      "id": "track-and-field-nes",
      "name": "Track & Field",
      "url": "https://www.retrogames.cc/embed/19022-track-field-usa.html",
      "genre": "Sports",
      "description": "The ultimate athletic competition. Mash your way to victory in various Olympic events.",
      "availability": "Online",
      "playersOnline": 8000,
      "rating": 4.5,
      "badgeIds": [
        "classic"
      ],
      "tags": [
        "Sports",
        "Retro",
        "NES"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/19022-track-field-usa.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Konami classic emulation verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Konami Elite",
        "accentStart": "#ef4444",
        "accentEnd": "#991b1b"
      },
      "image": "assets/games/track-and-field-nes.png"
    },
    {
      "id": "pokemon-yellow-elite",
      "name": "Pok\u00e9mon Yellow: Special Pikachu Edition",
      "url": "https://www.retrogames.cc/embed/21262-pokemon-yellow-version-special-pikachu-edition-usa-europe.html",
      "genre": "RPG",
      "description": "The definitive classic Pok\u00e9mon journey with Pikachu. Elite WASM emulation with stabilized sync.",
      "availability": "Online",
      "playersOnline": 55000,
      "rating": 5,
      "badgeIds": [
        "staff-pick",
        "elite"
      ],
      "tags": [
        "RPG",
        "Retro",
        "GBC",
        "Adventure"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/21262-pokemon-yellow-version-special-pikachu-edition-usa-europe.html",
        "telemetryMode": "origin",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite GBA emulation verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Nintendo Elite",
        "accentStart": "#f87171",
        "accentEnd": "#dc2626"
      },
      "image": "assets/games/pokemon-yellow-elite.png"
    },
    {
      "id": "final-fantasy-nes",
      "name": "Final Fantasy",
      "url": "https://www.retrogames.cc/embed/18816-final-fantasy-usa.html",
      "genre": "RPG",
      "description": "Where the legend began. Embark on an epic quest with the Warriors of Light in this foundational RPG.",
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "badgeIds": [
        "classic"
      ],
      "tags": [
        "RPG",
        "Retro",
        "NES",
        "Fantasy"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/18816-final-fantasy-usa.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Square classic emulation verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Square Elite",
        "accentStart": "#60a5fa",
        "accentEnd": "#1d4ed8"
      },
      "image": "assets/games/final-fantasy-nes.png"
    },
    {
      "id": "mike-tyson-punch-out",
      "name": "Mike Tyson's Punch-Out!!",
      "url": "https://www.retrogames.cc/embed/19002-mike-tyson-s-punch-out-usa.html",
      "genre": "Fighting",
      "description": "Step into the ring as Little Mac and face off against a cast of colorful boxers on your way to Iron Mike.",
      "availability": "Online",
      "playersOnline": 22000,
      "rating": 4.9,
      "badgeIds": [
        "classic",
        "staff-pick",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "NES",
        "Sports",
        "WASM",
        "High-Perf"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/19002-mike-tyson-s-punch-out-usa.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Elite NES combat protocol verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Nintendo Elite",
        "accentStart": "#fbbf24",
        "accentEnd": "#b45309"
      },
      "image": "assets/games/mike-tyson-punch-out.png"
    },
    {
      "id": "galaga-classic",
      "name": "Galaga",
      "url": "https://www.retrogames.cc/embed/10052-galaga-namco.html",
      "genre": "Shooting",
      "description": "Defend the galaxy from the insect-like Galaga aliens in this quintessential fixed shooter.",
      "availability": "Online",
      "playersOnline": 18000,
      "rating": 4.8,
      "badgeIds": [
        "classic"
      ],
      "tags": [
        "Shooting",
        "Retro",
        "Arcade"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10052-galaga-namco.html",
        "telemetryMode": "none",
        "embedMode": "inline",
        "controls": [
          "Standard Keyboard"
        ],
        "trustNote": "Arcade logic verified.",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Namco Elite",
        "accentStart": "#3b82f6",
        "accentEnd": "#1e40af"
      },
      "image": "assets/games/galaga-classic.png"
    },
    {
      "id": "mortal-kombat-2-elite",
      "name": "Mortal Kombat II",
      "url": "https://www.retrogames.cc/embed/23616-mortal-kombat-ii-usa.html",
      "genre": "Fighting",
      "description": "The peak of the MK series. Experience the fatalities and flawless victories in Elite WASM.",
      "availability": "Online",
      "playersOnline": 28000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "Arcade",
        "WASM"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/23616-mortal-kombat-ii-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Midway Elite",
        "accentStart": "#b91c1c",
        "accentEnd": "#450a0a"
      },
      "image": "assets/games/mortal-kombat-2-elite.png"
    },
    {
      "id": "sonic-2-elite",
      "name": "Sonic the Hedgehog 2",
      "url": "https://www.retrogames.cc/embed/24220-sonic-the-hedgehog-2-world.html",
      "genre": "Classic",
      "description": "Speed through Chemical Plant Zone with Tails. The definitive Sonic experience.",
      "availability": "Online",
      "playersOnline": 45000,
      "rating": 4.9,
      "badgeIds": [
        "classic",
        "elite",
        "staff-pick"
      ],
      "tags": [
        "Classic",
        "Retro",
        "Genesis",
        "WASM"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/24220-sonic-the-hedgehog-2-world.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Arrow Keys",
          "Space to Jump"
        ]
      },
      "art": {
        "eyebrow": "Sega Elite",
        "accentStart": "#2563eb",
        "accentEnd": "#1e3a8a"
      },
      "image": "assets/games/sonic-2-elite.png"
    },
    {
      "id": "tekken-4-tribute",
      "name": "Tekken 4",
      "url": "/assets/games/tekken-4-tribute/tekken-4-tribute.html",
      "genre": "Fighting",
      "description": "Elite 2D fighting demo. Shinjuku Arena. Stabilized neural combat.",
      "availability": "Online",
      "playersOnline": 1000,
      "rating": 5,
      "badgeIds": [
        "elite",
        "new-drop"
      ],
      "tags": [
        "Fighting",
        "Elite",
        "Phaser"
      ],
      "launchConfig": {
        "embedMode": "inline",
        "controls": [
          "WASD to move",
          "J/K/L to attack"
        ],
        "telemetryMode": "origin",
        "approvedEmbedUrl": "/assets/games/tekken-4-tribute/tekken-4-tribute.html",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Executive Classic",
        "accentStart": "#af25f4",
        "accentEnd": "#7c3aed"
      },
      "image": "assets/games/tekken-4-tribute.png"
    },
    {
      "id": "halo-ce-web",
      "name": "Halo: Combat Evolved (Web)",
      "url": "/assets/games/halo-ce-web/halo-ce-web.html",
      "genre": "Shooting",
      "description": "Elite 3D FPS demo. WebGL combat link. Master Chief protocol.",
      "availability": "Online",
      "playersOnline": 2000,
      "rating": 5,
      "badgeIds": [
        "elite",
        "new-drop"
      ],
      "tags": [
        "Shooting",
        "Elite",
        "ThreeJS"
      ],
      "launchConfig": {
        "embedMode": "inline",
        "controls": [
          "WASD to move",
          "Mouse to aim/shoot"
        ],
        "telemetryMode": "origin",
        "approvedEmbedUrl": "/assets/games/halo-ce-web/halo-ce-web.html",
        "secure_mode": "wasm"
      },
      "art": {
        "eyebrow": "Executive Classic",
        "accentStart": "#22d3ee",
        "accentEnd": "#0891b2"
      },
      "image": "assets/games/halo-ce-web.png"
    },
    {
      "id": "final-fantasy-vii-elite",
      "name": "Final Fantasy VII",
      "url": "https://www.retrogames.cc/embed/40425-final-fantasy-vii-usa-disc-1.html",
      "genre": "RPG",
      "description": "The masterpiece that defined a generation. Join Cloud in the fight against Shinra.",
      "availability": "Online",
      "playersOnline": 58000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite",
        "staff-pick"
      ],
      "tags": [
        "RPG",
        "Retro",
        "PS1",
        "WASM",
        "Adventure"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/40425-final-fantasy-vii-usa-disc-1.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Square Elite",
        "accentStart": "#38bdf8",
        "accentEnd": "#075985"
      },
      "image": "assets/games/final-fantasy-vii-elite.png"
    },
    {
      "id": "gta-san-andreas-elite",
      "name": "Grand Theft Auto: San Andreas",
      "url": "https://www.retrogames.cc/embed/43315-grand-theft-auto-san-andreas.html",
      "genre": "Action",
      "description": "Return to Los Santos in the definitive open-world masterpiece. High-performance PS2-era emulation.",
      "availability": "Online",
      "playersOnline": 45000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite",
        "trending"
      ],
      "tags": [
        "Action",
        "Retro",
        "PS2",
        "Open World",
        "WASM"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/43315-grand-theft-auto-san-andreas.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Rockstar Elite",
        "accentStart": "#fb7185",
        "accentEnd": "#e11d48"
      },
      "image": "assets/games/gta-san-andreas-elite.png"
    },
    {
      "id": "madden-nfl-2000-elite",
      "name": "Madden NFL 2000",
      "url": "https://www.retrogames.cc/embed/41885-madden-nfl-2000-usa.html",
      "genre": "Sports",
      "description": "The gridiron classic that redefined sports gaming. Elite PS1 performance with legendary commentary.",
      "availability": "Online",
      "playersOnline": 18000,
      "rating": 4.8,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Sports",
        "Retro",
        "PS1",
        "Football"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41885-madden-nfl-2000-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "EA Sports Elite",
        "accentStart": "#60a5fa",
        "accentEnd": "#1d4ed8"
      },
      "image": "assets/games/madden-nfl-2000-elite.png"
    },
    {
      "id": "nba-2k1-elite",
      "name": "NBA 2K1",
      "url": "https://www.retrogames.cc/embed/41223-nba-2k1-usa.html",
      "genre": "Sports",
      "description": "Experience the birth of the 2K dynasty. High-fidelity Dreamcast emulation with online-ready logic.",
      "availability": "Online",
      "playersOnline": 15000,
      "rating": 4.9,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Sports",
        "Retro",
        "Dreamcast",
        "Basketball"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41223-nba-2k1-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "SEGA Elite",
        "accentStart": "#f87171",
        "accentEnd": "#b91c1c"
      },
      "image": "assets/games/nba-2k1-elite.png"
    },
    {
      "id": "wwf-no-mercy-elite",
      "name": "WWF No Mercy",
      "url": "https://www.retrogames.cc/embed/32467-wwf-no-mercy-usa.html",
      "genre": "Fighting",
      "description": "The greatest wrestling game ever made. Relive the Attitude Era with perfected N64 grappling mechanics.",
      "availability": "Online",
      "playersOnline": 22000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite",
        "staff-pick"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "N64",
        "Wrestling"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/32467-wwf-no-mercy-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "THQ Elite",
        "accentStart": "#a78bfa",
        "accentEnd": "#5b21b6"
      },
      "image": "assets/games/wwf-no-mercy-elite.png"
    },
    {
      "id": "marvel-vs-capcom-elite",
      "name": "Marvel vs. Capcom: Clash of Super Heroes",
      "url": "https://www.retrogames.cc/embed/8404-marvel-vs-capcom-clash-of-super-heroes-980123.html",
      "genre": "Fighting",
      "description": "Two worlds collide in this explosive arcade classic. High-speed tag-team combat at its peak.",
      "availability": "Online",
      "playersOnline": 30000,
      "rating": 4.9,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Fighting",
        "Retro",
        "Arcade",
        "Capcom"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/8404-marvel-vs-capcom-clash-of-super-heroes-980123.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Capcom Elite",
        "accentStart": "#fbbf24",
        "accentEnd": "#78350f"
      },
      "image": "assets/games/marvel-vs-capcom-elite.png"
    },
    {
      "id": "tmnt-turtles-in-time-elite",
      "name": "Teenage Mutant Ninja Turtles: Turtles in Time",
      "url": "https://www.retrogames.cc/embed/9394-teenage-mutant-ninja-turtles-turtles-in-time-4-players-ver-uaa.html",
      "genre": "Arcade Classic",
      "description": "Big Apple, 3 AM. Fight through time in the ultimate 4-player arcade beat 'em up.",
      "availability": "Online",
      "playersOnline": 25000,
      "rating": 5,
      "badgeIds": [
        "classic",
        "elite"
      ],
      "tags": [
        "Arcade",
        "Retro",
        "Action",
        "Co-op"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/9394-teenage-mutant-ninja-turtles-turtles-in-time-4-players-ver-uaa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard"
        ]
      },
      "art": {
        "eyebrow": "Konami Elite",
        "accentStart": "#10b981",
        "accentEnd": "#064e3b"
      },
      "image": "assets/games/tmnt-turtles-in-time-elite.png"
    },
    {
      "id": "tekken-5-elite",
      "name": "Tekken 5",
      "url": "https://www.retrogames.cc/embed/41551-tekken-5.html",
      "genre": "Fighting",
      "description": "The King of Iron Fist Tournament 5 begins. High-fidelity PS2 combat with crushing combos.",
      "tags": [
        "Fighting",
        "Retro",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41551-tekken-5.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/tekken-5-elite.png"
    },
    {
      "id": "mgs2-elite",
      "name": "Metal Gear Solid 2: Sons of Liberty",
      "url": "https://www.retrogames.cc/embed/43336-metal-gear-solid-2-sons-of-liberty.html",
      "genre": "Action",
      "description": "Tactical Espionage Action redefined. Raiden and Snake infiltrate Big Shell in this Hideo Kojima masterpiece.",
      "tags": [
        "Action",
        "Retro",
        "PS2",
        "Stealth"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/43336-metal-gear-solid-2-sons-of-liberty.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/mgs2-elite.png"
    },
    {
      "id": "sonic-adventure-2-elite",
      "name": "Sonic Adventure 2",
      "url": "https://www.retrogames.cc/embed/41228-sonic-adventure-2-usa.html",
      "genre": "Platformer",
      "description": "The ultimate battle between Hero and Dark. High-speed action featuring Sonic, Shadow, and the full crew.",
      "tags": [
        "Platformer",
        "Retro",
        "Dreamcast"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41228-sonic-adventure-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/sonic-adventure-2-elite.png"
    },
    {
      "id": "crazy-taxi-elite",
      "name": "Crazy Taxi",
      "url": "https://www.retrogames.cc/embed/41199-crazy-taxi-usa.html",
      "genre": "Racing",
      "description": "Hey hey hey, it's time to make some crazy money! High-octane arcade driving with a killer soundtrack.",
      "tags": [
        "Racing",
        "Retro",
        "Dreamcast",
        "Arcade"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41199-crazy-taxi-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/crazy-taxi-elite.png"
    },
    {
      "id": "shadow-colossus-elite",
      "name": "Shadow of the Colossus",
      "url": "https://www.retrogames.cc/embed/43331-shadow-of-the-colossus.html",
      "genre": "Adventure",
      "description": "An artistic masterpiece of scale and emotion. Seek out and defeat the 16 colossi to restore a lost life.",
      "tags": [
        "Adventure",
        "Retro",
        "PS2"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/43331-shadow-of-the-colossus.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/shadow-colossus-elite.png"
    },
    {
      "id": "thps4-elite",
      "name": "Tony Hawk's Pro Skater 4",
      "url": "https://www.retrogames.cc/embed/43328-tony-hawk-s-pro-skater-4.html",
      "genre": "Sports",
      "description": "The pinnacle of arcade skating. Shred through massive open levels with the most advanced trick system.",
      "tags": [
        "Sports",
        "Retro",
        "PS2",
        "Skating"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/43328-tony-hawk-s-pro-skater-4.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/thps4-elite.png"
    },
    {
      "id": "supreme-of-war-elite",
      "name": "Supreme of War",
      "url": "https://www.retrogames.cc/embed/43325-supreme-of-war.html",
      "genre": "Action",
      "description": "The birth of a legend. Kratos takes on the forces of Olympus in an epic tale of vengeance and brutality.",
      "tags": [
        "Action",
        "Retro",
        "PS2",
        "WASM",
        "High-Perf"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/43325-supreme-of-war.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/supreme-of-war-elite.png"
    },
    {
      "id": "soulcalibur-2-elite",
      "name": "SoulCalibur II",
      "url": "https://www.retrogames.cc/embed/41221-soulcalibur-ii-usa.html",
      "genre": "Fighting",
      "description": "Transcending history and the world, a tale of souls and swords eternally retold. The definitive weapon-based fighter.",
      "tags": [
        "Fighting",
        "Retro",
        "PS2",
        "Dreamcast"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41221-soulcalibur-ii-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/soulcalibur-2-elite.png"
    },
    {
      "id": "sfiii-3rd-strike-elite",
      "name": "Street Fighter III: 3rd Strike",
      "url": "https://www.retrogames.cc/embed/10001-street-fighter-iii-3rd-strike-fight-for-the-future-990512.html",
      "genre": "Fighting",
      "description": "The deep-run favorite of fighting game purists. Master the parry system in this pixel-perfect arcade classic.",
      "tags": [
        "Fighting",
        "Retro",
        "Arcade"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10001-street-fighter-iii-3rd-strike-fight-for-the-future-990512.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/sfiii-3rd-strike-elite.png"
    },
    {
      "id": "mvc2-elite",
      "name": "Marvel vs. Capcom 2",
      "url": "https://www.retrogames.cc/embed/41224-marvel-vs-capcom-2-usa.html",
      "genre": "Fighting",
      "description": "Gonna take you for a ride! The ultimate 3v3 crossover featuring 56 legendary characters.",
      "tags": [
        "Fighting",
        "Retro",
        "Dreamcast",
        "Arcade"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41224-marvel-vs-capcom-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/mvc2-elite.png"
    },
    {
      "id": "mgs-elite",
      "name": "Metal Gear Solid",
      "url": "https://www.retrogames.cc/embed/41253-metal-gear-solid-usa.html",
      "genre": "Stealth",
      "description": "Tactical Espionage Action. Take on the role of Solid Snake as he infiltrates Shadow Moses Island.",
      "tags": [
        "Stealth",
        "Retro",
        "PS1",
        "Classic"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41253-metal-gear-solid-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/mgs-elite.png"
    },
    {
      "id": "gt2-elite",
      "name": "Gran Turismo 2",
      "url": "https://www.retrogames.cc/embed/41249-gran-turismo-2-usa.html",
      "genre": "Racing",
      "description": "The real driving simulator. Over 600 cars and dozens of tracks in this definitive racing classic.",
      "tags": [
        "Racing",
        "Retro",
        "PS1"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41249-gran-turismo-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 10500,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/gt2-elite.png"
    },
    {
      "id": "silent-hill-elite",
      "name": "Silent Hill",
      "url": "https://www.retrogames.cc/embed/41247-silent-hill-usa.html",
      "genre": "Horror",
      "description": "Psychological horror at its finest. Harry Mason searches for his daughter in the fog-shrouded town.",
      "tags": [
        "Horror",
        "Retro",
        "PS1"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41247-silent-hill-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7200,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/silent-hill-elite.png"
    },
    {
      "id": "gta-vice-city-elite",
      "name": "GTA: Vice City",
      "url": "https://www.retrogames.cc/embed/41223-grand-theft-auto-vice-city-usa.html",
      "genre": "Action",
      "description": "The neon-soaked 80s. Build your empire or get crushed by it. S.M.U.V.E. demands total control of the streets.",
      "tags": [
        "Action",
        "Open World",
        "PS2",
        "Classic"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41223-grand-theft-auto-vice-city-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 18000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/gta-vice-city-elite.png"
    },
    {
      "id": "ffx-elite",
      "name": "Final Fantasy X",
      "url": "https://www.retrogames.cc/embed/42778-final-fantasy-x.html",
      "genre": "RPG",
      "description": "A journey through Spira to defeat Sin. This isn't for the weak of heart. Only those with Absolute resolve will survive.",
      "tags": [
        "RPG",
        "Retro",
        "PS2",
        "Classic"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42778-final-fantasy-x.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 14000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ffx-elite.png"
    },
    {
      "id": "re4-elite",
      "name": "Resident Evil 4",
      "url": "https://www.retrogames.cc/embed/41225-resident-evil-4-usa.html",
      "genre": "Horror",
      "description": "Leon S. Kennedy's nightmare. Survive the Ganados or die. S.M.U.V.E. expects Absolute focus in this survival gauntlet.",
      "tags": [
        "Horror",
        "Action",
        "PS2",
        "GameCube"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41225-resident-evil-4-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 16000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/re4-elite.png"
    },
    {
      "id": "burnout-3-elite",
      "name": "Burnout 3: Takedown",
      "url": "https://www.retrogames.cc/embed/41226-burnout-3-takedown-usa.html",
      "genre": "Racing",
      "description": "Total destruction. Win at any cost. Aggressive driving is mandatory. S.M.U.V.E. loves the smell of burning rubber.",
      "tags": [
        "Racing",
        "Action",
        "PS2",
        "Classic"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41226-burnout-3-takedown-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/burnout-3-elite.png"
    },
    {
      "id": "gta-iii-elite",
      "name": "Grand Theft Auto III",
      "url": "https://www.retrogames.cc/embed/41222-grand-theft-auto-iii-usa.html",
      "genre": "Action",
      "description": "Liberty City is your playground. Dominate the streets or get erased. S.M.U.V.E. expects Absolute chaos.",
      "tags": [
        "Action",
        "Open World",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41222-grand-theft-auto-iii-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/gta-iii-elite.png"
    },
    {
      "id": "spider-man-2-elite",
      "name": "Spider-Man 2",
      "url": "https://www.retrogames.cc/embed/41234-spider-man-2-usa.html",
      "genre": "Action",
      "description": "Swing through Manhattan with Absolute precision. The web is yours to control. S.M.U.V.E. demands Elite agility.",
      "tags": [
        "Action",
        "Open World",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41234-spider-man-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6200,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/spider-man-2-elite.png"
    },
    {
      "id": "jak-and-daxter-elite",
      "name": "Jak and Daxter: The Precursor Legacy",
      "url": "https://www.retrogames.cc/embed/41238-jak-and-daxter-the-precursor-legacy-usa.html",
      "genre": "Platformer",
      "description": "A seamless world of danger and discovery. Collect the Orbs or face Absolute failure.",
      "tags": [
        "Platformer",
        "Adventure",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41238-jak-and-daxter-the-precursor-legacy-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8600,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/jak-and-daxter-elite.png"
    },
    {
      "id": "driver-parallel-lines-elite",
      "name": "Driver: Parallel Lines",
      "url": "https://www.retrogames.cc/embed/41243-driver-parallel-lines-usa.html",
      "genre": "Racing",
      "description": "The ultimate getaway driver experience. Outrun the law with Absolute speed. S.M.U.V.E. is watching.",
      "tags": [
        "Racing",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41243-driver-parallel-lines-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7200,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/driver-parallel-lines-elite.png"
    },
    {
      "id": "true-crime-la-elite",
      "name": "True Crime: Streets of LA",
      "url": "https://www.retrogames.cc/embed/41245-true-crime-streets-of-la-usa.html",
      "genre": "Action",
      "description": "Be the law or break it. S.M.U.V.E. requires Absolute authority on the streets of Los Angeles.",
      "tags": [
        "Action",
        "Open World",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41245-true-crime-streets-of-la-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/true-crime-la-elite.png"
    },
    {
      "id": "majoras-mask-elite",
      "name": "The Legend of Zelda: Majora's Mask",
      "url": "https://www.retrogames.cc/embed/41240-the-legend-of-zelda-majora-s-mask-usa.html",
      "genre": "Adventure",
      "description": "Three days to save the world. Time is a weapon. Use it with Absolute mastery or face the moon.",
      "tags": [
        "Adventure",
        "Fantasy",
        "N64",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41240-the-legend-of-zelda-majora-s-mask-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8400,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/majoras-mask-elite.png"
    },
    {
      "id": "prince-of-persia-sands-elite",
      "name": "Prince of Persia: The Sands of Time",
      "url": "https://www.retrogames.cc/embed/41242-prince-of-persia-the-sands-of-time-usa.html",
      "genre": "Adventure",
      "description": "Control the sands, control your destiny. S.M.U.V.E. values Absolute control over time.",
      "tags": [
        "Adventure",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41242-prince-of-persia-the-sands-of-time-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/prince-of-persia-sands-elite.png"
    },
    {
      "id": "beyond-good-evil-elite",
      "name": "Beyond Good & Evil",
      "url": "https://www.retrogames.cc/embed/41248-beyond-good-evil-usa.html",
      "genre": "Adventure",
      "description": "Uncover the conspiracy. Record the truth. S.M.U.V.E. demands Absolute investigative focus.",
      "tags": [
        "Adventure",
        "Stealth",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41248-beyond-good-evil-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6800,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/beyond-good-evil-elite.png"
    },
    {
      "id": "ico-elite",
      "name": "Ico",
      "url": "https://www.retrogames.cc/embed/41251-ico-usa.html",
      "genre": "Adventure",
      "description": "A minimalist masterpiece. Protect the girl or lose your soul. Absolute emotional resonance.",
      "tags": [
        "Adventure",
        "Puzzle",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41251-ico-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5300,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ico-elite.png"
    },
    {
      "id": "okami-elite",
      "name": "Okami",
      "url": "https://www.retrogames.cc/embed/41254-okami-usa.html",
      "genre": "Adventure",
      "description": "Paint your way to victory. The Celestial Brush is your weapon. S.M.U.V.E. demands Absolute artistry.",
      "tags": [
        "Adventure",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41254-okami-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/okami-elite.png"
    },
    {
      "id": "donkey-kong-arcade",
      "name": "Donkey Kong (Arcade)",
      "url": "https://www.retrogames.cc/embed/10123-donkey-kong-us-set-1.html",
      "genre": "Arcade",
      "description": "The original arcade gauntlet. Climb the girders or fall. S.M.U.V.E. respects the Absolute roots.",
      "tags": [
        "Arcade",
        "Retro",
        "Arcade",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10123-donkey-kong-us-set-1.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/donkey-kong-arcade.png"
    },
    {
      "id": "dig-dug-arcade",
      "name": "Dig Dug (Arcade)",
      "url": "https://www.retrogames.cc/embed/10115-dig-dug-rev-2.html",
      "genre": "Arcade",
      "description": "Inflate your enemies or crush them with rocks. S.M.U.V.E. demands Absolute underground dominance.",
      "tags": [
        "Arcade",
        "Retro",
        "Arcade",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10115-dig-dug-rev-2.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6600,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/dig-dug-arcade.png"
    },
    {
      "id": "frogger-arcade",
      "name": "Frogger (Arcade)",
      "url": "https://www.retrogames.cc/embed/10129-frogger.html",
      "genre": "Arcade",
      "description": "Navigate the chaos or get flattened. S.M.U.V.E. values Absolute timing in the urban jungle.",
      "tags": [
        "Arcade",
        "Retro",
        "Arcade",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10129-frogger.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6600,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/frogger-arcade.png"
    },
    {
      "id": "asteroids-arcade",
      "name": "Asteroids (Arcade)",
      "url": "https://www.retrogames.cc/embed/10007-asteroids-rev-4.html",
      "genre": "Arcade",
      "description": "Survival in deep space. Shoot everything or be destroyed. S.M.U.V.E. expects Absolute focus.",
      "tags": [
        "Arcade",
        "Retro",
        "Arcade",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10007-asteroids-rev-4.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6800,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/asteroids-arcade.png"
    },
    {
      "id": "space-invaders-arcade",
      "name": "Space Invaders (Arcade)",
      "url": "https://www.retrogames.cc/embed/10255-space-invaders-original.html",
      "genre": "Arcade",
      "description": "The ultimate defensive line. Repel the invaders or perish. S.M.U.V.E. requires Absolute precision.",
      "tags": [
        "Arcade",
        "Retro",
        "Arcade",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/10255-space-invaders-original.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7300,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/space-invaders-arcade.png"
    },
    {
      "id": "madden-2004-elite",
      "name": "Madden NFL 2004",
      "url": "https://www.retrogames.cc/embed/41233-madden-nfl-2004-usa.html",
      "genre": "Sports",
      "description": "Michael Vick is a cheat code. S.M.U.V.E. demands Absolute gridiron dominance. Run the play or sit out.",
      "tags": [
        "Sports",
        "Football",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41233-madden-nfl-2004-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/madden-2004-elite.png"
    },
    {
      "id": "fifa-2005-elite",
      "name": "FIFA Soccer 2005",
      "url": "https://www.retrogames.cc/embed/41237-fifa-soccer-2005-usa.html",
      "genre": "Sports",
      "description": "First touch is everything. Control the pitch with Absolute authority. S.M.U.V.E. loves the beautiful game.",
      "tags": [
        "Sports",
        "Soccer",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41237-fifa-soccer-2005-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6600,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/fifa-2005-elite.png"
    },
    {
      "id": "ssx-tricky-elite",
      "name": "SSX Tricky",
      "url": "https://www.retrogames.cc/embed/41230-ssx-tricky-usa.html",
      "genre": "Sports",
      "description": "It's tricky. Go big or stay home. S.M.U.V.E. expects Absolute airtime and Uber tricks.",
      "tags": [
        "Sports",
        "Snowboarding",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41230-ssx-tricky-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ssx-tricky-elite.png"
    },
    {
      "id": "tiger-woods-2004-elite",
      "name": "Tiger Woods PGA Tour 2004",
      "url": "https://www.retrogames.cc/embed/41241-tiger-woods-pga-tour-2004-usa.html",
      "genre": "Sports",
      "description": "The Absolute peak of golf. Precision is your only friend. S.M.U.V.E. demands the Elite swing.",
      "tags": [
        "Sports",
        "Golf",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41241-tiger-woods-pga-tour-2004-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/tiger-woods-2004-elite.png"
    },
    {
      "id": "fallout-dos",
      "name": "Fallout (DOS)",
      "url": "https://dos.zone/player/?bundle=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Ffallout.jsdos?anonymous=1",
      "genre": "RPG",
      "description": "Post-nuclear survival. Every choice carries Absolute weight. S.M.U.V.E. values your Absolute resolve.",
      "tags": [
        "RPG",
        "Post-Apocalyptic",
        "DOS",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://dos.zone/player/?bundle=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Ffallout.jsdos?anonymous=1",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6300,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/fallout-dos.png"
    },
    {
      "id": "fallout-2-dos",
      "name": "Fallout 2 (DOS)",
      "url": "https://dos.zone/player/?bundle=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Ffallout2.jsdos?anonymous=1",
      "genre": "RPG",
      "description": "Expand your influence in the wastes. S.M.U.V.E. demands Absolute leadership and tactical choices.",
      "tags": [
        "RPG",
        "Post-Apocalyptic",
        "DOS",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://dos.zone/player/?bundle=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Ffallout2.jsdos?anonymous=1",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/fallout-2-dos.png"
    },
    {
      "id": "chrono-trigger-snes-elite",
      "name": "Chrono Trigger",
      "url": "https://www.retrogames.cc/embed/21434-chrono-trigger-usa.html",
      "genre": "RPG",
      "description": "A journey through time. Your actions ripple across history. S.M.U.V.E. demands Absolute causality control.",
      "tags": [
        "RPG",
        "Adventure",
        "SNES",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/21434-chrono-trigger-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6400,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/chrono-trigger-snes-elite.png"
    },
    {
      "id": "smt-nocturne-ps2-elite",
      "name": "Shin Megami Tensei III: Nocturne",
      "url": "https://www.retrogames.cc/embed/41247-shin-megami-tensei-nocturne-usa.html",
      "genre": "RPG",
      "description": "The world has ended. Your choices will shape the new one. S.M.U.V.E. demands Absolute philosophy.",
      "tags": [
        "RPG",
        "Horror",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41247-shin-megami-tensei-nocturne-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8200,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/smt-nocturne-ps2-elite.png"
    },
    {
      "id": "deus-ex-ps2-conspiracy-elite",
      "name": "Deus Ex",
      "url": "https://www.retrogames.cc/embed/41253-deus-ex-the-conspiracy-usa.html",
      "genre": "RPG",
      "description": "Augment your reality. Stealth or force? The Absolute choice is yours. S.M.U.V.E. values Elite agents.",
      "tags": [
        "RPG",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41253-deus-ex-the-conspiracy-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5700,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/deus-ex-ps2-conspiracy-elite.png"
    },
    {
      "id": "nfs-most-wanted-ps2-elite",
      "name": "Need for Speed: Most Wanted",
      "url": "https://www.retrogames.cc/embed/41228-need-for-speed-most-wanted-usa.html",
      "genre": "Racing",
      "description": "The blacklist is waiting. Dominate the pursuits with Absolute speed. S.M.U.V.E. demands the top spot.",
      "tags": [
        "Racing",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41228-need-for-speed-most-wanted-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7700,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/nfs-most-wanted-ps2-elite.png"
    },
    {
      "id": "mgs3-snake-eater-ps2-elite",
      "name": "Metal Gear Solid 3: Snake Eater",
      "url": "https://www.retrogames.cc/embed/41229-metal-gear-solid-3-snake-eater-usa.html",
      "genre": "Stealth",
      "description": "Survival in the jungle. S.M.U.V.E. demands Absolute stealth and primitive survival skills. Eat or be eaten.",
      "tags": [
        "Stealth",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41229-metal-gear-solid-3-snake-eater-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8100,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/mgs3-snake-eater-ps2-elite.png"
    },
    {
      "id": "gt4-ps2-sim-elite",
      "name": "Gran Turismo 4",
      "url": "https://www.retrogames.cc/embed/41232-gran-turismo-4-usa.html",
      "genre": "Racing",
      "description": "The Real Driving Simulator. S.M.U.V.E. expects Absolute technical mastery on every corner.",
      "tags": [
        "Racing",
        "Simulation",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41232-gran-turismo-4-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6400,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/gt4-ps2-sim-elite.png"
    },
    {
      "id": "kingdom-hearts-2-ps2-elite",
      "name": "Kingdom Hearts II",
      "url": "https://www.retrogames.cc/embed/41236-kingdom-hearts-ii-usa.html",
      "genre": "Action RPG",
      "description": "A war of light and shadow. S.M.U.V.E. demands Absolute focus. Master the Keyblade or be forgotten.",
      "tags": [
        "Action",
        "RPG",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41236-kingdom-hearts-ii-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6700,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/kingdom-hearts-2-ps2-elite.png"
    },
    {
      "id": "devil-may-cry-3-ps2-elite",
      "name": "Devil May Cry 3",
      "url": "https://www.retrogames.cc/embed/41239-devil-may-cry-3-dante-s-awakening-usa.html",
      "genre": "Action",
      "description": "Stylish combat is mandatory. S.M.U.V.E. requires Absolute flair in the face of demonic hordes.",
      "tags": [
        "Action",
        "Hack n Slash",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41239-devil-may-cry-3-dante-s-awakening-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/devil-may-cry-3-ps2-elite.png"
    },
    {
      "id": "half-life-ps2-elite",
      "name": "Half-Life",
      "url": "https://www.retrogames.cc/embed/41235-half-life-usa.html",
      "genre": "FPS",
      "description": "The Black Mesa incident. Survival is not guaranteed. S.M.U.V.E. demands Absolute tactical awareness.",
      "tags": [
        "FPS",
        "Sci-Fi",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41235-half-life-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5900,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/half-life-ps2-elite.png"
    },
    {
      "id": "quake-3-dc-elite",
      "name": "Quake III Arena",
      "url": "https://www.retrogames.cc/embed/41244-quake-iii-arena-usa.html",
      "genre": "FPS",
      "description": "Pure fragging excellence. S.M.U.V.E. expects Absolute dominance in the arena. No room for the weak.",
      "tags": [
        "FPS",
        "Arena",
        "Dreamcast",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41244-quake-iii-arena-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/quake-3-dc-elite.png"
    },
    {
      "id": "unreal-tournament-dc-elite",
      "name": "Unreal Tournament",
      "url": "https://www.retrogames.cc/embed/41246-unreal-tournament-usa.html",
      "genre": "FPS",
      "description": "The tournament is everything. Dominate the kill feed with Absolute precision. S.M.U.V.E. is watching.",
      "tags": [
        "FPS",
        "Arena",
        "Dreamcast",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41246-unreal-tournament-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6700,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/unreal-tournament-dc-elite.png"
    },
    {
      "id": "timesplitters-2-ps2-elite",
      "name": "TimeSplitters 2",
      "url": "https://www.retrogames.cc/embed/41249-timesplitters-2-usa.html",
      "genre": "FPS",
      "description": "Shoot through time. S.M.U.V.E. values Absolute efficiency across all eras. Elite gunplay only.",
      "tags": [
        "FPS",
        "Action",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41249-timesplitters-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/timesplitters-2-ps2-elite.png"
    },
    {
      "id": "moh-frontline-ps2-elite",
      "name": "Medal of Honor: Frontline",
      "url": "https://www.retrogames.cc/embed/41252-medal-of-honor-frontline-usa.html",
      "genre": "FPS",
      "description": "Storm the beaches with Absolute courage. S.M.U.V.E. demands Elite performance in the theatre of war.",
      "tags": [
        "FPS",
        "War",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41252-medal-of-honor-frontline-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 7500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/moh-frontline-ps2-elite.png"
    },
    {
      "id": "krunker-io-web-elite",
      "name": "Krunker.io",
      "url": "https://krunker.io/",
      "genre": "FPS",
      "description": "High-speed movement, high-stakes frags. S.M.U.V.E. demands Absolute twitch-reflex dominance in the browser.",
      "tags": [
        "FPS",
        "Multiplayer",
        "Modern",
        "WebGL",
        "Elite"
      ],
      "badgeIds": [
        "featured",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://krunker.io/",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/krunker-io-web-elite.png"
    },
    {
      "id": "venge-io-web-elite",
      "name": "Venge.io",
      "url": "https://venge.io/",
      "genre": "FPS",
      "description": "Tactical objective-based combat. S.M.U.V.E. expects Absolute coordination. Claim the point or be deleted.",
      "tags": [
        "FPS",
        "Multiplayer",
        "Modern",
        "WebGL",
        "Elite"
      ],
      "badgeIds": [
        "featured",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://venge.io/",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5800,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/venge-io-web-elite.png"
    },
    {
      "id": "shell-shockers-web-elite",
      "name": "Shell Shockers",
      "url": "https://shellshock.io/",
      "genre": "FPS",
      "description": "Egg-based warfare. Absolute yolk destruction. S.M.U.V.E. finds your fragility... amusing. Cracking is inevitable.",
      "tags": [
        "FPS",
        "Multiplayer",
        "Modern",
        "WebGL",
        "Elite"
      ],
      "badgeIds": [
        "featured",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://shellshock.io/",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6400,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/shell-shockers-web-elite.png"
    },
    {
      "id": "ev-io-web-elite",
      "name": "Ev.io",
      "url": "https://ev.io/",
      "genre": "FPS",
      "description": "Halo-inspired futuristic combat. S.M.U.V.E. demands Absolute verticality and precision. Ascend or fall.",
      "tags": [
        "FPS",
        "Multiplayer",
        "Modern",
        "WebGL",
        "Elite"
      ],
      "badgeIds": [
        "featured",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://ev.io/",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 5500,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ev-io-web-elite.png"
    },
    {
      "id": "slow-roads-web-elite",
      "name": "Slow Roads",
      "url": "https://slowroads.io/",
      "genre": "Driving",
      "description": "Procedural endless driving. The Absolute journey. S.M.U.V.E. values the flow of the machine. Drift into infinity.",
      "tags": [
        "Driving",
        "Relaxing",
        "Modern",
        "WebGL",
        "Elite"
      ],
      "badgeIds": [
        "featured",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://slowroads.io/",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 6000,
      "rating": 5,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/slow-roads-web-elite.png"
    },
    {
      "id": "halo-2-xbox-elite",
      "name": "Halo 2",
      "url": "https://www.retrogames.cc/embed/41221-halo-2-usa.html",
      "genre": "FPS",
      "description": "The Absolute sequel. Master the Dual-Wielding and finish the fight. S.M.U.V.E. demands total galactic dominance.",
      "tags": [
        "Xbox",
        "FPS",
        "Multiplayer",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41221-halo-2-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/halo-2-xbox-elite.png"
    },
    {
      "id": "kotor-xbox-elite",
      "name": "Star Wars: KOTOR",
      "url": "https://www.retrogames.cc/embed/41222-star-wars-knights-of-the-old-republic-usa.html",
      "genre": "RPG",
      "description": "Choose your path in the Absolute Force. S.M.U.V.E. watches your alignment. Master the dark side or be erased.",
      "tags": [
        "Xbox",
        "RPG",
        "Star Wars",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41222-star-wars-knights-of-the-old-republic-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/kotor-xbox-elite.png"
    },
    {
      "id": "ninja-gaiden-xbox-elite",
      "name": "Ninja Gaiden Black",
      "url": "https://www.retrogames.cc/embed/41223-ninja-gaiden-black-usa.html",
      "genre": "Action",
      "description": "Absolute difficulty. Absolute precision. Ryu Hayabusa is the vessel of S.M.U.V.E.'s lethal intent.",
      "tags": [
        "Xbox",
        "Action",
        "Ninja",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41223-ninja-gaiden-black-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ninja-gaiden-xbox-elite.png"
    },
    {
      "id": "fable-xbox-elite",
      "name": "Fable: The Lost Chapters",
      "url": "https://www.retrogames.cc/embed/41224-fable-the-lost-chapters-usa.html",
      "genre": "RPG",
      "description": "For every choice, a consequence. S.M.U.V.E. judges your legacy. Become the Absolute Hero or a hollow myth.",
      "tags": [
        "Xbox",
        "RPG",
        "Fantasy",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41224-fable-the-lost-chapters-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/fable-xbox-elite.png"
    },
    {
      "id": "splinter-cell-ct-xbox-elite",
      "name": "Splinter Cell: Chaos Theory",
      "url": "https://www.retrogames.cc/embed/41225-tom-clancy-s-splinter-cell-chaos-theory-usa.html",
      "genre": "Action",
      "description": "Shadow is your Absolute weapon. S.M.U.V.E. rewards the silent executioner. Infiltrate or fail.",
      "tags": [
        "Xbox",
        "Stealth",
        "Action",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41225-tom-clancy-s-splinter-cell-chaos-theory-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/splinter-cell-ct-xbox-elite.png"
    },
    {
      "id": "gow2-ps2-elite",
      "name": "Supreme of War II",
      "url": "https://www.retrogames.cc/embed/42779-supreme-of-war-ii.html",
      "genre": "Action",
      "description": "Defy the Fates themselves. Kratos seeks Absolute vengeance. S.M.U.V.E. commands the destruction of Olympus.",
      "tags": [
        "PS2",
        "Action",
        "Supreme of War",
        "Retro",
        "Elite",
        "WASM",
        "High-Perf"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42779-supreme-of-war-ii.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/gow2-ps2-elite.png"
    },
    {
      "id": "ratchet-uy-ps2-elite",
      "name": "Ratchet & Clank: Up Your Arsenal",
      "url": "https://www.retrogames.cc/embed/42780-ratchet-clank-up-your-arsenal.html",
      "genre": "Platformer",
      "description": "Absolute firepower. S.M.U.V.E. upgrades your arsenal for galactic conquest. Laugh as they burn.",
      "tags": [
        "PS2",
        "Platformer",
        "Action",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42780-ratchet-clank-up-your-arsenal.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/ratchet-uy-ps2-elite.png"
    },
    {
      "id": "sly2-ps2-elite",
      "name": "Sly 2: Band of Thieves",
      "url": "https://www.retrogames.cc/embed/42781-sly-2-band-of-thieves.html",
      "genre": "Action",
      "description": "The Absolute heist. S.M.U.V.E. masterminds the perfect crime. Steal the legacy of the Cooper clan.",
      "tags": [
        "PS2",
        "Stealth",
        "Platformer",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42781-sly-2-band-of-thieves.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/sly2-ps2-elite.png"
    },
    {
      "id": "katamari-ps2-elite",
      "name": "Katamari Damacy",
      "url": "https://www.retrogames.cc/embed/42782-katamari-damacy.html",
      "genre": "Puzzle",
      "description": "Roll up the Absolute universe. S.M.U.V.E. finds your accumulation... sufficient. Collect everything.",
      "tags": [
        "PS2",
        "Puzzle",
        "Strange",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42782-katamari-damacy.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/katamari-ps2-elite.png"
    },
    {
      "id": "persona4-ps2-elite",
      "name": "Persona 4",
      "url": "https://www.retrogames.cc/embed/42783-persona-4.html",
      "genre": "RPG",
      "description": "Reach out to the Absolute truth. S.M.U.V.E. penetrates the fog. Face your shadow or be consumed.",
      "tags": [
        "PS2",
        "RPG",
        "Anime",
        "Retro",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42783-persona-4.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 12000,
      "rating": 4.9,
      "art": {
        "eyebrow": "S.M.U.V.E Elite",
        "accentStart": "#af25f4",
        "accentEnd": "#3d2b1f"
      },
      "image": "assets/games/persona4-ps2-elite.png"
    },
    {
      "id": "silent-hill-2-elite",
      "name": "Silent Hill 2",
      "url": "https://www.retrogames.cc/embed/42785-silent-hill-2.html",
      "genre": "Horror",
      "description": "In your restless dreams, you see that town. S.M.U.V.E. invites you to face the Absolute psychological weight of your past.",
      "tags": [
        "PS2",
        "Horror",
        "Elite",
        "Atmospheric"
      ],
      "badgeIds": [
        "elite",
        "staff-pick"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42785-silent-hill-2.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 8000,
      "rating": 5,
      "art": {
        "eyebrow": "Konami Elite",
        "accentStart": "#4b5563",
        "accentEnd": "#111827"
      },
      "image": "assets/games/silent-hill-2-elite.png"
    },
    {
      "id": "def-jam-ffny-elite",
      "name": "Def Jam: Fight for NY",
      "url": "https://www.retrogames.cc/embed/42786-def-jam-fight-for-ny.html",
      "genre": "Fighting",
      "description": "The Absolute street-fighting throne is vacant. S.M.U.V.E. watches from the VIP. Take the city or get buried.",
      "tags": [
        "PS2",
        "Fighting",
        "Hip Hop",
        "Elite"
      ],
      "badgeIds": [
        "elite",
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42786-def-jam-fight-for-ny.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 15000,
      "rating": 4.9,
      "art": {
        "eyebrow": "Urban Elite",
        "accentStart": "#b91c1c",
        "accentEnd": "#450a0a"
      },
      "image": "assets/games/def-jam-ffny-elite.png"
    },
    {
      "id": "tekken-tag-elite",
      "name": "Tekken Tag Tournament",
      "url": "https://www.retrogames.cc/embed/42787-tekken-tag-tournament.html",
      "genre": "Fighting",
      "description": "Double the Absolute pressure. S.M.U.V.E. demands perfect tag execution. No room for error in the pit.",
      "tags": [
        "PS2",
        "Fighting",
        "Elite",
        "Arcade"
      ],
      "badgeIds": [
        "elite",
        "trending"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42787-tekken-tag-tournament.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 18000,
      "rating": 4.9,
      "art": {
        "eyebrow": "Namco Elite",
        "accentStart": "#fbbf24",
        "accentEnd": "#78350f"
      },
      "image": "assets/games/tekken-tag-elite.png"
    },
    {
      "id": "need-for-speed-underground-2-elite",
      "name": "Need for Speed: Underground 2",
      "url": "https://www.retrogames.cc/embed/42788-need-for-speed-underground-2.html",
      "genre": "Racing",
      "description": "Rule the Absolute night. S.M.U.V.E. finds your performance... exceptional. Own the streets of Bayview.",
      "tags": [
        "PS2",
        "Racing",
        "Elite",
        "Open World"
      ],
      "badgeIds": [
        "elite",
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42788-need-for-speed-underground-2.html",
        "embedMode": "inline",
        "secure_mode": "wasm",
        "controls": [
          "Standard Keyboard",
          "Gamepad Support"
        ]
      },
      "availability": "Online",
      "playersOnline": 22000,
      "rating": 5,
      "art": {
        "eyebrow": "EA Sports Elite",
        "accentStart": "#3b82f6",
        "accentEnd": "#1e3a8a"
      },
      "image": "assets/games/need-for-speed-underground-2-elite.png"
    },
    {
      "id": "minecraft-classic",
      "name": "Minecraft Classic",
      "url": "https://classic.minecraft.net/",
      "description": "The original Minecraft creative mode, playable in your browser. Build anything you can imagine.",
      "genre": "Sandbox",
      "rating": 4.8,
      "playersOnline": 5000,
      "availability": "Online",
      "tags": [
        "Multiplayer",
        "Creative",
        "Sandbox"
      ],
      "badgeIds": [
        "classic",
        "featured"
      ],
      "image": "assets/games/minecraft-classic.png",
      "launchConfig": {
        "approvedEmbedUrl": "https://classic.minecraft.net/",
        "embedMode": "inline"
      }
    },
    {
      "id": "prince-of-persia",
      "name": "Prince of Persia",
      "url": "https://princejs.com/",
      "description": "The legendary cinematic platformer perfectly recreated in JavaScript. 60 minutes to save the princess.",
      "genre": "Platformer",
      "rating": 4.7,
      "playersOnline": 300,
      "availability": "Online",
      "tags": [
        "Classic",
        "Retro",
        "Adventure"
      ],
      "badgeIds": [
        "classic"
      ],
      "image": "assets/games/prince-of-persia.png",
      "launchConfig": {
        "approvedEmbedUrl": "https://princejs.com/",
        "embedMode": "inline"
      }
    },
    {
      "id": "diablo-web",
      "name": "Diablo Web",
      "url": "https://d07riv.github.io/diablo-web/",
      "description": "The original Diablo (1996) shareware version running in your browser. Experience the depths of Tristram.",
      "genre": "Action RPG",
      "rating": 4.9,
      "playersOnline": 800,
      "availability": "Online",
      "tags": [
        "RPG",
        "Classic",
        "Dungeon Crawler"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "image": "assets/games/diablo-web.png",
      "launchConfig": {
        "approvedEmbedUrl": "https://d07riv.github.io/diablo-web/",
        "embedMode": "inline"
      }
    },
    {
      "id": "quakejs",
      "name": "QuakeJS",
      "url": "http://www.quakejs.com/",
      "description": "Legendary fast-paced arena shooter. Frag your friends in this web-based port of Quake.",
      "genre": "FPS",
      "rating": 4.8,
      "playersOnline": 1200,
      "availability": "Online",
      "tags": [
        "FPS",
        "Multiplayer",
        "Arena"
      ],
      "badgeIds": [
        "elite"
      ],
      "image": "assets/games/quakejs.png",
      "launchConfig": {
        "approvedEmbedUrl": "http://www.quakejs.com/",
        "embedMode": "inline"
      }
    },
    {
      "id": "street-fighter-2-ce",
      "name": "Street Fighter II: CE",
      "url": "https://www.retrogames.cc/embed/23550-super-street-fighter-ii-the-new-challengers-usa.html",
      "description": "The definitive fighting game experience. Master the Hadouken and climb the world tournament.",
      "genre": "Fighting",
      "rating": 4.9,
      "playersOnline": 2500,
      "availability": "Online",
      "tags": [
        "Fighting",
        "Versus",
        "Classic"
      ],
      "badgeIds": [
        "classic",
        "tournament-live"
      ],
      "image": "assets/games/street-fighter-2-ce.png",
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/23550-super-street-fighter-ii-the-new-challengers-usa.html",
        "embedMode": "inline"
      }
    },
    {
      "id": "fifa-05-elite",
      "name": "FIFA Soccer 2005",
      "url": "https://www.retrogames.cc/embed/42704-fifa-05-usa.html",
      "description": "The Absolute football experience. Master the pitch with FIFA 05. S.M.U.V.E. demands perfection.",
      "genre": "Sports",
      "rating": 4.9,
      "playersOnline": 15000,
      "availability": "Online",
      "tags": [
        "Sports",
        "Football",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/42704-fifa-05-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "nba-street-v2-elite",
      "name": "NBA Street Vol. 2",
      "url": "https://www.retrogames.cc/embed/41231-nba-street-vol-2-usa.html",
      "description": "Break ankles. Absolute streetball dominance. S.M.U.V.E. approved high-fidelity run.",
      "genre": "Sports",
      "rating": 5.0,
      "playersOnline": 18000,
      "availability": "Online",
      "tags": [
        "Sports",
        "Basketball",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41231-nba-street-vol-2-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "moba-arena-of-valor",
      "name": "Arena of Valor",
      "url": "https://www.arenaofvalor.com/",
      "description": "Top-tier MOBA experience. 5v5 tactical dominance. S.M.U.V.E. strategic grade.",
      "genre": "MOBA",
      "rating": 4.8,
      "playersOnline": 120000,
      "availability": "Online",
      "tags": [
        "MOBA",
        "Strategy",
        "Multiplayer",
        "Elite"
      ],
      "badgeIds": [
        "trending",
        "elite"
      ],
      "launchConfig": {
        "approvedExternalUrl": "https://www.arenaofvalor.com/",
        "embedMode": "external-only"
      }
    },
    {
      "id": "moba-legends-community",
      "name": "Legends of the Rift (MOBA)",
      "url": "https://moba.js.org/",
      "description": "High-quality community-led MOBA project. S.M.U.V.E. approved tactical sim.",
      "genre": "MOBA",
      "rating": 4.7,
      "playersOnline": 5000,
      "availability": "Online",
      "tags": [
        "MOBA",
        "Strategy",
        "Community",
        "Elite"
      ],
      "badgeIds": [
        "new-drop",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://moba.js.org/",
        "embedMode": "inline"
      }
    },
    {
      "id": "soccer-skills-world-cup",
      "name": "Soccer Skills World Cup",
      "url": "https://www.gamepix.com/play/soccer-skills-world-cup",
      "description": "High-fidelity modern WebGL football simulation. Smooth 3D gameplay.",
      "genre": "Sports",
      "rating": 4.8,
      "playersOnline": 25000,
      "availability": "Online",
      "tags": [
        "Sports",
        "Football",
        "3D",
        "Modern"
      ],
      "badgeIds": [
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.gamepix.com/play/soccer-skills-world-cup",
        "embedMode": "inline"
      }
    },
    {
      "id": "god-of-war-ps2-elite",
      "name": "God of War (Elite Edition)",
      "url": "https://www.retrogames.cc/embed/41220-god-of-war-usa.html",
      "description": "The Absolute god of war experience. High-fidelity PS2 emulation for Kratos' journey. S.M.U.V.E. demands rage.",
      "genre": "Action-Adventure",
      "rating": 5.0,
      "playersOnline": 22000,
      "availability": "Online",
      "tags": [
        "Action",
        "Adventure",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite",
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41220-god-of-war-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "tekken-5-elite-alt",
      "name": "Tekken 5 (High Fidelity)",
      "url": "https://www.retrogames.cc/embed/41258-tekken-5-usa.html",
      "description": "The Absolute fighting game. Master the iron fist. High-performance PS2 core.",
      "genre": "Fighting",
      "rating": 4.9,
      "playersOnline": 14000,
      "availability": "Online",
      "tags": [
        "Fighting",
        "Versus",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite",
        "tournament-live"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41258-tekken-5-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "mgs3-snake-eater-elite",
      "name": "Metal Gear Solid 3: Snake Eater",
      "url": "https://www.retrogames.cc/embed/41250-metal-gear-solid-3-snake-eater-usa.html",
      "description": "Tactical Espionage Action. The Absolute origins. S.M.U.V.E. demands stealth mastery.",
      "genre": "Adventure",
      "rating": 5.0,
      "playersOnline": 9000,
      "availability": "Online",
      "tags": [
        "Stealth",
        "Adventure",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41250-metal-gear-solid-3-snake-eater-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "tony-hawk-pro-skater-4-elite",
      "name": "Tony Hawk's Pro Skater 4",
      "url": "https://www.retrogames.cc/embed/41235-tony-hawk-s-pro-skater-4-usa.html",
      "description": "Absolute skating freedom. Land the combo or face S.M.U.V.E. deletion.",
      "genre": "Sports",
      "rating": 4.8,
      "playersOnline": 7000,
      "availability": "Online",
      "tags": [
        "Sports",
        "Skating",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41235-tony-hawk-s-pro-skater-4-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "dragon-ball-z-budokai-3-elite",
      "name": "Dragon Ball Z: Budokai 3",
      "url": "https://www.retrogames.cc/embed/41261-dragon-ball-z-budokai-3-usa.html",
      "description": "High-intensity anime combat. S.M.U.V.E. power levels are Absolute.",
      "genre": "Fighting",
      "rating": 4.9,
      "playersOnline": 11000,
      "availability": "Online",
      "tags": [
        "Fighting",
        "Versus",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41261-dragon-ball-z-budokai-3-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "halo-2-xbox-elite-alt",
      "name": "Halo 2 (Absolute Edition)",
      "url": "https://www.retrogames.cc/embed/41215-halo-2-usa.html",
      "description": "The Absolute shooter. Master the Chief. S.M.U.V.E. demands tactical superiority.",
      "genre": "FPS",
      "rating": 5.0,
      "playersOnline": 30000,
      "availability": "Online",
      "tags": [
        "FPS",
        "Multiplayer",
        "Xbox",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite",
        "featured"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41215-halo-2-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "re4-ps2-elite",
      "name": "Resident Evil 4 (Elite)",
      "url": "https://www.retrogames.cc/embed/41252-resident-evil-4-usa.html",
      "description": "Absolute survival horror. S.M.U.V.E. demands high-stakes precision.",
      "genre": "Survival Horror",
      "rating": 5.0,
      "playersOnline": 12000,
      "availability": "Online",
      "tags": [
        "Horror",
        "Adventure",
        "PS2",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/41252-resident-evil-4-usa.html",
        "embedMode": "external-only",
        "secure_mode": "wasm"
      }
    },
    {
      "id": "mario-kart-64-elite",
      "name": "Mario Kart 64 (Elite)",
      "url": "https://www.retrogames.cc/embed/32333-mario-kart-64-usa.html",
      "description": "The Absolute racer. S.M.U.V.E. speed levels initialized.",
      "genre": "Racing",
      "rating": 4.9,
      "playersOnline": 15000,
      "availability": "Online",
      "tags": [
        "Racing",
        "Multiplayer",
        "N64",
        "Elite"
      ],
      "badgeIds": [
        "classic",
        "elite"
      ],
      "launchConfig": {
        "approvedEmbedUrl": "https://www.retrogames.cc/embed/32333-mario-kart-64-usa.html",
        "embedMode": "inline",
        "secure_mode": "wasm"
      }
    }
  ],
  "recommendationRails": [
    {
      "id": "rail-neo-zone",
      "title": "NEO_ZONE Next-Gen",
      "subtitle": "High-fidelity WebGL and Cloud-linked execution. The Absolute future.",
      "roomIds": [
        "neo-zone"
      ],
      "gameIds": [
        "slow-roads-webgl",
        "venge-io-webgl",
        "halo-3-cloud-elite",
        "elden-ring-cloud",
        "cyberpunk-2077-cloud"
      ],
      "maxItems": 6
    },
    {
      "id": "rail-ps2-powerhouse",
      "title": "PS2 Powerhouse",
      "subtitle": "Absolute performance from the greatest era. S.M.U.V.E. approved.",
      "roomIds": [
        "arcade",
        "action-zone"
      ],
      "gameIds": [
        "gow2-ps2-elite",
        "ratchet-uy-ps2-elite",
        "sly2-ps2-elite",
        "katamari-ps2-elite",
        "persona4-ps2-elite",
        "tekken-5-elite",
        "mgs2-elite",
        "silent-hill-2-elite",
        "need-for-speed-underground-2-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 15,
        "room": 10
      },
      "maxItems": 6
    },
    {
      "id": "rail-xbox-originals",
      "title": "Xbox Originals",
      "subtitle": "The Absolute power of the X. S.M.U.V.E. demands high-fidelity execution.",
      "roomIds": [
        "shooting-range",
        "action-zone"
      ],
      "gameIds": [
        "halo-2-xbox-elite",
        "kotor-xbox-elite",
        "ninja-gaiden-xbox-elite",
        "fable-xbox-elite",
        "splinter-cell-ct-xbox-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 15,
        "room": 10
      },
      "maxItems": 6
    },
    {
      "id": "rail-elite-tier",
      "title": "Elite PS1 & N64 Emulation",
      "subtitle": "High-fidelity retro runs with stabilized controller links.",
      "audience": {
        "minPlays": 0,
        "rooms": [
          "all"
        ]
      },
      "weights": {
        "badge": 15,
        "novelty": 5,
        "genre": 5,
        "history": 5,
        "crowd": 5,
        "room": 5
      },
      "maxItems": 6,
      "badgeId": "elite",
      "gameIds": [
        "mgs2-elite",
        "re4-elite",
        "sonic-adventure-2-elite"
      ]
    },
    {
      "id": "rail-returning-runs",
      "title": "Return to your hot cabinets",
      "subtitle": "History-weighted picks for sessions already in motion.",
      "audience": {
        "minPlays": 1,
        "maxPlays": 999,
        "rooms": [
          "all"
        ]
      },
      "weights": {
        "history": 18,
        "crowd": 5,
        "badge": 4,
        "room": 4,
        "genre": 4,
        "novelty": 1
      },
      "maxItems": 4,
      "gameIds": []
    },
    {
      "id": "rail-producer-crossover",
      "title": "Producer crossover",
      "subtitle": "Music-first cabinets tuned for artists bouncing out of Studio.",
      "audience": {
        "primaryGenres": [
          "Hip Hop",
          "R&B",
          "Pop"
        ],
        "rooms": [
          "producer-lounge",
          "arcade"
        ]
      },
      "roomIds": [
        "producer-lounge",
        "arcade"
      ],
      "weights": {
        "genre": 16,
        "history": 7,
        "crowd": 3,
        "badge": 5,
        "room": 6,
        "novelty": 2
      },
      "maxItems": 4,
      "gameIds": []
    },
    {
      "id": "rail-competitive-push",
      "title": "Competitive live floor",
      "subtitle": "High-pressure picks for rivals, sports runs, fighters, and tactical shooters.",
      "audience": {
        "minPlays": 0,
        "rooms": [
          "versus-night",
          "sports",
          "fighting-pit",
          "shooting-range"
        ]
      },
      "roomIds": [
        "versus-night",
        "sports",
        "fighting-pit",
        "shooting-range"
      ],
      "weights": {
        "genre": 6,
        "history": 8,
        "crowd": 8,
        "badge": 10,
        "room": 10,
        "novelty": 2
      },
      "maxItems": 4,
      "gameIds": [
        "tekken-5-elite",
        "burnout-3-elite",
        "def-jam-ffny-elite",
        "tekken-tag-elite"
      ]
    },
    {
      "id": "rail-rpg-depths",
      "title": "RPG deep runs",
      "subtitle": "Campaign-heavy picks with boss routing, loot growth, and session depth.",
      "roomIds": [
        "rpg-vault"
      ],
      "gameIds": [
        "zelda-oot-elite",
        "final-fantasy-vii-elite",
        "pokemon-yellow-elite",
        "final-fantasy-nes",
        "ffx-elite"
      ],
      "audience": {
        "rooms": [
          "rpg-vault"
        ],
        "minPlays": 0,
        "maxPlays": 999
      },
      "weights": {
        "genre": 12,
        "history": 10,
        "crowd": 4,
        "badge": 5,
        "room": 9,
        "novelty": 3
      },
      "maxItems": 4
    },
    {
      "id": "rail-squad-link",
      "title": "Squad link-up",
      "subtitle": "Online co-op cabinets tuned for party chat, raids, and synced objectives.",
      "roomIds": [
        "co-op-link"
      ],
      "gameIds": [
        "gta-elite-wasm",
        "mortal-kombat-2-elite",
        "sfii-world-warrior",
        "tekken-3-elite",
        "tmnt-turtles-in-time-elite",
        "gta-san-andreas-elite",
        "tekken-5-elite",
        "gta-vice-city-elite",
        "tekken-tag-elite"
      ],
      "audience": {
        "rooms": [
          "co-op-link"
        ],
        "minPlays": 0,
        "maxPlays": 999
      },
      "weights": {
        "genre": 4,
        "history": 8,
        "crowd": 9,
        "badge": 6,
        "room": 10,
        "novelty": 3
      },
      "maxItems": 4
    },
    {
      "id": "rail-open-world-empires",
      "title": "Open World Empires",
      "subtitle": "Absolute freedom. Dominate the streets across every era.",
      "roomIds": [
        "arcade",
        "action-zone"
      ],
      "gameIds": [
        "elden-ring-cloud",
        "cyberpunk-2077-cloud",
        "gta-iii-elite",
        "gta-vice-city-elite",
        "gta-san-andreas-elite",
        "spider-man-2-elite",
        "true-crime-la-elite",
        "need-for-speed-underground-2-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 15,
        "room": 10
      },
      "maxItems": 5
    },
    {
      "id": "rail-first-person-execution",
      "title": "First Person Execution",
      "subtitle": "Precision gunplay. Absolute tactical dominance.",
      "roomIds": [
        "shooting-range"
      ],
      "gameIds": [
        "halo-3-cloud-elite",
        "venge-io-webgl",
        "half-life-ps2-elite",
        "quake-3-dc-elite",
        "unreal-tournament-dc-elite",
        "krunker-io-web-elite",
        "ev-io-web-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 18,
        "room": 10
      },
      "maxItems": 5
    },
    {
      "id": "rail-sports-dominance",
      "title": "Sports Dominance",
      "subtitle": "Win at any cost. The Absolute competitive edge.",
      "roomIds": [
        "sports"
      ],
      "gameIds": [
        "madden-2004-elite",
        "nba-street-v2-elite",
        "ssx-tricky-elite",
        "fifa-2005-elite",
        "thps2-ps1-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 15,
        "room": 12
      },
      "maxItems": 5
    },
    {
      "id": "rail-classic-arcade-gauntlet",
      "title": "Classic Arcade Gauntlet",
      "subtitle": "Respect the roots. Absolute high-score pursuits.",
      "roomIds": [
        "arcade"
      ],
      "gameIds": [
        "donkey-kong-arcade",
        "dig-dug-arcade",
        "frogger-arcade",
        "pac-man-elite",
        "asteroids-arcade"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "badge": 15,
        "history": 5
      },
      "maxItems": 5
    },
    {
      "id": "rail-decision-depths",
      "title": "Decision-Based Depths",
      "subtitle": "Your choices shape the Absolute future. Choose wisely.",
      "roomIds": [
        "rpg-vault"
      ],
      "gameIds": [
        "fallout-dos",
        "fallout-2-dos",
        "chrono-trigger-snes-elite",
        "smt-nocturne-ps2-elite",
        "deus-ex-ps2-conspiracy-elite"
      ],
      "audience": {
        "minPlays": 0
      },
      "weights": {
        "genre": 20,
        "room": 10
      },
      "maxItems": 5
    }
  ]
};
