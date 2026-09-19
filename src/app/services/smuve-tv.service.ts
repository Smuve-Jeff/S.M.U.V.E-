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
  | 'vault';

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
    id: 'midnight-vinyl',
    number: 104,
    name: 'MIDNIGHT VINYL',
    callSign: 'MV',
    tagline: 'Crackle, warmth, and 33⅓ rpm.',
    category: 'music',
    accent: '#B45309',
    scene: 'vinyl',
    icon: 'album',
    shows: [
      show('mv-1', 'SIDE A', 'Needle down, no skips', 45, 'mix'),
      show('mv-2', 'CRATE DIG', 'Dusty finds and rarer pressings', 60, 'documentary'),
      show('mv-3', 'SIDE B', 'The deep cut rotation', 45, 'mix'),
      show('mv-4', 'LAST CALL SPIN', 'One more before the lights come up', 90, 'mix'),
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
    id: 'bass-cathedral',
    number: 114,
    name: 'BASS CATHEDRAL',
    callSign: 'BC',
    tagline: 'Sub frequencies, structurally risky.',
    category: 'music',
    accent: '#7C3AED',
    scene: 'storm',
    icon: 'surround_sound',
    shows: [
      show('bc-1', 'SUBSONIC SERVICE', 'Continuous low-end worship', 90, 'mix'),
      show('bc-2', '808 CONFESSIONAL', 'The drum that rebuilt a genre', 60, 'documentary'),
      show('bc-3', 'PRESSURE TEST', 'Warn the neighbours first', 60, 'mix'),
      show('bc-4', 'DECOMPRESSION', 'Coming down, gently', 60, 'mix'),
    ],
  },
  {
    id: 'synth-city',
    number: 115,
    name: 'SYNTH CITY',
    callSign: 'SY',
    tagline: 'Hardware, harmony, and neon.',
    category: 'music',
    accent: '#F43F5E',
    scene: 'skyline',
    icon: 'piano',
    shows: [
      show('sy-1', 'PATCH OF THE DAY', 'One synth, explored completely', 45, 'documentary'),
      show('sy-2', 'ANALOG PURISTS', 'Arguing about oscillators', 60, 'news'),
      show('sy-3', 'ARPEGGIO CITY', 'Continuous, unrelenting', 90, 'mix'),
      show('sy-4', 'MIDNIGHT DRIVE', 'Neon, top down, no destination', 90, 'mix'),
    ],
  },
  {
    id: 'lofi-lounge',
    number: 116,
    name: 'LO-FI LOUNGE',
    callSign: 'LL',
    tagline: 'Study, chill, repeat.',
    category: 'music',
    accent: '#8B5CF6',
    scene: 'pulse',
    icon: 'nightlight',
    shows: [
      show('ll-1', 'TAPE HISS HOUR', 'Wobble, warmth, and no urgency', 120, 'mix'),
      show('ll-2', 'RAIN ON THE WINDOW', 'Ambience with a beat underneath', 90, 'mix'),
      show('ll-3', 'HOMEWORK BLOCK', 'Two hours, no vocals', 120, 'mix'),
      show('ll-4', 'SUNRISE SESSION', 'The loop that ends the night', 90, 'mix'),
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
  {
    id: 'jukebox-gold',
    number: 145,
    name: 'JUKEBOX GOLD',
    callSign: 'JG',
    tagline: 'Diner-era gold, still spinning.',
    category: 'music',
    accent: '#A16207',
    scene: 'vinyl',
    icon: 'album',
    shows: [
      show('jg-1', 'A-SIDE ROTATION', 'Videos from the golden era', 90, 'mix'),
      show('jg-2', 'THE DINER SET', 'Slow dances and soda fountains', 60, 'mix'),
      show('jg-3', 'ONE-HIT STORIES', 'Where they went after the hit', 45, 'documentary'),
      show('jg-4', 'MALT SHOP HOUR', 'Chrome, fins, and reverb', 60, 'mix'),
    ],
  },
  {
    id: 'flashback-70s',
    number: 146,
    name: 'FLASHBACK 70s',
    callSign: 'FB',
    tagline: 'Wah pedal, wide lapels.',
    category: 'music',
    accent: '#D97706',
    scene: 'vinyl',
    icon: 'album',
    shows: [
      show('fb-1', 'AM GOLD', 'The singles that ruled the decade', 90, 'mix'),
      show('fb-2', 'STADIUM YEARS', 'Live footage, restored', 60, 'mix'),
      show('fb-3', 'THE STUDIO SOUND', 'Desks, tape, and the take', 45, 'documentary'),
      show('fb-4', 'DISCO BREAK', 'Four on the floor, unapologetic', 60, 'mix'),
    ],
  },
  {
    id: 'k-pop-now',
    number: 147,
    name: 'K-POP NOW',
    callSign: 'KP',
    tagline: 'The current chart, straight from Seoul.',
    category: 'music',
    accent: '#EC4899',
    scene: 'neon-grid',
    icon: 'graphic_eq',
    shows: [
      show('kp-1', 'COMEBACK STAGE', 'New releases, first look', 60, 'mix'),
      show('kp-2', 'THE PRACTICE ROOM', 'Choreography, broken down', 45, 'documentary'),
      show('kp-3', 'CHART WATCH', 'Melon, Hanteo, and the numbers', 30, 'news'),
      show('kp-4', 'B-SIDE HOUR', 'The tracks that deserved a single', 60, 'mix'),
    ],
  },
  {
    id: 'latin-pop-now',
    number: 148,
    name: 'LATIN POP NOW',
    callSign: 'LP',
    tagline: 'The hit list, en español.',
    category: 'music',
    accent: '#F43F5E',
    scene: 'neon-grid',
    icon: 'graphic_eq',
    shows: [
      show('lp-1', 'LA LISTA', 'The current chart, back to back', 90, 'mix'),
      show('lp-2', 'NUEVO', 'Releases older than an hour', 45, 'mix'),
      show('lp-3', 'THE WRITERS ROOM', 'Who actually wrote the hook', 45, 'documentary'),
      show('lp-4', 'PLAYA SET', 'The coastal rotation', 60, 'mix'),
    ],
  },
  {
    id: 'latin-romance',
    number: 149,
    name: 'LATIN ROMANCE',
    callSign: 'LR',
    tagline: 'Boleros, bachata, and slow dances.',
    category: 'music',
    accent: '#DB2777',
    scene: 'pulse',
    icon: 'favorite',
    shows: [
      show('lr-1', 'BOLERO HOUR', 'Brass, strings, and restraint', 60, 'mix'),
      show('lr-2', 'BACHATA NIGHT', 'The guitar that answers back', 90, 'mix'),
      show('lr-3', 'DEDICATORIAS', 'Requests, read between tracks', 45, 'live'),
      show('lr-4', 'LA PLAYA', 'Sunset, and the last dance', 60, 'mix'),
    ],
  },
  {
    id: 'djazztv',
    number: 150,
    name: 'DJAZZ',
    callSign: 'DJ',
    tagline: 'The festival stage, all night.',
    category: 'music',
    accent: '#1D4ED8',
    scene: 'orbit',
    icon: 'music_note',
    shows: [
      show('dj-1', 'MAIN STAGE', 'A full set, from the pit', 90, 'live'),
      show('dj-2', 'THE STANDARDS', 'The canon, played straight', 60, 'mix'),
      show('dj-3', 'FREE JAZZ HOUR', 'Nobody counts, everybody listens', 45, 'mix'),
      show('dj-4', 'AFTER HOURS', 'Slow, low, and late', 60, 'mix'),
    ],
  },
  {
    id: 'karaoke-lounge',
    number: 151,
    name: 'KARAOKE LOUNGE',
    callSign: 'KJ',
    tagline: 'Sing it like you wrote it.',
    category: 'music',
    accent: '#7C3AED',
    scene: 'neon-grid',
    icon: 'mic',
    shows: [
      show('kj-1', 'OPEN MIC', 'Whatever the room calls out', 90, 'live'),
      show('kj-2', 'LYRIC WATCH', 'Words on screen, perfectly timed', 60, 'mix'),
      show('kj-3', 'THE BALLAD SLOT', 'For the ones who go last', 45, 'mix'),
      show('kj-4', 'ENCORE', 'Demanded, and delivered', 30, 'live'),
    ],
  },
  {
    id: 'zen-life',
    number: 152,
    name: 'ZEN LIFE',
    callSign: 'ZL',
    tagline: 'Ambient, ambient, ambient.',
    category: 'music',
    accent: '#14B8A6',
    scene: 'pulse',
    icon: 'nightlight',
    shows: [
      show('zl-1', 'DRIFT', 'Pads, and nothing sharper', 120, 'mix'),
      show('zl-2', 'BREATHWORK', 'Counted, in and out', 45, 'mix'),
      show('zl-3', 'SUNRISE', 'Light arrives, slowly', 90, 'mix'),
      show('zl-4', 'DEEP REST', 'Nothing happens, beautifully', 120, 'mix'),
    ],
  },
  {
    id: 'naturescape',
    number: 153,
    name: 'NATURESCAPE',
    callSign: 'NS',
    tagline: 'Canopy, tide, and slow light.',
    category: 'music',
    accent: '#0D9488',
    scene: 'storm',
    icon: 'forest',
    shows: [
      show('ns-1', 'FOREST FLOOR', 'Wind and light through leaves', 90, 'mix'),
      show('ns-2', 'TIDE LINE', 'Water, arriving and leaving', 90, 'mix'),
      show('ns-3', 'MOUNTAIN AIR', 'Thin, cold, and clear', 60, 'mix'),
      show('ns-4', 'NIGHT GARDEN', 'The shift that starts at dusk', 60, 'mix'),
    ],
  },
  {
    id: 'california-music',
    number: 154,
    name: 'CALIFORNIA MUSIC',
    callSign: 'CA',
    tagline: 'West coast videos, back to back.',
    category: 'music',
    accent: '#F59E0B',
    scene: 'spectrum',
    icon: 'album',
    shows: [
      show('ca-1', 'THE VIDEO BLOCK', 'Non-stop, no interruptions', 90, 'mix'),
      show('ca-2', 'LOCAL ARTISTS', 'What is coming out of the garage', 45, 'documentary'),
      show('ca-3', 'HIGHWAY HOUR', 'Top down, engine warm', 60, 'mix'),
      show('ca-4', 'NEW RELEASE WALL', 'The videos that just landed', 45, 'mix'),
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
