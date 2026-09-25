import { Injectable } from '@angular/core';

/**
 * S.M.U.V.E. TV — the in-app linear broadcast network.
 *
 * This replaces the former Pluto TV handoff. Pluto's consumer player refuses to
 * run inside a frame (its analytics step throws, leaving "Optimizing your video
 * playback experience" on screen forever), and no iframe permission, channel
 * slug, or sandbox token changes that. S.M.U.V.E. TV therefore renders its own
 * stations natively — canvas scenes on a Web Audio bed — so every channel is
 * guaranteed to play on Android Chrome and desktop Chrome alike.
 *
 * The schedule is *linear*, exactly like broadcast television: it is derived
 * purely from the wall clock, so two viewers looking at the same station at the
 * same minute see the same programme at the same point. That also makes it
 * fully testable — `scheduleFor(channel, at)` is a pure function of `at`.
 */

export type SmuveTvCategoryId =
  | 'all'
  | 'live'
  | 'news'
  | 'music'
  | 'studio'
  | 'docs'
  | 'sports'
  | 'gaming'
  | 'cinema'
  | 'series'
  | 'vault'
  | 'movies'
  | 'comedy'
  | 'crime'
  | 'cartoons'
  | 'black-cinema'
  | 'entertainment'
  | 'vintage';

/** The native visual bed a station renders. No network, no codec, no embed. */
export type SmuveTvScene =
  | 'spectrum'
  | 'vinyl'
  | 'skyline'
  | 'orbit'
  | 'neon-grid'
  | 'reel'
  | 'pulse'
  | 'storm';

export type SmuveTvProgramKind =
  | 'live'
  | 'feature'
  | 'episode'
  | 'mix'
  | 'match'
  | 'news'
  | 'documentary';

export interface SmuveTvCategory {
  id: SmuveTvCategoryId;
  label: string;
  icon: string;
}

export interface SmuveTvProgram {
  id: string;
  title: string;
  subtitle: string;
  durationMin: number;
  kind: SmuveTvProgramKind;
}

export interface SmuveTvChannel {
  id: string;
  /** Tuned like a real set-top box: "GO TO CHANNEL 107". */
  number: number;
  name: string;
  callSign: string;
  tagline: string;
  category: Exclude<SmuveTvCategoryId, 'all'>;
  /** Hex accent that drives the scene, the bug, and the rail highlight. */
  accent: string;
  scene: SmuveTvScene;
  /** Material Symbols glyph for the rail. */
  icon: string;
  /** One full rotation of the station's schedule, in minutes. */
  shows: SmuveTvProgram[];
}

export interface SmuveTvSlot {
  program: SmuveTvProgram;
  startsAt: number;
  endsAt: number;
  /** 0–1 across the slot; 0 for anything that has not started yet. */
  progress: number;
  /** True only for the slot actually on air right now. */
  onAir: boolean;
}

/**
 * The artist's own station.
 *
 * Smuve Jeff Radio is the one station in the line-up that is not a canvas bed
 * with a schedule: it broadcasts the artist's own catalogue, in full, around
 * the clock. It is a normal entry in the guide on purpose — the guide *is* the
 * module's navigation — so this id is how the component recognises the station
 * and hands it the audio transport instead of the station bed.
 */
export const SMUVE_JEFF_RADIO_CHANNEL_ID = 'smuve-jeff-radio';

export const SMUVE_TV_CATEGORIES: readonly SmuveTvCategory[] = [
  { id: 'all', label: 'ALL STATIONS', icon: 'tv' },
  { id: 'live', label: 'LIVE NOW', icon: 'sensors' },
  { id: 'news', label: 'NEWS', icon: 'newspaper' },
  { id: 'music', label: 'MUSIC', icon: 'graphic_eq' },
  { id: 'studio', label: 'STUDIO', icon: 'piano' },
  { id: 'docs', label: 'DOCS', icon: 'travel_explore' },
  { id: 'sports', label: 'SPORTS', icon: 'sports_soccer' },
  { id: 'gaming', label: 'GAMING', icon: 'sports_esports' },
  { id: 'cinema', label: 'CINEMA', icon: 'movie' },
  { id: 'series', label: 'SERIES', icon: 'theaters' },
  { id: 'vault', label: 'VAULT', icon: 'inventory_2' },
  { id: 'movies', label: 'MOVIES', icon: 'movie' },
  { id: 'comedy', label: 'COMEDY', icon: 'sentiment_satisfied' },
  { id: 'entertainment', label: 'ENTERTAINMENT', icon: 'celebration' },
  { id: 'crime', label: 'CRIME', icon: 'search' },
  { id: 'cartoons', label: 'CARTOONS', icon: 'child_care' },
  { id: 'black-cinema', label: 'BLACK CINEMA', icon: 'palette' },
  { id: 'vintage', label: 'VINTAGE', icon: 'history' },
];

function show(
  id: string,
  title: string,
  subtitle: string,
  durationMin: number,
  kind: SmuveTvProgramKind
): SmuveTvProgram {
  return { id, title, subtitle, durationMin, kind };
}

/**
 * The station line-up. Channel numbers run 101+ so the on-screen guide reads
 * like a cable box, and every station carries a full rotation of programming.
 */
