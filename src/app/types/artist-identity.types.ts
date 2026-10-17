export type ConnectorPlatform =
  | 'Spotify'
  | 'YouTube'
  | 'Instagram'
  | 'TikTok'
  | 'SoundCloud'
  | 'Apple Music';

export type ConnectorCapability =
  | 'auth'
  | 'profile'
  | 'catalog'
  | 'metrics'
  | 'webhook'
  | 'health';

export type VerificationTier =
  | 'UNVERIFIED'
  | 'CLAIMED'
  | 'OFFICIAL'
  | 'TRUSTED';

export type ConnectorStatus = 'linked' | 'needs_review' | 'stale' | 'error';

export type ConflictState =
  | 'healthy'
  | 'duplicate'
  | 'impersonation'
  | 'stale'
  | 'disputed';

export type ConnectorTaskTrigger = 'manual' | 'scheduled' | 'event';

export type ConnectorTaskStatus = 'queued' | 'running' | 'success' | 'failed';

export interface ArtistIdentityCore {
  artistName: string;
  aliases: string[];
  legalName?: string;
  proName?: string;
  ipi?: string;
  isni?: string;
  officialWebsite?: string;
  regions: string[];
  genres: string[];
}

export interface ArtistLinkEvidence {
  id: string;
  source: string;
  type:
    | 'bio_link'
    | 'website_backlink'
    | 'handle_similarity'
    | 'metadata_overlap'
    | 'verified_badge'
    | 'catalog_match';
  detail: string;
  weight: number;
  url?: string;
}

export interface ArtistAccountMetrics {
  followers?: number;
  monthlyListeners?: number;
  totalStreams?: number;
  playlistAdds?: number;
  engagementRate?: number;
  avgViews?: number;
  topContentTitle?: string;
}

export interface ConnectorHealthSnapshot {
  status: 'healthy' | 'degraded' | 'down';
  lastSyncAt?: number;
  latencyMs: number;
  queueDepth: number;
  rateLimitRemaining?: number;
  errorMessage?: string;
}

export interface ArtistPlatformAccount {
  id: string;
  platform: ConnectorPlatform;
  handle: string;
  externalId: string;
  profileUrl: string;
  verificationTier: VerificationTier;
  isOfficial: boolean;
  status: ConnectorStatus;
  capabilities: ConnectorCapability[];
  metrics: ArtistAccountMetrics;
  ownershipEvidence: ArtistLinkEvidence[];
  refreshedAt: number;
  linkedAt: number;
  health: ConnectorHealthSnapshot;
}

export interface ArtistWorkLink {
  id: string;
  title: string;
  artistName: string;
  genre?: string;
  status?: string;
  isrc?: string;
  upc?: string;
  releaseId?: string;
  platformIds: Partial<Record<ConnectorPlatform, string>>;
}

export interface ArtistIdentityResolution {
  confidenceScore: number;
  explainability: string[];
  conflictStates: ConflictState[];
  autoResolved: boolean;
  manualReviewRequired: boolean;
}

export interface ArtistFingerprint {
  version: number;
  updatedAt: number;
  identityIntegrityScore: number;
  platformConsistencyScore: number;
  catalogCompletenessScore: number;
  trustScore: number;
  riskFlags: string[];
  changeSummary: string[];
}

export interface ArtistIdentityRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'identity' | 'growth' | 'risk' | 'release' | 'sync';
  impactScore: number;
  confidenceScore: number;
  actionLabel: string;
  evidence: string[];
}

export interface ConnectorSyncTask {
  id: string;
  connectorId: ConnectorPlatform | 'system';
  status: ConnectorTaskStatus;
  trigger: ConnectorTaskTrigger;
  enqueuedAt: number;
  lastAttemptAt?: number;
  attempts: number;
  payload?: Record<string, unknown>;
}

export interface ArtistIdentityAuditEntry {
  id: string;
  action:
    | 'identity.refresh'
    | 'account.linked'
    | 'account.reviewed'
    | 'account.flagged'
    | 'fingerprint.updated'
    | 'connector.queued';
  at: number;
  connectorId?: ConnectorPlatform | 'system';
  detail: string;
}

export interface ArtistIdentityState {
  core: ArtistIdentityCore;
  linkedAccounts: ArtistPlatformAccount[];
  works: ArtistWorkLink[];
  resolution: ArtistIdentityResolution;
  fingerprint: ArtistFingerprint;
  recommendations: ArtistIdentityRecommendation[];
  sync: {
    lastFullRefreshAt?: number;
    queueDepth: number;
    deadLetter: number;
    pendingTasks: ConnectorSyncTask[];
  };
  auditTrail: ArtistIdentityAuditEntry[];
}

const EMPTY_FINGERPRINT: ArtistFingerprint = {
  version: 1,
  updatedAt: 0,
  identityIntegrityScore: 0,
  platformConsistencyScore: 0,
  catalogCompletenessScore: 0,
  trustScore: 0,
  riskFlags: [],
  changeSummary: [],
};

export function createInitialArtistIdentity(
  artistName: string,
  primaryGenre: string
): ArtistIdentityState {
  return {
    core: {
      artistName,
      aliases: [artistName].filter(Boolean),
      genres: [primaryGenre].filter(Boolean),
      regions: [],
    },
    linkedAccounts: [],
    works: [],
    resolution: {
      confidenceScore: 0,
      explainability: ['Identity graph has not been synchronized yet.'],
      conflictStates: ['stale'],
      autoResolved: false,
      manualReviewRequired: true,
    },
    fingerprint: { ...EMPTY_FINGERPRINT },
    recommendations: [],
    sync: {
      queueDepth: 0,
      deadLetter: 0,
      pendingTasks: [],
    },
    auditTrail: [],
  };
}

export function ensureArtistIdentityState(
  artistName: string,
  primaryGenre: string,
  identity?: ArtistIdentityState | null
): ArtistIdentityState {
  const seeded =
    identity || createInitialArtistIdentity(artistName, primaryGenre);
  return {
    ...seeded,
    core: {
      ...seeded.core,
      artistName: seeded.core.artistName || artistName,
      aliases: Array.from(
        new Set([artistName, ...(seeded.core.aliases || [])].filter(Boolean))
      ),
      genres: Array.from(
        new Set([primaryGenre, ...(seeded.core.genres || [])].filter(Boolean))
      ),
      regions: seeded.core.regions || [],
    },
    linkedAccounts: seeded.linkedAccounts || [],
    works: seeded.works || [],
    resolution: seeded.resolution || {
      confidenceScore: 0,
      explainability: [],
      conflictStates: ['stale'],
      autoResolved: false,
      manualReviewRequired: true,
    },
    fingerprint: seeded.fingerprint || { ...EMPTY_FINGERPRINT },
    recommendations: seeded.recommendations || [],
    sync: seeded.sync || {
      queueDepth: 0,
      deadLetter: 0,
      pendingTasks: [],
    },
    auditTrail: seeded.auditTrail || [],
  };
}
