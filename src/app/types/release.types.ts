export type ReleaseType = 'Album' | 'EP' | 'Mixtape' | 'Single';

export type ProductionStageStatus = 'Pending' | 'In Progress' | 'Completed';

/**
 * The measurement of a master that actually left the Studio.
 *
 * This is evidence, not a checklist tick: it records the target the artist
 * delivered against and the numbers measured from the encoded audio, so the
 * release pipeline can tell a verified delivery from a stage the artist marked
 * complete by hand. A miss is kept as a miss; filing a master never upgrades
 * the verdict.
 */
export interface MasterDeliveryEvidence {
  fileName: string;
  formatLabel: string;
  sampleRate: number;
  /** `share` means a file was prepared for the share sheet, not a download. */
  method: 'download' | 'share';
  deliveredAt: number;
  targetId: string;
  targetLabel: string;
  lufs: number;
  truePeakDb: number;
  correlation: number;
  allPass: boolean;
  /** The Studio project this master came from, when it is known. */
  projectId?: string;
}

export interface ProductionTrack {
  id: string;
  title: string;
  status: ProductionStageStatus;
  stages: {
    instrumental: ProductionStageStatus;
    lyrics: ProductionStageStatus;
    vocals: ProductionStageStatus;
    mixing: ProductionStageStatus;
    mastering: ProductionStageStatus;
  };
  studioProjectId?: string;
  /** Present only after a mastered file was delivered from the Studio. */
  masterDelivery?: MasterDeliveryEvidence;
}

export interface ReleaseProject {
  id: string;
  name: string;
  type: ReleaseType;
  description: string;
  status:
    | 'Planning'
    | 'Production'
    | 'Visuals'
    | 'Admin'
    | 'Distributing'
    | 'Released';
  tracks: ProductionTrack[];
  artworkUrl?: string;
  visualsUrl?: string;
  credits: {
    artistName: string;
    proName?: string;
    proIpi?: string;
    collaborators: string[];
  };
  /**
   * The split document recorded for this release, as the artist states it. It
   * may be a file name, a folder reference, or a sheet id — the app stores the
   * reference and never claims to hold or verify the document itself.
   */
  splitSheetRef?: string;
  /**
   * The catalogue work this release is, when the artist has said so. Linking is
   * what keeps a retitled release attached to its ISRC, split reference, and
   * delivery metadata, which title matching alone would lose.
   */
  catalogWorkId?: string;
  /**
   * The collaborator names that reference was recorded against. Kept so a split
   * cannot keep reading as settled after someone it does not name joins the
   * release. Absent on references recorded before coverage was tracked.
   */
  splitSheetFor?: string[];
  marketingCampaignId?: string;
  /**
   * The artist's intended release date (YYYY-MM-DD), used to score delivery
   * runway and the market window. It is not the distributor-facing date on the
   * catalogue work: that one is recorded separately once the artist has it.
   */
  plannedReleaseDate?: string;
  createdAt: number;
  updatedAt: number;
}