export const SMUVE_TV_CHANNELS: readonly SmuveTvChannel[] = [
  {
    id: 'smuve-one',
    number: 101,
    name: 'S.M.U.V.E ONE',
    callSign: 'S1',
    tagline: 'The flagship feed. Never off air.',
    category: 'live',
    accent: '#2BA09C',
    scene: 'spectrum',
    icon: 'live_tv',
    shows: [
      show('one-1', 'NEURAL UPLINK LIVE', 'Continuous signal from the core engine', 120, 'live'),
      show('one-2', 'THE DAILY MIX', 'Top selections from the vault, resequenced', 60, 'mix'),
      show('one-3', 'S.M.U.V.E TRANSMISSION', 'Direct address from the Musical GOD', 45, 'news'),
      show('one-4', 'AFTERGLOW', 'Slow-burn closers for the small hours', 90, 'mix'),
    ],
  },
  {
    id: 'producers-desk',
    number: 102,
    name: "PRODUCER'S DESK",
    callSign: 'PD',
    tagline: 'Arrangement, dynamics, and ruthless edits.',
    category: 'studio',
    accent: '#D97706',
    scene: 'pulse',
    icon: 'tune',
    shows: [
      show('pd-1', 'ARRANGEMENT CLINIC', 'Eight bars in, a finished record out', 60, 'documentary'),
      show('pd-2', 'GAIN STAGING 101', 'Where your headroom actually goes', 30, 'documentary'),
      show('pd-3', 'CRITIQUE THE CRITICS', 'S.M.U.V.E. reviews the reviewers', 45, 'news'),
      show('pd-4', 'BUS ROUTING DEEP DIVE', 'Sidechain, send, and destroy', 60, 'documentary'),
    ],
  },
  {
    id: 'neural-uplink',
    number: 103,
    name: 'NEURAL UPLINK',
    callSign: 'NU',
    tagline: 'Model telemetry, rendered as television.',
    category: 'studio',
    accent: '#7C3AED',
    scene: 'orbit',
    icon: 'neurology',
    shows: [
      show('nu-1', 'LATENT SPACE TOUR', 'Inside the embedding, live', 60, 'documentary'),
      show('nu-2', 'TOKEN BY TOKEN', 'Generation, unfiltered', 45, 'live'),
      show('nu-3', 'THE FINETUNE HOUR', 'Bend the model to your will', 60, 'documentary'),
      show('nu-4', 'HALLUCINATION WATCH', 'When the machine lies beautifully', 30, 'news'),
    ],
  },
  {
    id: 'sample-vault',
    number: 105,
    name: 'SAMPLE VAULT',
    callSign: 'SV',
    tagline: 'Breakbeats, stabs, and one-shots on loop.',
    category: 'vault',
    accent: '#0EA5E9',
    scene: 'reel',
    icon: 'graphic_eq',
    shows: [
      show('sv-1', 'BREAK LIBRARY', 'Amen, Think, and everything after', 60, 'mix'),
      show('sv-2', 'ONE-SHOT THEATRE', 'Kicks, snares, and the perfect rimshot', 30, 'mix'),
      show('sv-3', 'CHOP SHOP', 'Flipping in real time', 45, 'documentary'),
      show('sv-4', 'CLEARANCE DESK', 'What you can and cannot lift', 30, 'documentary'),
    ],
  },
  {
    id: 'beat-battle-arena',
    number: 106,
    name: 'BEAT BATTLE ARENA',
    callSign: 'BA',
    tagline: 'Two producers enter. One loop leaves.',
    category: 'gaming',
    accent: '#EC4899',
    scene: 'neon-grid',
    icon: 'sports_kabaddi',
    shows: [
      show('ba-1', 'ROUND ONE', 'Sixteen bars, no mercy', 45, 'match'),
      show('ba-2', 'THE RIVAL BOARD', 'Challenger ranking and callouts', 30, 'news'),
      show('ba-3', 'SUDDEN DEATH', 'Flip the sample in ten minutes', 60, 'match'),
      show('ba-4', 'CROWNING THE CHAMPION', 'The deciding round, uncut', 60, 'match'),
    ],
  },
  {
    id: 'arcade-after-dark',
    number: 107,
    name: 'ARCADE AFTER DARK',
    callSign: 'AD',
    tagline: 'Attract mode till sunrise.',
    category: 'gaming',
    accent: '#22D3EE',
    scene: 'neon-grid',
    icon: 'sports_esports',
    shows: [
      show('ad-1', 'CABINET ROTATION', 'High-score runs, back to back', 90, 'match'),
      show('ad-2', 'ONE-CREDIT CLEAR', 'No continues allowed', 60, 'match'),
      show('ad-3', 'SPEEDRUN SLOT', 'Frame-perfect, all game', 45, 'match'),
      show('ad-4', 'GAME OVER SCREENS', 'A history of the taunt', 30, 'documentary'),
    ],
  },
  {
    id: 'tha-spot-live',
    number: 108,
    name: 'THA SPOT LIVE',
    callSign: 'TS',
    tagline: 'Straight from the floor.',
    category: 'live',
    accent: '#10B981',
    scene: 'spectrum',
    icon: 'sensors',
    shows: [
      show('ts-1', 'FLOOR FEED', 'Whatever cabinet is loudest right now', 120, 'live'),
      show('ts-2', 'CHALLENGE WINDOW', 'Open callouts, live resolution', 60, 'live'),
      show('ts-3', 'LOBBY CAM', 'Co-op runs and squad chatter', 45, 'live'),
      show('ts-4', 'NIGHT SHIFT', 'The floor after everyone leaves', 90, 'live'),
    ],
  },
  {
    id: 'cinema-engine-one',
    number: 109,
    name: 'CINEMA ENGINE ONE',
    callSign: 'CE',
    tagline: 'Premieres, uncut and unskippable.',
    category: 'cinema',
    accent: '#F97316',
    scene: 'skyline',
    icon: 'movie',
    shows: [
      show('ce-1', 'PREMIERE: THE LOOP WARS', 'Two producers, one stolen break', 120, 'feature'),
      show('ce-2', 'SHORT: STATIC BLOOM', 'Six minutes of pure texture', 30, 'feature'),
      show('ce-3', 'DOC: TWENTY YEARS OF BASS', 'The low end, examined', 90, 'documentary'),
      show('ce-4', 'DOUBLE FEATURE', 'Back-to-back, no intermission', 120, 'feature'),
    ],
  },
  {
    id: 'noir-channel',
    number: 110,
    name: 'NOIR CHANNEL',
    callSign: 'NC',
    tagline: 'Rain, neon, and a bad decision.',
    category: 'cinema',
    accent: '#64748B',
    scene: 'storm',
    icon: 'videocam',
    shows: [
      show('nc-1', 'FEATURE: THE LAST MASTER', 'A studio, a deadline, a betrayal', 120, 'feature'),
      show('nc-2', 'SHORT: CLIP-ON', 'The fade that ended a career', 30, 'feature'),
      show('nc-3', 'FEATURE: DIRTY SIGNAL', 'Nobody leaves the booth clean', 120, 'feature'),
      show('nc-4', 'THE VAULT INTERVIEW', 'Confessions from the booth', 60, 'documentary'),
    ],
  },
  {
    id: 'deep-focus',
    number: 111,
    name: 'DEEP FOCUS',
    callSign: 'DF',
    tagline: 'No lyrics. No vocals. No mercy.',
    category: 'studio',
    accent: '#3B82F6',
    scene: 'pulse',
    icon: 'headphones',
    shows: [
      show('df-1', 'WRITING BLOCK', 'Ninety minutes, no interruptions', 90, 'mix'),
      show('df-2', 'READING BLOCK', 'Ambient bed, zero percussion', 60, 'mix'),
      show('df-3', 'MASTERING BLOCK', 'Critical listening at low volume', 90, 'mix'),
      show('df-4', 'SLEEP BLOCK', 'Slow pads for the reset', 120, 'mix'),
    ],
  },
  {
    id: 'smuve-classics',
    number: 112,
    name: 'S.M.U.V.E CLASSICS',
    callSign: 'SC',
    tagline: 'Restored, remastered, respected.',
    category: 'vault',
    accent: '#A16207',
    scene: 'vinyl',
    icon: 'history_edu',
    shows: [
      show('sc-1', 'THE GOLDEN ROTATION', 'Deep-era catalogue, restored', 90, 'mix'),
      show('sc-2', 'LOST TAPES', 'Sessions that never shipped', 60, 'documentary'),
      show('sc-3', 'REMASTER HOUR', 'Before and after, A/B on air', 60, 'documentary'),
      show('sc-4', 'REQUEST LINE', 'The catalogue, by demand', 90, 'live'),
    ],
  },
  {
    id: 'mastering-suite',
    number: 113,
    name: 'THE MASTERING SUITE',
    callSign: 'MS',
    tagline: 'Watching meters so you do not have to.',
    category: 'studio',
    accent: '#14B8A6',
    scene: 'spectrum',
    icon: 'equalizer',
    shows: [
      show('ms-1', 'LOUDNESS WARS', 'Why your master is quieter', 60, 'documentary'),
      show('ms-2', 'METER WATCH', 'Real-time level telemetry', 120, 'live'),
      show('ms-3', 'LIMITER LAB', 'Squash it, then justify it', 45, 'documentary'),
      show('ms-4', 'REFERENCE DESK', 'Commercials, compared honestly', 60, 'documentary'),
    ],
  },
  {
    id: 'live-stage-88',
    number: 117,
    name: 'LIVE STAGE 88',
    callSign: 'LS',
    tagline: 'Front row, house lights down.',
    category: 'live',
    accent: '#EF4444',
    scene: 'spectrum',
    icon: 'mic',
    shows: [
      show('ls-1', 'TONIGHT LIVE', 'A full set, start to finish', 90, 'live'),
      show('ls-2', 'SOUNDCHECK', 'The unglamorous hour', 45, 'live'),
      show('ls-3', 'ENCORE CLUB', 'The song they always come back for', 60, 'live'),
      show('ls-4', 'LOAD-OUT', 'Trucks, cables, and reflection', 30, 'documentary'),
    ],
  },
  {
    id: 'news-desk',
    number: 118,
    name: 'S.M.U.V.E NEWS DESK',
    callSign: 'ND',
    tagline: 'The industry, as it happens.',
    category: 'live',
    accent: '#0891B2',
    scene: 'orbit',
    icon: 'newspaper',
    shows: [
      show('nd-1', 'THE HOUR', 'Headlines from the industry floor', 60, 'news'),
      show('nd-2', 'CHART WATCH', 'Movements, debuts, and drops', 30, 'news'),
      show('nd-3', 'LITIGATION REPORT', 'Sampling lawsuits, explained', 45, 'news'),
      show('nd-4', 'THE LONG READ', 'One story, told properly', 60, 'documentary'),
    ],
  },
  {
    id: 'story-mode',
    number: 119,
    name: 'STORY MODE',
    callSign: 'SM',
    tagline: 'Episodic deep dives, in season order.',
    category: 'series',
    accent: '#6366F1',
    scene: 'reel',
    icon: 'theaters',
    shows: [
      show('sm-1', 'S1E1: THE FIRST LOOP', 'A bedroom, a drum machine, a plan', 45, 'episode'),
      show('sm-2', 'S1E2: SIGNAL CHAIN', 'Every cable that shaped the sound', 45, 'episode'),
      show('sm-3', 'S1E3: THE RIVAL', 'Somebody else wants the same break', 45, 'episode'),
      show('sm-4', 'S2E1: REBUILT FROM TAPE', 'Starting again with what survived', 60, 'episode'),
    ],
  },
  {
    id: 'the-making-of',
    number: 120,
    name: 'THE MAKING OF',
    callSign: 'MO',
    tagline: 'How the records were actually made.',
    category: 'series',
    accent: '#0D9488',
    scene: 'orbit',
    icon: 'movie_filter',
    shows: [
      show('mo-1', 'S1E1: TAKE ONE', 'The session that became the single', 60, 'episode'),
      show('mo-2', 'S1E2: THE OVERDUB', 'Adding what nobody asked for', 45, 'episode'),
      show('mo-3', 'S1E3: MIXDOWN', 'Twenty versions, one released', 60, 'episode'),
      show('mo-4', 'S1E4: MASTERED', 'The last pass before the world hears it', 45, 'episode'),
    ],
  },

  // ── Sports ─────────────────────────────────────────────
  {
    id: 'smuve-sports',
    number: 121,
    name: 'S.M.U.V.E SPORTS',
    callSign: 'SP',
    tagline: 'Every score, every angle, live.',
    category: 'sports',
    accent: '#F59E0B',
    scene: 'neon-grid',
    icon: 'sports_soccer',
    shows: [
      show('sp-1', 'MATCHDAY LIVE', 'Two sides, ninety minutes, no breaks', 120, 'live'),
      show('sp-2', 'THE HIGHLIGHT REEL', 'Everything that mattered, compressed', 30, 'news'),
      show('sp-3', 'TACTICS BOARD', 'Why the shape beat the talent', 45, 'documentary'),
      show('sp-4', 'PRESS CONFERENCE', 'Managers, microphones, consequences', 60, 'live'),
    ],
  },
  {
    id: 'game-day-feed',
    number: 122,
    name: 'GAME DAY FEED',
    callSign: 'GD',
    tagline: 'College hardwood and gridiron, all day.',
    category: 'sports',
    accent: '#22C55E',
    scene: 'pulse',
    icon: 'sports_basketball',
    shows: [
      show('gd-1', 'TIP-OFF', 'From the opening whistle', 120, 'live'),
      show('gd-2', 'SIDELINE FEED', 'The call, the crowd, the chaos', 60, 'live'),
      show('gd-3', 'BRACKETOLOGY', 'Who is in, who is out, and why', 45, 'news'),
      show('gd-4', 'FILM ROOM', 'Three plays that decided it', 45, 'documentary'),
    ],
  },
  {
    id: 'endurance-tv',
    number: 123,
    name: 'ENDURANCE TV',
    callSign: 'EN',
    tagline: 'Ramps, mountains, and relentless athletes.',
    category: 'sports',
    accent: '#0EA5E9',
    scene: 'storm',
    icon: 'sports_motorsports',
    shows: [
      show('en-1', 'LIVE COMP: BIG AIR', 'Judges, wind, and a long way down', 90, 'live'),
      show('en-2', 'THE LINE', 'Choosing a route nobody has ridden', 60, 'documentary'),
      show('en-3', 'FULL SEND', 'Crashes, recoveries, and repair bills', 45, 'match'),
      show('en-4', 'REST DAY', 'Recovery, physio, and preparation', 45, 'documentary'),
    ],
  },
  {
    id: 'track-day',
    number: 124,
    name: 'TRACK DAY',
    callSign: 'TR',
    tagline: 'Dirt, asphalt, and no lift-off.',
    category: 'sports',
    accent: '#EF4444',
    scene: 'neon-grid',
    icon: 'sports_score',
    shows: [
      show('tr-1', 'GREEN FLAG', 'Feature race, lights out to chequered', 90, 'live'),
      show('tr-2', 'HEAT RACES', 'Short, brutal, and consequential', 60, 'match'),
      show('tr-3', 'PIT WALL RADIO', 'Strategy, decoded as it happens', 45, 'live'),
      show('tr-4', 'TECH INSPECTION', 'The rules, enforced to the millimetre', 30, 'documentary'),
    ],
  },

  // ── News ───────────────────────────────────────────────
  {
    id: 'world-news-now',
    number: 125,
    name: 'WORLD NEWS NOW',
    callSign: 'WNW',
    tagline: 'The world, every hour.',
    category: 'news',
    accent: '#0284C7',
    scene: 'orbit',
    icon: 'public',
    shows: [
      show('wnw-1', 'THE HOUR', 'Headlines on the hour, every hour', 60, 'news'),
      show('wnw-2', 'WORLD REPORT', 'Correspondents, in their own regions', 45, 'news'),
      show('wnw-3', 'THE BRIEFING', 'One story, examined properly', 30, 'documentary'),
      show('wnw-4', 'OVERSEAS', 'What the rest of the world is watching', 45, 'documentary'),
    ],
  },
  {
    id: 'asia-news-desk',
    number: 126,
    name: 'ASIA NEWS DESK',
    callSign: 'ASN',
    tagline: 'Singapore to Seoul, live.',
    category: 'news',
    accent: '#0891B2',
    scene: 'skyline',
    icon: 'newspaper',
    shows: [
      show('asn-1', 'ASIA TONIGHT', 'The region, as the day closes', 60, 'news'),
      show('asn-2', 'BUSINESS DESK', 'Markets, trade, and the money moving', 30, 'news'),
      show('asn-3', 'CROSSROADS', 'Politics across a dozen capitals', 45, 'documentary'),
      show('asn-4', 'TYPHOON WATCH', 'Weather that redraws coastlines', 30, 'news'),
    ],
  },
  {
    id: 'seoul-feed',
    number: 127,
    name: 'SEOUL FEED',
    callSign: 'SEL',
    tagline: 'Korea, in its own words.',
    category: 'news',
    accent: '#6366F1',
    scene: 'orbit',
    icon: 'newspaper',
    shows: [
      show('sel-1', 'KOREA NOW', 'The peninsula, reported from the peninsula', 60, 'news'),
      show('sel-2', 'CULTURE WIRE', 'Music, film, and the export machine', 45, 'documentary'),
      show('sel-3', 'THE INTERVIEW', 'One conversation, unedited', 45, 'news'),
      show('sel-4', 'NIGHT DESK', 'The late shift, and the day ahead', 60, 'news'),
    ],
  },
  {
    id: 'wall-street-desk',
    number: 128,
    name: 'WALL STREET DESK',
    callSign: 'WSD',
    tagline: 'Open to close, from the floor.',
    category: 'news',
    accent: '#16A34A',
    scene: 'reel',
    icon: 'trending_up',
    shows: [
      show('wsd-1', 'OPENING BELL', 'The first ten minutes, explained', 60, 'live'),
      show('wsd-2', 'THE TAPE', 'What moved, and what it means', 30, 'news'),
      show('wsd-3', 'EARNINGS DESK', 'Numbers, guidance, and the fine print', 45, 'news'),
      show('wsd-4', 'CLOSING BELL', 'The final print, and the overnight', 60, 'live'),
    ],
  },
  {
    id: 'europe-markets',
    number: 129,
    name: 'EUROPE MARKETS',
    callSign: 'EUM',
    tagline: 'Frankfurt to London, at the bell.',
    category: 'news',
    accent: '#0D9488',
    scene: 'reel',
    icon: 'trending_up',
    shows: [
      show('eum-1', 'EUROPE OPENS', 'Bourses live, from the opening auction', 60, 'live'),
      show('eum-2', 'THE CONTINENT', 'Policy, energy, and industry', 45, 'news'),
      show('eum-3', 'CURRENCY DESK', 'Rates, flows, and the euro', 30, 'news'),
      show('eum-4', 'AFTER THE BELL', 'Analysis once the screens go dark', 60, 'documentary'),
    ],
  },
  {
    id: 'asia-markets',
    number: 130,
    name: 'ASIA MARKETS',
    callSign: 'ASM',
    tagline: 'The first opening bell of the day.',
    category: 'news',
    accent: '#14B8A6',
    scene: 'reel',
    icon: 'trending_up',
    shows: [
      show('asm-1', 'ASIA AM', 'Tokyo first, then everywhere else', 60, 'live'),
      show('asm-2', 'THE SUPPLY CHAIN', 'Where things are made, and why', 45, 'documentary'),
      show('asm-3', 'CHIP WATCH', 'Silicon, fabs, and export controls', 30, 'news'),
      show('asm-4', 'ASIA CLOSE', 'The session, wrapped', 60, 'live'),
    ],
  },
  {
    id: 'the-german-desk',
    number: 131,
    name: 'THE GERMAN DESK',
    callSign: 'GE',
    tagline: 'Germany, as it airs.',
    category: 'news',
    accent: '#475569',
    scene: 'skyline',
    icon: 'newspaper',
    shows: [
      show('ge-1', 'TAGESSCHAU', 'The evening bulletin, as broadcast', 30, 'news'),
      show('ge-2', 'TALK DER WOCHE', 'The week, argued properly', 60, 'news'),
      show('ge-3', 'WIRTSCHAFT', 'Industry and labour, day to day', 45, 'documentary'),
      show('ge-4', 'NACHTMAGAZIN', 'The late magazine, and the morning after', 45, 'documentary'),
    ],
  },
  {
    id: 'global-desk',
    number: 132,
    name: 'GLOBAL DESK',
    callSign: 'GL',
    tagline: 'Arabic-language headlines, continuously.',
    category: 'news',
    accent: '#B45309',
    scene: 'orbit',
    icon: 'public',
    shows: [
      show('gl-1', 'THE HOUR', 'Regional headlines, on the hour', 60, 'news'),
      show('gl-2', 'WORLD IN FOCUS', 'Reported from the field', 45, 'documentary'),
      show('gl-3', 'SCIENCE & TECH', 'Research, translated', 30, 'documentary'),
      show('gl-4', 'NIGHT REPORT', 'The day summarised, unaired elsewhere', 45, 'news'),
    ],
  },
  {
    id: 'the-arabic-desk',
    number: 133,
    name: 'THE ARABIC DESK',
    callSign: 'ARB',
    tagline: 'The region, reported round the clock.',
    category: 'news',
    accent: '#DC2626',
    scene: 'orbit',
    icon: 'public',
    shows: [
      show('arb-1', 'THE NEWS HOUR', 'Continuous coverage, no filler', 60, 'news'),
      show('arb-2', 'THE ECONOMY', 'Markets and policy across the Gulf', 30, 'news'),
      show('arb-3', 'PEOPLE AND PLACES', 'Long-form reporting', 45, 'documentary'),
      show('arb-4', 'THE DEBATE', 'Two positions, one hour', 60, 'news'),
    ],
  },
  {
    id: 'south-asia-live',
    number: 134,
    name: 'SOUTH ASIA LIVE',
    callSign: 'SAL',
    tagline: 'Mumbai to Delhi, live.',
    category: 'news',
    accent: '#C2410C',
    scene: 'skyline',
    icon: 'newspaper',
    shows: [
      show('sal-1', 'THE BIG STORY', 'The sentence leading every bulletin', 60, 'news'),
      show('sal-2', 'MARKET WATCH', 'Sensex, rupee, and the monsoons', 30, 'news'),
      show('sal-3', 'THE SPECIAL', 'One investigation, in full', 45, 'documentary'),
      show('sal-4', 'INDIA THIS WEEK', 'Seven days, in order', 60, 'news'),
    ],
  },
  {
    id: 'cbs-news-feed',
    number: 135,
    name: 'CBS NEWS FEED',
    callSign: 'CBF',
    tagline: 'Rolling coverage, never off air.',
    category: 'news',
    accent: '#1D4ED8',
    scene: 'skyline',
    icon: 'newspaper',
    shows: [
      show('cbf-1', 'ROLLING COVERAGE', 'Breaking news, as it develops', 120, 'live'),
      show('cbf-2', 'AMERICA DECIDES', 'Elections, polled and unpacked', 60, 'news'),
      show('cbf-3', 'THE MONEYWATCH', 'Consumer prices and the market', 30, 'news'),
      show('cbf-4', 'THE INVESTIGATION', 'Documents, sources, and results', 60, 'documentary'),
    ],
  },
  {
    id: 'the-weather-desk',
    number: 136,
    name: 'THE WEATHER DESK',
    callSign: 'SW',
    tagline: 'Forecasts, storms, and the numbers behind them.',
    category: 'news',
    accent: '#38BDF8',
    scene: 'storm',
    icon: 'cloud',
    shows: [
      show('sw-1', 'LOCAL FORECAST', 'The next six hours, minute by minute', 30, 'live'),
      show('sw-2', 'SEVERE WATCH', 'Where the warnings are, and why', 60, 'live'),
      show('sw-3', 'THE CLIMATE DESK', 'Longer trends, plainly stated', 45, 'documentary'),
      show('sw-4', 'ALLERGY AND AIR', 'Pollen, air quality, and the breeze', 30, 'news'),
    ],
  },

  // ── Documentary ────────────────────────────────────────
  {
    id: 'history-vault',
    number: 137,
    name: 'HISTORY VAULT',
    callSign: 'HV',
    tagline: 'The past, sourced and told properly.',
    category: 'docs',
    accent: '#A16207',
    scene: 'reel',
    icon: 'history_edu',
    shows: [
      show('hv-1', 'THE ARCHIVE HOUR', 'Documents, read aloud, in order', 90, 'documentary'),
      show('hv-2', 'FIGURES OF THE AGE', 'One life, examined', 60, 'documentary'),
      show('hv-3', 'DECLASSIFIED', 'What was withheld, and then released', 60, 'documentary'),
      show('hv-4', 'THE MAP ROOM', 'Borders redrawn, explained', 45, 'documentary'),
    ],
  },
  {
    id: 'wild-earth',
    number: 138,
    name: 'WILD EARTH',
    callSign: 'WE',
    tagline: 'Habitat, behaviour, and patience.',
    category: 'docs',
    accent: '#15803D',
    scene: 'storm',
    icon: 'forest',
    shows: [
      show('we-1', 'THE MIGRATION', 'Following the herd, on foot', 90, 'documentary'),
      show('we-2', 'NIGHT HUNTERS', 'What the dark conceals', 60, 'documentary'),
      show('we-3', 'RIVER SYSTEMS', 'Water as the architect', 60, 'documentary'),
      show('we-4', 'FIELD NOTES', 'The crew, and how it was filmed', 45, 'documentary'),
    ],
  },
  {
    id: 'the-blue-planet',
    number: 139,
    name: 'THE BLUE PLANET',
    callSign: 'BP',
    tagline: 'Oceans, ice, and the long view.',
    category: 'docs',
    accent: '#0891B2',
    scene: 'storm',
    icon: 'waves',
    shows: [
      show('bp-1', 'OPEN OCEAN', 'The deep water, without a landfall', 90, 'documentary'),
      show('bp-2', 'POLAR WATCH', 'Ice, measured year over year', 60, 'documentary'),
      show('bp-3', 'REEF CITY', 'A reef as infrastructure', 60, 'documentary'),
      show('bp-4', 'COASTLINE', 'Where land and water negotiate', 45, 'documentary'),
    ],
  },
  {
    id: 'wonder-lab',
    number: 140,
    name: 'WONDER LAB',
    callSign: 'WO',
    tagline: 'Science, explained without the smugness.',
    category: 'docs',
    accent: '#7C3AED',
    scene: 'orbit',
    icon: 'science',
    shows: [
      show('wo-1', 'HOW IT WORKS', 'One mechanism, dismantled', 45, 'documentary'),
      show('wo-2', 'THE PHYSICS HOUR', 'Forces, fields, and consequences', 60, 'documentary'),
      show('wo-3', 'BIG NUMBERS', 'Scale, demonstrated honestly', 45, 'documentary'),
      show('wo-4', 'OPEN QUESTIONS', 'What nobody has answered yet', 60, 'documentary'),
    ],
  },
  {
    id: 'expedition',
    number: 141,
    name: 'EXPEDITION',
    callSign: 'EX',
    tagline: 'Deep field, high summit, far orbit.',
    category: 'docs',
    accent: '#B91C1C',
    scene: 'reel',
    icon: 'explore',
    shows: [
      show('ex-1', 'THE ASCENT', 'Altitude, one thousand metres at a time', 90, 'documentary'),
      show('ex-2', 'UNDERGROUND', 'Caves, mines, and buried rivers', 60, 'documentary'),
      show('ex-3', 'DEEP FIELD', 'Recording where nobody lives', 60, 'documentary'),
      show('ex-4', 'RETURN TRIP', 'Getting home with everything intact', 45, 'documentary'),
    ],
  },
  {
    id: 'curious-mind',
    number: 142,
    name: 'CURIOUS MIND',
    callSign: 'CU',
    tagline: 'Questions that outlive the answers.',
    category: 'docs',
    accent: '#F97316',
    scene: 'pulse',
    icon: 'psychology',
    shows: [
      show('cu-1', 'THE ORIGIN QUESTION', 'Where the idea first came from', 60, 'documentary'),
      show('cu-2', 'FUTURE SHOCK', 'What arrives sooner than expected', 45, 'documentary'),
      show('cu-3', 'THE HUMAN FACTOR', 'Behaviour, measured and misread', 60, 'documentary'),
      show('cu-4', 'DEEP TIME', 'Geology at its own pace', 45, 'documentary'),
    ],
  },
  {
    id: 'the-courtroom',
    number: 143,
    name: 'THE COURTROOM',
    callSign: 'CR',
    tagline: 'Trials, verbatim.',
    category: 'docs',
    accent: '#64748B',
    scene: 'reel',
    icon: 'gavel',
    shows: [
      show('cr-1', 'LIVE TRIAL', 'Proceedings, as they are argued', 120, 'live'),
      show('cr-2', 'THE VERDICT', 'Readings, reactions, and reasons', 60, 'news'),
      show('cr-3', 'EVIDENCE HOUR', 'What the exhibits actually show', 45, 'documentary'),
      show('cr-4', 'APPEALS DESK', 'Where a ruling goes next', 30, 'documentary'),
    ],
  },
  {
    id: 'true-crime-archive',
    number: 144,
    name: 'TRUE CRIME ARCHIVE',
    callSign: 'TC',
    tagline: 'Case files, opened.',
    category: 'docs',
    accent: '#991B1B',
    scene: 'storm',
    icon: 'search',
    shows: [
      show('tc-1', 'COLD CASE FILE', 'The one that went quiet', 90, 'documentary'),
      show('tc-2', 'THE TIMELINE', 'Hour by hour, sourced', 60, 'documentary'),
      show('tc-3', 'FORENSICS', 'What the lab could and could not say', 45, 'documentary'),
      show('tc-4', 'THE APPEAL', 'New evidence, old conviction', 60, 'documentary'),
    ],
  },

  // ── Music ──────────────────────────────────────────────
  // ── Sitcoms, Entertainment & Movies (the music dial, retuned) ──
  {
    id: 'prime-sitcoms',
    number: 104,
    name: 'PRIME SITCOMS',
    callSign: 'PS',
    tagline: 'The classics that built the laugh track.',
    category: 'comedy',
    accent: '#F59E0B',
    scene: 'skyline',
    icon: 'sentiment_satisfied',
    shows: [
      show('ps-1', 'THE CLASSIC BLOCK', 'The episodes television kept', 60, 'episode'),
      show('ps-2', 'LATE NIGHT RERUNS', 'The ones worth losing sleep over', 90, 'episode'),
      show('ps-3', 'THE FRIDAY LINEUP', 'Back when everybody watched', 60, 'episode'),
      show('ps-4', 'THE SYNDICATION ROTATION', 'Forever in reruns, forever funny', 90, 'episode'),
    ],
  },
  {
    id: 'family-sitcoms',
    number: 114,
    name: 'FAMILY SITCOMS',
    callSign: 'FS',
    tagline: 'Dinner at seven, lesson by eight.',
    category: 'comedy',
    accent: '#22C55E',
    scene: 'skyline',
    icon: 'family_restroom',
    shows: [
      show('fs-1', 'THE LIVING ROOM', 'Where every problem got solved in 22 minutes', 60, 'episode'),
      show('fs-2', 'AFTER SCHOOL', 'Homework, postponed again', 90, 'episode'),
      show('fs-3', 'SUNDAY DINNER', 'The table where the episode began', 60, 'episode'),
      show('fs-4', 'VERY SPECIAL EPISODES', 'The ones they warned you about', 45, 'episode'),
    ],
  },
  {
    id: 'workplace-sitcoms',
    number: 115,
    name: 'WORKPLACE SITCOMS',
    callSign: 'WS',
    tagline: 'Nine to five, funnier than it sounds.',
    category: 'comedy',
    accent: '#0EA5E9',
    scene: 'skyline',
    icon: 'business_center',
    shows: [
      show('ws-1', 'THE OFFICE HOURS', 'Meetings that should have been emails', 60, 'episode'),
      show('ws-2', 'THE BREAK ROOM', 'Where the real business happened', 45, 'episode'),
      show('ws-3', 'THE DRESS CODE', 'Casual Friday, strictly enforced', 60, 'episode'),
      show('ws-4', 'THE QUARTERLY REVIEW', 'Performance, reviewed generously', 90, 'episode'),
    ],
  },
  {
    id: 'standup-spotlight',
    number: 116,
    name: 'STAND-UP SPOTLIGHT',
    callSign: 'SS',
    tagline: 'One mic, one stool, no notes.',
    category: 'comedy',
    accent: '#EC4899',
    scene: 'spectrum',
    icon: 'mic',
    shows: [
      show('ss-1', 'THE HEADLINER', 'A full hour, no opener', 60, 'live'),
      show('ss-2', 'NEW MATERIAL', 'The bits still being built', 45, 'live'),
      show('ss-3', 'THE LATE SET', 'After the room thinned out', 60, 'live'),
      show('ss-4', 'CROWD WORK', 'The front row asked for it', 30, 'live'),
    ],
  },
  {
    id: 'modern-movies',
    number: 145,
    name: 'MODERN MOVIES',
    callSign: 'MM',
    tagline: 'New films, all night, no rentals.',
    category: 'movies',
    accent: '#E11D48',
    scene: 'reel',
    icon: 'movie',
    shows: [
      show('mm-1', 'THE FRIDAY PREMIERE', 'First run, right here', 120, 'feature'),
      show('mm-2', 'THE DOUBLE FEATURE', 'Two films, one ticket', 240, 'feature'),
      show('mm-3', 'INDIE SPOTLIGHT', 'Small budgets, big swings', 90, 'feature'),
      show('mm-4', 'THE LATE MOVIE', 'After the news, before the sunrise', 120, 'feature'),
    ],
  },
  {
    id: 'feelgood-movies',
    number: 146,
    name: 'FEEL-GOOD MOVIES',
    callSign: 'FG',
    tagline: 'The endings you came back for.',
    category: 'movies',
    accent: '#FBBF24',
    scene: 'pulse',
    icon: 'favorite',
    shows: [
      show('fg-1', 'THE ROMANCE BLOCK', 'Two people, one misunderstanding, resolved', 120, 'feature'),
      show('fg-2', 'FAMILY SUNDAY', 'Movies the whole room agreed on', 120, 'feature'),
      show('fg-3', 'THE UNDERDOG HOUR', 'They had no business winning', 90, 'feature'),
      show('fg-4', 'THE COMFORT ROTATION', 'Put it on, leave it on', 120, 'feature'),
    ],
  },
  {
    id: 'movie-marathon',
    number: 147,
    name: 'MOVIE MARATHON',
    callSign: 'MX',
    tagline: 'Back to back to back to back.',
    category: 'movies',
    accent: '#8B5CF6',
    scene: 'reel',
    icon: 'theaters',
    shows: [
      show('mx-1', 'THE ALL-NIGHTER', 'Six films, one remote', 300, 'feature'),
      show('mx-2', 'DIRECTOR SPOTLIGHT', 'One voice, four features', 240, 'feature'),
      show('mx-3', 'THE SEQUEL WALL', 'All of them, in order', 240, 'feature'),
      show('mx-4', 'GENRE WEEKEND', 'One genre, all week', 180, 'feature'),
    ],
  },
  {
    id: 'classic-drama',
    number: 148,
    name: 'CLASSIC DRAMA',
    callSign: 'CD',
    tagline: 'The series that never lowered the stakes.',
    category: 'series',
    accent: '#1D4ED8',
    scene: 'orbit',
    icon: 'drama',
    shows: [
      show('cd-1', 'THE PILOT HOUR', 'Where every legend started', 60, 'episode'),
      show('cd-2', 'SEASON FINALES', 'The ones that broke the water cooler', 60, 'episode'),
      show('cd-3', 'TWO-PARTERS', 'To be continued, properly', 90, 'episode'),
      show('cd-4', 'THE REWATCH', 'Better the second time', 60, 'episode'),
    ],
  },
  {
    id: 'teen-drama',
    number: 149,
    name: 'TEEN DRAMA',
    callSign: 'TD',
    tagline: 'Lockers, prom, and enormous consequences.',
    category: 'series',
    accent: '#DB2777',
    scene: 'pulse',
    icon: 'school',
    shows: [
      show('td-1', 'FIRST PERIOD', 'Homeroom is where the drama lives', 60, 'episode'),
      show('td-2', 'THE BIG GAME', 'Everything decided under the lights', 60, 'episode'),
      show('td-3', 'PROM NIGHT', 'One dance, one decade', 90, 'episode'),
      show('td-4', 'GRADUATION', 'The goodbye season', 60, 'episode'),
    ],
  },
  {
    id: 'crime-series',
    number: 150,
    name: 'CRIME SERIES',
    callSign: 'CS',
    tagline: 'The case opens, the case closes, the show renews.',
    category: 'series',
    accent: '#1F2937',
    scene: 'storm',
    icon: 'local_police',
    shows: [
      show('cs-1', 'THE PRECINCT', 'One case per shift', 60, 'episode'),
      show('cs-2', 'THE INTERROGATION', 'Nobody leaves until somebody talks', 60, 'episode'),
      show('cs-3', 'THE STAKEOUT', 'Coffee, patience, and paperwork', 60, 'episode'),
      show('cs-4', 'THE CLOSER', 'The last witness always talks', 90, 'episode'),
    ],
  },
  {
    id: 'reality-roundup',
    number: 151,
    name: 'REALITY ROUNDUP',
    callSign: 'RR',
    tagline: 'Unscripted, unfiltered, unbelievable.',
    category: 'entertainment',
    accent: '#F97316',
    scene: 'spectrum',
    icon: 'videocam',
    shows: [
      show('rr-1', 'THE PRIME BLOCK', 'The format that took over television', 60, 'live'),
      show('rr-2', 'THE COMPETITION', 'Judges, stakes, and one winner', 90, 'live'),
      show('rr-3', 'BEHIND THE VOTING', 'What the audience never saw', 45, 'documentary'),
      show('rr-4', 'THE REUNION', 'Everybody back on one couch', 60, 'live'),
    ],
  },
  {
    id: 'game-night',
    number: 152,
    name: 'GAME NIGHT',
    callSign: 'GN',
    tagline: 'Big doors, bright lights, wrong answers.',
    category: 'entertainment',
    accent: '#EAB308',
    scene: 'pulse',
    icon: 'celebration',
    shows: [
      show('gn-1', 'THE CLASSIC ROUNDS', 'Deals, doors, and dated prizes', 60, 'episode'),
      show('gn-2', 'LIGHTNING ROUND', 'No thinking, just answering', 30, 'episode'),
      show('gn-3', 'THE BIG BOARD', 'Where the money was', 45, 'episode'),
      show('gn-4', 'CHAMPIONS HOUR', 'The streaks that lasted', 60, 'episode'),
    ],
  },
  {
    id: 'talent-stage',
    number: 153,
    name: 'TALENT STAGE',
    callSign: 'TL',
    tagline: 'The audition room, never locked.',
    category: 'entertainment',
    accent: '#14B8A6',
    scene: 'spectrum',
    icon: 'star',
    shows: [
      show('tl-1', 'OPEN AUDITIONS', 'Everybody gets a minute', 60, 'live'),
      show('tl-2', 'THE GOLDEN BUZZER', 'The acts that stopped the room', 60, 'live'),
      show('tl-3', 'LIVE RESULTS', 'Who stayed, who went home', 45, 'live'),
      show('tl-4', 'THE FINALE', 'One act, one stage, one night', 90, 'live'),
    ],
  },
  {
    id: 'pop-lifestyle',
    number: 154,
    name: 'POP LIFESTYLE',
    callSign: 'PL',
    tagline: 'Kitchens, makeovers, and everything after.',
    category: 'entertainment',
    accent: '#2BA09C',
    scene: 'skyline',
    icon: 'home',
    shows: [
      show('pl-1', 'THE KITCHEN HOUR', 'One dish, done properly', 60, 'episode'),
      show('pl-2', 'THE MAKEOVER', 'Before, during, and the reveal', 45, 'episode'),
      show('pl-3', 'THE HOME TOUR', 'Somewhere you would rather be', 60, 'episode'),
      show('pl-4', 'THE WEEKEND PROJECT', 'Started Saturday, finished never', 30, 'episode'),
    ],
  },

  {
    id: SMUVE_JEFF_RADIO_CHANNEL_ID,
    number: 155,
    name: 'SMUVE JEFF RADIO',
    callSign: 'SJR',
    tagline: 'The artist, around the clock.',
    category: 'music',
    accent: '#22C55E',
    scene: 'vinyl',
    icon: 'radio',
    /*
     * The rotation is the programming: the station plays the artist's released
     * records in full rather than repeating a spoken-word schedule, so these
     * blocks describe the catalogue being worked through, not invented shows.
     */
    shows: [
      show('sjr-1', 'THE ROTATION', 'Every released record, played in full', 300, 'mix'),
      show('sjr-2', 'DEEP CUTS', 'Album tracks the singles outshone', 200, 'mix'),
      show('sjr-3', 'AFTER HOURS', 'Slow records into the small hours', 220, 'mix'),
      show('sjr-4', 'THE CATALOGUE', 'Nothing but the artist, all day', 240, 'mix'),
    ],
  },

  // ── Movies & Cinema ────────────────────────────────────
  {
    id: 'movies-classic',
    number: 156,
    name: 'MOVIES CLASSIC',
    callSign: 'MC',
    tagline: 'Hollywood back catalogue, around the clock.',
    category: 'movies',
    accent: '#F97316',
    scene: 'reel',
    icon: 'movie',
    shows: [
      show('mc-1', 'THE CLASSIC BLOCK', 'The hits you know by heart', 120, 'feature'),
      show('mc-2', 'AFTERNOON DOUBLE FEATURE', 'Two for one, no intermission', 180, 'feature'),
      show('mc-3', 'THE FRANCHISE HOUR', 'Where a franchise built its legend', 90, 'documentary'),
      show('mc-4', 'LATE NIGHT REEL', 'The movies that play second screen', 120, 'feature'),
    ],
  },

  // ── Comedy ─────────────────────────────────────────────
  {
    id: 'comedy-central',
    number: 157,
    name: 'COMEDY CENTRAL',
    callSign: 'CC',
    tagline: 'Stand-up, sketches, and the punchline after.',
    category: 'comedy',
    accent: '#FBBF24',
    scene: 'neon-grid',
    icon: 'sentiment_satisfied',
    shows: [
      show('cc-1', 'THE STAND-UP HOUR', 'An hour, opening act to closer', 60, 'feature'),
      show('cc-2', 'THE ROAST', 'Laughing at the people who deserve it', 90, 'live'),
      show('cc-3', 'CLASSIC SKETCHES', 'The bits that outlasted the series', 30, 'feature'),
      show('cc-4', 'THE MONOLOGUE', 'Late night, unfiltered', 60, 'live'),
    ],
  },

  // ── Crime & Investigation ──────────────────────────────
  {
    id: 'the-first-48',
    number: 158,
    name: 'THE FIRST 48',
    callSign: 'F48',
    tagline: 'The first forty-eight hours, case by case.',
    category: 'crime',
    accent: '#1F2937',
    scene: 'storm',
    icon: 'search',
    shows: [
      show('f48-1', 'THE FIRST 48', 'Hours one through forty-eight, tracked', 60, 'documentary'),
      show('f48-2', 'COLD CASE UNIT', 'The files nobody closed', 45, 'documentary'),
      show('f48-3', 'FORENSICS LIBRARY', 'What the lab actually said', 30, 'documentary'),
      show('f48-4', 'INTERROGATION FILES', 'What was asked, and what was answered', 45, 'documentary'),
    ],
  },

  // ── Cartoons ───────────────────────────────────────────
  {
    id: 'cartoon-network-classics',
    number: 159,
    name: 'CARTOON NETWORK CLASSICS',
    callSign: 'CN',
    tagline: 'Saturday morning, every morning.',
    category: 'cartoons',
    accent: '#FF6B35',
    scene: 'neon-grid',
    icon: 'child_care',
    shows: [
      show('cn-1', 'THE POWER HOUR', 'Action blocks, one after another', 60, 'feature'),
      show('cn-2', 'THE MONDAY PUNISHMENT', 'Four mistakes, one segment', 45, 'feature'),
      show('cn-3', 'SPACE RANGERS', 'Armour, zords, and the overhead', 60, 'feature'),
      show('cn-4', 'THE ALL-NIGHTER', 'What dropped on the long nights', 90, 'feature'),
    ],
  },

  // ── Black Cinema ───────────────────────────────────────
  {
    id: 'black-cinema-classics',
    number: 160,
    name: 'BLACK CINEMA CLASSICS',
    callSign: 'BC',
    tagline: 'Black film history, watched properly.',
    category: 'black-cinema',
    accent: '#7C3AED',
    scene: 'neon-grid',
    icon: 'palette',
    shows: [
      show('bc-1', 'THE CLASSIC BLOCK', 'The films that built the canon', 120, 'feature'),
      show('bc-2', 'THE AUSGUST ROOM', 'Stories that left an imprint', 90, 'feature'),
      show('bc-3', 'INDIE FIRST FRIDAY', 'New voices, early in their arc', 60, 'feature'),
      show('bc-4', 'THE BALLAD HOUR', 'Soul, sound, and the stories around it', 60, 'feature'),
    ],
  },

  // ── Series ─────────────────────────────────────────────
  {
    id: 'star-trek-tng',
    number: 161,
    name: 'STAR TREK: THE NEXT GENERATION',
    callSign: 'TNG',
    tagline: 'Encounters with the future, in order.',
    category: 'series',
    accent: '#0EA5E9',
    scene: 'orbit',
    icon: 'theaters',
    shows: [
      show('tng-1', 'SEASON ONE', 'The ship introduced itself to television', 60, 'episode'),
      show('tng-2', 'SEASON TWO', 'The crew found its voice', 60, 'episode'),
      show('tng-3', 'SEASON THREE', 'The series grew up fast', 60, 'episode'),
      show('tng-4', 'SEASON FOUR', 'The world got bigger', 60, 'episode'),
    ],
  },

  // ── Comedy (long-form) ─────────────────────────────────
  {
    id: 'showtime-frasier',
    number: 162,
    name: 'SHOWTIME FRASIER',
    callSign: 'FRZ',
    tagline: 'Cocktails, callers, and good intentions.',
    category: 'comedy',
    accent: '#FBBF24',
    scene: 'skyline',
    icon: 'sentiment_satisfied',
    shows: [
      show('frz-1', 'SEASON ONE', 'Seattle, the practice, and a new apartment', 60, 'episode'),
      show('frz-2', 'SEASON TWO', 'The house, the father, and the fallout', 60, 'episode'),
      show('frz-3', 'SEASON THREE', 'Seattle grows up too', 60, 'episode'),
      show('frz-4', 'SEASON FOUR', 'The room got smaller, not the life', 60, 'episode'),
    ],
  },

  // ── Vintage ────────────────────────────────────────────
  {
    id: 'vintage-classics',
    number: 163,
    name: 'VINTAGE CLASSICS',
    callSign: 'VC',
    tagline: 'The library that outlasted the network.',
    category: 'vintage',
    accent: '#C2884B',
    scene: 'reel',
    icon: 'history',
    shows: [
      show('vc-1', 'THE GOLDEN HOUR', 'The episodes television kept', 60, 'episode'),
      show('vc-2', 'PRIME TIME CLASSICS', 'When everybody watched the same thing', 90, 'episode'),
      show('vc-3', 'THE VAULT REWIND', 'Back before the reboot', 60, 'episode'),
      show('vc-4', 'LATE NIGHT RERUNS', 'The ones worth losing sleep over', 120, 'episode'),
    ],
  },
  {
    id: 'game-show-classics',
    number: 164,
    name: 'GAME SHOW CLASSICS',
    callSign: 'GS',
    tagline: 'Big doors, bright lights, and the wrong answer.',
    category: 'vintage',
    accent: '#E11D48',
    scene: 'pulse',
    icon: 'celebration',
    shows: [
      show('gs-1', 'THE CLASSIC ROUNDS', 'Deals, doors, and dated prizes', 60, 'episode'),
      show('gs-2', 'LIGHTNING ROUND', 'No thinking, just answering', 30, 'episode'),
      show('gs-3', 'THE BIG BOARD', 'Where the money was', 45, 'episode'),
      show('gs-4', 'CHAMPIONS HOUR', 'The streaks that lasted', 60, 'episode'),
    ],
  },

  // ── Cartoons (classic) ─────────────────────────────────
  {
    id: 'retro-cartoons',
    number: 165,
    name: 'RETRO CARTOONS',
    callSign: 'RC',
    tagline: 'Hand-drawn mornings, before the CG.',
    category: 'cartoons',
    accent: '#F59E0B',
    scene: 'neon-grid',
    icon: 'animation',
    shows: [
      show('rc-1', 'SATURDAY MORNING', 'The block that ruined weekday sleep', 90, 'episode'),
      show('rc-2', 'CLASSIC ANIMATION', 'Cels, not render farms', 60, 'episode'),
      show('rc-3', 'ACTION CARTOONS', 'Transforming, battling, saving the block', 60, 'episode'),
      show('rc-4', 'THE AFTER-SCHOOL RUN', 'Homework, postponed', 90, 'episode'),
    ],
  },
];

