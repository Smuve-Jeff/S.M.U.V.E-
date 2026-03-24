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
  gameStats?: Record<
    string,
    {
      bestScore?: number;
      lastScore?: number;
      plays?: number;
      lastPlayedAt?: number;
    }
  >;

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
};

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private logger = inject(LoggingService);
  private databaseService = inject(DatabaseService);

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
    const next: UserProfile = {
      ...current,
      equipment: [...(current.equipment || [])],
      daw: [...(current.daw || [])],
    };

    if (upgrade.type === 'Gear') {
      next.equipment.push(upgrade.title);
    } else {
      next.daw.push(upgrade.title);
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

  async recordGameResult(gameId: string, score: number): Promise<void> {
    const current = this.profile();
    const stats = { ...(current.gameStats || {}) };
    const prev = stats[gameId] || {};

    stats[gameId] = {
      bestScore: Math.max(prev.bestScore || 0, score),
      lastScore: score,
      plays: (prev.plays || 0) + 1,
      lastPlayedAt: Date.now(),
    };

    await this.updateProfile({
      ...current,
      gameStats: stats,
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
}
