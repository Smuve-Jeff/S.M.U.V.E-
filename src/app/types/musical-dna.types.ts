/**
 * S.M.U.V.E. Musical DNA — pure model layer.
 *
 * The app already collects a *declared* fingerprint (the `musical-dna`
 * questionnaire phase) and S.M.U.V.E. already *acts* on the artist's data
 * (mixing, beats, strategy). What was missing is the loop between the two:
 *
 *   read      → reconcile what the artist says with what the artist does
 *   learn     → keep every new signal, newest first
 *   remember  → persist the state so it survives devices (see
 *               `MusicalDnaService`, which stores it on the UserProfile)
 *   teach     → turn the weakest reading into a concrete next lesson
 *   adapt     → hand every AI surface a fingerprint it must honour
 *
 * This module is intentionally dependency-free (it only type-imports
 * `UserProfile`) so the whole model is unit-testable without Angular and so
 * `profile.types.ts` can call `buildMusicalDnaContext` without creating a
 * runtime import cycle with the service layer.
 */

import type { UserProfile } from './profile.types';

/** The eight axes S.M.U.V.E. fingerprints an artist on. */
export type DnaDimensionId =
  | 'rhythm'
  | 'harmony'
  | 'melody'
  | 'sonics'
  | 'writing'
  | 'arrangement'
  | 'production'
  | 'audience';

/** Where a piece of DNA evidence came from. */
export type DnaEvidenceSource =
  | 'questionnaire' // declared answers (blueprint / journey)
  | 'catalog' // released or registered works
  | 'settings' // studio, audio and DJ preferences
  | 'expertise' // self-assessed skill levels
  | 'decision' // accepted vs dismissed recommendation history
  | 'behaviour'; // live in-app actions recorded by the engine

export interface DnaEvidence {
  id: string;
  dimension: DnaDimensionId;
  source: DnaEvidenceSource;
  summary: string;
  /** 0..1 — how strongly this signal pins the dimension down. */
  weight: number;
  observedAt: number;
}

/**
 * How declared intent and evidenced reality reconcile. This is the heart of
 * "accurately read": the gap is a finding, not an error.
 */
export type DnaPosture = 'aligned' | 'instinct-led' | 'vision-led' | 'unread';

export interface DnaDimensionReading {
  id: DnaDimensionId;
  label: string;
  /** Depth of the artist's *stated* intent for this axis (0..100). */
  declared: number;
  /** Depth implied by works, settings, decisions and behaviour (0..100). */
  observed: number;
  /** How far S.M.U.V.E. trusts the two numbers above (0..100). */
  confidence: number;
  posture: DnaPosture;
  /** One line reconciling declared vs observed. */
  trait: string;
  evidenceCount: number;
  /** Human-readable signals behind the reading — nothing is a black box. */
  evidence: string[];
}

export interface DnaDrift {
  dimension: DnaDimensionId;
  label: string;
  declared: number;
  observed: number;
  /** Absolute gap, always >= 18 (below that the axes are treated as aligned). */
  gap: number;
  message: string;
}

export interface DnaLesson {
  dimension: DnaDimensionId;
  /** `KnowledgeCategory` on SmuveKnowledgeEngine, kept as a string here so this
   *  module stays free of service imports. */
  category: string;
  title: string;
  reason: string;
  /** Concrete thing to do next; the service resolves a knowledge entry. */
  action: string;
}

export interface DnaAdaptation {
  id: string;
  dimension: DnaDimensionId;
  /** info = context only, coach = push the artist, protect = defend a rule. */
  severity: 'info' | 'coach' | 'protect';
  directive: string;
  rationale: string;
}

export interface MusicalDnaReading {
  version: number;
  updatedAt: number;
  dimensions: DnaDimensionReading[];
  /** Compact fingerprint, e.g. `Rhythm instinct-led · Sonics aligned`. */
  signature: string;
  strengths: DnaDimensionId[];
  gaps: DnaDimensionId[];
  drift: DnaDrift[];
  adaptations: DnaAdaptation[];
  /** 0..100 — how complete and self-consistent the fingerprint is. */
  fidelity: number;
}

export interface MusicalDnaState {
  version: number;
  updatedAt: number;
  /** Recency-weighted behaviour log, capped at {@link DNA_EVENT_CAP}. */
  events: DnaEvidence[];
  /** Last computed reading so surfaces can render without recomputing. */
  lastReading?: MusicalDnaReading;
}

