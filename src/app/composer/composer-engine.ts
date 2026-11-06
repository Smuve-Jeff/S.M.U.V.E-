import type {
  CatalogEntry,
  ComponentKind,
  ComposerNote,
  ComposerPart,
  ComposerSection,
  Composition,
  ComposeRequest,
  DrumHit,
  DrumLane,
  GenreFamily,
  GenreProfile,
  HarmonyTemplate,
  LayerRole,
  ModeId,
  MoodId,
  PartRole,
  SectionRole,
  VariationMode,
} from './composer.types';
import {
  ARRANGEMENT_BY_ID,
  BASS_STYLE_BY_ID,
  FAMILY_LABELS,
  GROOVE_BY_ID,
  MODE_LABELS,
  MODE_SCALES,
  MOOD_LABELS,
  PROGRESSION_BY_ID,
  arrangementById,
  bassStyleById,
  grooveById,
  progressionById,
} from './atlas';

/**
 * S.M.U.V.E.'s composition core.
 *
 * Pure functions, seeded randomness, real theory: modes, diatonic harmony,
 * voice leading, rhythmic cells, and arrangement templates. The engine writes
 * a *score* — pitches, lengths, velocities and drum hits — which any surface
 * can audition, edit, or load into the Studio. It never pretends to render
 * audio it did not render.
 */

export const PITCH_NAMES = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

/** Deterministic, fast PRNG (mulberry32) so every seed is reproducible. */
export function createRng(seed: number): Rng {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0 || 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * Math.max(1, maxExclusive)),
    range: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length) % items.length],
    chance: (probability: number) => next() < probability,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const COMPONENT_OPTIONS: Array<{
  id: ComponentKind;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}> = [
  { id: 'full-song', label: 'Complete Song', shortLabel: 'Song', icon: 'album', description: 'Full arrangement: intro to outro, every part written.' },
  { id: 'arrangement', label: 'Arrangement Blueprint', shortLabel: 'Form', icon: 'view_week', description: 'Section map with energy, layers and transitions.' },
  { id: 'drums', label: 'Drum Pattern', shortLabel: 'Drums', icon: 'queue_music', description: 'Kick, snare, hats and fills for the chosen genre.' },
  { id: 'kick', label: 'Kick / 808', shortLabel: 'Kick', icon: 'graphic_eq', description: 'Low-end rhythm, placed around the groove.' },
  { id: 'snare', label: 'Snare / Clap', shortLabel: 'Snare', icon: 'bolt', description: 'Backbeat and ghost-note skeleton.' },
  { id: 'hats', label: 'Hi-Hats', shortLabel: 'Hats', icon: 'water_drop', description: 'Subdivision, rolls and open accents.' },
  { id: 'percussion', label: 'Percussion Layer', shortLabel: 'Perc', icon: 'grain', description: 'Shakers, congas, ride and texture.' },
  { id: 'bassline', label: 'Bassline', shortLabel: 'Bass', icon: 'linear_scale', description: 'Root movement and pocket for the harmony.' },
  { id: 'chords', label: 'Chord Progression', shortLabel: 'Chords', icon: 'piano', description: 'Voicings, comping rhythm and harmonic cycle.' },
  { id: 'melody', label: 'Melody / Hook', shortLabel: 'Melody', icon: 'graphic_eq', description: 'Motif-first topline over the changes.' },
  { id: 'counter-melody', label: 'Counter-Melody', shortLabel: 'Counter', icon: 'layers', description: 'A second voice that answers, never competes.' },
  { id: 'arp', label: 'Arpeggio', shortLabel: 'Arp', icon: 'show_chart', description: 'Rhythmic chord motion for lift and texture.' },
  { id: 'loop', label: 'Loop Kit', shortLabel: 'Loop', icon: 'repeat', description: 'A repeatable section bed you can build on.' },
  { id: 'transition', label: 'Transition / Fill', shortLabel: 'Riser', icon: 'trending_up', description: 'Tension device between two sections.' },
];

const ROLE_MIX: Record<PartRole, string> = {
  drums: 'Keep the transient sharp; tune the kick to the bass root.',
  kick: 'Short, mono and tuned — let it share the sub with the bass, never fight it.',
  snare: 'One loud hit, one ghost; keep the tail short enough to hear the groove.',
  hats: 'Subdivision carries the motion — vary velocity, not just pattern.',
  percussion: 'Pan for depth and keep the hits short; percussion is texture with rhythm.',
  bass: 'Play the pocket, not the kick. Leave the backbeat room.',
  chords: 'Voice-led and filtered — the vocal has to live above this.',
  pad: 'Wide and quiet; it is the room, not the event.',
  melody: 'Chord tones on the strong beats, stepwise motion between them.',
  counter: 'Answer the lead in the gaps; never double its rhythm.',
  arp: 'One chord at a time, clear subdivision, no clutter.',
  fx: 'Tension only. If it is audible after the drop, it is too loud.',
};

const DRUM_LANE_MIDI: Record<DrumLane, number> = {
  kick: 36,
  snare: 38,
  clap: 39,
  rim: 37,
  hat: 42,
  openhat: 46,
  ride: 51,
  perc: 75,
  shaker: 70,
  tom: 43,
  crash: 49,
};

const DRUM_LANE_LABEL: Record<DrumLane, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  rim: 'Rim',
  hat: 'Hi-hat',
  openhat: 'Open hat',
  ride: 'Ride',
  perc: 'Percussion',
  shaker: 'Shaker',
  tom: 'Tom',
  crash: 'Crash',
};

export function drumMidiForLane(lane: DrumLane): number {
  return DRUM_LANE_MIDI[lane];
}

/* ── Key and harmony ────────────────────────────────────────────── */

export interface ResolvedKey {
  tonicPc: number;
  tonicName: string;
  modeId: ModeId;
  modeLabel: string;
  scale: number[];
  keyLabel: string;
}

const MODE_ALIASES: Array<[RegExp, ModeId]> = [
  [/harmonic\s*minor/i, 'harmonic-minor'],
  [/phrygian\s*dominant|spanish|andalusian/i, 'phrygian-dominant'],
  [/dorian/i, 'dorian'],
  [/phrygian/i, 'phrygian'],
  [/lydian/i, 'lydian'],
  [/mixolydian/i, 'mixolydian'],
  [/pentatonic\s*minor|minor\s*pentatonic/i, 'minor-pentatonic'],
  [/pentatonic|major\s*pentatonic/i, 'major-pentatonic'],
  [/blues/i, 'blues'],
  [/whole\s*tone/i, 'whole-tone'],
  [/major|ionian/i, 'ionian'],
  [/minor|aeolian/i, 'aeolian'],
];

