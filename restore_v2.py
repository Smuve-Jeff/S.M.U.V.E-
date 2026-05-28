import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. UserProfileService - Restore exports and full contract
write_file('src/app/services/user-profile.service.ts', """import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import {
  UserProfile,
  AppSettings,
  CatalogItem,
  ExpertiseLevels,
  TeamMember,
  ProfessionalFinancials,
  ProfileAuditLog,
  RecommendationHistoryEntry,
  UpgradeRecommendation
} from '../types/profile.types';
import { createInitialArtistIdentity } from '../types/artist-identity.types';

export type {
  UserProfile,
  AppSettings,
  CatalogItem,
  RecommendationHistoryEntry,
  UpgradeRecommendation
};

export const initialProfile: UserProfile = {
  settings: {
    ui: { theme: 'Dark', performanceMode: false, showScanlines: false, animationsEnabled: true, autoPianoRoll: false },
    audio: { masterVolume: 0.8, autoSaveEnabled: true },
    ai: { kbWriteAccess: true, commanderPersona: 'Elite' },
    security: { twoFactorEnabled: false, endToEndEncryption: false, biometricLock: false, auditLogEnabled: true, sessionTimeout: 3600 },
  },
  artistName: 'New Artist', primaryGenre: 'Hip Hop',
  knowledgeBase: { id: 'kb-initial', artistId: 'new-artist', dataPoints: [], learnedStyles: [], productionSecrets: [], coreTrends: [], strategicDirectives: [], marketIntel: [], genreAnalysis: {}, brandStatus: {}, strategicHealthScore: 0 },
  careerGoals: [], equipment: [], daw: [], services: [], recommendationPreferences: {}, recommendationHistory: [],
  expertise: { production: 0, songwriting: 0, marketing: 0, business: 0, legal: 0, performance: 0, catalyst: 0 },
  team: [], marketingCampaigns: [],
  financials: { accounts: [], monthlyBudget: 0, totalRevenue: 0, pendingPayouts: 0, splitSheets: [], revenueHistory: [] },
  catalog: [], artistIdentity: createInitialArtistIdentity('New Artist', 'Hip Hop'),
  strategicHealthScore: 0, criticalDeficits: [],
  strategicSignals: { marketReadiness: 0, identityTrust: 0, careerMomentum: 0, technicalAuthority: 0, syncViability: 0, touringStability: 0 },
  auditHistory: [], skills: [], productionStyles: [], brandVoices: [], strategicGoals: [], performancesPerYear: 'None',
  touringDetails: { travelPreference: 'Van', regions: [], isTourReady: 'Studio Only', hasBackline: 'No' },
  syncDetails: { isSyncReady: 'Not Started', hasCleanVersions: false, hasInstrumentals: false, hasStems: 'No', oneStopClearance: false, catalogSize: 0, preferredKeywords: [] },
  legalInfrastructure: { hasRegisteredWorks: false, proAffiliation: "None", hasStandardSplitSheet: "Never", isIncorporated: false, trademarkStatus: "None" },
  genreSpecificData: {}, gameStats: {},
  thaSpotProgression: { roomStats: {}, earnedCosmetics: [], eventHistory: [] },
};

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private get db(): DatabaseService { return this.injector.get(DatabaseService); }

  profile = signal<UserProfile>(initialProfile);

  constructor() {
    if (typeof window !== 'undefined' && !(typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID)) {
      setTimeout(() => void this.loadProfile(), 0);
    }
  }

  async loadProfile(id: string = 'current') {
    try { const saved = await this.db.loadUserProfile(id); if (saved) this.profile.set(saved); }
    catch (err) { this.logger.error('Failed to load profile', err); }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p }; this.profile.set(next);
    try { await this.db.saveUserProfile(next, 'current'); } catch (e) {}
  }

  async acquireUpgrade(u: any) { await this.updateProfile({ strategicHealthScore: (this.profile().strategicHealthScore || 0) + 5 }); }
  async completeUpgrade(u: any) { await this.updateProfile({ strategicHealthScore: (this.profile().strategicHealthScore || 0) + 10 }); }
  async updateExpertise(u: Partial<ExpertiseLevels>) { await this.updateProfile({ expertise: { ...this.profile().expertise, ...u } }); }
  async addTeamMember(m: any) { await this.updateProfile({ team: [...(this.profile().team || []), m] }); }
  async updateFinancials(u: Partial<ProfessionalFinancials>) { await this.updateProfile({ financials: { ...this.profile().financials, ...u } }); }
  async recordAudit(l: ProfileAuditLog) { await this.updateProfile({ strategicHealthScore: l.score, criticalDeficits: l.deficits, auditHistory: [l, ...(this.profile().auditHistory || [])].slice(0, 20) }); }

  async setRecommendationState(id: string, state: any, metadata?: any) {
    const entry: RecommendationHistoryEntry = { id, state, timestamp: Date.now(), metadata };
    await this.updateProfile({ recommendationHistory: [...(this.profile().recommendationHistory || []), entry].slice(-30) });
  }

  async recordGameLaunch(gid: string, ctx: any) {}
  async recordGameResult(gid: string, res: any) {}
}
""")