export const DNA_VERSION = 1;
export const DNA_EVENT_CAP = 160;
/** Half-life, in days, for how fast old behaviour stops mattering. */
export const DNA_HALF_LIFE_DAYS = 30;

/** A live signal the engine can learn from, contributed by any surface. */
export interface DnaEvidenceInput {
  dimension: DnaDimensionId;
  source?: DnaEvidenceSource;
  summary: string;
  weight?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension specs
// ─────────────────────────────────────────────────────────────────────────────

interface DeclaredField {
  value: unknown;
  /** 1 = core evidence for this axis, 0.5 = supporting evidence. */
  weight: number;
  label: string;
}

interface ObservedSignal {
  label: string;
  /** 0..1 contribution towards a fully evidenced axis. */
  weight: number;
}

interface DimensionSpec {
  id: DnaDimensionId;
  label: string;
  declared: (profile: UserProfile) => DeclaredField[];
  observed: (profile: UserProfile) => ObservedSignal[];
  /** Posture blurbs, keyed by posture. */
  trait: Record<DnaPosture, string>;
}

const isPresent = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some((v) => isPresent(v));
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return String(value).trim() !== '';
};

/** Reads a loosely-typed nested path off the profile without `any` leakage. */
const at = (source: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      source,
    );

const field = (profile: UserProfile, path: string, label: string, weight = 1): DeclaredField => ({
  value: at(profile, path),
  weight,
  label,
});

/** How many registered works carry a usable numeric tempo. */
const catalogBpms = (profile: UserProfile): number[] =>
  (profile.catalog ?? [])
    .map((item) => Number(item?.bpm))
    .filter((bpm) => Number.isFinite(bpm) && bpm > 0);

const catalogKeys = (profile: UserProfile): string[] =>
  (profile.catalog ?? [])
    .map((item) => String(item?.key ?? '').trim())
    .filter(Boolean);