function pcFromName(name: string): number | null {
  const clean = name.trim().replace(/\s+/g, '');
  const match = clean.match(/^([A-Ga-g])([#b]?)/);
  if (!match) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[match[1].toUpperCase()];
  if (pc === undefined) return null;
  if (match[2] === '#') pc = (pc + 1) % 12;
  if (match[2] === 'b') pc = (pc + 11) % 12;
  return pc;
}

export function parseKeyLabel(label: string | undefined | null): {
  tonicPc: number | null;
  modeId: ModeId | null;
} {
  if (!label) return { tonicPc: null, modeId: null };
  const tonicPc = pcFromName(label);
  let modeId: ModeId | null = null;
  for (const [pattern, id] of MODE_ALIASES) {
    if (pattern.test(label)) {
      modeId = id;
      break;
    }
  }
  return { tonicPc, modeId };
}

export function resolveKey(
  genre: GenreProfile,
  rng: Rng,
  preference?: string
): ResolvedKey {
  const parsed = parseKeyLabel(preference);
  const tonicPc =
    parsed.tonicPc !== null
      ? parsed.tonicPc
      : pcFromName(rng.pick(genre.keys)) ?? 0;
  const modeId = parsed.modeId ?? rng.pick(genre.modes);
  const scale = MODE_SCALES[modeId];
  const modeLabel = MODE_LABELS[modeId];
  const tonicName = PITCH_NAMES[tonicPc];
  return {
    tonicPc,
    tonicName,
    modeId,
    modeLabel,
    scale,
    keyLabel: `${tonicName} ${modeLabel}`,
  };
}

/** Converts a scale degree (can exceed the octave) to a MIDI note. */
export function scaleMidi(
  key: ResolvedKey,
  degree: number,
  octave: number
): number {
  const size = key.scale.length;
  const wrapped = ((degree % size) + size) % size;
  const octaveShift = Math.floor(degree / size);
  return 12 * (octave + 1 + octaveShift) + key.tonicPc + key.scale[wrapped];
}

export interface ChordShape {
  degree: number;
  rootPc: number;
  intervals: number[];
  pcs: number[];
  label: string;
  roman: string;
  rootName: string;
}

const QUALITY_SUFFIX: Record<string, string> = {
  '0,4,7': '',
  '0,3,7': 'm',
  '0,3,6': 'dim',
  '0,4,8': 'aug',
  '0,5,7': 'sus4',
  '0,2,7': 'sus2',
  '0,4,7,11': 'maj7',
  '0,4,7,10': '7',
  '0,3,7,10': 'm7',
  '0,3,6,10': 'm7b5',
  '0,3,6,9': 'dim7',
  '0,3,7,11': 'mMaj7',
  '0,4,7,10,14': '9',
  '0,3,7,10,14': 'm9',
  '0,4,7,11,14': 'maj9',
  '0,3,6,8': 'dim7',
  '0,5,7,10': '7sus4',
};

const QUALITY_TONE: Record<string, string> = {
  '0,4,7': 'major',
  '0,3,7': 'minor',
  '0,3,6': 'diminished',
  '0,4,8': 'augmented',
  '0,5,7': 'suspended',
  '0,2,7': 'suspended',
  '0,4,7,11': 'major seventh',
  '0,4,7,10': 'dominant seventh',
  '0,3,7,10': 'minor seventh',
  '0,3,6,10': 'half-diminished',
  '0,3,6,9': 'diminished seventh',
  '0,3,7,11': 'minor-major seventh',
  '0,4,7,10,14': 'dominant ninth',
  '0,3,7,10,14': 'minor ninth',
  '0,4,7,11,14': 'major ninth',
  '0,3,6,8': 'diminished seventh',
  '0,5,7,10': 'suspended seventh',
};

const ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/** Builds a diatonic chord by stacking scale thirds on a scale degree. */
export function chordForDegree(
  key: ResolvedKey,
  degree: number,
  options: { seventh?: boolean; ninth?: boolean } = {}
): ChordShape {
  const size = key.scale.length;
  const rootDegree = ((degree % size) + size) % size;
  const rootPc = (key.tonicPc + key.scale[rootDegree]) % 12;
  const intervals: number[] = [0];

  if (size >= 7) {
    const steps = options.ninth ? [2, 4, 6, 8] : options.seventh ? [2, 4, 6] : [2, 4];
    for (const step of steps) {
      const idx = rootDegree + step;
      const octaveShift = Math.floor(idx / size);
      const semitone =
        key.scale[((idx % size) + size) % size] + 12 * octaveShift - key.scale[rootDegree];
      intervals.push(((semitone % 12) + 12) % 12);
    }
  } else {
    // Pentatonic and blues scales have no diatonic thirds — use the mode's
    // character (minor vs. major) to choose a real triad.
    const minorish = !['ionian', 'lydian', 'mixolydian', 'major-pentatonic'].includes(
      key.modeId
    );
    intervals.push(minorish ? 3 : 4);
    intervals.push(7);
    if (options.seventh) intervals.push(minorish ? 10 : 11);
  }

  const unique = [...new Set(intervals)].sort((a, b) => a - b);
  const pcs = unique.map((interval) => (rootPc + interval) % 12);
  const qualityKey = unique.join(',');
  const suffix = QUALITY_SUFFIX[qualityKey] ?? '';
  const romanBase = ROMAN[(rootPc - key.tonicPc + 12) % 12];
  const minorishRoman = /^(m|dim|m7|m7b5|mMaj7|m9|dim7)/.test(suffix)
    ? romanBase.toLowerCase()
    : romanBase;
  const roman = `${minorishRoman}${suffix.includes('7') ? '7' : suffix === 'dim' ? '°' : suffix === 'aug' ? '+' : ''}`;

  return {
    degree: rootDegree,
    rootPc,
    intervals: unique,
    pcs,
    label: `${PITCH_NAMES[rootPc]}${suffix}`,
    roman,
    rootName: PITCH_NAMES[rootPc],
  };
}

export function chordToneName(chord: ChordShape): string {
  return QUALITY_TONE[chord.intervals.join(',')] ?? 'chord';
}

/* ── Groove parsing ─────────────────────────────────────────────── */

interface LaneHit {
  step: number;
  velocity: number;
}

export function parseLanePattern(pattern: string | undefined): LaneHit[] {
  if (!pattern) return [];
  const hits: LaneHit[] = [];
  const velocityFor = (char: string): number =>
    char === 'X' ? 1 : char === 'x' ? 0.82 : char === 'o' ? 0.6 : 0.3;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '.' || char === ' ') continue;
    if (!'Xxo-'.includes(char)) continue;
    hits.push({ step: i, velocity: velocityFor(char) });
  }
  return hits;
}

/* ── Titles and catalogue ───────────────────────────────────────── */

const TITLE_BANK: Record<GenreFamily, { open: string[]; close: string[] }> = {
  'hip-hop': {
    open: ['Concrete', 'Midnight', 'Pressure', 'Gold', 'Southside', 'Glass', 'Hollow', 'Corner', 'Neon', 'Iron'],
    close: ['Protocol', 'Season', 'Pressure', 'Chrome', 'Ritual', 'Weather', 'Hands', 'Math', 'Frequency', 'Code'],
  },
  electronic: {
    open: ['Signal', 'Afterhours', 'Circuit', 'Violet', 'Terminal', 'Static', 'Solar', 'Mirage', 'Orbit', 'Phase'],
    close: ['Transmission', 'Sequence', 'Loop', 'Current', 'Drift', 'Engine', 'Bloom', 'Pulse', 'Theory', 'Machine'],
  },
  pop: {
    open: ['Golden', 'Paper', 'Electric', 'Summer', 'Little', 'Bright', 'Sweet', 'Open', 'Silver', 'Better'],
    close: ['Hearts', 'Weather', 'Mornings', 'Fire', 'Signals', 'Story', 'Motion', 'Skyline', 'Promise', 'Chance'],
  },
  'rnb-soul': {
    open: ['Velvet', 'Slow', 'Honey', 'Midnight', 'Silk', 'Sunday', 'Amber', 'Soft', 'Brown', 'Late'],
    close: ['Room', 'Confession', 'Hours', 'Touch', 'Gospel', 'Ritual', 'Season', 'Letters', 'Vows', 'Storm'],
  },
  rock: {
    open: ['Broken', 'Electric', 'Wild', 'Empty', 'Static', 'Thunder', 'Paper', 'Black', 'Last', 'Riot'],
    close: ['Nerves', 'Highway', 'Ghosts', 'Walls', 'Weather', 'Youth', 'Signals', 'Machines', 'Saints', 'Fire'],
  },
  jazz: {
    open: ['Blue', 'Late', 'Autumn', 'Quiet', 'Uptown', 'Velvet', 'Sunday', 'Smoke', 'Minor', 'After'],
    close: ['Standards', 'Conversation', 'Room', 'Changes', 'Nocturne', 'Swing', 'Mood', 'Window', 'Letter', 'Hour'],
  },
  global: {
    open: ['Sunset', 'Lagos', 'Island', 'Golden', 'Mango', 'Night', 'Dust', 'Ocean', 'Moonlight', 'Market'],
    close: ['Motion', 'Fire', 'Season', 'Riddim', 'Story', 'Road', 'Sky', 'Dance', 'Weather', 'Song'],
  },
  'country-folk': {
    open: ['Dust', 'Porchlight', 'Fields', 'Old', 'Small', 'Tin', 'Honey', 'Long', 'Sunday', 'Backroad'],
    close: ['Roads', 'Songs', 'Weather', 'Promises', 'Home', 'Towns', 'Miles', 'Letters', 'Prayers', 'Trucks'],
  },
  cinematic: {
    open: ['Ashes', 'First', 'Distant', 'Northern', 'Silent', 'Last', 'Rising', 'Broken', 'Eternal', 'Winter'],
    close: ['Light', 'Horizon', 'Kingdom', 'Requiem', 'Tide', 'Monument', 'Sky', 'Anthem', 'Vigil', 'Descent'],
  },
};

export function titleFor(genre: GenreProfile, rng: Rng): string {
  const bank = TITLE_BANK[genre.family];
  const open = rng.pick(bank.open);
  const close = rng.pick(bank.close);
  const patterns = [
    `${open} ${close}`,
    `${open} ${close}`,
    `${open} ${close} (Reprise)`,
    `${open} ${close} Vol. ${rng.int(4) + 1}`,
    `${open} ${close} — ${rng.pick(['Night Cut', 'Daylight Mix', 'Interlude', 'Session'])}`,
  ];
  return rng.pick(patterns);
}

export interface CatalogOptions {
  genre: GenreProfile;
  count?: number;
  seedBase?: number;
}

/**
 * The on-demand catalogue: the same genre read through many different briefs.
 * Titles, tempos and keys are generated from the genre's own vocabulary, so a
 * catalogue never reads like a random list of words.
 */
export function buildCatalogEntries(
  genre: GenreProfile,
  count = 24,
  seedBase?: number
): CatalogEntry[] {
  const base = seedBase ?? hashSeed(genre.id);
  const entries: CatalogEntry[] = [];
  for (let index = 0; index < count; index++) {
    const seed = (base + index * 2654435761) >>> 0;
    const rng = createRng(seed);
    const key = resolveKey(genre, rng);
    const bpm = Math.round(rng.range(genre.bpm[0], genre.bpm[1]));
    const mood = rng.pick(genre.moods);
    const groove = grooveById(rng.pick(genre.grooveIds));
    const progressions = genre.progressionIds.filter((id) => PROGRESSION_BY_ID.has(id));
    const progression = progressionById(
      rng.pick(progressions.length ? progressions : genre.progressionIds)
    );
    const arrangement = arrangementById(genre.arrangementId);
    const totalBars = arrangement.slots.reduce((sum, slot) => sum + slot.bars, 0);
    const durationSeconds = Math.round((totalBars * 4 * 60) / bpm);
    entries.push({
      id: `${genre.id}-${index}`,
      genreId: genre.id,
      seed,
      variationIndex: index,
      title: titleFor(genre, rng),
      keyLabel: key.keyLabel,
      bpm,
      mood,
      hook: groove.name,
      durationSeconds,
      tags: [MOOD_LABELS[mood], `${progression.name}`, `${genre.bpm[0]}–${genre.bpm[1]} BPM`],
    });
  }
  return entries;
}

/* ── Request normalisation ──────────────────────────────────────── */

export interface NormalizedRequest {
  seed: number;
  motifSeed: number;
  variation: VariationMode;
  bpm: number;
  bars: number;
  complexity: number;
  energy: number;
  darkness: number;
  component: ComponentKind;
  title?: string;
  keyLabel?: string;
  mode: MoodId;
}

const COMPONENT_LAYER: Partial<Record<ComponentKind, LayerRole[]>> = {
  drums: ['drums'],
  kick: ['drums'],
  snare: ['drums'],
  hats: ['drums'],
  percussion: ['percussion'],
  bassline: ['bass', 'chords'],
  chords: ['chords'],
  melody: ['melody', 'chords'],
  'counter-melody': ['counter', 'chords'],
  arp: ['arp', 'chords'],
  loop: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp'],
  transition: ['drums', 'bass', 'fx'],
};

export function normalizeRequest(
  genre: GenreProfile,
  request: ComposeRequest,
  rng: Rng
): NormalizedRequest {
  let complexity = clamp(request.complexity ?? 0.55, 0, 1);
  let energy = clamp(request.energy ?? 0.6, 0, 1);
  const darkness = clamp(request.darkness ?? 0.5, 0, 1);
  const variation = request.variation ?? 'fresh';

  if (variation === 'simplify' || variation === 'strip') {
    complexity = clamp(complexity * 0.55, 0, 1);
    energy = clamp(energy * 0.9, 0, 1);
  }
  if (variation === 'intensify') {
    complexity = clamp(complexity + 0.18, 0, 1);
    energy = clamp(energy + 0.15, 0, 1);
  }

  const moodPool = genre.moods.length ? genre.moods : (['dark'] as MoodId[]);
  const mood =
    darkness > 0.62
      ? rng.pick(
          moodPool.filter((m) =>
            ['dark', 'aggressive', 'melancholic', 'cinematic', 'hypnotic'].includes(m)
          ).length
            ? moodPool.filter((m) =>
                ['dark', 'aggressive', 'melancholic', 'cinematic', 'hypnotic'].includes(m)
              )
            : moodPool
        )
      : rng.pick(moodPool);

  return {
    seed: (request.seed ?? randomSeed()) >>> 0,
    motifSeed: (request.motifSeed ?? (request.seed ?? randomSeed()) ^ 0x9e3779b9) >>> 0,
    variation,
    bpm: Math.round(
      clamp(request.bpm ?? rng.range(genre.bpm[0], genre.bpm[1]), 40, 220)
    ),
    bars: clamp(Math.round(request.bars ?? 8), 2, 64),
    complexity,
    energy,
    darkness,
    component: request.component ?? 'full-song',
    title: request.title,
    keyLabel: request.keyLabel,
    mode: mood,
  };
}

/* ── Section planning ───────────────────────────────────────────── */

function sectionLayers(
  role: SectionRole,
  base: LayerRole[],
  complexity: number,
  energy: number,
  component: ComponentKind
): LayerRole[] {
  const allowed = new Set<LayerRole>(base);
  if (component === 'loop') {
    ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'counter', 'arp'].forEach(
      (layer) => allowed.add(layer as LayerRole)
    );
  }
  if (complexity < 0.38) {
    allowed.delete('counter');
    allowed.delete('arp');
    if (energy < 0.5) allowed.delete('percussion');
  }
  if (complexity > 0.72 && ['hook', 'drop', 'post-hook', 'solo'].includes(role)) {
    allowed.add('counter');
    if (complexity > 0.82) allowed.add('arp');
  }
  return [...allowed];
}

