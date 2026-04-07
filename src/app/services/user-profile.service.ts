import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { UpgradeRecommendation } from '../types/ai.types';

export interface AppSettings {
  ui: {
    theme: string;
    performanceMode: boolean;
    showScanlines: boolean;
    animationsEnabled: boolean;
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
  currentStreak?: number;
  longestStreak?: number;
  lastRoomId?: string;
  roomPlays?: Record<string, number>;
  earnedCosmetics?: string[];
  eventHistory?: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotProgression {
  currentStreak?: number;
  longestStreak?: number;
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

export interface UserProfile {
  id?: string;
  artistName: string;
  primaryGenre: string;
  settings: AppSettings;
  knowledgeBase: any;
  careerGoals: string[];
  equipment: string[];
  daw: string[];
  services?: string[];
  recommendationPreferences?: Record<
    string,
    {
      state: NonNullable<UpgradeRecommendation['state']>;
      updatedAt: number;
    }
  >;
  expertise?: any;
  team?: any[];
  marketingCampaigns?: any[];
  proName?: string;
  proIpi?: string;
  catalog: CatalogItem[];

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
  marketingCampaigns: [],
  catalog: [],
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
  private readonly streakWindowMs = 1000 * 60 * 60 * 18;
  private readonly maxEventHistory = 20;

  profile = signal<UserProfile>(initialProfile);
  profile$ = signal<UserProfile>(initialProfile);

  async loadProfile(userId: string): Promise<void> {
    try {
      const userProfile = await this.databaseService.loadUserProfile(userId);
      if (userProfile) {
        const sanitizedProfile = this.sanitizeProfile(userProfile);
        this.profile.set(sanitizedProfile);
        this.profile$.set(sanitizedProfile);
      }
    } catch (error) {
      this.logger.error('UserProfileService: Failed to load profile', error);
    }
  }

  async updateProfile(newProfile: UserProfile, userId?: string): Promise<void> {
    try {
      const id = userId || 'anonymous';
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
    const current = this.profile();
    const title = upgrade.title?.trim() || '';
    const next: UserProfile = {
      ...current,
      equipment: [...(current.equipment || [])],
      daw: [...(current.daw || [])],
      services: [...(current.services || [])],
      recommendationPreferences: {
        ...(current.recommendationPreferences || {}),
      },
    };

    if (!title) {
      return;
    }

    if (upgrade.type === 'Gear') {
      if (next.equipment.includes(title)) {
        return;
      }
      next.equipment.push(title);
    } else if (upgrade.type === 'Software') {
      if (next.daw.includes(title)) {
        return;
      }
      next.daw.push(title);
    } else if (upgrade.type === 'Service') {
      if (next.services.includes(title)) {
        return;
      }
      next.services.push(title);
    } else {
      return;
    }

    if (upgrade.recommendationId) {
      next.recommendationPreferences[upgrade.recommendationId] = {
        state: 'acquired',
        updatedAt: Date.now(),
      };
    }

    await this.updateProfile(next);
  }

  async setRecommendationState(
    recommendationId: string,
    state: NonNullable<UpgradeRecommendation['state']>
  ) {
    if (!recommendationId) {
      return;
    }

    const current = this.profile();
    await this.updateProfile({
      ...current,
      recommendationPreferences: {
        ...(current.recommendationPreferences || {}),
        [recommendationId]: {
          state,
          updatedAt: Date.now(),
        },
      },
    });
  }

  async recordGameSession(
    gameId: string,
    context: ThaSpotSessionContext = {}
  ): Promise<void> {
    const current = this.profile();
    const stats = { ...(current.gameStats || {}) };
    const prev = stats[gameId] || {};
    const playedAt = Date.now();
    const previousPlayedAt =
      prev.lastPlayedAt || current.thaSpotProgression?.lastSessionAt;
    const currentStreak =
      previousPlayedAt && playedAt - previousPlayedAt <= this.streakWindowMs
        ? (prev.currentStreak ||
            current.thaSpotProgression?.currentStreak ||
            0) + 1
        : 1;
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
        playedAt,
        roomId,
        currentStreak,
        roomPlays,
      }
    );

    stats[gameId] = {
      ...prev,
      plays: (prev.plays || 0) + 1,
      lastPlayedAt: playedAt,
      currentStreak,
      longestStreak: Math.max(prev.longestStreak || 0, currentStreak),
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

  private buildThaSpotProgression(
    progression: ThaSpotProgression | undefined,
    previousGameStats: ThaSpotGameStat,
    context: ThaSpotSessionContext & {
      playedAt: number;
      score?: number;
      currentStreak?: number;
      roomPlays?: Record<string, number>;
    }
  ): ThaSpotProgression {
    const roomStats = { ...(progression?.roomStats || {}) };
    const roomId = context.roomId || previousGameStats.lastRoomId;

    if (roomId) {
      const existingRoom = roomStats[roomId] || {};
      const sessionIncrement = context.currentStreak ? 1 : 0;
      roomStats[roomId] = {
        plays: (existingRoom.plays || 0) + sessionIncrement,
        lastPlayedAt: context.playedAt,
      };
    }

    const favoriteRoomId = Object.entries(roomStats).sort(
      (a, b) => (b[1].plays || 0) - (a[1].plays || 0)
    )[0]?.[0];

    return {
      currentStreak: context.currentStreak || progression?.currentStreak || 1,
      longestStreak: Math.max(
        progression?.longestStreak || 0,
        context.currentStreak || 0
      ),
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
    return {
      ...profile,
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
            },
          ]
        )
      ),
      gameStats: this.sanitizeGameStats(profile.gameStats),
      thaSpotProgression: this.sanitizeProgression(profile.thaSpotProgression),
    };
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
          currentStreak: stat?.currentStreak || 0,
          longestStreak: stat?.longestStreak || 0,
          lastRoomId: stat?.lastRoomId,
          roomPlays: { ...(stat?.roomPlays || {}) },
          earnedCosmetics: [...(stat?.earnedCosmetics || [])],
          eventHistory: this.sanitizeEventHistory(stat?.eventHistory),
        },
      ])
    );
  }

  private sanitizeProgression(
    progression: ThaSpotProgression | undefined
  ): ThaSpotProgression {
    return {
      currentStreak: progression?.currentStreak || 0,
      longestStreak: progression?.longestStreak || 0,
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
      case 'cosmetic':
      case 'token':
        return rewardType;
      case 'xp':
        return 'access';
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
