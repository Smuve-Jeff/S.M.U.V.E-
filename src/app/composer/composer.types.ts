/**
 * S.M.U.V.E. 2.0 — Composition Core type model.
 *
 * These types describe music as data: a genre atlas entry (the taste and the
 * rules), the seed-driven request (the artist's decision), and the finished
 * composition (sections, parts, notes, and the reasoning behind every one).
 * Nothing here touches the DOM or Angular, so the engine is pure and testable.
 */

export type GenreFamily =
  | 'hip-hop'
  | 'electronic'
  | 'pop'
  | 'rnb-soul'
  | 'rock'
  | 'jazz'
  | 'global'
  | 'country-folk'
  | 'cinematic';

export type ModeId =
  | 'ionian'
  | 'aeolian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'harmonic-minor'
  | 'phrygian-dominant'
  | 'major-pentatonic'
  | 'minor-pentatonic'
  | 'blues'
  | 'whole-tone';

export type MoodId =
  | 'dark'
  | 'bright'
  | 'nostalgic'
  | 'aggressive'
  | 'romantic'
  | 'hypnotic'
  | 'triumphant'
  | 'melancholic'
  | 'playful'
  | 'luxurious'
  | 'spiritual'
  | 'cinematic';

export type DrumLane =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'rim'
  | 'hat'
  | 'openhat'
  | 'ride'
  | 'perc'
  | 'shaker'
  | 'tom'
  | 'crash';

/** A layer is what the artist hears in a section. */
export type LayerRole =
  | 'drums'
  | 'percussion'
  | 'bass'
  | 'chords'
  | 'pad'
  | 'melody'
  | 'counter'
  | 'arp'
  | 'fx'
  | 'vocal-hook';

/** A part is what lands on the studio's track sheet. */
export type PartRole =
  | 'drums'
  | 'kick'
  | 'snare'
  | 'hats'
  | 'percussion'
  | 'bass'
  | 'chords'
  | 'pad'
  | 'melody'
  | 'counter'
  | 'arp'
  | 'fx';

export type SectionRole =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'hook'
  | 'post-hook'
  | 'bridge'
  | 'breakdown'
  | 'build'
  | 'drop'
  | 'solo'
  | 'interlude'
  | 'loop'
  | 'outro';

/** The exact step the artist asked S.M.U.V.E. to take. */
export type ComponentKind =
  | 'full-song'
  | 'arrangement'
  | 'drums'
  | 'kick'
  | 'snare'
  | 'hats'
  | 'percussion'
  | 'bassline'
  | 'chords'
  | 'melody'
  | 'counter-melody'
  | 'arp'
  | 'loop'
  | 'transition';

export type VariationMode =
  | 'fresh'
  | 'variation'
  | 'evolve'
  | 'simplify'
  | 'intensify'
  | 'reharmonize'
  | 'strip';

/* ── Atlas vocabulary ───────────────────────────────────────────── */

/**
 * Groove patterns are written as bar strings: one character per 16th note.
 * `X` accent · `x` hit · `o` soft · `-` ghost · `.` rest.
 * A string longer than 16 characters spans several bars.
 */
export interface GrooveTemplate {
  id: string;
  name: string;
  bars: number;
  swing?: number;
  description: string;
  lanes: Partial<Record<DrumLane, string>>;
}

export interface HarmonyTemplate {
  id: string;
  name: string;
  /** 0-based scale degrees, e.g. [0, 5, 3, 4] = i–VI–iv–v in minor. */
  degrees: number[];
  /** Stack the seventh on every chord. */
  sevenths?: boolean;
  /** Use ninth colour where the mode supports it. */
  ninths?: boolean;
  /** One chord per this many bars. */
  barsPerChord: number;
  feel: string;
}

export interface BassStyle {
  id: string;
  label: string;
  /** 16th-note onsets inside one bar. */
  rhythm: number[];
  approach:
    | 'root'
    | 'root-fifth'
    | 'octave'
    | 'walk'
    | 'slide'
    | 'drone'
    | 'funk'
    | 'melodic';
  glide?: boolean;
  /** Note length in 16ths for sustained styles. */
  sustain?: number;
  description: string;
}

export interface MelodyTraits {
  density: 'sparse' | 'mid' | 'dense';
  register: 'low' | 'mid' | 'high';
  noteLength: 'short' | 'mixed' | 'long';
  contour: 'arch' | 'descending' | 'ascending' | 'wave' | 'static';
  devices: string[];
}

export interface PaletteSlot {
  label: string;
  /** A real Studio instrument id when one exists. */
  instrumentId?: string;
}

export interface GenrePalette {
  drums: PaletteSlot;
  bass: PaletteSlot;
  chords: PaletteSlot;
  lead: PaletteSlot;
  pad?: PaletteSlot;
  perc?: PaletteSlot;
  counter?: PaletteSlot;
}

export interface GenreMarket {
  /** Playlist / release lane the record actually lives in. */
  lane: string;
  listener: string;
  /** The two-bar idea that makes the record travel. */
  hookDevice: string;
  syncLane: string;
  /** A producer's read of where the sound sits right now. */
  trendRead: string;
}

