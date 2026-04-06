import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';

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
  rewardType?: 'xp' | 'cosmetic' | 'token';
  participatedAt: number;
}

export interface ThaSpotRoomStat {
  plays?: number;
  bestScore?: number;
  lastPlayedAt?: number;
  masteryScore?: number;
}

export interface ThaSpotGameStat {
  bestScore?: number;
  lastScore?: number;
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
  rewardType?: 'xp' | 'cosmetic' | 'token';
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
  expertise?: any;
  team?: any[];
  marketingCampaigns?: any[];
  proName?: string;
  proIpi?: string;
  catalog: CatalogItem[];

  // Gameplay progression
  xp?: number;
  level?: number;
  achievements?: { id: string; title: string; unlockedAt: number }[];
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
  marketingCampaigns: [],
  catalog: [],

  xp: 0,
  level: 1,
  achievements: [],
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
        this.profile.set(userProfile);
        this.profile$.set(userProfile);
      }
    } catch (error) {
      this.logger.error('UserProfileService: Failed to load profile', error);
    }
  }

  async updateProfile(newProfile: UserProfile, userId?: string): Promise<void> {
    try {
      const id = userId || 'anonymous';
      await this.databaseService.saveUserProfile(newProfile, id);
      this.profile.set(newProfile);
      this.profile$.set(newProfile);
    } catch (error) {
      this.logger.error('UserProfileService: Failed to save profile', error);
    }
  }

  async acquireUpgrade(upgrade: { title: string; type: string }) {
    const current = this.profile();
    const title = upgrade.title?.trim() || '';
    const next: UserProfile = {
      ...current,
      equipment: [...(current.equipment || [])],
      daw: [...(current.daw || [])],
    };

    if (!title) {
      return;
    }

    if (upgrade.type === 'Gear') {
      if (next.equipment.includes(title)) {
        return;
      }
      next.equipment.push(title);
    } else {
      if (next.daw.includes(title)) {
        return;
      }
      next.daw.push(title);
    }

    await this.updateProfile(next);
  }

  /**
   * Adds XP and auto-levels the user.
   * Level curve: each level requires 250 * level XP.
   */
  async awardXp(amount: number, reason: string = 'activity'): Promise<void> {
    const current = this.profile();
    const xp = (current.xp || 0) + Math.max(0, Math.floor(amount));

    const requiredForNext = (lvl: number) => 250 * lvl;
    let level = 1;
    let remaining = xp;
    while (remaining >= requiredForNext(level)) {
      remaining -= requiredForNext(level);
      level++;
      if (level > 999) break;
    }

    await this.updateProfile({
      ...current,
      xp,
      level,
      lastXpReason: reason,
      lastXpAt: Date.now(),
    } as any);
  }

  async recordGameResult(
    gameId: string,
    score: number,
    context: ThaSpotSessionContext = {}
  ): Promise<void> {
    const current = this.profile();
    const stats = { ...(current.gameStats || {}) };
    const prev = stats[gameId] || {};
    const now = Date.now();
    const isNewPlaySession =
      !prev.lastPlayedAt || now - prev.lastPlayedAt > this.streakWindowMs;
    const nextProgression = this.buildThaSpotProgression(
      current.thaSpotProgression,
      prev,
      {
        ...context,
        playedAt: now,
        score,
      }
    );

    stats[gameId] = {
      ...prev,
      bestScore: Math.max(prev.bestScore || 0, score),
      lastScore: score,
      plays: (prev.plays || 0) + (isNewPlaySession ? 1 : 0),
      lastPlayedAt: now,
      currentStreak: nextProgression.currentStreak,
      longestStreak: Math.max(
        prev.longestStreak || 0,
        nextProgression.longestStreak || 0
      ),
      lastRoomId: context.roomId || prev.lastRoomId,
      roomPlays: prev.roomPlays || {},
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

  async unlockAchievement(id: string, title: string): Promise<void> {
    const current = this.profile();
    const achievements = [...(current.achievements || [])];
    if (achievements.some((a) => a.id === id)) return;

    achievements.push({ id, title, unlockedAt: Date.now() });
    await this.updateProfile({
      ...current,
      achievements,
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
        bestScore: Math.max(existingRoom.bestScore || 0, context.score || 0),
        lastPlayedAt: context.playedAt,
        masteryScore:
          (existingRoom.masteryScore || 0) +
          (sessionIncrement ? 10 : 0) +
          Math.min(40, Math.floor((context.score || 0) / 100)),
      };
    }

    const favoriteRoomId = Object.entries(roomStats).sort(
      (a, b) => (b[1].masteryScore || 0) - (a[1].masteryScore || 0)
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
        rewardType: context.rewardType,
        participatedAt: Date.now(),
      },
    ].slice(-this.maxEventHistory);
  }

  private mergeUniqueStrings(
    existing: string[] | undefined,
    incoming: string[] | undefined
  ) {
    return [...new Set([...(existing || []), ...(incoming || [])])];
  }
}
