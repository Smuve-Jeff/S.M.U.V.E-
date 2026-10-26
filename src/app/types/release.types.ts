export type ReleaseType = 'Album' | 'EP' | 'Mixtape' | 'Single';

export type ProductionStageStatus = 'Pending' | 'In Progress' | 'Completed';

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
   * The collaborator names that reference was recorded against. Kept so a split
   * cannot keep reading as settled after someone it does not name joins the
   * release. Absent on references recorded before coverage was tracked.
   */
  splitSheetFor?: string[];
  marketingCampaignId?: string;
  createdAt: number;
  updatedAt: number;
}