# 2. DatabaseService - Add missing saveArtistIdentity
write_file('src/app/services/database.service.ts', """import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, inject, signal } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { firstValueFrom } from 'rxjs';
import { ArtistIdentityState } from '../types/artist-identity.types';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private http = inject(HttpClient);
  private localStorageService = inject(LocalStorageService);
  private tokenService = inject(TokenService);
  private API_URL = APP_SECURITY_CONFIG.api_url;

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }

  get apiUrl(): string { return this.API_URL; }

  isSyncing = signal(false);
  lastSyncTime = signal<number | null>(null);

  private getProfileBackupKey(userId?: string): string {
    return userId ? `smuve_user_profile_backup_${userId}` : 'smuve_user_profile_backup';
  }

  async saveUserProfile(profile: UserProfile, userId: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getProfileBackupKey(userId), JSON.stringify(profile));
    }
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(this.http.post(`${this.API_URL}/profile`, { userId, profileData: profile }, this.getHeaders()));
        this.lastSyncTime.set(Date.now());
      } catch (error) { this.logger.error('Failed to sync profile to cloud', error); }
      finally { this.isSyncing.set(false); }
    }
  }

  async loadUserProfile(userId: string): Promise<UserProfile | null> {
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const profile = await firstValueFrom(this.http.get<UserProfile>(`${this.API_URL}/profile/${userId}`, this.getHeaders()));
        if (profile) {
          if (typeof localStorage !== 'undefined') { localStorage.setItem(this.getProfileBackupKey(userId), JSON.stringify(profile)); }
          return profile;
        }
      } catch (error) { this.logger.error('Failed to load profile from cloud', error); }
    }
    if (typeof localStorage === 'undefined') return null;
    const backup = localStorage.getItem(this.getProfileBackupKey(userId)) || localStorage.getItem(this.getProfileBackupKey());
    return backup ? JSON.parse(backup) : null;
  }

  async saveProject(projectId: string, title: string, projectData: any, userId: string): Promise<void> {
    await this.localStorageService.saveItem('projects', { id: projectId, title, data: projectData, userId: userId || 'anonymous', updatedAt: Date.now() });
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(this.http.post(`${this.API_URL}/projects`, { projectId, userId, title, projectData }, this.getHeaders()));
        this.lastSyncTime.set(Date.now());
      } catch (error) { this.logger.error(`Failed to sync project ${title} to cloud`, error); }
      finally { this.isSyncing.set(false); }
    }
  }

  async saveArtistIdentity(userId: string, identity: ArtistIdentityState, profile?: UserProfile): Promise<void> {
    await this.localStorageService.saveItem('projects', { id: `artist-identity:${userId}`, userId, identity, profileSnapshot: profile, updatedAt: Date.now() });
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(this.http.post(`${this.API_URL}/identity`, { userId, identity, profileData: profile }, this.getHeaders()));
        this.lastSyncTime.set(Date.now());
      } catch (error) { this.logger.error('Failed to sync artist identity to cloud', error); }
      finally { this.isSyncing.set(false); }
    }
  }
}
""")
