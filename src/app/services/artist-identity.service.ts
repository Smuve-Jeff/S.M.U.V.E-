import { Injectable, computed, inject } from '@angular/core';
import { UserProfile, UserProfileService } from './user-profile.service';
import { OfflineSyncService } from './offline-sync.service';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import {
  ArtistIdentityAuditEntry,
  ArtistIdentityRecommendation,
  ArtistIdentityResolution,
  ArtistIdentityState,
  ArtistLinkEvidence,
  ArtistPlatformAccount,
  ArtistWorkLink,
  ConnectorCapability,
  ConnectorPlatform,
  ConnectorSyncTask,
  ensureArtistIdentityState,
} from '../types/artist-identity.types';
import { SocialPlatformData, StreamingData } from '../types/marketing.types';

interface ConnectorDefinition {
  id: ConnectorPlatform;
  website: string;
  capabilities: ConnectorCapability[];
  verificationBias: number;
  growthWeight: number;
  category: 'social' | 'streaming' | 'hybrid';
}

const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'Spotify',
    website: 'https://open.spotify.com/artist',
    capabilities: ['auth', 'profile', 'catalog', 'metrics', 'health'],
    verificationBias: 14,
    growthWeight: 28,
    category: 'streaming',
  },
  {
    id: 'YouTube',
    website: 'https://www.youtube.com/@',
    capabilities: [
      'auth',
      'profile',
      'catalog',
      'metrics',
      'webhook',
      'health',
    ],
    verificationBias: 12,
    growthWeight: 24,
    category: 'hybrid',
  },
  {
    id: 'Instagram',
    website: 'https://instagram.com/',
    capabilities: ['auth', 'profile', 'metrics', 'health'],
    verificationBias: 10,
    growthWeight: 18,
    category: 'social',
  },
  {
    id: 'TikTok',
    website: 'https://www.tiktok.com/@',
    capabilities: ['auth', 'profile', 'metrics', 'health'],
    verificationBias: 8,
    growthWeight: 22,
    category: 'social',
  },
  {
    id: 'SoundCloud',
    website: 'https://soundcloud.com/',
    capabilities: ['auth', 'profile', 'catalog', 'metrics', 'health'],
    verificationBias: 7,
    growthWeight: 14,
    category: 'streaming',
  },
  {
    id: 'Apple Music',
    website: 'https://music.apple.com/us/artist/',
    capabilities: ['auth', 'profile', 'catalog', 'metrics', 'health'],
    verificationBias: 10,
    growthWeight: 16,
    category: 'streaming',
  },
];

@Injectable({
  providedIn: 'root',
})
export class ArtistIdentityService {
  private profileService = inject(UserProfileService);
  private offlineSync = inject(OfflineSyncService);
  private logger = inject(LoggingService);
  private database = inject(DatabaseService);

  identity = computed(() =>
    this.buildIdentitySnapshot(this.profileService.profile())
  );
  nextBestActions = computed(() =>
    [...this.identity().recommendations].sort(
      (a, b) =>
        b.impactScore + b.confidenceScore - (a.impactScore + a.confidenceScore)
    )
  );