export interface ArrangementSlot {
  role: SectionRole;
  label: string;
  bars: number;
  /** Relative energy 0–1 that drives which layers survive. */
  energy: number;
  layers: LayerRole[];
  development: string;
  transition: string;
}

export interface ArrangementTemplate {
  id: string;
  name: string;
  description: string;
  slots: ArrangementSlot[];
}

export interface GenreProfile {
  id: string;
  label: string;
  family: GenreFamily;
  aliases: string[];
  tagline: string;
  bpm: [number, number];
  swing: number;
  moods: MoodId[];
  keys: string[];
  modes: ModeId[];
  progressionIds: string[];
  grooveIds: string[];
  bassStyleIds: string[];
  melody: MelodyTraits;
  palette: GenrePalette;
  arrangementId: string;
  mixNotes: string[];
  productionTricks: string[];
  study: string[];
  market: GenreMarket;
  vocalDirection: string;
  /** Per-step coaching, the human answer to "what should I do here?". */
  componentAdvice: Partial<Record<ComponentKind, string>>;
  tags: string[];
}

/* ── Generation ─────────────────────────────────────────────────── */

export interface ComposeRequest {
  genreId: string;
  component: ComponentKind;
  seed?: number;
  variation?: VariationMode;
  /** Bars for loop / single-step requests. */
  bars?: number;
  bpm?: number;
  /** 0–1: how much harmonic and rhythmic information S.M.U.V.E. writes. */
  complexity: number;
  /** 0–1: how hard the arrangement pushes. */
  energy: number;
  /** 0–1: minor modes, low registers, dissonance and space. */
  darkness: number;
  title?: string;
  /** Keep the pitch centre when the artist already has a key. */
  keyLabel?: string;
  /** Carry a motif between variations. */
  motifSeed?: number;
}

export interface ComposerNote {
  /** Absolute bar from the top of the composition. */
  bar: number;
  /** 16th-note step inside the bar (0–15). */
  step: number;
  midi: number;
  /** Length in 16ths. */
  length: number;
  velocity: number;
  slide?: boolean;
}

export interface DrumHit {
  bar: number;
  step: number;
  lane: DrumLane;
  velocity: number;
}

export interface ComposerPart {
  id: string;
  role: PartRole;
  name: string;
  instrument: string;
  instrumentId?: string;
  notes: ComposerNote[];
  hits: DrumHit[];
  /** Human-readable register, e.g. "E1–G3". */
  range: string;
  mixNote: string;
  /** Context the artist did not ask for, shown but never sent as a deliverable. */
  reference?: boolean;
}

export interface ComposerSection {
  id: string;
  label: string;
  role: SectionRole;
  startBar: number;
  bars: number;
  energy: number;
  layers: LayerRole[];
  development: string;
  transition: string;
  chords: string;
}

export interface Composition {
  id: string;
  seed: number;
  motifSeed: number;
  variation: VariationMode;
  createdAt: number;
  title: string;
  genreId: string;
  genreLabel: string;
  family: GenreFamily;
  keyLabel: string;
  modeLabel: string;
  scaleLabel: string;
  bpm: number;
  swing: number;
  mood: MoodId;
  complexity: number;
  energy: number;
  darkness: number;
  component: ComponentKind;
  componentLabel: string;
  totalBars: number;
  durationSeconds: number;
  sections: ComposerSection[];
  parts: ComposerPart[];
  progressionLabel: string;
  grooveName: string;
  arrangementName: string;
  theory: string[];
  rationale: string[];
  productionNotes: string[];
  marketNote: string;
  marketTags: string[];
  studyNotes: string[];
  vocalDirection: string;
  tags: string[];
  personaLine: string;
  /** Honest disclaimer: a composition is a score, not rendered audio. */
  deliveryNote: string;
}

/** A ready-to-browse card in the on-demand catalogue. */
export interface CatalogEntry {
  id: string;
  genreId: string;
  seed: number;
  variationIndex: number;
  title: string;
  keyLabel: string;
  bpm: number;
  mood: MoodId;
  hook: string;
  durationSeconds: number;
  tags: string[];
}

export interface SavedComposition {
  id: string;
  title: string;
  genreId: string;
  seed: number;
  motifSeed: number;
  component: ComponentKind;
  bpm: number;
  keyLabel: string;
  complexity: number;
  energy: number;
  darkness: number;
  savedAt: number;
}

export interface ComponentOption {
  id: ComponentKind;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}

/* ── Gate ───────────────────────────────────────────────────────── */

export interface ComposerBlocker {
  id: string;
  label: string;
  detail: string;
  fixRoute: string;
  fixLabel: string;
}

export interface ComposerPersonalization {
  artistName: string;
  genre: string;
  subgenres: string[];
  influences: string[];
  tempoHint: [number, number] | null;
  declaredKeys: string[];
  vocalRange: string;
  signatureSound: string;
  grooveNote: string;
  harmonyNote: string;
  arrangementNote: string;
  experience: string;
}

export interface ComposerGate {
  ready: boolean;
  genreLabel: string;
  genre: GenreProfile | null;
  blockers: ComposerBlocker[];
  personalization: ComposerPersonalization;
  /** Comma-separated genres the profile currently allows generation for. */
  allowedGenres: string[];
}
