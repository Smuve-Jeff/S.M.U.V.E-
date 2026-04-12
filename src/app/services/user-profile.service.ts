import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import {
  RecommendationHistoryEntry,
  UpgradeRecommendation,
} from '../types/ai.types';
import {
  ArtistIdentityState,
  createInitialArtistIdentity,
  ensureArtistIdentityState,
} from '../types/artist-identity.types';

export interface AppSettings {
  ui: {
    theme: string;
    performanceMode: boolean;
    showScanlines: boolean;
    animationsEnabled: boolean;
    autoPianoRoll: boolean;
  };
  audio: { masterVolume: number; autoSaveEnabled: boolean };
  ai: { kbWriteAccess: boolean; commanderPersona: string };
  security: { twoFactorEnabled: boolean };
}

export interface CatalogItem {
  id: string;
  title: string;
  artist?: string;
  genre?: string;
  status?: string;
  category?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  url?: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface ThaSpotEventHistoryEntry {
  eventId: string;
  roomId?: string;
  reward?: string;
  rewardType?: 'access' | 'cosmetic' | 'token';
  participatedAt: number;
}

export interface ThaSpotRoomStat {
  plays?: number;
  lastPlayedAt?: number;
}

export interface ThaSpotGameStat {
  plays?: number;
  lastPlayedAt?: number;
  lastRoomId?: string;
  roomPlays?: Record<string, number>;
  earnedCosmetics?: string[];
  eventHistory?: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotProgression {
  lastSessionAt?: number;
  lastRoomId?: string;
  favoriteRoomId?: string;
  roomStats?: Record<string, ThaSpotRoomStat>;
  earnedCosmetics?: string[];
  eventHistory?: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotSessionContext {
  roomId?: string;
  eventId?: string;
  reward?: string;
  rewardType?: 'access' | 'cosmetic' | 'token';
  cosmetics?: string[];
}

export interface RecommendationPreference {
  state: NonNullable<UpgradeRecommendation['state']>;
  updatedAt: number;
  actionCount?: number;
}

export interface UserProfile {
  id?: string;
  artistName: string;
  primaryGenre: string;
  website?: string;
  settings: AppSettings;
  knowledgeBase: any;
  careerGoals: string[];
  equipment: string[];
  daw: string[];
  services?: string[];
  recommendationPreferences?: Record<string, RecommendationPreference>;
  recommendationHistory?: RecommendationHistoryEntry[];
  expertise?: any;
  team?: any[];
  marketingCampaigns?: any[];
  proName?: string;
  proIpi?: string;
  catalog: CatalogItem[];
  artistIdentity?: ArtistIdentityState;

  // Gameplay progression
  gameStats?: Record<string, ThaSpotGameStat>;
  thaSpotProgression?: ThaSpotProgression;

  [key: string]: any;
}

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
    learnedStyles: [],
    productionSecrets: [],
    strategicDirectives: [],
    genreAnalysis: {},
    strategicHealthScore: 0,
  },
  careerGoals: [],
  equipment: [],
  daw: [],
  services: [],
  recommendationPreferences: {},
  recommendationHistory: [],
  marketingCampaigns: [],
  catalog: [],
  artistIdentity: createInitialArtistIdentity('New Artist', 'Hip Hop'),
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
  private logger = inject(LoggingService);
  private databaseService = inject(DatabaseService);
  private readonly maxEventHistory = 20;

  profile = signal<UserProfile>(initialProfile);
  profile$ = signal<UserProfile>(initialProfile);

  async loadProfile(userId: string): Promise<void> {
    try {
      const userProfile = await this.databaseService.loadUserProfile(userId);
      const sanitizedProfile = this.sanitizeProfile(
        userProfile || {
          ...initialProfile,
          id: userId,
        }
      );
      this.profile.set(sanitizedProfile);
      this.profile$.set(sanitizedProfile);
    } catch (error) {
      this.logger.error('UserProfileService: Failed to load profile', error);
    }
  }

  async updateProfile(newProfile: UserProfile, userId?: string): Promise<void> {
    try {
      const id = userId || newProfile.id || this.profile().id || 'anonymous';
      const sanitizedProfile = this.sanitizeProfile(newProfile);
      await this.databaseService.saveUserProfile(sanitizedProfile, id);
      this.profile.set(sanitizedProfile);
      this.profile$.set(sanitizedProfile);
    } catch (error) {
      this.logger.error('UserProfileService: Failed to save profile', error);
    }
  }

  async acquireUpgrade(upgrade: {
    title: string;
    type: string;
    recommendationId?: string;
  }) {
    const next = this.buildUpgradeState(this.profile(), upgrade, 'acquired');
    if (!next) {
      return;
    }
    await this.updateProfile(next);
  }

  async completeUpgrade(upgrade: {
    title: string;
    type: string;
    recommendationId?: string;
  }) {
    const next = this.buildUpgradeState(this.profile(), upgrade, 'completed');
    if (!next) {
      return;
    }
    await this.updateProfile(next);
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
    // For now, recordGameLaunch redirects to recording a result update or session start
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
      equipment: [...(profile.equipment || [])],
      daw: [...(profile.daw || [])],
      services: [...(profile.services || [])],
      marketingCampaigns: [...(profile.marketingCampaigns || [])],
      catalog: [...(profile.catalog || [])],
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
}