function planSections(
  genre: GenreProfile,
  normalized: NormalizedRequest,
  progression: HarmonyTemplate,
  altProgression: HarmonyTemplate | null
): Array<{
  label: string;
  role: SectionRole;
  bars: number;
  energy: number;
  layers: LayerRole[];
  development: string;
  transition: string;
  progression: HarmonyTemplate;
}> {
  const component = normalized.component;
  const arrangement = arrangementById(genre.arrangementId);

  if (
    component === 'full-song' ||
    component === 'arrangement'
  ) {
    return arrangement.slots.map((slot, _index) => ({
      label: slot.label,
      role: slot.role,
      bars: slot.bars,
      energy: clamp(slot.energy * (0.85 + normalized.energy * 0.3), 0.1, 1),
      layers: sectionLayers(
        slot.role,
        slot.layers,
        normalized.complexity,
        slot.energy,
        component
      ),
      development: slot.development,
      transition: slot.transition,
      progression:
        altProgression && ['bridge', 'breakdown', 'interlude'].includes(slot.role)
          ? altProgression
          : progression,
    }));
  }

  if (component === 'transition') {
    return [
      {
        label: 'Transition',
        role: 'build',
        bars: 4,
        energy: 0.9,
        layers: ['drums', 'bass', 'fx'],
        development: 'Four bars of rising tension into the next section',
        transition: 'Cut on the downbeat',
        progression,
      },
    ];
  }

  const layerSet = COMPONENT_LAYER[component] ?? ['drums', 'bass', 'chords', 'melody'];
  const bars = component === 'loop' ? normalized.bars : Math.min(normalized.bars, 16);

  return [
    {
      label: component === 'loop' ? 'Loop' : 'Section',
      role: 'loop',
      bars,
      energy: 0.75,
      layers: layerSet,
      development:
        component === 'loop'
          ? 'Built to repeat; every element has a job'
          : 'Focused pass on the requested step',
      transition: '',
      progression,
    },
  ];
}