/** Total minutes in one rotation of a station's schedule. */
function rotationMinutes(channel: SmuveTvChannel): number {
  return channel.shows.reduce((sum, entry) => sum + entry.durationMin, 0);
}

/**
 * Per-station phase offset, so the line-up is not in lockstep — channel 118 is
 * never playing the same slot boundary as channel 101.
 */
function stationSeed(channel: SmuveTvChannel): number {
  return channel.number * 17;
}

/** 24-hour `HH:MM` in the viewer's own zone. */
export function smuveTvClock(ms: number): string {
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, '0')}:${String(
    at.getMinutes()
  ).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class SmuveTvService {
  readonly categories = SMUVE_TV_CATEGORIES;
  readonly channels = SMUVE_TV_CHANNELS;

  /**
   * The artist's station, so the module always has a route to it without
   * hard-coding a channel number into the component.
   */
  readonly radioChannel: SmuveTvChannel =
    this.channels.find(
      (channel) => channel.id === SMUVE_JEFF_RADIO_CHANNEL_ID
    ) ?? this.channels[0];

  /** Stations in a category, in channel order. `all` returns the line-up. */
  channelsIn(category: SmuveTvCategoryId): SmuveTvChannel[] {
    const pool =
      category === 'all'
        ? [...this.channels]
        : this.channels.filter((channel) => channel.category === category);
    return pool.sort((a, b) => a.number - b.number);
  }

  /** Matches channel number, name, call sign, tagline, and programme titles. */
  search(query: string): SmuveTvChannel[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.channelsIn('all');
    return this.channelsIn('all').filter((channel) => {
      const haystack = [
        String(channel.number),
        channel.name,
        channel.callSign,
        channel.tagline,
        ...channel.shows.map((entry) => entry.title),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  channelByNumber(value: number | string): SmuveTvChannel | null {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) return null;
    return this.channels.find((channel) => channel.number === parsed) ?? null;
  }

  /**
   * The slot on air at `at`.
   *
   * Pure arithmetic on the wall clock: the station's rotation repeats forever,
   * so this is stable for every viewer and trivially testable.
   */
  nowPlaying(channel: SmuveTvChannel, at: Date = new Date()): SmuveTvSlot {
    const total = rotationMinutes(channel);
    const minute = Math.floor(at.getTime() / 60000);
    const loopPos =
      (((minute + stationSeed(channel)) % total) + total) % total;

    let cursor = 0;
    let index = 0;
    for (; index < channel.shows.length; index += 1) {
      const next = cursor + channel.shows[index].durationMin;
      if (loopPos < next) break;
      cursor = next;
    }

    const program = channel.shows[index] ?? channel.shows[0];
    const startedMinutesAgo = loopPos - cursor;
    const startsAt = (minute - startedMinutesAgo) * 60000;
    const endsAt = startsAt + program.durationMin * 60000;
    const span = endsAt - startsAt;

    return {
      program,
      startsAt,
      endsAt,
      progress: span > 0 ? Math.min(1, Math.max(0, (at.getTime() - startsAt) / span)) : 0,
      onAir: true,
    };
  }

  /**
   * The next `count` slots, starting with whatever is on air. Entering the
   * module always opens the guide on live programming, never mid-episode of
   * something that is not actually broadcast.
   */
  guideFor(
    channel: SmuveTvChannel,
    at: Date = new Date(),
    count = 6
  ): SmuveTvSlot[] {
    const slots: SmuveTvSlot[] = [];
    let cursorAt = at;
    for (let i = 0; i < Math.max(1, count); i += 1) {
      const slot = this.nowPlaying(channel, cursorAt);
      slots.push(i === 0 ? slot : { ...slot, progress: 0, onAir: false });
      cursorAt = new Date(slot.endsAt);
    }
    return slots;
  }
}