const DIMENSION_SPECS: DimensionSpec[] = [
  {
    id: 'rhythm',
    label: 'Rhythm & Groove',
    declared: (p) => [
      field(p, 'musicalJourney.musicBlueprint.rhythmicFeel', 'Stated rhythmic feel'),
      field(p, 'musicalJourney.preferredBpmRange', 'Declared tempo zone', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const bpms = catalogBpms(p);
      if (bpms.length >= 2) {
        const span = Math.max(...bpms) - Math.min(...bpms);
        signals.push({
          label: `${bpms.length} catalog works spanning ${Math.round(span)} BPM`,
          weight: Math.min(0.45, 0.15 + bpms.length * 0.05),
        });
      } else if (bpms.length === 1) {
        signals.push({ label: 'Single catalog tempo on record', weight: 0.1 });
      }
      const quantize = String(at(p, 'settings.studio.defaultQuantize') ?? '');
      if (quantize && quantize !== '1/16') {
        signals.push({ label: `Grid set to ${quantize}`, weight: 0.25 });
      }
      const curve = String(at(p, 'settings.dj.crossfaderCurve') ?? '');
      if (curve && curve !== 'power') {
        signals.push({ label: `DJ crossfader curve: ${curve}`, weight: 0.2 });
      }
      if (at(p, 'settings.dj.vinylMode') === true) {
        signals.push({ label: 'Vinyl mode engaged', weight: 0.15 });
      }
      return signals;
    },
    trait: {
      aligned: 'The groove you describe is the groove on record.',
      'instinct-led': 'Your records move faster than your words — S.M.U.V.E. mirrors the tempo data before adding feel.',
      'vision-led': 'The groove is stated but not yet on record; S.M.U.V.E. converts it into clock and grid choices.',
      unread: 'No groove evidence yet — S.M.U.V.E. will ask rather than assume a pocket.',
    },
  },
  {
    id: 'harmony',
    label: 'Harmony & Tonality',
    declared: (p) => [
      field(p, 'musicalJourney.musicBlueprint.harmonicLanguage', 'Stated harmonic language'),
      field(p, 'musicalJourney.subgenres', 'Subgenres', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const keys = catalogKeys(p);
      if (keys.length >= 3) {
        const unique = new Set(keys.map((k) => k.toLowerCase())).size;
        signals.push({
          label: `${unique} distinct keys across ${keys.length} works`,
          weight: Math.min(0.5, 0.2 + unique * 0.06),
        });
      } else if (keys.length > 0) {
        signals.push({ label: `${keys.length} work(s) with a logged key`, weight: 0.15 });
      }
      if (isPresent(at(p, 'musicalJourney.musicalInfluences'))) {
        signals.push({ label: 'Named harmonic influences', weight: 0.2 });
      }
      return signals;
    },
    trait: {
      aligned: 'Harmonic intent and the written catalogue agree.',
      'instinct-led': 'Your key choices outrun the stated theory — S.M.U.V.E. names the pattern instead of forcing a doctrine.',
      'vision-led': 'A harmonic direction is declared without written evidence; S.M.U.V.E. turns it into progressions to test.',
      unread: 'Tonality is unread — S.M.U.V.E. will propose, then listen to what you keep.',
    },
  },
  {
    id: 'melody',
    label: 'Melody & Vocals',
    declared: (p) => [
      field(p, 'musicalJourney.musicBlueprint.vocalDelivery', 'Stated vocal/instrument delivery'),
      field(p, 'musicalJourney.vocalRange', 'Declared vocal range', 0.5),
      field(p, 'musicalJourney.musicBlueprint.recognitionCue', 'Recognition cue', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      if (isPresent(at(p, 'musicalJourney.signatureSound'))) {
        signals.push({ label: 'Signature sound defined', weight: 0.3 });
      }
      if (isPresent(at(p, 'artistName')) && (p.catalog ?? []).length > 0) {
        signals.push({
          label: `${(p.catalog ?? []).length} work(s) carrying the melody in public`,
          weight: 0.3,
        });
      }
      const expertise = at(p, 'expertise.performance');
      if (typeof expertise === 'number' && expertise > 0) {
        signals.push({ label: `Self-rated performance ${expertise}/100`, weight: 0.25 });
      }
      return signals;
    },
    trait: {
      aligned: 'Delivery is described and demonstrated.',
      'instinct-led': 'The voice on the records leads the description; S.M.U.V.E. extracts hooks from the work itself.',
      'vision-led': 'The delivery is a plan, not yet a take — S.M.U.V.E. will keep the range honest while you record.',
      unread: 'Melody is unread — S.M.U.V.E. will not invent a vocal identity for you.',
    },
  },
  {
    id: 'sonics',
    label: 'Sonic Signature',
    declared: (p) => [
      field(p, 'musicalJourney.signatureSound', 'Signature sound', 0.5),
      field(p, 'musicalJourney.musicBlueprint.sonicNonNegotiables', 'Non-negotiables', 0.5),
      field(p, 'musicalJourney.musicBlueprint.referenceTracks', 'Reference tracks'),
      field(p, 'musicalJourney.signatureGear', 'Signature gear', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const sampleRate = at(p, 'settings.audio.sampleRate');
      if (typeof sampleRate === 'number' && sampleRate > 0) {
        signals.push({ label: `Session rate ${sampleRate} Hz`, weight: 0.15 });
      }
      if (at(p, 'settings.studio.highFidelityExport') === true) {
        signals.push({ label: 'High-fidelity export armed', weight: 0.2 });
      }
      if (isPresent(at(p, 'equipment'))) {
        signals.push({ label: 'Gear inventory claimed', weight: 0.25 });
      }
      if (isPresent(at(p, 'settings.studio.smartSheet'))) {
        signals.push({ label: 'Smart Creation Sheet recall in use', weight: 0.2 });
      }
      return signals;
    },
    trait: {
      aligned: 'The sound you describe matches the rig and export path.',
      'instinct-led': 'Tone is coming from the rig and settings, not the brief — S.M.U.V.E. protects what the sessions already prove.',
      'vision-led': 'The signature is declared ahead of the setup; S.M.U.V.E. will align the chain to the brief.',
      unread: 'Sonics are unread — S.M.U.V.E. will ask before touching your tone.',
    },
  },
  {
    id: 'writing',
    label: 'Songwriting',
    declared: (p) => [
      field(p, 'musicalJourney.songwritingStyle', 'Songwriting style'),
      field(p, 'musicalJourney.songwritingProcess', 'Writing process', 0.5),
      field(p, 'musicalJourney.musicBlueprint.lyricalThemes', 'Lyrical themes'),
      field(p, 'musicalJourney.musicBlueprint.signatureTension', 'Signature tension', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const works = p.catalog ?? [];
      if (works.length > 0) {
        signals.push({ label: `${works.length} work(s) in the catalogue`, weight: 0.25 });
      }
      const forms = new Set(
        works
          .map((item) => String(item?.releaseType ?? '').trim())
          .filter(Boolean),
      );
      if (forms.size >= 2) {
        signals.push({ label: `${forms.size} release formats practised`, weight: 0.25 });
      }
      if (isPresent(p.brandVoices)) {
        signals.push({ label: 'Brand voices defined', weight: 0.2 });
      }
      if (isPresent(at(p, 'musicalJourney.musicBlueprint.livedWorldDetails'))) {
        signals.push({ label: 'Specific lived-world detail captured', weight: 0.25 });
      }
      return signals;
    },
    trait: {
      aligned: 'Your writing intent and your released body of work line up.',
      'instinct-led': 'The catalogue is ahead of the stated process — S.M.U.V.E. reverse-engineers your own method back to you.',
      'vision-led': 'The writing identity is declared without finished work behind it; S.M.U.V.E. will push for a first document.',
      unread: 'Writing is unread — S.M.U.V.E. will start from what you already wrote, not a template.',
    },
  },
  {
    id: 'arrangement',
    label: 'Arrangement',
    declared: (p) => [
      field(p, 'musicalJourney.musicBlueprint.arrangementApproach', 'Stated arrangement approach'),
      field(p, 'musicalJourney.musicBlueprint.collaborationBoundaries', 'Collaboration boundaries', 0.5),
      field(p, 'musicalJourney.musicBlueprint.artisticIntent', 'Artistic intent', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const durations = (p.catalog ?? [])
        .map((item) => Number(item?.duration))
        .filter((d) => Number.isFinite(d) && d > 0);
      if (durations.length >= 3) {
        signals.push({ label: `${durations.length} works with logged run-times`, weight: 0.35 });
      }
      if (isPresent(at(p, 'musicalJourney.visualAesthetic'))) {
        signals.push({ label: 'Visual/structural aesthetic defined', weight: 0.2 });
      }
      if (isPresent(at(p, 'musicalJourney.ultimateVision'))) {
        signals.push({ label: 'Long-form vision on record', weight: 0.25 });
      }
      return signals;
    },
    trait: {
      aligned: 'Structure on record matches the structure you describe.',
      'instinct-led': 'Your arrangements already have a shape — S.M.U.V.E. reads the run-times, not the theory.',
      'vision-led': 'The plan for structure is stated; S.M.U.V.E. will turn it into section maps.',
      unread: 'Arrangement is unread — S.M.U.V.E. will build structure from your existing material.',
    },
  },
  {
    id: 'production',
    label: 'Production Craft',
    declared: (p) => [
      field(p, 'musicalJourney.productionPhilosophy', 'Production philosophy'),
      field(p, 'musicalJourney.musicBlueprint.mixingPriorities', 'Mix priorities', 0.5),
      field(p, 'musicalJourney.musicBlueprint.recordingPriorities', 'Recording priorities', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const self = at(p, 'expertise.production');
      if (typeof self === 'number' && self > 0) {
        signals.push({ label: `Self-rated production ${self}/100`, weight: 0.3 });
      }
      const technical = at(p, 'expertise.technical_mastery');
      if (typeof technical === 'number' && technical > 0) {
        signals.push({ label: `Technical mastery ${technical}/100`, weight: 0.2 });
      }
      if (at(p, 'settings.studio.autoMixEnabled') === true) {
        signals.push({ label: 'Auto-mix is currently enabled', weight: 0.2 });
      }
      if (isPresent(p.daw)) {
        signals.push({ label: 'DAW environment declared', weight: 0.2 });
      }
      return signals;
    },
    trait: {
      aligned: 'Your craft claims are backed by how you actually work.',
      'instinct-led': 'The work is ahead of the philosophy — S.M.U.V.E. will name the technique you are already using.',
      'vision-led': 'The craft ambition is stated ahead of the evidence; S.M.U.V.E. will assign reps, not theory.',
      unread: 'Craft is unread — S.M.U.V.E. will start at gain staging and listen.',
    },
  },
  {
    id: 'audience',
    label: 'Audience & Reach',
    declared: (p) => [
      field(p, 'musicalJourney.musicBlueprint.audienceProfile', 'Audience profile'),
      field(p, 'musicalJourney.marketPosition', 'Market position', 0.5),
      field(p, 'musicalJourney.incomeStreams', 'Income streams', 0.5),
    ],
    observed: (p) => {
      const signals: ObservedSignal[] = [];
      const works = p.catalog ?? [];
      if (works.length > 0) {
        signals.push({ label: `${works.length} released/registered work(s)`, weight: 0.3 });
      }
      const marketing = at(p, 'expertise.marketing');
      if (typeof marketing === 'number' && marketing > 0) {
        signals.push({ label: `Self-rated marketing ${marketing}/100`, weight: 0.25 });
      }
      if (isPresent(p.careerGoals)) {
        signals.push({ label: 'Career goals set', weight: 0.2 });
      }
      if ((p.recommendationHistory ?? []).length > 0) {
        signals.push({
          label: `${(p.recommendationHistory ?? []).length} S.M.U.V.E. recommendation decision(s) logged`,
          weight: 0.2,
        });
      }
      return signals;
    },
    trait: {
      aligned: 'Reach is described and already in motion.',
      'instinct-led': 'You are shipping to people before you have defined them — S.M.U.V.E. will read the works and name the actual audience.',
      'vision-led': 'The audience is a hypothesis; S.M.U.V.E. will convert it into tests you can run this week.',
      unread: 'Audience is unread — S.M.U.V.E. will not guess who listens.',
    },
  },
];

export const DNA_DIMENSION_SPECS = DIMENSION_SPECS;

export const DNA_DIMENSION_LABELS: Record<DnaDimensionId, string> = DIMENSION_SPECS.reduce(
  (acc, spec) => {
    acc[spec.id] = spec.label;
    return acc;
  },
  {} as Record<DnaDimensionId, string>,
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const clamp100 = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Recency weight for a behaviour event. Newest evidence counts fully; the
 * influence halves every {@link DNA_HALF_LIFE_DAYS}. This is what lets the
 * fingerprint move when an artist's habits change.
 */
export function dnaRecencyWeight(observedAt: number, now = Date.now()): number {
  const ageDays = Math.max(0, (now - observedAt) / 86_400_000);
  return Math.pow(0.5, ageDays / DNA_HALF_LIFE_DAYS);
}

/** Behaviour evidence is capped per axis so one busy day cannot dominate. */
const BEHAVIOUR_CAP = 0.6;

export function createInitialMusicalDnaState(now = Date.now()): MusicalDnaState {
  return { version: DNA_VERSION, updatedAt: now, events: [] };
}

/**
 * Pure append: returns a new state with the evidence recorded and the log
 * trimmed to {@link DNA_EVENT_CAP}. Used by the service to persist learning
 * without ever mutating the caller's object.
 */
export function recordDnaEvidence(
  state: MusicalDnaState | undefined,
  input: DnaEvidenceInput,
  now = Date.now(),
): MusicalDnaState {
  const base = state ?? createInitialMusicalDnaState(now);
  const event: DnaEvidence = {
    id: uid(),
    dimension: input.dimension,
    source: input.source ?? 'behaviour',
    summary: String(input.summary ?? '').trim() || 'Unlabelled signal',
    weight: Math.max(0, Math.min(1, input.weight ?? 0.25)),
    observedAt: now,
  };
  const events = [...base.events, event].slice(-DNA_EVENT_CAP);
  return { ...base, version: DNA_VERSION, updatedAt: now, events };
}

/** Declared depth for one axis, weighted so core fields outweigh supporting ones. */
function declaredDepth(profile: UserProfile, spec: DimensionSpec): { score: number; labels: string[] } {
  const fields = spec.declared(profile);
  const max = fields.reduce((total, f) => total + f.weight, 0);
  if (max <= 0) return { score: 0, labels: [] };
  let earned = 0;
  const labels: string[] = [];
  for (const f of fields) {
    if (isPresent(f.value)) {
      earned += f.weight;
      labels.push(f.label);
    }
  }
  return { score: clamp100((earned / max) * 100), labels };
}

/** Evidenced depth for one axis, including recency-weighted live behaviour. */
function observedDepth(
  profile: UserProfile,
  spec: DimensionSpec,
  state: MusicalDnaState | undefined,
  now: number,
): { score: number; labels: string[]; count: number } {
  const signals = spec.observed(profile);
  const labels = signals.map((s) => s.label);
  let total = signals.reduce((sum, s) => sum + s.weight, 0);
  let count = signals.length;

  const events = (state?.events ?? []).filter((e) => e.dimension === spec.id);
  if (events.length > 0) {
    const behaviour = events.reduce((sum, e) => sum + e.weight * dnaRecencyWeight(e.observedAt, now), 0);
    total += Math.min(BEHAVIOUR_CAP, behaviour);
    count += events.length;
    const newest = events[events.length - 1];
    labels.push(`Live signal: ${newest.summary}`);
  }

  return { score: clamp100(Math.min(1, total) * 100), labels, count };
}

function postureFor(declared: number, observed: number, count: number): DnaPosture {
  if (declared === 0 && observed === 0 && count === 0) return 'unread';
  if (observed - declared >= 18) return 'instinct-led';
  if (declared - observed >= 18) return 'vision-led';
  return 'aligned';
}

/**
 * Confidence blends how much evidence exists with how well the artist's
 * words and reality agree. Agreement is only meaningful when both sides
 * exist, so a one-sided reading is capped rather than inflated.
 */
function confidenceFor(declared: number, observed: number, count: number, posture: DnaPosture): number {
  if (posture === 'unread') return 0;
  const volume = Math.min(100, 18 + count * 14);
  const oneSided = declared === 0 || observed === 0;
  const agreement = oneSided ? 35 : 100 - Math.abs(declared - observed);
  const blended = 0.5 * volume + 0.5 * agreement;
  return clamp100(oneSided ? Math.min(blended, 45) : blended);
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptation rules
// ─────────────────────────────────────────────────────────────────────────────

const GAP_COACH: Record<DnaDimensionId, { title: string; directive: string; category: string }> = {
  rhythm: {
    title: 'Lock the pocket',
    directive: 'Ask what the groove should do to the body before generating any drum or bass part.',
    category: 'Production',
  },
  harmony: {
    title: 'Define the tonal rules',
    directive: 'Offer two chord vocabularies drawn from the artist\'s influences and let them keep one.',
    category: 'Songwriting',
  },
  melody: {
    title: 'Capture the delivery',
    directive: 'Record a reference hum or take before producing around the melody.',
    category: 'Vocal',
  },
  sonics: {
    title: 'Pin the tone',
    directive: 'Ask for one reference track and one non-negotiable about the sound before touching the chain.',
    category: 'Production',
  },
  writing: {
    title: 'Get words on the page',
    directive: 'Push a single hook plus verse draft instead of discussing a writing identity.',
    category: 'Songwriting',
  },
  arrangement: {
    title: 'Map the sections',
    directive: 'Turn the stated intent into a section map with named energy changes.',
    category: 'Songwriting',
  },
  production: {
    title: 'Assign production reps',
    directive: 'Give one concrete mixing rep on the artist\'s current project and review the result.',
    category: 'Production',
  },
  audience: {
    title: 'Turn reach into a test',
    directive: 'Convert the audience hypothesis into one measurable release or content experiment this week.',
    category: 'Marketing',
  },
};

function buildAdaptations(
  profile: UserProfile,
  readings: DnaDimensionReading[],
  drift: DnaDrift[],
): DnaAdaptation[] {
  const adaptations: DnaAdaptation[] = [];
  const byId = new Map(readings.map((r) => [r.id, r]));

  for (const d of drift) {
    const reading = byId.get(d.dimension);
    if (!reading) continue;
    adaptations.push({
      id: `drift-${d.dimension}`,
      dimension: d.dimension,
      severity: 'info',
      directive:
        reading.posture === 'instinct-led'
          ? `Trust the evidence over the brief on ${d.label}: read the works first, then reconcile the words.`
          : `Convert the stated ${d.label.toLowerCase()} into a concrete decision before producing.`,
      rationale: `Declared ${d.declared} vs observed ${d.observed} (gap ${d.gap}).`,
    });
  }

  // Gap coaching — the three least-trusted axes.
  const weakest = readings
    .filter((r) => r.confidence < 70)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 3);
  for (const reading of weakest) {
    const coach = GAP_COACH[reading.id];
    adaptations.push({
      id: `coach-${reading.id}`,
      dimension: reading.id,
      severity: 'coach',
      directive: coach.directive,
      rationale:
        reading.posture === 'unread'
          ? `${reading.label} has no evidence yet — ask, do not assume.`
          : `${reading.label} confidence is ${reading.confidence}/100.`,
    });
  }

  // Protected rules — only fire when the profile actually contradicts itself.
  const nonNegotiables = at(profile, 'musicalJourney.musicBlueprint.sonicNonNegotiables');
  if (isPresent(nonNegotiables) && at(profile, 'settings.studio.autoMixEnabled') === true) {
    adaptations.push({
      id: 'protect-sonic-non-negotiables',
      dimension: 'sonics',
      severity: 'protect',
      directive:
        'Auto-mix stays a draft: it must not overwrite the artist\'s declared sonic non-negotiables, and every auto decision is reviewable.',
      rationale: 'The artist declared non-negotiable sonic rules while auto-mix is enabled.',
    });
  }

  const selfProduction = at(profile, 'expertise.production');
  if (typeof selfProduction === 'number' && selfProduction >= 60 && at(profile, 'settings.studio.autoMixEnabled') === true) {
    adaptations.push({
      id: 'protect-production-authority',
      dimension: 'production',
      severity: 'protect',
      directive:
        'Treat auto-mix as a reference pass, not the final word — this artist rates their own production highly.',
      rationale: `Self-rated production is ${selfProduction}/100 with auto-mix enabled.`,
    });
  }

  const rhythmicFeel = at(profile, 'musicalJourney.musicBlueprint.rhythmicFeel');
  if (isPresent(rhythmicFeel) && String(at(profile, 'settings.studio.defaultQuantize') ?? '') === '1/16') {
    adaptations.push({
      id: 'protect-grid-vs-feel',
      dimension: 'rhythm',
      severity: 'coach',
      directive: 'Audition a swing or 1/8 grid against the stated groove before locking the shipped 1/16 grid.',
      rationale: 'A specific groove is declared while the grid is still on the shipped default.',
    });
  }

  return adaptations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconciles declared intent with evidenced reality across every axis and
 * derives the fingerprint, drift, strengths, gaps and adaptation directives.
 */
export function readMusicalDna(
  profile: UserProfile | null | undefined,
  state?: MusicalDnaState,
  now = Date.now(),
): MusicalDnaReading {
  if (!profile) {
    return {
      version: DNA_VERSION,
      updatedAt: now,
      dimensions: [],
      signature: 'No artist profile loaded.',
      strengths: [],
      gaps: [],
      drift: [],
      adaptations: [],
      fidelity: 0,
    };
  }

  const dimensions: DnaDimensionReading[] = DIMENSION_SPECS.map((spec) => {
    const declared = declaredDepth(profile, spec);
    const observed = observedDepth(profile, spec, state, now);
    const posture = postureFor(declared.score, observed.score, observed.count);
    const confidence = confidenceFor(declared.score, observed.score, observed.count, posture);
    const evidence = [...declared.labels.map((l) => `Declared: ${l}`), ...observed.labels];
    return {
      id: spec.id,
      label: spec.label,
      declared: declared.score,
      observed: observed.score,
      confidence,
      posture,
      trait: spec.trait[posture],
      evidenceCount: evidence.length,
      evidence,
    };
  });

  const drift: DnaDrift[] = dimensions
    .filter((d) => d.posture !== 'unread' && d.declared > 0 && d.observed > 0)
    .map((d) => ({
      dimension: d.id,
      label: d.label,
      declared: d.declared,
      observed: d.observed,
      gap: Math.abs(d.declared - d.observed),
    }))
    .filter((d) => d.gap >= 18)
    .sort((a, b) => b.gap - a.gap)
    .map((d) => ({
      ...d,
      message:
        d.observed > d.declared
          ? `${d.label}: the work runs ${d.gap} points ahead of the stated intent.`
          : `${d.label}: intent runs ${d.gap} points ahead of the evidence.`,
    }));

  const strengths = dimensions
    .filter((d) => d.posture !== 'unread' && d.confidence >= 60)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((d) => d.id);

  const gaps = dimensions
    .filter((d) => !strengths.includes(d.id))
    .sort((a, b) => a.confidence - b.confidence || b.declared + b.observed - (a.declared + a.observed))
    .slice(0, 3)
    .map((d) => d.id);

  const signatureParts = dimensions
    .filter((d) => d.posture !== 'unread' && d.posture !== 'aligned')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((d) => `${d.label} ${d.posture}`);
  const alignedCount = dimensions.filter((d) => d.posture === 'aligned').length;
  if (signatureParts.length === 0 && alignedCount > 0) {
    signatureParts.push(`${alignedCount} axes aligned`);
  }
  const signature = signatureParts.length > 0 ? signatureParts.join(' · ') : 'Fingerprint still forming.';

  const adaptations = buildAdaptations(profile, dimensions, drift);

  const readAxes = dimensions.filter((d) => d.posture !== 'unread');
  const meanConfidence = readAxes.length
    ? readAxes.reduce((sum, d) => sum + d.confidence, 0) / readAxes.length
    : 0;
  const coverage = (readAxes.length / dimensions.length) * 100;
  const fidelity = clamp100(0.7 * meanConfidence + 0.3 * coverage);

  return {
    version: DNA_VERSION,
    updatedAt: now,
    dimensions,
    signature,
    strengths,
    gaps,
    drift,
    adaptations,
    fidelity,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Teaching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turns the least-trusted axes into a short, ordered lesson plan. The service
 * enriches each lesson with a real SMUVE knowledge entry so the "action" is
 * the app's own curriculum rather than invented advice.
 */
export function dnaLessonPlan(reading: MusicalDnaReading): DnaLesson[] {
  const byId = new Map(reading.dimensions.map((d) => [d.id, d]));
  const ordered = [...reading.gaps, ...reading.drift.map((d) => d.dimension)];
  const seen = new Set<DnaDimensionId>();
  const lessons: DnaLesson[] = [];

  for (const id of ordered) {
    if (seen.has(id)) continue;
    const axisReading = byId.get(id);
    if (!axisReading) continue;
    seen.add(id);
    const coach = GAP_COACH[id];
    lessons.push({
      dimension: id,
      category: coach.category,
      title: coach.title,
      reason:
        axisReading.posture === 'unread'
          ? `${axisReading.label} has no evidence yet, so S.M.U.V.E. teaches from first principles here.`
          : `${axisReading.label} is the weakest reading at ${axisReading.confidence}/100 confidence.`,
      action: coach.directive,
    });
  }

  return lessons.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact fingerprint block appended to every AI surface's artist context.
 * Kept short: it rides along with {@link buildArtistMusicContext} on each
 * prompt, so it states only what changes the model's behaviour.
 */
export function buildMusicalDnaContext(profile: UserProfile | null | undefined): string {
  if (!profile) return '';
  // Always recompute: the profile is the source of truth and the reading is
  // cheap, so a prompt can never quote a stale fingerprint.
  const reading = readMusicalDna(profile, profile.musicalDna);
  if (!reading.dimensions.length) return '';

  const byId = new Map(reading.dimensions.map((d) => [d.id, d]));
  const axis = (id: DnaDimensionId): string => {
    const d = byId.get(id);
    if (!d) return `${id}: unread`;
    if (d.posture === 'unread') return `${d.label}: unread — ask, do not assume`;
    // Cite the strongest evidence so the model can reason about the reading
    // instead of treating it as an unexplained verdict.
    const why = d.evidence.slice(0, 2).join('; ');
    const base = `${d.label}: ${d.posture} (declared ${d.declared} / observed ${d.observed}, ${d.confidence}% confidence)`;
    return why ? `${base} — evidence: ${why}` : base;
  };

  const lines = [
    `MUSICAL DNA (fidelity ${reading.fidelity}/100) — adapt to this, never override it silently:`,
    reading.signature,
    axis('rhythm'),
    axis('harmony'),
    axis('melody'),
    axis('sonics'),
    axis('writing'),
    axis('arrangement'),
    axis('production'),
    axis('audience'),
  ];

  const protects = reading.adaptations.filter((a) => a.severity === 'protect');
  for (const p of protects) lines.push(`NON-NEGOTIABLE (${p.dimension}): ${p.directive}`);

  if (reading.drift.length) {
    lines.push(`DRIFT TO RAISE: ${reading.drift.slice(0, 2).map((d) => d.message).join(' ')}`);
  }

  return lines.join('\n');
}

/** Lessons in the shape the prompt uses. Kept here so both AI surfaces agree. */
export function buildMusicalDnaTeachingContext(profile: UserProfile | null | undefined): string {
  if (!profile) return '';
  const reading = readMusicalDna(profile, profile.musicalDna);
  const lessons = dnaLessonPlan(reading);
  if (!lessons.length) return '';
  return [
    'TEACHING PRIORITY (lead with these, in order):',
    ...lessons.map((l, i) => `${i + 1}. ${l.title} (${l.category}) — ${l.action}`),
  ].join('\n');
}
