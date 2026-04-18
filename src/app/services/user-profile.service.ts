import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import {
  RecommendationHistoryEntry,
  UpgradeRecommendation,
  ArtistKnowledgeBase,
} from '../types/ai.types';
import {
  ArtistIdentityState,
  createInitialArtistIdentity,
  ensureArtistIdentityState,
} from '../types/artist-identity.types';
import {
  UserProfile,
  AppSettings,
  CatalogItem,
  ThaSpotGameStat,
  ThaSpotProgression,
  RecommendationPreference,
  ThaSpotEventHistoryEntry,
  ThaSpotSessionContext,
  ExpertiseLevels,
  TeamMember,
  ProfessionalFinancials,
  ProfileAuditLog,
} from '../types/profile.types';

export type {
  UserProfile,
  AppSettings,
  CatalogItem,
  ThaSpotGameStat,
  ThaSpotProgression,
  RecommendationPreference,
  ThaSpotEventHistoryEntry,
  ThaSpotSessionContext,
  ExpertiseLevels,
  TeamMember,
  ProfessionalFinancials,
  ProfileAuditLog,
};

export const initialProfile: UserProfile = {
  settings: {
    ui: {
      theme: 'Dark',
      performanceMode: false,
      showScanlines: false,
      animationsEnabled: true,
      autoPianoRoll: false,
    },
    audio: { masterVolume: 0.8, autoSaveEnabled: true },
    ai: { kbWriteAccess: true, commanderPersona: 'Elite' },
    security: { twoFactorEnabled: false },
  },
  artistName: 'New Artist',
  primaryGenre: 'Hip Hop',
  knowledgeBase: {
    id: 'kb-initial',
    artistId: 'new-artist',
    dataPoints: [],
    learnedStyles: [],
    productionSecrets: [],
    coreTrends: [],
    strategicDirectives: [],
    marketIntel: [],
    genreAnalysis: {},
    brandStatus: {},
    strategicHealthScore: 0,
  },
  careerGoals: [],
  equipment: [],
  daw: [],
  services: [],
  recommendationPreferences: {},
  recommendationHistory: [],
  expertise: {
    production: 0,
    songwriting: 0,
    marketing: 0,
    business: 0,
    legal: 0,
    performance: 0,
    catalyst: 0,
  },
  team: [],
  marketingCampaigns: [],
  financials: {
    accounts: [],
    totalRevenue: 0,
    pendingPayouts: 0,
    splitSheets: [],
    revenueHistory: [],
  },
  catalog: [],
  artistIdentity: createInitialArtistIdentity('New Artist', 'Hip Hop'),
  avatarImage: undefined,
  headerImage: undefined,
  pressGallery: [],
  strategicHealthScore: 0,
  criticalDeficits: [],
  auditHistory: [],

  // Onboarding & UI specific fields
  skills: [],
  productionStyles: [],
  brandVoices: [],
  strategicGoals: [],
  performancesPerYear: 'None',
  touringDetails: {
    travelPreference: 'Van',
    regions: [],
  },
  genreSpecificData: {},

  gameStats: {},
  thaSpotProgression: {
    roomStats: {},
    earnedCosmetics: [],
    eventHistory: [],
  },
};

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private db = inject(DatabaseService);
  private logger = inject(LoggingService);

  profile = signal<UserProfile>(initialProfile);
  private maxEventHistory = 50;

  constructor() {
    if (!(typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID)) {
      void this.loadProfile();
    }
  }

  async loadProfile(userId: string = 'current') {
    try {
      const saved = await this.db.loadUserProfile(userId);
      if (saved) {
        this.profile.set(this.sanitizeProfile(saved));
      } else if (userId === 'current') {
        await this.updateProfile(initialProfile);
      }
    } catch (err) {
      this.logger.error('Failed to load profile', err);
    }
  }

  async updateProfile(profile: Partial<UserProfile>) {
    const current = this.profile();
    const next = this.sanitizeProfile({ ...current, ...profile });
    this.profile.set(next);
    try {
      await this.db.saveUserProfile(next, 'current');
    } catch (err) {
      this.logger.error('Failed to save profile', err);
    }
  }

  async acquireUpgrade(upgrade: {
    title: string;
    type: string;
    recommendationId?: string;
  }) {
    const next = this.buildUpgradeState(this.profile(), upgrade, 'acquired');
    if (next) {
      await this.updateProfile(next);
    }
  }

  async completeUpgrade(upgrade: {
    title: string;
    type: string;
    recommendationId?: string;
  }) {
    const next = this.buildUpgradeState(this.profile(), upgrade, 'completed');
    if (next) {
      await this.updateProfile(next);
    }
  }

  async updateExpertise(update: Partial<ExpertiseLevels>) {
    const current = this.profile();
    await this.updateProfile({
      expertise: {
        ...current.expertise,
        ...update,
      },
    });
  }

  async addTeamMember(member: Omit<TeamMember, 'id'>) {
    const current = this.profile();
    const newMember: TeamMember = {
      ...member,
      id: `team-${Date.now()}`,
    };
    await this.updateProfile({
      team: [...(current.team || []), newMember],
    });
  }

  async updateFinancials(update: Partial<ProfessionalFinancials>) {
    const current = this.profile();
    await this.updateProfile({
      financials: {
        ...current.financials,
        ...update,
      },
    });
  }

  async recordAudit(log: ProfileAuditLog) {
    const current = this.profile();
    await this.updateProfile({
      strategicHealthScore: log.score,
      criticalDeficits: log.deficits,
      auditHistory: [log, ...(current.auditHistory || [])].slice(0, 20),
    });
  }

  async addCatalogItem(item: Omit<CatalogItem, 'id'>) {
    const current = this.profile();
    const newItem: CatalogItem = {
      ...item,
      id: `cat-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.updateProfile({
      catalog: [...(current.catalog || []), newItem],
    });
  }

  async updateCatalogItem(id: string, update: Partial<CatalogItem>) {
    const current = this.profile();
    const next = (current.catalog || []).map((item) =>
      item.id === id
        ? { ...item, ...update, updatedAt: new Date().toISOString() }
        : item
    );
    await this.updateProfile({ catalog: next });
  }

  async setRecommendationState(
    recommendationId: string,
    state: NonNullable<UpgradeRecommendation['state']>,
    recommendation?: Pick<UpgradeRecommendation, 'title' | 'type'>
  ) {
    if (!recommendationId) {
      return;
    }

    const current = this.profile();
    const currentPreference = (current.recommendationPreferences || {})[
      recommendationId
    ];
    await this.updateProfile({
      ...current,
      recommendationPreferences: {
        ...(current.recommendationPreferences || {}),
        [recommendationId]: {
          state,
          updatedAt: Date.now(),
          actionCount: (currentPreference?.actionCount || 0) + 1,
        },
      },
      recommendationHistory: this.appendRecommendationHistory(
        current.recommendationHistory,
        {
          recommendationId,
          title: recommendation?.title || recommendationId,
          type: recommendation?.type || 'Service',
          state,
          updatedAt: Date.now(),
        }
      ),
    });
  }

  async recordGameResult(gameId: string, context: ThaSpotSessionContext = {}) {
    const current = this.profile();
    const stats = { ...(current.gameStats || {}) };
    const prev = stats[gameId] || {};
    const now = Date.now();

    const roomId = context.roomId || prev.lastRoomId;
    const roomPlays = {
      ...(prev.roomPlays || {}),
      ...(roomId
        ? { [roomId]: ((prev.roomPlays || {})[roomId] || 0) + 1 }
        : {}),
    };

    const nextProgression = this.buildThaSpotProgression(
      current.thaSpotProgression,
      prev,
      {
        ...context,
        playedAt: now,
        roomId,
        roomPlays,
      }
    );

    stats[gameId] = {
      ...prev,
      plays: (prev.plays || 0) + 1,
      lastPlayedAt: now,
      lastRoomId: roomId,
      roomPlays,
      earnedCosmetics: this.mergeUniqueStrings(
        prev.earnedCosmetics,
        context.cosmetics
      ),
      eventHistory: this.buildEventHistory(prev.eventHistory, context),
    };

    await this.updateProfile({
      ...current,
      gameStats: stats,
      thaSpotProgression: nextProgression,
    } as any);
  }

  async recordGameLaunch(gameId: string, context: ThaSpotSessionContext = {}) {
    await this.recordGameResult(gameId, context);
  }

  private buildThaSpotProgression(
    progression: ThaSpotProgression | undefined,
    previousGameStats: ThaSpotGameStat,
    context: ThaSpotSessionContext & {
      playedAt: number;
      roomPlays?: Record<string, number>;
    }
  ): ThaSpotProgression {
    const roomStats = { ...(progression?.roomStats || {}) };
    const roomId = context.roomId || previousGameStats.lastRoomId;

    if (roomId) {
      const existingRoom = roomStats[roomId] || {};
      roomStats[roomId] = {
        plays: Math.max(
          existingRoom.plays || 0,
          (context.roomPlays || {})[roomId] || 0
        ),
        lastPlayedAt: context.playedAt,
      };
    }

    const favoriteRoomId = Object.entries(roomStats).sort(
      (a, b) => (b[1].plays || 0) - (a[1].plays || 0)
    )[0]?.[0];

    return {
      lastSessionAt: context.playedAt,
      lastRoomId: roomId,
      favoriteRoomId,
      roomStats,
      earnedCosmetics: this.mergeUniqueStrings(
        progression?.earnedCosmetics,
        context.cosmetics
      ),
      eventHistory: this.buildEventHistory(progression?.eventHistory, context),
    };
  }

  private buildEventHistory(
    history: ThaSpotEventHistoryEntry[] | undefined,
    context: ThaSpotSessionContext
  ) {
    if (!context.eventId) {
      return history || [];
    }

    return [
      ...(history || []),
      {
        eventId: context.eventId,
        roomId: context.roomId,
        reward: context.reward,
        rewardType: this.normalizeRewardType(context.rewardType),
        participatedAt: Date.now(),
      },
    ].slice(-this.maxEventHistory);
  }

  private sanitizeProfile(profile: UserProfile): UserProfile {
    const {
      xp: _xp,
      level: _level,
      achievements: _achievements,
      lastXpReason: _lastXpReason,
      lastXpAt: _lastXpAt,
      ...cleanProfile
    } = profile as any;

    return {
      ...cleanProfile,
      artistIdentity: ensureArtistIdentityState(
        profile.artistName,
        profile.primaryGenre,
        profile.artistIdentity
      ),
      knowledgeBase: profile.knowledgeBase || initialProfile.knowledgeBase,
      expertise: profile.expertise || initialProfile.expertise,
      team: profile.team || [],
      marketingCampaigns: profile.marketingCampaigns || [],
      financials: {
        ...initialProfile.financials,
        ...(profile.financials || {}),
      },
      equipment: [...(profile.equipment || [])],
      daw: [...(profile.daw || [])],
      services: [...(profile.services || [])],
      catalog: [...(profile.catalog || [])],
      avatarImage: profile.avatarImage,
      headerImage: profile.headerImage,
      pressGallery: profile.pressGallery || [],
      strategicHealthScore: profile.strategicHealthScore || 0,
      criticalDeficits: profile.criticalDeficits || [],
      auditHistory: (profile.auditHistory || []).map((log: any) => ({
        ...log,
        auditType: log.auditType || 'Full',
      })),

      // Onboarding & UI specific fields
      skills: profile.skills || [],
      brandVoices: profile.brandVoices || [],
      strategicGoals: profile.strategicGoals || [],
      performancesPerYear: profile.performancesPerYear || 'None',
      touringDetails: profile.touringDetails || initialProfile.touringDetails,
      genreSpecificData: profile.genreSpecificData || {},

      recommendationPreferences: Object.fromEntries(
        Object.entries(profile.recommendationPreferences || {}).map(
          ([recommendationId, preference]) => [
            recommendationId,
            {
              state: preference?.state || 'suggested',
              updatedAt: preference?.updatedAt || Date.now(),
              actionCount: preference?.actionCount || 0,
            },
          ]
        )
      ),
      recommendationHistory: (profile.recommendationHistory || [])
        .map((entry: any) => ({
          recommendationId: entry.recommendationId,
          title: entry.title || entry.recommendationId,
          type: entry.type || 'Service',
          state: entry.state || 'suggested',
          updatedAt: entry.updatedAt || Date.now(),
        }))
        .slice(-30),
      gameStats: this.sanitizeGameStats(profile.gameStats),
      thaSpotProgression: this.sanitizeThaSpotProgression(
        profile.thaSpotProgression
      ),
    };
  }

  private buildUpgradeState(
    current: UserProfile,
    upgrade: { title: string; type: string; recommendationId?: string },
    state: Extract<
      NonNullable<UpgradeRecommendation['state']>,
      'acquired' | 'completed'
    >
  ): UserProfile | null {
    const title = upgrade.title?.trim() || '';
    if (!title) {
      return null;
    }

    const next: UserProfile = {
      ...current,
      equipment: [...(current.equipment || [])],
      daw: [...(current.daw || [])],
      services: [...(current.services || [])],
      recommendationPreferences: {
        ...(current.recommendationPreferences || {}),
      },
      recommendationHistory: [...(current.recommendationHistory || [])],
    };

    if (upgrade.type === 'Gear') {
      if (!next.equipment.includes(title)) next.equipment.push(title);
    } else if (upgrade.type === 'Software') {
      if (!next.daw.includes(title)) next.daw.push(title);
    } else if (upgrade.type === 'Service') {
      if (!next.services.includes(title)) next.services.push(title);
    } else {
      return null;
    }

    if (upgrade.recommendationId) {
      const preference =
        next.recommendationPreferences[upgrade.recommendationId];
      next.recommendationPreferences[upgrade.recommendationId] = {
        state,
        updatedAt: Date.now(),
        actionCount: (preference?.actionCount || 0) + 1,
      };
      next.recommendationHistory = this.appendRecommendationHistory(
        next.recommendationHistory,
        {
          recommendationId: upgrade.recommendationId,
          title,
          type: this.normalizeRecommendationType(upgrade.type),
          state,
          updatedAt: Date.now(),
        }
      );
    }

    return next;
  }

  private sanitizeGameStats(
    stats: Record<string, ThaSpotGameStat> | undefined
  ): Record<string, ThaSpotGameStat> {
    return Object.fromEntries(
      Object.entries(stats || {}).map(([gameId, stat]) => [
        gameId,
        {
          plays: stat?.plays || 0,
          lastPlayedAt: stat?.lastPlayedAt,
          lastRoomId: stat?.lastRoomId,
          roomPlays: { ...(stat?.roomPlays || {}) },
          earnedCosmetics: [...(stat?.earnedCosmetics || [])],
          eventHistory: this.sanitizeEventHistory(stat?.eventHistory),
        },
      ])
    );
  }

  private sanitizeThaSpotProgression(
    progression: ThaSpotProgression | undefined
  ): ThaSpotProgression {
    return {
      lastSessionAt: progression?.lastSessionAt,
      lastRoomId: progression?.lastRoomId,
      favoriteRoomId: progression?.favoriteRoomId,
      roomStats: Object.fromEntries(
        Object.entries(progression?.roomStats || {}).map(([roomId, stat]) => [
          roomId,
          {
            plays: stat?.plays || 0,
            lastPlayedAt: stat?.lastPlayedAt,
          },
        ])
      ),
      earnedCosmetics: [...(progression?.earnedCosmetics || [])],
      eventHistory: this.sanitizeEventHistory(progression?.eventHistory),
    };
  }

  private sanitizeEventHistory(
    history: ThaSpotEventHistoryEntry[] | undefined
  ): ThaSpotEventHistoryEntry[] {
    return (history || []).map((entry) => ({
      eventId: entry.eventId,
      roomId: entry.roomId,
      reward: entry.reward,
      rewardType: this.normalizeRewardType(entry.rewardType),
      participatedAt: entry.participatedAt,
    }));
  }

  private normalizeRewardType(
    rewardType: string | undefined
  ): ThaSpotEventHistoryEntry['rewardType'] {
    switch (rewardType) {
      case 'access':
      case 'cosmetic':
      case 'token':
        return rewardType;
      default:
        return undefined;
    }
  }

  private mergeUniqueStrings(
    existing: string[] | undefined,
    incoming: string[] | undefined
  ) {
    return [...new Set([...(existing || []), ...(incoming || [])])];
  }

  private appendRecommendationHistory(
    history: RecommendationHistoryEntry[] | undefined,
    entry: RecommendationHistoryEntry
  ): RecommendationHistoryEntry[] {
    return [...(history || []), entry].slice(-30);
  }

  private normalizeRecommendationType(
    type: string
  ): UpgradeRecommendation['type'] {
    switch (type) {
      case 'Gear':
      case 'Software':
        return type;
      default:
        return 'Service';
    }
  }
}