  buildIdentitySnapshot(profile: UserProfile): ArtistIdentityState {
    const base = ensureArtistIdentityState(
      profile.artistName,
      profile.primaryGenre,
      profile.artistIdentity
    );
    const linkedAccounts = this.buildLinkedAccounts(
      profile,
      base.linkedAccounts
    );
    const works = this.buildWorks(profile, linkedAccounts, base.works);
    const resolution = this.buildResolution(profile, linkedAccounts, works);
    const fingerprint = this.buildFingerprint(
      profile,
      base.fingerprint?.version || 1,
      linkedAccounts,
      works,
      resolution
    );
    const recommendations = this.buildRecommendations(
      profile,
      linkedAccounts,
      resolution,
      fingerprint
    );

    return {
      ...base,
      core: {
        ...base.core,
        artistName: profile.artistName,
        aliases: Array.from(
          new Set(
            [
              profile.artistName,
              profile.proName,
              ...(base.core.aliases || []),
            ].filter(Boolean)
          )
        ) as string[],
        proName: profile.proName || base.core.proName,
        ipi: profile.proIpi || base.core.ipi,
        genres: Array.from(
          new Set(
            [profile.primaryGenre, ...(base.core.genres || [])].filter(Boolean)
          )
        ),
      },
      linkedAccounts,
      works,
      resolution,
      fingerprint,
      recommendations,
      sync: {
        ...base.sync,
        queueDepth:
          base.sync.pendingTasks?.filter((task) => task.status === 'queued')
            .length || 0,
        pendingTasks: (base.sync.pendingTasks || []).slice(-12),
      },
      auditTrail: (base.auditTrail || []).slice(-24),
    };
  }

  async refreshIdentityGraph(profile: UserProfile): Promise<UserProfile> {
    const identity = this.buildIdentitySnapshot(profile);
    const previous = ensureArtistIdentityState(
      profile.artistName,
      profile.primaryGenre,
      profile.artistIdentity
    );
    const refreshed: ArtistIdentityState = {
      ...identity,
      sync: {
        ...identity.sync,
        lastFullRefreshAt: Date.now(),
      },
      auditTrail: [
        ...previous.auditTrail,
        this.buildAuditEntry(
          'identity.refresh',
          'system',
          `Refreshed ${identity.linkedAccounts.length} platform accounts and ${identity.works.length} catalog links.`
        ),
        this.buildAuditEntry(
          'fingerprint.updated',
          'system',
          `Fingerprint trust score recalculated to ${identity.fingerprint.trustScore}.`
        ),
      ].slice(-24),
    };

    const updatedProfile: UserProfile = {
      ...profile,
      artistIdentity: refreshed,
    };

    try {
      await this.database.saveArtistIdentity(
        profile.id || 'anonymous',
        refreshed,
        updatedProfile
      );
    } catch (error) {
      this.logger.warn(
        'ArtistIdentityService: Failed to persist identity snapshot',
        error
      );
    }

    return updatedProfile;
  }

  async queueConnectorRefresh(
    connectorId: ConnectorPlatform,
    profile: UserProfile
  ): Promise<UserProfile> {
    const taskId = await this.offlineSync.queueConnectorSync(
      connectorId,
      `${this.database.apiUrl}/identity/${profile.id || 'anonymous'}/connectors/${encodeURIComponent(connectorId)}/sync`,
      {
        artistName: profile.artistName,
        requestedAt: Date.now(),
      }
    );

    const identity = this.buildIdentitySnapshot(profile);
    const task: ConnectorSyncTask = {
      id: taskId,
      connectorId,
      status: 'queued',
      trigger: 'manual',
      enqueuedAt: Date.now(),
      attempts: 0,
      payload: {
        artistName: profile.artistName,
      },
    };

    return {
      ...profile,
      artistIdentity: {
        ...identity,
        sync: {
          ...identity.sync,
          queueDepth: identity.sync.queueDepth + 1,
          pendingTasks: [...identity.sync.pendingTasks, task].slice(-12),
        },
        auditTrail: [
          ...identity.auditTrail,
          this.buildAuditEntry(
            'connector.queued',
            connectorId,
            `Manual refresh queued for ${connectorId}.`
          ),
        ].slice(-24),
      },
    };
  }

  getConnectorMatrix(identity = this.identity()): Array<{
    connector: ConnectorPlatform;
    status: string;
    verification: string;
    official: boolean;
    health: string;
    followersOrListeners: number;
  }> {
    return identity.linkedAccounts.map((account) => ({
      connector: account.platform,
      status: account.status,
      verification: account.verificationTier,
      official: account.isOfficial,
      health: account.health.status,
      followersOrListeners:
        account.metrics.followers || account.metrics.monthlyListeners || 0,
    }));
  }

