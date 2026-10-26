import type { LifecycleProvenance } from './artist-lifecycle.types';

/**
 * The six consequences a release carries beyond the music itself. These are the
 * dimensions the advisor has to be able to explain, and they are deliberately
 * separate from release readiness: readiness asks "can this ship", this asks
 * "what does shipping commit the artist to".
 */
export type CreativeDimensionId =
  | 'rights'
  | 'schedule'
  | 'audience'
  | 'legal'
  | 'monetization'
  | 'growth';

/**
 * blocking  an unresolved liability that should be settled before delivery
 * watch     no failure, but the decision carries a cost the artist should see
 * clear     the recorded facts carry no exposure
 * unknown   the app has no fact to judge with — never reported as clear
 */
export type CreativeSeverity = 'blocking' | 'watch' | 'clear' | 'unknown';

export interface CreativeConsequence {
  id: string;
  dimension: CreativeDimensionId;
  label: string;
  /** The creative fact, quoted from the release or profile. */
  observation: string;
  /** What follows for the career if the artist ships as-is. */
  consequence: string;
  /** The decision the artist is actually being asked to make. */
  decision: string;
  severity: CreativeSeverity;
  /** The fields this reading came from, or the fields that are empty. */
  evidence: string[];
  provenance: LifecycleProvenance;
}

export interface CreativeBusinessBridge {
  generatedAt: string;
  /** `no-release` means nothing is in the pipeline; nothing is inferred. */
  status: 'no-release' | 'assessed';
  releaseId: string | null;
  releaseName: string | null;
  /** One sentence the UI can show verbatim. */
  headline: string;
  /** One entry per dimension, always all six, in dimension order. */
  consequences: CreativeConsequence[];
  /** Dimensions carrying an unresolved liability. */
  blocking: CreativeDimensionId[];
  /** Dimensions the app had nothing to judge with. */
  unclear: CreativeDimensionId[];
  /** Plain-language statements about what this reading can and cannot know. */
  provenanceNotes: string[];
}

export const CREATIVE_DIMENSION_ORDER: CreativeDimensionId[] = [
  'rights',
  'schedule',
  'audience',
  'legal',
  'monetization',
  'growth',
];

export const CREATIVE_DIMENSION_LABEL: Record<CreativeDimensionId, string> = {
  rights: 'Rights',
  schedule: 'Schedule',
  audience: 'Audience fit',
  legal: 'Legal exposure',
  monetization: 'Monetization',
  growth: 'Growth strategy',
};
