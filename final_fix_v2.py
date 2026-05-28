import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. profile.types.ts - FULL RESTORATION WITH ALL PROPERTIES AND EXPORTS
write_file('src/app/types/profile.types.ts', """import { ArtistIdentityState } from './artist-identity.types';
import { ArtistKnowledgeBase, RecommendationHistoryEntry, UpgradeRecommendation } from './ai.types';
import { MarketingCampaign } from './marketing.types';

export type { RecommendationHistoryEntry, UpgradeRecommendation };

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
  security: {
    twoFactorEnabled: boolean;
    endToEndEncryption: boolean;
    biometricLock: boolean;
    auditLogEnabled: boolean;
    sessionTimeout: number;
  };
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

export interface StrategicSignals {
  marketReadiness: number;
  identityTrust: number;
  careerMomentum: number;
  technicalAuthority: number;
  syncViability: number;
  touringStability: number;
}

export interface SyncDetails {
  isSyncReady: string;
  hasCleanVersions: boolean;
  hasInstrumentals: boolean;
  hasStems: string;
  oneStopClearance: boolean;
  catalogSize: number;
  preferredKeywords: string[];
}

export interface LegalInfrastructure {
  hasRegisteredWorks: boolean;
  proAffiliation: string;
  hasStandardSplitSheet: string;
  isIncorporated: boolean;
  legalEntityName?: string;
  trademarkStatus: 'None' | 'Pending' | 'Registered';
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
  highScore?: number;
  bestLevel?: number;
  lastPlayedAt?: number;
}

export interface ThaSpotGameStat {
  plays?: number;
  highScore?: number;
  bestLevel?: number;
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
  roomStats: Record<string, ThaSpotRoomStat>;
  earnedCosmetics: string[];
  eventHistory: ThaSpotEventHistoryEntry[];
}

export interface ThaSpotSessionContext {
  roomId: string;
  startedAt: number;
  gameId?: string;
  mode?: string;
}

export interface ExpertiseLevels {
  production: number;
  songwriting: number;
  marketing: number;
  business: number;
  legal: number;
  performance: number;
  catalyst: any;
  technical_mastery?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  share: number;
  bio?: string;
  joinedAt: string;
}

export interface ProfessionalFinancials {
  accounts: any[];
  monthlyBudget: number;
  totalRevenue: number;
  pendingPayouts: number;
  splitSheets: any[];
  revenueHistory: any[];
}

export interface ProfileAuditLog {
  score: number;
  status: string;
  alerts: string[];
  deficits: string[];
  timestamp: number;
  recommendations?: any[];
  auditType?: string;
}

export interface UserProfile {
  id?: string;
  artistName: string;
  primaryGenre: string;
  website?: string;
  proIpi?: string;
  proName?: string;
  proData?: {
    workIds: any[];
    affiliations: string[];
    ipiNumber?: string;
  };
  skills?: string[];
  productionStyles?: string[];
  brandVoices?: string[];
  strategicGoals?: string[];
  performancesPerYear?: string;
  settings: AppSettings;
  knowledgeBase: ArtistKnowledgeBase;
  careerGoals: string[];
  equipment: string[];
  daw: string[];
  services: string[];
  recommendationPreferences: any;
  recommendationHistory: RecommendationHistoryEntry[];
  expertise: ExpertiseLevels;
  team: TeamMember[];
  marketingCampaigns: MarketingCampaign[];
  financials: ProfessionalFinancials;
  catalog: CatalogItem[];
  artistIdentity: ArtistIdentityState;
  avatarImage?: string;
  headerImage?: string;
  pressGallery: string[];
  strategicHealthScore: number;
  criticalDeficits: string[];
  strategicSignals: StrategicSignals;
  auditHistory: ProfileAuditLog[];
  touringDetails?: any;
  syncDetails?: any;
  legalInfrastructure?: any;
  genreSpecificData?: any;
  gameStats?: any;
  thaSpotProgression?: any;
  profileSetupCompleted?: boolean;
  profileSetupCompletedAt?: number;
}

import { createInitialArtistIdentity } from './artist-identity.types';
export const initialProfile: UserProfile = {
  settings: {
    ui: { theme: 'Dark', performanceMode: false, showScanlines: false, animationsEnabled: true, autoPianoRoll: false },
    audio: { masterVolume: 0.8, autoSaveEnabled: true },
    ai: { kbWriteAccess: true, commanderPersona: 'Elite' },
    security: { twoFactorEnabled: false, endToEndEncryption: false, biometricLock: false, auditLogEnabled: true, sessionTimeout: 3600 },
  },
  artistName: 'New Artist', primaryGenre: 'Hip Hop',
  proName: '', proIpi: '', proData: { workIds: [], affiliations: [], ipiNumber: '' },
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
  genreSpecificData: {}, gameStats: {}, pressGallery: [],
  thaSpotProgression: { roomStats: {}, earnedCosmetics: [], eventHistory: [] },
};
""")