/* ── Part builders ──────────────────────────────────────────────── */

interface BuildContext {
  genre: GenreProfile;
  key: ResolvedKey;
  normalized: NormalizedRequest;
  rng: Rng;
  motifRng: Rng;
  sections: Array<{
    label: string;
    role: SectionRole;
    bars: number;
    energy: number;
    layers: LayerRole[];
    development: string;
    transition: string;
    progression: HarmonyTemplate;
    startBar: number;
  }>;
  title: string;
}

function chordAtBar(
  context: BuildContext,
  progression: HarmonyTemplate,
  bar: number
): ChordShape {
  const degrees = progression.degrees;
  const index = Math.floor(bar / Math.max(1, progression.barsPerChord)) % degrees.length;
  const seventh = Boolean(progression.sevenths) || context.normalized.complexity > 0.62;
  const ninth = Boolean(progression.ninths) && context.normalized.complexity > 0.55;
  return chordForDegree(context.key, degrees[index], { seventh, ninth });
}

function voiceChord(
  chord: ChordShape,
  octave: number,
  spread: 'close' | 'open' | 'power' | 'wide',
  rng: Rng
): number[] {
  const base = 12 * (octave + 1) + chord.rootPc;
  let intervals = [...chord.intervals];
  if (spread === 'power') {
    intervals = [0, 7, 12];
  }
  if (spread === 'open' && intervals.length >= 3) {
    intervals = [intervals[0], intervals[2], intervals[1] + 12, ...intervals.slice(3)];
  }
  if (spread === 'wide') {
    intervals = intervals.map((interval, index) => interval + (index >= 2 ? 12 : 0));
  }
  if (rng.chance(0.3) && intervals.length > 2) {
    // First inversion: lift the root an octave for a lighter top.
    intervals = [...intervals.slice(1), intervals[0] + 12];
  }
  return intervals.map((interval) => clamp(base + interval, 24, 100));
}

function spreadFor(genre: GenreProfile, complexity: number): 'close' | 'open' | 'power' | 'wide' {
  if (genre.family === 'rock' && complexity < 0.6) return 'power';
  if (genre.family === 'cinematic' || genre.id === 'ambient') return 'wide';
  if (genre.family === 'jazz' || genre.family === 'rnb-soul') return 'open';
  return 'close';
}

function compingRhythm(genre: GenreProfile, complexity: number): { steps: number[]; length: number } {
  switch (genre.family) {
    case 'jazz':
      return { steps: complexity > 0.55 ? [0, 3, 7, 10, 14] : [0, 4, 8, 12], length: 3 };
    case 'rnb-soul':
      return { steps: [0, 6, 10], length: 3 };
    case 'electronic':
      return { steps: [2, 6, 10, 14], length: 1 };
    case 'hip-hop':
      return complexity > 0.6 ? { steps: [0, 6, 11], length: 3 } : { steps: [0], length: 15 };
    case 'rock':
      return { steps: [0, 2, 4, 6, 8, 10, 12, 14], length: 2 };
    case 'global':
      return { steps: [0, 3, 6, 10, 12], length: 2 };
    case 'country-folk':
      return { steps: [0, 4, 8, 12], length: 3 };
    case 'cinematic':
      return { steps: [0], length: 15 };
    case 'pop':
    default:
      return { steps: [0, 4, 8, 12], length: 3 };
  }
}

function buildDrums(context: BuildContext): ComposerPart {
  const groove = grooveById(context.rng.pick(context.genre.grooveIds));
  const hits: DrumHit[] = [];
  const lanes = Object.entries(groove.lanes) as Array<[DrumLane, string]>;

  for (const section of context.sections) {
    if (!section.layers.includes('drums')) continue;
    const energyScale = 0.78 + section.energy * 0.22;
    for (let barOffset = 0; barOffset < section.bars; barOffset++) {
      const bar = section.startBar + barOffset;
      const isFillBar =
        context.normalized.complexity > 0.45 &&
        section.energy > 0.45 &&
        barOffset === section.bars - 1;
      for (const [lane, pattern] of lanes) {
        const laneHits = parseLanePattern(pattern);
        for (const hit of laneHits) {
          const hitBar = Math.floor(hit.step / 16);
          // A multi-bar groove applies each of its own bars in turn; without
          // this, bar one would be replayed on every bar of the pattern.
          if (hitBar !== barOffset % Math.max(1, groove.bars)) continue;
          const stepInBar = hit.step % 16;
          let velocity = clamp(hit.velocity * energyScale, 0.18, 1);
          if (lane === 'hat' || lane === 'shaker') {
            if (context.normalized.complexity < 0.4 && stepInBar % 2 === 1) continue;
            velocity *= 0.9;
          }
          if (lane === 'openhat' && section.energy < 0.55) continue;
          hits.push({ bar, step: stepInBar, lane, velocity: Number(velocity.toFixed(2)) });
        }
      }
      if (isFillBar) {
        hits.push({ bar, step: 13, lane: 'snare', velocity: 0.55 });
        hits.push({ bar, step: 14, lane: 'snare', velocity: 0.68 });
        hits.push({ bar, step: 15, lane: 'snare', velocity: 0.82 });
        if (context.normalized.complexity > 0.7) {
          hits.push({ bar, step: 14, lane: 'tom', velocity: 0.7 });
        }
      }
      if (barOffset === 0 && section.energy >= 0.82) {
        hits.push({ bar, step: 0, lane: 'crash', velocity: 0.7 });
      }
    }
  }

  const palette = context.genre.palette.drums;
  return {
    id: 'part-drums',
    role: 'drums',
    name: `Drums · ${groove.name}`,
    instrument: palette.label,
    instrumentId: palette.instrumentId,
    notes: [],
    hits: dedupeHits(hits),
    range: 'Kick / Snare / Hats',
    mixNote: ROLE_MIX.drums,
  };
}

