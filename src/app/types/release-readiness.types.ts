import type { LifecycleProvenance } from './artist-lifecycle.types';

/**
 * Release readiness, scored only from data the app actually holds: the release
 * project, the artist's catalogue, and the legal fields on the profile.
 *
 * A check is `insufficient-data` when the app has nothing to judge with — it is
 * never scored 0 to look decisive. That distinction is the point of this model:
 * "we cannot tell" and "you have not done it" are different answers.
 */
export type ReadinessCheckId =
  | 'production'
  | 'metadata'
  | 'rights'
  | 'campaign'
  | 'timing';

export type ReadinessState =
  | 'ready'
  | 'almost'
  | 'not-ready'
  | 'insufficient-data';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  /** True when the check must pass before the release can be delivered. */
  blocking: boolean;
  state: ReadinessState;
  /** 0-100, or `null` when the app has no data to score. */
  score: number | null;
  provenance: LifecycleProvenance;
  /** What was actually found. */
  evidence: string[];
  /** What is still missing, phrased as the artist's next action. */
  gaps: string[];
}

export interface ReleaseReadiness {
  generatedAt: string;
  /** `no-release` means nothing is in the pipeline; nothing is scored. */
  status: 'no-release' | 'assessed';
  releaseId: string | null;
  releaseName: string | null;
  state: ReadinessState;
  /**
   * Mean of the checks that could be scored. `null` when nothing could be.
   * Unscorable checks are excluded rather than counted as zero.
   */
  overallScore: number | null;
  checks: ReadinessCheck[];
  /** Gaps that make delivery impossible right now. */
  blockingGaps: string[];
  /** One sentence the UI can show verbatim. */
  verdict: string;
  provenanceNotes: string[];
}