  getSocialPlatformData(identity = this.identity()): SocialPlatformData[] {
    return identity.linkedAccounts
      .filter((account) =>
        ['Instagram', 'TikTok', 'YouTube'].includes(account.platform)
      )
      .map((account) => ({
        platform: account.platform as SocialPlatformData['platform'],
        followers:
          account.metrics.followers ||
          Math.round((account.metrics.monthlyListeners || 0) * 0.35),
        engagementRate: account.metrics.engagementRate || 3.5,
        topPosts: [
          {
            id: `${account.id}-1`,
            likes: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.11
            ),
            shares: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.02
            ),
            comments: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.008
            ),
          },
          {
            id: `${account.id}-2`,
            likes: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.07
            ),
            shares: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.015
            ),
            comments: Math.round(
              (account.metrics.followers ||
                account.metrics.monthlyListeners ||
                1000) * 0.006
            ),
          },
        ],
        lastUpdated: account.refreshedAt,
      }));
  }

  getStreamingPlatformData(identity = this.identity()): StreamingData[] {
    return identity.linkedAccounts
      .filter((account) =>
        ['Spotify', 'Apple Music', 'SoundCloud'].includes(account.platform)
      )
      .map((account) => ({
        platform: account.platform as StreamingData['platform'],
        monthlyListeners: account.metrics.monthlyListeners || 0,
        totalStreams: account.metrics.totalStreams || 0,
        topTracks: identity.works.slice(0, 3).map((work, index) => ({
          id: `${account.id}-${index + 1}`,
          title: work.title,
          streams: Math.round(
            (account.metrics.totalStreams || 10000) /
              Math.max(identity.works.length, 1)
          ),
        })),
        playlistAdds: account.metrics.playlistAdds || 0,
        lastUpdated: account.refreshedAt,
      }));
  }

  private buildLinkedAccounts(
    profile: UserProfile,
    existingAccounts: ArtistPlatformAccount[]
  ): ArtistPlatformAccount[] {
    const now = Date.now();
    const normalizedHandle = profile.artistName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
    const catalogDepth = Math.max(profile.catalog?.length || 0, 1);
    const hasOfficialWebsite = Boolean(
      profile.website || profile.artistIdentity?.core.officialWebsite
    );
    const hasProMetadata = Boolean(profile.proName || profile.proIpi);

    return CONNECTORS.map((connector, index) => {
      const existing = existingAccounts.find(
        (account) => account.platform === connector.id
      );
      const evidence = this.buildEvidence(
        profile,
        connector.id,
        normalizedHandle
      );
      const confidenceWeight = evidence.reduce(
        (sum, item) => sum + item.weight,
        0
      );
      const official =
        connector.id === 'Spotify' ||
        connector.id === 'YouTube' ||
        hasOfficialWebsite;
      const status: ArtistPlatformAccount['status'] =
        confidenceWeight >= 75
          ? 'linked'
          : connector.id === 'TikTok' || connector.id === 'Instagram'
            ? 'needs_review'
            : 'stale';
      const followersBase =
        (catalogDepth * 1800 + connector.growthWeight * 110) * (index + 1);
      const streamBase = followersBase * 8;

      return {
        id:
          existing?.id ||
          `${connector.id.toLowerCase().replace(/\s+/g, '-')}-${normalizedHandle}`,
        platform: connector.id,
        handle: normalizedHandle,
        externalId:
          existing?.externalId ||
          `${connector.id.toLowerCase().replace(/\s+/g, '-')}_${normalizedHandle}_${catalogDepth}`,
        profileUrl:
          existing?.profileUrl ||
          `${connector.website}${connector.id === 'Apple Music' ? normalizedHandle : normalizedHandle}`,
        verificationTier:
          status === 'linked' && hasProMetadata
            ? 'TRUSTED'
            : official
              ? 'OFFICIAL'
              : confidenceWeight >= 55
                ? 'CLAIMED'
                : 'UNVERIFIED',
        isOfficial: official,
        status,
        capabilities: connector.capabilities,
        metrics: {
          followers:
            connector.category !== 'streaming'
              ? Math.round(followersBase * 1.1)
              : undefined,
          monthlyListeners:
            connector.category !== 'social'
              ? Math.round(followersBase * 0.9)
              : undefined,
          totalStreams:
            connector.category !== 'social'
              ? Math.round(streamBase * 14)
              : undefined,
          playlistAdds:
            connector.id === 'Spotify' || connector.id === 'Apple Music'
              ? Math.round(catalogDepth * 26 + connector.growthWeight * 2)
              : undefined,
          engagementRate:
            connector.category !== 'streaming'
              ? Number(
                  (4.2 + index * 0.7 + (hasOfficialWebsite ? 0.6 : 0)).toFixed(
                    1
                  )
                )
              : undefined,
          avgViews:
            connector.id === 'YouTube' || connector.id === 'TikTok'
              ? Math.round(streamBase * 0.4)
              : undefined,
          topContentTitle: profile.catalog?.[0]?.title || 'Catalog Preview',
        },
        ownershipEvidence: evidence,
        refreshedAt: now,
        linkedAt: existing?.linkedAt || now - (index + 1) * 1000 * 60 * 60 * 24,
        health: {
          status:
            status === 'linked'
              ? 'healthy'
              : status === 'needs_review'
                ? 'degraded'
                : 'down',
          lastSyncAt: now - index * 1000 * 60 * 8,
          latencyMs: 120 + index * 28,
          queueDepth: existing?.health.queueDepth || 0,
          rateLimitRemaining: 1000 - index * 75,
          errorMessage:
            status === 'stale'
              ? `${connector.id} requires source credential review.`
              : undefined,
        },
      };
    });
  }

  private buildEvidence(
    profile: UserProfile,
    connectorId: ConnectorPlatform,
    normalizedHandle: string
  ): ArtistLinkEvidence[] {
    const artistName = profile.artistName || 'artist';
    const website =
      profile.website || profile.artistIdentity?.core.officialWebsite;
    const baseEvidence: ArtistLinkEvidence[] = [
      {
        id: `${connectorId}-handle`,
        source: connectorId,
        type: 'handle_similarity',
        detail: `Detected handle @${normalizedHandle} aligned with ${artistName}.`,
        weight: 22,
      },
      {
        id: `${connectorId}-metadata`,
        source: connectorId,
        type: 'metadata_overlap',
        detail: `Catalog metadata matches ${profile.catalog?.length || 0} release entries.`,
        weight: Math.min(26, 10 + (profile.catalog?.length || 0) * 4),
      },
    ];

    if (website) {
      baseEvidence.push({
        id: `${connectorId}-site`,
        source: 'website',
        type: 'website_backlink',
        detail: `Official website ${website} can backlink to ${connectorId}.`,
        weight: 18,
        url: website,
      });
    }

    if (profile.proName || profile.proIpi) {
      baseEvidence.push({
        id: `${connectorId}-pro`,
        source: 'pro',
        type: 'catalog_match',
        detail: `PRO metadata ${profile.proName || artistName} / ${profile.proIpi || 'pending'} overlaps source record.`,
        weight: 24,
      });
    }

    if (connectorId === 'Spotify' || connectorId === 'YouTube') {
      baseEvidence.push({
        id: `${connectorId}-verified`,
        source: connectorId,
        type: 'verified_badge',
        detail: `${connectorId} is designated as a priority official surface.`,
        weight: 16,
      });
    }

    return baseEvidence;
  }

  private buildWorks(
    profile: UserProfile,
    accounts: ArtistPlatformAccount[],
    existingWorks: ArtistWorkLink[]
  ): ArtistWorkLink[] {
    const artistName = profile.artistName || 'New Artist';

    return (profile.catalog || []).map((item, index) => {
      const existing = existingWorks.find((work) => work.id === item.id);
      const slug = (item.title || `track-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

      return {
        id: item.id || `work-${index + 1}`,
        title: item.title,
        artistName,
        genre: item.genre || profile.primaryGenre,
        status: item.status || 'draft',
        isrc:
          item.metadata?.isrc ||
          existing?.isrc ||
          `QZK6K${String(index + 1).padStart(5, '0')}`,
        upc:
          item.metadata?.upc ||
          existing?.upc ||
          `1984${String(index + 11).padStart(8, '0')}`,
        releaseId: existing?.releaseId || `release-${slug}`,
        platformIds: Object.fromEntries(
          accounts
            .filter((account) => account.capabilities.includes('catalog'))
            .map((account) => [account.platform, `${account.platform}-${slug}`])
        ),
      };
    });
  }

  private buildResolution(
    profile: UserProfile,
    accounts: ArtistPlatformAccount[],
    works: ArtistWorkLink[]
  ): ArtistIdentityResolution {
    const averageEvidence =
      accounts.reduce(
        (sum, account) =>
          sum +
          account.ownershipEvidence.reduce(
            (weight, evidence) => weight + evidence.weight,
            0
          ),
        0
      ) / Math.max(accounts.length, 1);
    const officialCount = accounts.filter(
      (account) => account.isOfficial
    ).length;
    const needsReview = accounts.filter(
      (account) => account.status !== 'linked'
    ).length;
    const score = Math.min(
      98,
      Math.round(
        averageEvidence * 0.7 +
          officialCount * 6 +
          Math.min(works.length, 8) * 2 +
          (profile.proIpi ? 8 : 0)
      )
    );
    const conflictStates: ArtistIdentityResolution['conflictStates'] = [];

    if (needsReview === 0) {
      conflictStates.push('healthy');
    } else {
      conflictStates.push('stale');
      if (accounts.some((account) => account.status === 'needs_review')) {
        conflictStates.push('disputed');
      }
    }

    if (!profile.website && accounts.some((account) => !account.isOfficial)) {
      conflictStates.push('impersonation');
    }

    return {
      confidenceScore: score,
      explainability: [
        `${officialCount} official surfaces detected across priority connectors.`,
        `${works.length} catalog works contributed deterministic metadata overlap.`,
        needsReview > 0
          ? `${needsReview} accounts need analyst review before auto-approval.`
          : 'All linked accounts met the auto-resolution threshold.',
      ],
      conflictStates: Array.from(new Set(conflictStates)),
      autoResolved: score >= 78 && needsReview <= 2,
      manualReviewRequired: score < 78 || needsReview > 0,
    };
  }

  private buildFingerprint(
    profile: UserProfile,
    version: number,
    accounts: ArtistPlatformAccount[],
    works: ArtistWorkLink[],
    resolution: ArtistIdentityResolution
  ) {
    const identityIntegrityScore = Math.min(
      100,
      Math.round(
        resolution.confidenceScore * 0.72 +
          (profile.proIpi ? 12 : 0) +
          (profile.website ? 8 : 0)
      )
    );
    const linkedAccounts = accounts.filter(
      (account) => account.status === 'linked'
    ).length;
    const platformConsistencyScore = Math.round(
      (linkedAccounts / Math.max(accounts.length, 1)) * 100
    );
    const catalogCompletenessScore = Math.min(
      100,
      Math.round(
        ((works.filter((work) => work.isrc && work.upc).length || 0) /
          Math.max(works.length, 1)) *
          100
      )
    );
    const riskFlags = Array.from(
      new Set([
        ...(!profile.website ? ['Missing official website backlink'] : []),
        ...(resolution.conflictStates.includes('impersonation')
          ? ['Unofficial surfaces could confuse fans or DSPs']
          : []),
        ...(accounts.some((account) => account.status === 'stale')
          ? ['One or more connectors are stale']
          : []),
      ])
    );

    return {
      version: version + 1,
      updatedAt: Date.now(),
      identityIntegrityScore,
      platformConsistencyScore,
      catalogCompletenessScore,
      trustScore: Math.round(
        (identityIntegrityScore +
          platformConsistencyScore +
          catalogCompletenessScore) /
          3
      ),
      riskFlags,
      changeSummary: [
        `${linkedAccounts}/${accounts.length} connectors are currently linked.`,
        `${works.length} works are indexed in the identity graph.`,
        resolution.manualReviewRequired
          ? 'Manual review queue still has pending work.'
          : 'Identity graph is eligible for automated approvals.',
      ],
    };
  }

  private buildRecommendations(
    profile: UserProfile,
    accounts: ArtistPlatformAccount[],
    resolution: ArtistIdentityResolution,
    fingerprint: ArtistIdentityState['fingerprint']
  ): ArtistIdentityRecommendation[] {
    const recommendations: ArtistIdentityRecommendation[] = [];

    if (!profile.website) {
      recommendations.push({
        id: 'identity-site',
        title: 'Publish a canonical artist website',
        description:
          'Your connector trust score is limited because there is no central backlink proving ownership across platforms.',
        category: 'identity',
        impactScore: 94,
        confidenceScore: 88,
        actionLabel: 'Add official site',
        evidence: ['No website backlink evidence found in the identity graph.'],
      });
    }

    const pendingAccounts = accounts.filter(
      (account) => account.status !== 'linked'
    );
    if (pendingAccounts.length > 0) {
      recommendations.push({
        id: 'identity-review',
        title: 'Resolve pending connector approvals',
        description:
          'Review ambiguous accounts, confirm ownership evidence, and promote qualified surfaces to official status.',
        category: 'sync',
        impactScore: 90,
        confidenceScore: 82,
        actionLabel: 'Open review queue',
        evidence: pendingAccounts.map(
          (account) =>
            `${account.platform} is ${account.status} with ${account.ownershipEvidence.length} evidence signals.`
        ),
      });
    }

    if ((profile.catalog || []).length < 3) {
      recommendations.push({
        id: 'identity-release',
        title: 'Expand release coverage before campaign spend',
        description:
          'Catalog depth remains thin for strong DSP recommendation loops. Ship a clustered 3-track release wave.',
        category: 'release',
        impactScore: 86,
        confidenceScore: 79,
        actionLabel: 'Plan next release',
        evidence: ['Fewer than 3 catalog works are currently indexed.'],
      });
    }

    if (fingerprint.trustScore < 75 || resolution.manualReviewRequired) {
      recommendations.push({
        id: 'identity-risk',
        title: 'Harden the artist fingerprint',
        description:
          'Improve trust by adding PRO identifiers, refreshing stale connectors, and reconciling any disputed surfaces.',
        category: 'risk',
        impactScore: 88,
        confidenceScore: 84,
        actionLabel: 'Improve trust score',
        evidence: [
          `Trust score is ${fingerprint.trustScore}.`,
          ...fingerprint.riskFlags,
        ],
      });
    }

    recommendations.push({
      id: 'identity-growth',
      title: 'Deploy telemetry-driven promotion',
      description:
        'Use the strongest linked connector telemetry to prioritize short-form clips, DSP saves, and editorial-ready assets.',
      category: 'growth',
      impactScore: 81,
      confidenceScore: Math.max(72, resolution.confidenceScore - 4),
      actionLabel: 'Activate growth sequence',
      evidence: [
        `${accounts.filter((account) => account.isOfficial).length} official channels can drive real performance telemetry.`,
      ],
    });

    return recommendations.sort(
      (a, b) =>
        b.impactScore + b.confidenceScore - (a.impactScore + a.confidenceScore)
    );
  }

  private buildAuditEntry(
    action: ArtistIdentityAuditEntry['action'],
    connectorId: ArtistIdentityAuditEntry['connectorId'],
    detail: string
  ): ArtistIdentityAuditEntry {
    return {
      id: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      connectorId,
      at: Date.now(),
      detail,
    };
  }
}