function dedupeHits(hits: DrumHit[]): DrumHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.bar}-${hit.step}-${hit.lane}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPercussion(context: BuildContext): ComposerPart {
  const groove = grooveById(context.rng.pick(context.genre.grooveIds));
  const hits: DrumHit[] = [];
  const percLanes: DrumLane[] = ['perc', 'shaker', 'ride', 'rim'];
  for (const section of context.sections) {
    if (!section.layers.includes('percussion')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset++) {
      const bar = section.startBar + barOffset;
      for (const lane of percLanes) {
        const pattern = groove.lanes[lane];
        if (!pattern) continue;
        for (const hit of parseLanePattern(pattern)) {
          const hitBar = Math.floor(hit.step / 16);
          if (hitBar !== barOffset % groove.bars) continue;
          const step = hit.step % 16;
          if (context.normalized.complexity < 0.4 && step % 2 === 1) continue;
          hits.push({
            bar,
            step,
            lane,
            velocity: Number(clamp(hit.velocity * (0.7 + section.energy * 0.25), 0.2, 1).toFixed(2)),
          });
        }
      }
    }
  }
  const palette = context.genre.palette.perc;
  return {
    id: 'part-percussion',
    role: 'percussion',
    name: `Percussion · ${groove.name}`,
    instrument: palette?.label ?? 'Hand percussion',
    instrumentId: palette?.instrumentId,
    notes: [],
    hits: dedupeHits(hits),
    range: 'Shaker / Congas',
    mixNote: ROLE_MIX.percussion,
  };
}

function buildBass(context: BuildContext): ComposerPart {
  const style = bassStyleById(context.rng.pick(context.genre.bassStyleIds));
  const notes: ComposerNote[] = [];
  const baseOctave = context.normalized.darkness > 0.6 ? 1 : 2;

  for (const section of context.sections) {
    if (!section.layers.includes('bass')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset++) {
      const bar = section.startBar + barOffset;
      const chord = chordAtBar(context, section.progression, bar - section.startBar);
      const rhythm =
        section.role === 'hook' || section.role === 'drop'
          ? [...style.rhythm, ...(context.normalized.complexity > 0.7 ? [15] : [])]
          : style.rhythm;
      let previousPc = chord.rootPc;
      rhythm
        .filter((step) => step >= 0 && step < 16)
        .sort((a, b) => a - b)
        .forEach((step, index) => {
          let interval = 0;
          switch (style.approach) {
            case 'root-fifth':
              interval = index % 2 === 1 ? 7 : 0;
              break;
            case 'octave':
              interval = index % 2 === 1 ? 12 : 0;
              break;
            case 'walk': {
              const walkChoices = [0, chord.intervals[1] ?? 3, 7, 10];
              interval = walkChoices[index % walkChoices.length];
              break;
            }
            case 'slide':
              interval = index === 0 ? 0 : 12;
              break;
            case 'funk':
              interval = index % 3 === 2 ? 12 : index % 2 === 1 ? (chord.intervals[1] ?? 3) : 0;
              break;
            case 'melodic': {
              const choices = chord.pcs.map((pc) => (pc - chord.rootPc + 12) % 12);
              interval = choices[index % choices.length];
              break;
            }
            case 'drone':
            case 'root':
            default:
              interval = 0;
          }
          const pc = (chord.rootPc + interval) % 12;
          const midi = 12 * (baseOctave + 1) + pc;
          const length =
            style.approach === 'drone'
              ? Math.max(4, 16 - step - 1)
              : clamp(style.sustain ?? 2, 1, Math.max(1, 16 - step));
          const velocity = clamp(
            (index === 0 ? 0.95 : 0.78) * (0.85 + section.energy * 0.18),
            0.3,
            1
          );
          notes.push({
            bar,
            step,
            midi,
            length,
            velocity: Number(velocity.toFixed(2)),
            slide: Boolean(style.glide) && index > 0,
          });
          previousPc = pc;
        });
      if (style.approach === 'funk' && context.normalized.complexity > 0.65) {
        const ghostStep = 7 + (barOffset % 2);
        notes.push({
          bar,
          step: ghostStep,
          midi: 12 * (baseOctave + 1) + ((previousPc + 12) % 12),
          length: 1,
          velocity: 0.38,
        });
      }
    }
  }

  const palette = context.genre.palette.bass;
  return {
    id: 'part-bass',
    role: 'bass',
    name: `Bass · ${style.label}`,
    instrument: palette.label,
    instrumentId: palette.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.bass,
  };
}

function buildChords(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  const spread = spreadFor(context.genre, context.normalized.complexity);
  const comping = compingRhythm(context.genre, context.normalized.complexity);
  const baseOctave = context.genre.family === 'cinematic' ? 3 : 4;

  for (const section of context.sections) {
    if (!section.layers.includes('chords')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset++) {
      const bar = section.startBar + barOffset;
      const chord = chordAtBar(context, section.progression, bar - section.startBar);
      const steps = section.energy < 0.4 ? comping.steps.slice(0, 2) : comping.steps;
      const voicing = voiceChord(chord, baseOctave, spread, context.rng);
      const barLength = section.energy < 0.4 ? 8 : comping.length;
      steps.forEach((step, index) => {
        if (context.normalized.complexity < 0.35 && index > 0) return;
        voicing.forEach((midi) => {
          notes.push({
            bar,
            step,
            midi,
            length: clamp(barLength, 1, 16 - step),
            velocity: Number(
              clamp((step === 0 ? 0.82 : 0.66) * (0.85 + section.energy * 0.15), 0.25, 1).toFixed(2)
            ),
          });
        });
      });
    }
  }

  const palette = context.genre.palette.chords;
  return {
    id: 'part-chords',
    role: 'chords',
    name: `Chords · ${palette.label}`,
    instrument: palette.label,
    instrumentId: palette.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.chords,
  };
}

function buildPad(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  const palette = context.genre.palette.pad;
  for (const section of context.sections) {
    if (!section.layers.includes('pad')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset += 2) {
      const bar = section.startBar + barOffset;
      const chord = chordAtBar(context, section.progression, bar - section.startBar);
      const voicing = voiceChord(chord, 3, 'wide', context.rng);
      voicing.forEach((midi) => {
        notes.push({
          bar,
          step: 0,
          midi,
          length: Math.min(32, section.bars * 16 - barOffset * 16),
          velocity: 0.42,
        });
      });
    }
  }
  return {
    id: 'part-pad',
    role: 'pad',
    name: `Pad · ${palette?.label ?? 'Sustain'}`,
    instrument: palette?.label ?? 'Warm pad',
    instrumentId: palette?.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.pad,
  };
}

interface MotifNote {
  step: number;
  degree: number;
  length: number;
}

const RHYTHM_CELLS: Record<'sparse' | 'mid' | 'dense', number[][]> = {
  sparse: [
    [0, 6, 10],
    [0, 8, 12],
    [2, 6, 12],
    [0, 4, 10, 14],
  ],
  mid: [
    [0, 3, 6, 10],
    [0, 4, 7, 12],
    [0, 2, 6, 8, 12],
    [0, 4, 8, 10, 14],
  ],
  dense: [
    [0, 2, 4, 6, 8, 10, 12, 14],
    [0, 1, 3, 4, 6, 8, 10, 12, 14],
    [0, 2, 3, 6, 8, 11, 12, 14],
  ],
} as const;

