/** Shapes for the Independent Artist Toolkit. All data is local to the artist. */

export type ToolkitTab = 'blueprint' | 'splits' | 'royalties' | 'rights';

export type ReleaseType = 'Single' | 'EP' | 'Album' | 'Mixtape';

export type ContributorRole =
  | 'Songwriter'
  | 'Producer'
  | 'Featured artist'
  | 'Composer'
  | 'Publisher';

export interface ReleaseMilestone {
  id: string;
  phase: string;
  title: string;
  detail: string;
  /** Local calendar day, `yyyy-mm-dd`. */
  dueDate: string;
  done: boolean;
}

export interface ReleaseBlueprint {
  title: string;
  /** Local calendar day, `yyyy-mm-dd`. */
  releaseDate: string;
  releaseType: ReleaseType;
  distributor: string;
  milestones: ReleaseMilestone[];
}

export interface SplitContributor {
  id: string;
  name: string;
  role: ContributorRole;
  email: string;
  publisher: string;
  ipi: string;
  /** Writer's share of the composition, 0–100. */
  share: number;
}

export interface SplitSheet {
  title: string;
  iswc: string;
  contributors: SplitContributor[];
}

export interface RoyaltyLine {
  id: string;
  platform: string;
  streams: number;
  ratePerStream: number;
}

export interface RoyaltyInput {
  lines: RoyaltyLine[];
  distributorFeePercent: number;
}

export interface RoyaltyEstimate {
  gross: number;
  distributorFee: number;
  net: number;
  totalStreams: number;
}

export interface RoyaltyPayout {
  contributorId: string;
  name: string;
  share: number;
  amount: number;
}

export interface RightsTaskDefinition {
  id: string;
  category: string;
  title: string;
  detail: string;
  links?: Array<{ label: string; url: string }>;
}

export interface ToolkitGuide {
  id: string;
  title: string;
  summary: string;
  steps: string[];
}
