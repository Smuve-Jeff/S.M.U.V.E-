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
  [key: string]: any;
}

export const initialProfile: UserProfile = {
  settings: {
    ui: {
      theme: 'Light',
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
};

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private logger = inject(LoggingService);
  private databaseService = inject(DatabaseService);

  profile = signal<UserProfile>(initialProfile);
  profile$ = signal<UserProfile>(initialProfile);

  constructor() {}

  async loadProfile(userId: string): Promise<void> {
    try {
      // Lazy load DatabaseService logic to avoid circular dependency if needed,
      // but here we just call it.
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
    if (upgrade.type === 'Gear') {
      current.equipment.push(upgrade.title);
    } else {
      current.daw.push(upgrade.title);
    }
    await this.updateProfile(current);
  }
}