function buildMotif(
  genre: GenreProfile,
  complexity: number,
  rng: Rng,
  scaleSize: number
): MotifNote[] {
  const density =
    complexity > 0.72 ? 'dense' : complexity < 0.4 ? 'sparse' : genre.melody.density;
  const cell = rng.pick(RHYTHM_CELLS[density]);
  const motif: MotifNote[] = [];
  let degree = 0;
  const contour = genre.melody.contour;
  const total = cell.length;

  cell.forEach((step, index) => {
    const position = index / Math.max(1, total - 1);
    let delta: number;
    if (contour === 'ascending') delta = rng.chance(0.75) ? 1 : 2;
    else if (contour === 'descending') delta = rng.chance(0.75) ? -1 : -2;
    else if (contour === 'arch') delta = position < 0.5 ? (rng.chance(0.6) ? 1 : 2) : rng.chance(0.6) ? -1 : -2;
    else if (contour === 'static') delta = rng.chance(0.7) ? 0 : rng.chance(0.5) ? 1 : -1;
    else delta = rng.chance(0.5) ? 1 : rng.chance(0.5) ? -1 : 2;
    degree = clamp(degree + delta, 0, scaleSize - 1);
    motif.push({
      step,
      degree,
      length: genre.melody.noteLength === 'long' ? 3 : genre.melody.noteLength === 'short' ? 1 : 2,
    });
  });

  // A two-bar phrase: answer the first bar with a varied second bar.
  const secondBar = cell.map((step, index) => ({
    step: step + 16,
    degree: clamp(
      motif[index].degree + (index === cell.length - 1 ? -1 : rng.chance(0.4) ? 1 : 0),
      0,
      scaleSize - 1
    ),
    length: motif[index].length,
  }));
  return [...motif, ...secondBar];
}

function snapToChord(pcs: number[], midi: number): number {
  if (pcs.includes(((midi % 12) + 12) % 12)) return midi;
  for (let distance = 1; distance <= 6; distance++) {
    for (const direction of [-1, 1]) {
      const candidate = midi + distance * direction;
      if (pcs.includes(((candidate % 12) + 12) % 12)) return candidate;
    }
  }
  return midi;
}

function buildMelody(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  const motif = buildMotif(
    context.genre,
    context.normalized.complexity,
    context.motifRng,
    context.key.scale.length
  );
  const baseOctave = context.genre.melody.register === 'high' ? 5 : context.genre.melody.register === 'low' ? 3 : 4;

  for (const section of context.sections) {
    if (!section.layers.includes('melody')) continue;
    const sectionBars = section.bars;
    for (
      let blockStart = 0;
      blockStart < sectionBars;
      blockStart += 2
    ) {
      const isHook = section.role === 'hook' || section.role === 'drop';
      const octave = clamp(baseOctave + (isHook && context.normalized.energy > 0.7 ? 1 : 0), 2, 6);
      for (const note of motif) {
        const barOffset = blockStart + Math.floor(note.step / 16);
        if (barOffset >= sectionBars) continue;
        const bar = section.startBar + barOffset;
        const step = note.step % 16;
        const chord = chordAtBar(context, section.progression, barOffset);
        let midi = scaleMidi(context.key, note.degree, octave);
        const strong = step === 0 || step === 8;
        if (strong) midi = snapToChord(chord.pcs, midi);
        if (midi > 88) midi -= 12;
        if (midi < 48) midi += 12;
        notes.push({
          bar,
          step,
          midi,
          length: clamp(note.length, 1, 4),
          velocity: Number(
            clamp((strong ? 0.86 : 0.7) * (0.85 + section.energy * 0.15), 0.3, 1).toFixed(2)
          ),
        });
      }
    }
  }

  const palette = context.genre.palette.lead;
  return {
    id: 'part-melody',
    role: 'melody',
    name: `Melody · ${palette.label}`,
    instrument: palette.label,
    instrumentId: palette.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.melody,
  };
}

function buildCounter(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  for (const section of context.sections) {
    if (!section.layers.includes('counter')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset += 2) {
      const bar = section.startBar + barOffset;
      const chord = chordAtBar(context, section.progression, barOffset);
      const voice = [
        chord.rootPc,
        (chord.rootPc + (chord.intervals[2] ?? 7)) % 12,
        (chord.rootPc + (chord.intervals[1] ?? 3)) % 12,
      ];
      for (let index = 0; index < voice.length; index++) {
        notes.push({
          bar,
          step: index === 0 ? 0 : 8,
          midi: 12 * 4 + voice[index] + 12,
          length: index === 0 ? 6 : 5,
          velocity: 0.52,
        });
      }
    }
  }
  const palette = context.genre.palette.counter ?? context.genre.palette.pad;
  return {
    id: 'part-counter',
    role: 'counter',
    name: `Counter · ${palette?.label ?? 'Second voice'}`,
    instrument: palette?.label ?? 'Second voice',
    instrumentId: palette?.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.counter,
  };
}

function buildArp(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  const stepSize = context.normalized.complexity > 0.6 ? 1 : 2;
  for (const section of context.sections) {
    if (!section.layers.includes('arp')) continue;
    for (let barOffset = 0; barOffset < section.bars; barOffset++) {
      const bar = section.startBar + barOffset;
      const chord = chordAtBar(context, section.progression, barOffset);
      const voicing = voiceChord(chord, 5, 'close', context.rng);
      let noteIndex = 0;
      for (let step = 0; step < 16; step += stepSize) {
        const midi = voicing[noteIndex % voicing.length];
        notes.push({
          bar,
          step,
          midi,
          length: stepSize,
          velocity: 0.5,
        });
        noteIndex++;
      }
    }
  }
  return {
    id: 'part-arp',
    role: 'arp',
    name: `Arpeggio · ${context.genre.palette.lead.label}`,
    instrument: context.genre.palette.lead.label,
    instrumentId: context.genre.palette.lead.instrumentId,
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.arp,
  };
}

function buildTransition(context: BuildContext): ComposerPart {
  const notes: ComposerNote[] = [];
  const bars = context.sections[0]?.bars ?? 4;
  const degrees = context.key.scale.length;
  for (let barOffset = 0; barOffset < bars; barOffset++) {
    const bar = context.sections[0].startBar + barOffset;
    const density = 2 + barOffset;
    for (let index = 0; index < density; index++) {
      const degree = Math.floor((index / density) * degrees * (barOffset + 1));
      notes.push({
        bar,
        step: Math.min(15, Math.floor((index / density) * 16)),
        midi: scaleMidi(context.key, degree, 5),
        length: 1,
        velocity: 0.4 + index * 0.03,
      });
    }
  }
  const finalBar = (context.sections[0]?.startBar ?? 0) + bars - 1;
  const chord = chordForDegree(context.key, 0, { seventh: true });
  voiceChord(chord, 4, 'open', context.rng).forEach((midi) => {
    notes.push({ bar: finalBar, step: 12, midi, length: 4, velocity: 0.9 });
  });
  return {
    id: 'part-fx',
    role: 'fx',
    name: 'Transition · Riser',
    instrument: 'Riser / FX',
    notes,
    hits: [],
    range: midiRange(notes),
    mixNote: ROLE_MIX.fx,
  };
}

