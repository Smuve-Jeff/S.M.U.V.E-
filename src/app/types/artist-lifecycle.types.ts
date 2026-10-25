import type { PathwayArea, PathwayReadout } from '../services/artist-pathway.service';
import type { ReleaseReadiness } from './release-readiness.types';

/**
 * The artist lifecycle is a view over the Official Artist Pathway, not a second
 * scoring system. Each lifecycle phase is a group of pathway areas, so the
 * numbers here can always be traced back to a step whose evidence the app
 * actually checks. Nothing in this model invents its own definition of "done".
 */
export type LifecyclePhaseId =
  | 'identity'
  | 'craft'
  | 'release'
  | 'rights'
  | 'growth'
  | 'business'
  | 'money';

/**
 * on-track        every step in the phase passed its evidence check
 * needs-attention work is outstanding, but the artist can start it now
 * at-risk         the phase cannot advance until another phase's step is done
 */
export type LifecycleStatus = 'on-track' | 'needs-attention' | 'at-risk';

/**
 * How much weight a signal can carry.
 *
 * verified  every contributing step passed the app's own evidence check
 * inferred  derived from what the artist described about themselves
 * missing   no evidence at all; reported as missing rather than assumed
 * sampled   reserved for a live platform feed. No streaming, analytics, or
 *           royalty feed is connected yet, so nothing emits this today.
 */
export type LifecycleProvenance = 'verified' | 'inferred' | 'sampled' | 'missing';

/** Why a phase is flagged: something else blocks it, or the story and the work disagree. */
export type LifecycleRiskKind = 'dependency' | 'mismatch';

export const LIFECYCLE_PHASE_ORDER: LifecyclePhaseId[] = [
  'identity',
  'craft',
  'release',
  'rights',
  'growth',
  'business',
  'money',
];

/**
 * Phase → pathway areas. Every one of the eight areas belongs to exactly one
 * phase; `artist-lifecycle.service.spec.ts` fails if one is ever orphaned or
 * claimed twice.
 */
export const LIFECYCLE_PHASE_AREAS: Record<LifecyclePhaseId, PathwayArea[]> = {
  identity: ['identity'],
  craft: ['craft'],
  release: ['release'],
  rights: ['rights'],
  growth: ['presence', 'audience'],
  business: ['business'],
  money: ['money'],
};

export const LIFECYCLE_PHASE_LABEL: Record<LifecyclePhaseId, string> = {
  identity: 'Identity',
  craft: 'Craft & Production',
  release: 'Release',
  rights: 'Rights & Ownership',
  growth: 'Growth & Audience',
  business: 'Business',
  money: 'Money & Royalties',
};

export interface ArtistLifecyclePhase {
  id: LifecyclePhaseId;
  label: string;
  /** The pathway areas this phase summarises, in pathway order. */
  areas: PathwayArea[];
  status: LifecycleStatus;
  /**
   * 0-100, counted from evidenced pathway steps — never estimated. `null` only
   * when a phase has no steps at all, so an empty phase is never scored as if
   * it were healthy or failing.
   */
  score: number | null;
  provenance: LifecycleProvenance;
  completed: number;
  total: number;
  /** Titles the app has confirmed through their evidence checks. */
  confirmed: string[];
  /** Titles still outstanding, in pathway order. */
  gaps: string[];
  /** Titles of steps in other phases that are holding this phase up. */
  blockedBy: string[];
}

/** One actionable move, carrying the reason so the UI never shows a bare task. */
export interface ArtistLifecycleMove {
  id: string;
  phase: LifecyclePhaseId;
  title: string;
  action: string;
  why: string;
  provenance: LifecycleProvenance;
}

export interface ArtistLifecycleRisk {
  kind: LifecycleRiskKind;
  /** The phase at risk, or `null` for a whole-artist mismatch. */
  phase: LifecyclePhaseId | null;
  message: string;
  provenance: LifecycleProvenance;
}

export interface ArtistLifecycleSnapshot {
  /** ISO timestamp of when the snapshot was derived. */
  generatedAt: string;
  stage: PathwayReadout['stage'];
  /** 0-100 across every evidenced pathway step. */
  overallScore: number;
  overallProvenance: LifecycleProvenance;
  phases: ArtistLifecyclePhase[];
  /** Exactly one move, matching the pathway's ordered next action. */
  nextBestMove: ArtistLifecycleMove | null;
  /** Independent moves for an artist with spare capacity, capped at three. */
  supportingMoves: ArtistLifecycleMove[];
  risks: ArtistLifecycleRisk[];
  /**
   * Readiness for the release in the pipeline, if one was supplied. Without a
   * release it reports `status: 'no-release'` rather than an empty score.
   */
  releaseReadiness: ReleaseReadiness;
  /** The creative-differentiation score the profile supports, 0-100. */
  differentiationScore: number;
  /** Two sentences the UI can show verbatim. */
  summary: string;
  /** Plain-language statements about what the numbers do and do not know. */
  provenanceNotes: string[];
}
