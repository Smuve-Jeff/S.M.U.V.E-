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
  marketingCampaignId?: string;
  createdAt: number;
  updatedAt: number;
}
