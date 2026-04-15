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
      "featuredGameId": "1",
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
      "featuredGameId": "2",
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
      "featuredGameId": "6",
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
      "featuredGameId": "38",
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
      "featuredGameId": "44",
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
  "recommendationRails": [
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
      "maxItems": 4
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
      "maxItems": 4
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
      "maxItems": 4
    },
    {
      "id": "rail-rpg-depths",
      "title": "RPG deep runs",
      "subtitle": "Campaign-heavy picks with boss routing, loot growth, and session depth.",
      "roomIds": [
        "rpg-vault"
      ],
      "gameIds": [
        "24",
        "27",
        "32",
        "34",
        "43",
        "44",
        "45"
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
        "2",
        "25",
        "28",
        "31",
        "36",
        "39",
        "42",
        "43",
        "44"
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
    }
  ],
  "games": [
    {
      "id": "1",
      "name": "Tha Battlefield",
      "url": "/assets/games/battlefield/battlefield.html",
      "description": "Executive rap battle arena with live bracket energy and hybrid queue support.",
      "genre": "Music Battle",
      "rating": 4.9,
      "playersOnline": 1250,
      "availability": "Hybrid",
      "tags": [
        "Multiplayer",
        "Original",
        "PvP",
        "Combat"
      ],
      "multiplayerType": "Server",
      "aiSupportLevel": "Advanced",
      "aiBriefing": "Establish dominance in the rap battle arena. Neural sync is tuned for rhythm precision.",
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
      "badgeIds": [
        "featured",
        "tournament-live"
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
        "telemetryMode": "frame-only"
      },
      "art": {
        "eyebrow": "Hybrid",
        "accentStart": "#10b981",
        "accentEnd": "#0f766e"
      }
    },
    {
      "id": "2",
      "name": "Remix Arena",
      "url": "/assets/games/remix-arena/remixarena.html",
      "description": "Collaborative sequencing challenge where crews race to flip stems in real time.",
      "genre": "Rhythm",
      "rating": 4.7,
      "playersOnline": 850,
      "availability": "Hybrid",
      "tags": [
        "Multiplayer",
        "Original",
        "Co-op",
        "Rhythm"
      ],
      "multiplayerType": "Server",
      "aiSupportLevel": "Neural",
      "aiBriefing": "Collaborative remix engine is live. S.M.U.V.E. is balancing the sonic stems.",
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
      "badgeIds": [
        "staff-pick"
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
        "telemetryMode": "frame-only"
      },
      "art": {
        "eyebrow": "Hybrid",
        "accentStart": "#22c55e",
        "accentEnd": "#14b8a6"
      }
    },
    {
      "id": "3",
      "name": "Neon Drift X",
      "url": "/assets/games/neon-drift/neon-drift.html",
      "description": "Precision lane swaps through a neon expressway tuned for instant offline retries.",
      "genre": "Racing",
      "rating": 4.8,
      "playersOnline": 420,
      "availability": "Offline",
      "tags": [
        "Arcade",
        "Offline",
        "Reflex"
      ],
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
      "badgeIds": [
        "featured"
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
        "telemetryMode": "frame-only"
      },
      "art": {
        "eyebrow": "Offline",
        "accentStart": "#38bdf8",
        "accentEnd": "#6366f1"
      }
    },
    {
      "id": "4",
      "name": "Vinyl Vault",
      "url": "/assets/games/vinyl-vault/vinyl-vault.html",
      "description": "Crate-digging memory board with quick restarts and staff-curated puzzle loops.",
      "genre": "Puzzle",
      "rating": 4.7,
      "playersOnline": 260,
      "availability": "Offline",
      "tags": [
        "Puzzle",
        "Offline",
        "Memory"
      ],
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
      "badgeIds": [
        "staff-pick"
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
        "telemetryMode": "frame-only"
      },
      "art": {
        "eyebrow": "Offline",
        "accentStart": "#f59e0b",
        "accentEnd": "#f97316"
      }
    },
    {
      "id": "5",
      "name": "Tempo Lockdown",
      "url": "/assets/games/tempo-lockdown/tempo-lockdown.html",
      "description": "Responsive rhythm lane built for short focus sprints between sessions.",
      "genre": "Rhythm",
      "rating": 4.8,
      "playersOnline": 390,
      "availability": "Offline",
      "tags": [
        "Rhythm",
        "Arcade",
        "Original"
      ],
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
      "badgeIds": [
        "new-drop"
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
        "telemetryMode": "frame-only"
      },
      "art": {
        "eyebrow": "Offline",
        "accentStart": "#34d399",
        "accentEnd": "#059669"
      }
    },
    {
      "id": "6",
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
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
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
        ]
      },
      "art": {
        "eyebrow": "Online",
        "accentStart": "#06b6d4",
        "accentEnd": "#2563eb"
      }
    },
    {
      "id": "7",
      "name": "2048 Championship",
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
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
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
      }
    },
    {
      "id": "8",
      "name": "Beat Runner",
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
      "previewVideo": "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-dj-playing-at-a-club-24545-large.mp4",
      "bannerImage": "https://images.unsplash.com/photo-1514525253361-bee243870eb2?auto=format&fit=crop&w=1200&q=80",
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
        "approvedExternalUrl": "https://htmlgames.com/game/Beat+Runner",
        "approvedEmbedUrl": "https://www.gamepix.com/play/music-rush",
        "telemetryMode": "origin",
        "telemetryOrigins": [
          "https://www.gamepix.com"
        ]
      },
      "art": {
        "eyebrow": "Online",
        "accentStart": "#ec4899",
        "accentEnd": "#db2777"
      }
    }
  ]
};
