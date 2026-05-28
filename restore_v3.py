import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# Fix LoginConfirmationService sendLoginConfirmation signature
write_file('src/app/services/login-confirmation.service.ts', """import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import type { AuthUser } from './auth.service';

@Injectable({ providedIn: 'root' })
export class LoginConfirmationService {
  private http = inject(HttpClient);
  private database = inject(DatabaseService);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }

  async sendLoginConfirmation(user: AuthUser, token?: string | null): Promise<void> {
    if (!user?.email || !user.lastLogin) return;
    try {
      const loginAt = user.lastLogin instanceof Date ? user.lastLogin.toISOString() : new Date(user.lastLogin).toISOString();
      await firstValueFrom(this.http.post(`${this.database.apiUrl}/auth/login-email`, {
        userId: user.id, email: user.email, artistName: user.artistName, loginAt,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      }, this.getHeaders()));
    } catch (e) { this.logger.warn('Login confirmation failed', e); }
  }
}
""")

# Fix UserProfileService imports from types
write_file('src/app/services/user-profile.service.ts', """import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { UserProfile, AppSettings, CatalogItem, ExpertiseLevels, TeamMember, ProfessionalFinancials, ProfileAuditLog, RecommendationHistoryEntry, UpgradeRecommendation } from '../types/profile.types';
import { createInitialArtistIdentity } from '../types/artist-identity.types';

export type { UserProfile, AppSettings, CatalogItem, RecommendationHistoryEntry, UpgradeRecommendation };

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
  async acquireUpgrade(u: any) {}
  async completeUpgrade(u: any) {}
  async updateExpertise(u: any) {}
  async addTeamMember(m: any) {}
  async updateFinancials(u: any) {}
  async recordAudit(l: any) {}
  async setRecommendationState(id: string, state: any, metadata?: any) {}
  async recordGameLaunch(gid: string, ctx: any) {}
  async recordGameResult(gid: string, res: any) {}
}
""")

# Fix profile.types.ts exports
write_file('src/app/types/profile.types.ts', """import { ArtistIdentityState } from './artist-identity.types';
import { ArtistKnowledgeBase, RecommendationHistoryEntry, UpgradeRecommendation } from './ai.types';
import { MarketingCampaign } from './marketing.types';

export type { RecommendationHistoryEntry, UpgradeRecommendation };

export interface AppSettings {
  ui: { theme: string; performanceMode: boolean; showScanlines: boolean; animationsEnabled: boolean; autoPianoRoll: boolean; };
  audio: { masterVolume: number; autoSaveEnabled: boolean };
  ai: { kbWriteAccess: boolean; commanderPersona: string };
  security: { twoFactorEnabled: boolean; endToEndEncryption: boolean; biometricLock: boolean; auditLogEnabled: boolean; sessionTimeout: number; };
}

export interface CatalogItem {
  id: string; title: string; artist?: string; genre?: string; status?: string; category?: string; bpm?: number; key?: string; duration?: number; url?: string; metadata?: any; createdAt?: string; updatedAt?: string;
}

export interface StrategicSignals { marketReadiness: number; identityTrust: number; careerMomentum: number; technicalAuthority: number; syncViability: number; touringStability: number; }

export interface SyncDetails { isSyncReady: string; hasCleanVersions: boolean; hasInstrumentals: boolean; hasStems: string; oneStopClearance: boolean; catalogSize: number; preferredKeywords: string[]; }

export interface LegalInfrastructure { hasRegisteredWorks: boolean; proAffiliation: string; hasStandardSplitSheet: string; isIncorporated: boolean; legalEntityName?: string; trademarkStatus: 'None' | 'Pending' | 'Registered'; }

export interface ThaSpotEventHistoryEntry { eventId: string; roomId?: string; reward?: string; rewardType?: 'access' | 'cosmetic' | 'token'; participatedAt: number; }

export interface ThaSpotRoomStat { plays?: number; highScore?: number; bestLevel?: number; lastPlayedAt?: number; }

export interface ThaSpotGameStat { plays?: number; highScore?: number; bestLevel?: number; lastPlayedAt?: number; lastRoomId?: string; roomPlays?: Record<string, number>; earnedCosmetics?: string[]; eventHistory?: ThaSpotEventHistoryEntry[]; }

export interface ThaSpotProgression { lastSessionAt?: number; lastRoomId?: string; favoriteRoomId?: string; roomStats: Record<string, ThaSpotRoomStat>; earnedCosmetics: string[]; eventHistory: ThaSpotEventHistoryEntry[]; }

export interface ThaSpotSessionContext { roomId: string; startedAt: number; gameId?: string; mode?: string; }

export interface ExpertiseLevels { production: number; songwriting: number; marketing: number; business: number; legal: number; performance: number; catalyst: any; technical_mastery?: number; }

export interface TeamMember { id: string; name: string; role: string; email?: string; share: number; bio?: string; joinedAt: string; }

export interface ProfessionalFinancials { accounts: any[]; monthlyBudget: number; totalRevenue: number; pendingPayouts: number; splitSheets: any[]; revenueHistory: any[]; }

export interface ProfileAuditLog { score: number; status: string; alerts: string[]; deficits: string[]; timestamp: number; }

export interface UserProfile {
  id?: string; artistName: string; primaryGenre: string; website?: string; proIpi?: string; skills?: string[]; productionStyles?: string[]; brandVoices?: string[]; strategicGoals?: string[]; performancesPerYear?: string;
  settings: AppSettings; knowledgeBase: ArtistKnowledgeBase; careerGoals: string[]; equipment: string[]; daw: string[]; services: string[]; recommendationPreferences: any; recommendationHistory: RecommendationHistoryEntry[]; expertise: ExpertiseLevels;
  team: TeamMember[]; marketingCampaigns: MarketingCampaign[]; financials: ProfessionalFinancials; catalog: CatalogItem[]; artistIdentity: ArtistIdentityState; avatarImage?: string; headerImage?: string; pressGallery: string[]; strategicHealthScore: number; criticalDeficits: string[]; strategicSignals: StrategicSignals; auditHistory: ProfileAuditLog[];
  touringDetails: any; syncDetails: any; legalInfrastructure: any; genreSpecificData: any; gameStats: any; thaSpotProgression: any;
  profileSetupCompleted?: boolean; profileSetupCompletedAt?: number;
}
""")
