/**
 * Growth evidence, not a growth score.
 *
 * The lifecycle's growth phase is already scored by counting pathway steps, and
 * a second percentage over the same career would eventually disagree with it.
 * This model instead inventories the specific growth signals the profile can
 * actually hold, so the artist can see which ones are recorded and which are
 * absent — with no listener, follower, or conversion figure implied.
 */
export type GrowthDimensionId =
  | 'audience'
  | 'owned-channel'
  | 'content-cadence'
  | 'live'
  | 'collaboration'
  | 'press';

/**
 * evidenced  the profile holds the evidence this dimension needs
 * partial    one half is recorded; usually the rented platform exists and the
 *            owned asset does not
 * missing    nothing recorded — reported as absent, never as a low score
 */
export type GrowthDimensionState = 'evidenced' | 'partial' | 'missing';

/** Where the artist records this dimension, so a CTA lands on a real control. */
export type GrowthRecordSurface = 'profile' | 'questionnaire';

export interface GrowthDimension {
  id: GrowthDimensionId;
  label: string;
  /** Why the dimension matters, in one plain sentence. */
  why: string;
  state: GrowthDimensionState;
  /** What was actually found, quoting the recorded values. */
  evidence: string[];
  /** The next thing to record, or `null` when the dimension is evidenced. */
  gap: string | null;
  recordedWith: GrowthRecordSurface;
}

export interface GrowthReadiness {
  dimensions: GrowthDimension[];
  /** Dimensions reported `evidenced`. A count, not a score. */
  evidenced: number;
  /** Dimensions reported `partial`. */
  partial: number;
  total: number;
  /** Plain-language statements about what this inventory does and does not know. */
  notes: string[];
}

export const GROWTH_DIMENSION_LABEL: Record<GrowthDimensionId, string> = {
  audience: 'Named audience',
  'owned-channel': 'Owned channel',
  'content-cadence': 'Content cadence',
  live: 'Live readiness',
  collaboration: 'Collaboration direction',
  press: 'Press assets',
};