function midiRange(notes: ComposerNote[]): string {
  if (!notes.length) return '—';
  const values = notes.map((note) => note.midi);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const name = (midi: number) => `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return `${name(min)}–${name(max)}`;
}

/* ── Composition assembly ───────────────────────────────────────── */

const COMPONENT_LABELS: Record<ComponentKind, string> = {
  'full-song': 'Complete song',
  arrangement: 'Arrangement blueprint',
  drums: 'Drum pattern',
  kick: 'Kick / 808 pattern',
  snare: 'Snare / clap pattern',
  hats: 'Hi-hat pattern',
  percussion: 'Percussion layer',
  bassline: 'Bassline',
  chords: 'Chord progression',
  melody: 'Melody / hook',
  'counter-melody': 'Counter-melody',
  arp: 'Arpeggio',
  loop: 'Loop kit',
  transition: 'Transition / fill',
};

const COMPONENT_PARTS: Record<ComponentKind, PartRole[]> = {
  'full-song': ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'counter', 'arp'],
  arrangement: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'counter', 'arp'],
  drums: ['drums'],
  kick: ['kick'],
  snare: ['snare'],
  hats: ['hats'],
  percussion: ['percussion'],
  bassline: ['bass', 'chords'],
  chords: ['chords'],
  melody: ['melody', 'chords'],
  'counter-melody': ['counter', 'chords'],
  arp: ['arp', 'chords'],
  loop: ['drums', 'percussion', 'bass', 'chords', 'pad', 'melody', 'arp'],
  transition: ['fx', 'drums'],
};

function filterDrumsForComponent(
  part: ComposerPart,
  component: ComponentKind
): ComposerPart | null {
  if (component === 'drums' || component === 'full-song' || component === 'arrangement' || component === 'loop' || component === 'transition') {
    return part;
  }
  const lanes: Partial<Record<ComponentKind, DrumLane[]>> = {
    kick: ['kick'],
    snare: ['snare', 'clap', 'rim'],
    hats: ['hat', 'openhat'],
  };
  const allowed = lanes[component];
  if (!allowed) return null;
  const hits = part.hits.filter((hit) => allowed.includes(hit.lane));
  return {
    ...part,
    id: `part-${component}`,
    role: component as PartRole,
    name: `${component === 'kick' ? 'Kick / 808' : component === 'snare' ? 'Snare / Clap' : 'Hi-Hats'} · ${part.name.split('·')[1]?.trim() ?? ''}`,
    hits,
    range: allowed.map((lane) => DRUM_LANE_LABEL[lane]).join(' / '),
    mixNote: ROLE_MIX[component as PartRole] ?? ROLE_MIX.drums,
  };
}

export function composeWithGenre(
  genre: GenreProfile,
  request: ComposeRequest
): Composition {
  const rng = createRng(request.seed ?? randomSeed());
  const normalized = normalizeRequest(genre, request, rng);
  const key = resolveKey(genre, rng, normalized.keyLabel);

  const progressionIds = genre.progressionIds.filter((id) => PROGRESSION_BY_ID.has(id));
  const pool = progressionIds.length ? progressionIds : ['minor-epic'];
  // The seeded draw picks the cycle, so two seeds on the same brief do not
  // automatically return the same harmony.
  const progression = progressionById(rng.pick(pool));
  const altProgression =
    pool.length > 1
      ? progressionById(pool.find((id) => id !== progression.id) ?? pool[0])
      : null;

  const planned = planSections(genre, normalized, progression, altProgression);
  let cursor = 0;
  const sections = planned.map((section) => {
    const startBar = cursor;
    cursor += section.bars;
    return { ...section, startBar };
  });

  const context: BuildContext = {
    genre,
    key,
    normalized,
    rng,
    motifRng: createRng(normalized.motifSeed),
    sections,
    title: normalized.title ?? titleFor(genre, rng),
  };

  const drums = buildDrums(context);
  const percussion = buildPercussion(context);
  const bass = buildBass(context);
  const chords = buildChords(context);
  const pad = buildPad(context);
  const melody = buildMelody(context);
  const counter = buildCounter(context);
  const arp = buildArp(context);
  const transition = normalized.component === 'transition' ? buildTransition(context) : null;

  const allParts = [drums, percussion, bass, chords, pad, melody, counter, arp].filter(
    (part) => part.notes.length + part.hits.length > 0
  );

  let parts: ComposerPart[];
  if (normalized.component === 'transition') {
    parts = [transition, drums].filter(Boolean) as ComposerPart[];
  } else if (normalized.component === 'drums' || normalized.component === 'kick' || normalized.component === 'snare' || normalized.component === 'hats') {
    const filtered = filterDrumsForComponent(drums, normalized.component);
    parts = filtered ? [filtered] : [];
  } else {
    const requested = COMPONENT_PARTS[normalized.component];
    parts = allParts
      .filter((part) => requested.includes(part.role))
      .map((part) => {
        const isReference =
          normalized.component !== 'full-song' &&
          normalized.component !== 'arrangement' &&
          normalized.component !== 'loop' &&
          part.role === 'chords' &&
          requested[0] !== 'chords';
        return isReference ? { ...part, reference: true, mixNote: 'Reference harmony — muted by default when loading to Studio.' } : part;
      });
  }

  const totalBars = sections.reduce((sum, section) => sum + section.bars, 0);
  const durationSeconds = Math.round((totalBars * 4 * 60) / normalized.bpm);
  const title = normalized.title ?? context.title;

  const sectionSummaries: ComposerSection[] = sections.map((section) => {
    const chordLabels: string[] = [];
    const degrees = section.progression.degrees;
    for (let barOffset = 0; barOffset < Math.min(section.bars, 8); barOffset += Math.max(1, section.progression.barsPerChord)) {
      const index = Math.floor(barOffset / Math.max(1, section.progression.barsPerChord)) % degrees.length;
      const chord = chordForDegree(key, degrees[index], {
        seventh: Boolean(section.progression.sevenths) || normalized.complexity > 0.62,
      });
      if (!chordLabels.includes(chord.label)) chordLabels.push(chord.label);
    }
    return {
      id: `section-${section.startBar}`,
      label: section.label,
      role: section.role,
      startBar: section.startBar,
      bars: section.bars,
      energy: Number(section.energy.toFixed(2)),
      layers: section.layers,
      development: section.development,
      transition: section.transition,
      chords: chordLabels.join(' → '),
    };
  });

  const groove = grooveById(genre.grooveIds[0]);
  const usedGrooveName = drums.name.split('·')[1]?.trim() ?? groove.name;
  const arrangement = ARRANGEMENT_BY_ID.get(genre.arrangementId);
  const complexityWord =
    normalized.complexity > 0.72 ? 'dense' : normalized.complexity < 0.4 ? 'lean' : 'balanced';

  const theory = buildTheory({
    genre,
    key,
    normalized,
    progression,
    grooveName: usedGrooveName,
    sections: sectionSummaries,
    totalBars,
    durationSeconds,
    parts,
  });

  const rationale = buildRationale({
    genre,
    key,
    normalized,
    progression,
    sections: sectionSummaries,
    parts,
    arrangementName: arrangement?.name ?? 'Free form',
  });

  const productionNotes = [
    ...genre.mixNotes,
    `Write with intent: ${complexityWord} arrangement, ${Math.round(normalized.energy * 100)}% energy, ${Math.round(normalized.darkness * 100)}% dark.`,
    ...genre.productionTricks.slice(0, 2),
    'The score is 16th-note resolution; swing lives on the grid setting, not on the notes.',
  ];

  const marketNote = `${genre.market.lane}. ${genre.market.trendRead} Hook device: ${genre.market.hookDevice}.`;

  const moodLabel = MOOD_LABELS[normalized.mode];
  const personaLine = buildPersonaLine(title, genre, key, normalized, moodLabel);

  const tags = [
    genre.label,
    FAMILY_LABELS[genre.family],
    `${normalized.bpm} BPM`,
    key.keyLabel,
    moodLabel,
    COMPONENT_LABELS[normalized.component],
  ];

  return {
    id: `${genre.id}-${normalized.seed.toString(36)}-${normalized.component}`,
    seed: normalized.seed,
    motifSeed: normalized.motifSeed,
    variation: normalized.variation,
    createdAt: Date.now(),
    title,
    genreId: genre.id,
    genreLabel: genre.label,
    family: genre.family,
    keyLabel: key.keyLabel,
    modeLabel: key.modeLabel,
    scaleLabel: key.modeLabel,
    bpm: normalized.bpm,
    swing: Math.round(clamp(genre.swing, 0, 1) * 100),
    mood: normalized.mode,
    complexity: normalized.complexity,
    energy: normalized.energy,
    darkness: normalized.darkness,
    component: normalized.component,
    componentLabel: COMPONENT_LABELS[normalized.component],
    totalBars,
    durationSeconds,
    sections: sectionSummaries,
    parts,
    progressionLabel: `${progression.name}${altProgression ? ' / ' + altProgression.name + ' in the bridge' : ''}`,
    grooveName: usedGrooveName,
    arrangementName: arrangement?.name ?? 'Free form',
    theory,
    rationale,
    productionNotes,
    marketNote,
    marketTags: [genre.market.lane, genre.market.syncLane],
    studyNotes: genre.study,
    vocalDirection: genre.vocalDirection,
    tags,
    personaLine,
    deliveryNote:
      'This is a written score — notes, lengths, velocities and drum hits. Load it into the Studio to hear it on real instruments, then edit anything you disagree with.',
  };
}

function buildTheory(input: {
  genre: GenreProfile;
  key: ResolvedKey;
  normalized: NormalizedRequest;
  progression: HarmonyTemplate;
  grooveName: string;
  sections: ComposerSection[];
  totalBars: number;
  durationSeconds: number;
  parts: ComposerPart[];
}): string[] {
  const { genre, key, normalized, progression, grooveName, sections, totalBars, durationSeconds, parts } =
    input;
  const scaleNotes = key.scale
    .map((semi) => PITCH_NAMES[(key.tonicPc + semi) % 12])
    .join(', ');
  const degrees = progression.degrees
    .slice(0, 8)
    .map((degree) =>
      chordForDegree(key, degree, {
        seventh: Boolean(progression.sevenths) || normalized.complexity > 0.62,
      })
    );
  const chordLabels = degrees.map((chord) => chord.label).join(' – ');
  const noteCount = parts.reduce((sum, part) => sum + part.notes.length + part.hits.length, 0);
  const melody = parts.find((part) => part.role === 'melody');
  const bass = parts.find((part) => part.role === 'bass');

  return [
    `Key: ${key.keyLabel} — ${scaleNotes}.`,
    `Harmony: ${progression.name}, ${chordLabels}. ${progression.feel.charAt(0).toUpperCase()}${progression.feel.slice(1)}.`,
    `Groove: ${grooveName} at ${normalized.bpm} BPM with ${Math.round(genre.swing * 100)}% swing.`,
    `Form: ${totalBars} bars, ${formatDuration(durationSeconds)} — ${sections
      .map((section) => `${section.label} (${section.bars})`)
      .join(' → ')}.`,
    melody
      ? `Melody: ${melody.notes.length} notes, ${melody.range}; chord tones on the strong beats, stepwise motion between them, motif repeated with a varied answer.`
      : `Melody: not part of this pass — the harmonic and rhythmic frame is the deliverable.`,
    bass
      ? `Bass: ${bass.notes.length} notes, ${bass.range}; ${bassStyleLabel(genre)}.`
      : `Bass: not part of this pass.`,
    `Total: ${noteCount} musical events across ${parts.length} parts.`,
  ];
}

function bassStyleLabel(genre: GenreProfile): string {
  const style = bassStyleById(genre.bassStyleIds[0]);
  return style.description;
}

function buildRationale(input: {
  genre: GenreProfile;
  key: ResolvedKey;
  normalized: NormalizedRequest;
  progression: HarmonyTemplate;
  sections: ComposerSection[];
  parts: ComposerPart[];
  arrangementName: string;
}): string[] {
  const { genre, key, normalized, progression, sections, parts, arrangementName: _arrangementName } = input;
  const hooks = sections.filter((section) => section.role === 'hook' || section.role === 'drop');
  const intro = sections[0];
  const bridge = sections.find((section) =>
    ['bridge', 'breakdown'].includes(section.role)
  );
  const lines = [
    `${normalized.bpm} BPM sits inside ${genre.label}'s working range (${genre.bpm[0]}–${genre.bpm[1]}), so the groove reads as the genre before a single vocal arrives.`,
    `${progression.name} in ${key.keyLabel} gives the record its emotional address: ${progression.feel}.`,
    hooks.length
      ? `${hooks.length} full ${hooks.length === 1 ? 'statement' : 'statements'} of the hook, each with more layers than the last — the arrangement does the lifting instead of the master bus.`
      : `No hook section in this pass; the deliverable is the ${normalized.component.replace('-', ' ')} itself.`,
    intro
      ? `The intro opens with ${intro.layers.join(', ')} — the listener hears the identity before the drums commit.`
      : '',
    bridge
      ? `The bridge strips back to ${bridge.layers.join(', ')}; that subtraction is what makes the final return feel bigger.`
      : '',
    normalized.complexity > 0.72
      ? 'High complexity: counter-lines and arpeggios are written in, so the mix needs frequency separation or it will crowd.'
      : normalized.complexity < 0.4
        ? 'Lean complexity: only the essential parts exist. Space is doing the production work.'
        : 'Balanced complexity: enough parts to hold attention without crowding the vocal.',
    parts.some((part) => part.role === 'counter')
      ? 'The counter-melody avoids the lead’s onsets; two lines, two jobs.'
      : '',
  ];
  return lines.filter(Boolean);
}