# 2. user-profile.service.ts
write_file('src/app/services/user-profile.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { initialProfile, UserProfile, AppSettings, CatalogItem, RecommendationHistoryEntry, UpgradeRecommendation, ExpertiseLevels, ProfessionalFinancials, ProfileAuditLog } from '../types/profile.types';

export type { UserProfile, AppSettings, CatalogItem, RecommendationHistoryEntry, UpgradeRecommendation };

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  profile = signal<UserProfile>(initialProfile);

  private get db(): any { return this.injector.get(require('./database.service').DatabaseService); }

  constructor() {}

  async loadProfile(id: string = 'current') {
    try {
      const saved = await this.db.loadUserProfile(id);
      if (saved) this.profile.set(saved);
    } catch (e) { this.logger.error('Profile load failed', e); }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p };
    this.profile.set(next as UserProfile);
    try { await this.db.saveUserProfile(next as UserProfile, 'current'); } catch (e) {}
  }

  async acquireUpgrade(u: any) {}
  async completeUpgrade(u: any) {}
  async updateExpertise(u: Partial<ExpertiseLevels>) { await this.updateProfile({ expertise: { ...this.profile().expertise, ...u } }); }
  async addTeamMember(m: any) {}
  async updateFinancials(u: Partial<ProfessionalFinancials>) { await this.updateProfile({ financials: { ...this.profile().financials, ...u } }); }
  async recordAudit(l: ProfileAuditLog) { await this.updateProfile({ strategicHealthScore: l.score, criticalDeficits: l.deficits, auditHistory: [l, ...(this.profile().auditHistory || [])].slice(0, 20) }); }
  async setRecommendationState(id: string, s: any, m?: any) {}
  async recordGameLaunch(g: string, c: any) {}
  async recordGameResult(g: string, r: any) {}
}
""")

# 3. TokenService - Put it in src/app/services/token.service.ts as intended
write_file('src/app/services/token.service.ts', """import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class TokenService {
  private _jwtToken = signal<string | null>(null);
  jwtToken = this._jwtToken.asReadonly();
  constructor() { if (typeof localStorage !== 'undefined') this._jwtToken.set(localStorage.getItem('smuve_jwt_token')); }
  setToken(t: string | null) { this._jwtToken.set(t); if (typeof localStorage !== 'undefined') { if (t) localStorage.setItem('smuve_jwt_token', t); else localStorage.removeItem('smuve_jwt_token'); } }
}
""")

# 4. app.config.ts - Fix import path for TokenService
write_file('src/app/app.config.ts', """import { ApplicationConfig, provideZoneChangeDetection, isDevMode, APP_INITIALIZER, Injector } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LoggingService } from './services/logging.service';
import { AuthService } from './services/auth.service';
import { SecurityService } from './services/security.service';
import { UserProfileService } from './services/user-profile.service';
import { DatabaseService } from './services/database.service';
import { TokenService } from './services/token.service';
import { LoginConfirmationService } from './services/login-confirmation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    AuthService,
    SecurityService,
    UserProfileService,
    DatabaseService,
    TokenService,
    LoginConfirmationService,
    {
      provide: APP_INITIALIZER,
      useFactory: (logger: LoggingService, injector: Injector) => () => {
        logger.system('S.M.U.V.E 2.0 INITIALIZED');
        setTimeout(() => { try { injector.get(AuthService).loadSession(); } catch (e) {} }, 0);
      },
      deps: [LoggingService, Injector],
      multi: true
    }
  ]
};
""")
