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
  | 'music'
  | 'studio'
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

export const SMUVE_TV_CATEGORIES: readonly SmuveTvCategory[] = [
  { id: 'all', label: 'ALL STATIONS', icon: 'tv' },
  { id: 'live', label: 'LIVE NOW', icon: 'sensors' },
  { id: 'music', label: 'MUSIC', icon: 'graphic_eq' },
  { id: 'studio', label: 'STUDIO', icon: 'piano' },
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