function buildPersonaLine(
  title: string,
  genre: GenreProfile,
  key: ResolvedKey,
  normalized: NormalizedRequest,
  moodLabel: string
): string {
  const confidence = normalized.complexity > 0.7 ? 'Nothing here is filler' : 'Every part earns its place';
  return `“${title}.” ${normalized.bpm} BPM in ${key.keyLabel}, ${moodLabel.toLowerCase()} and built for ${genre.label}. ${confidence} — take it into the Studio and prove it.`;
}

export function variationRequest(
  composition: Composition,
  mode: VariationMode
): ComposeRequest {
  const keepMotif = mode === 'variation' || mode === 'evolve' || mode === 'reharmonize';
  return {
    genreId: composition.genreId,
    component: composition.component,
    seed: randomSeed(),
    motifSeed: keepMotif ? composition.motifSeed : undefined,
    variation: mode,
    bpm: composition.bpm,
    keyLabel: composition.keyLabel,
    complexity: composition.complexity,
    energy: composition.energy,
    darkness: composition.darkness,
    title: composition.title,
    bars: Math.min(composition.totalBars, 16),
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function formatBars(bars: number): string {
  return `${bars} bar${bars === 1 ? '' : 's'}`;
}

export function componentLabel(kind: ComponentKind): string {
  return COMPONENT_LABELS[kind] ?? kind;
}

export function genreGrooveName(genre: GenreProfile): string {
  return GROOVE_BY_ID.get(genre.grooveIds[0])?.name ?? 'Custom groove';
}

export function bassStyleName(genre: GenreProfile): string {
  return BASS_STYLE_BY_ID.get(genre.bassStyleIds[0])?.label ?? 'Root bass';
}

export function modePoolFor(genre: GenreProfile): string[] {
  return genre.modes.map((mode) => MODE_LABELS[mode]);
}

/** A short, human-readable summary used by chat and notifications. */
export function summarizeComposition(composition: Composition): string {
  return `${composition.title} — ${composition.genreLabel}, ${composition.bpm} BPM, ${composition.keyLabel}. ${composition.totalBars} bars / ${formatDuration(composition.durationSeconds)}. ${composition.parts.length} parts.`;
}


