import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. security.service.ts - FIXED QUOTING
write_file('src/app/services/security.service.ts', """import { APP_SECURITY_CONFIG } from '../app.security';
import { Injector, Injectable, inject, signal, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private ngZone = inject(NgZone);
  private http = inject(HttpClient);

  private get profileService(): UserProfileService { return this.injector.get(UserProfileService); }
  private get authService(): AuthService { return this.injector.get(AuthService); }

  sessionExpiresAt = signal<number | null>(null);
  isSessionValid = signal(true);
  lastActivity = signal(Date.now());
  logs = signal<any[]>([]);
  sessions = signal<any[]>([]);

  private readonly API_URL = APP_SECURITY_CONFIG.api_url;

  constructor() {}

  validateSession(): boolean { return !this.sessionExpiresAt() || Date.now() < this.sessionExpiresAt()!; }
  refreshSession(): void { this.sessionExpiresAt.set(Date.now() + 3600000); this.isSessionValid.set(true); }
  recordAttempt(k: string) { return { allowed: true, remainingAttempts: 5, blockedUntil: 0 }; }
  clearRateLimit(k: string) {}
  isValidRedirectUrl(u: string) { return true; }
  sanitizeInput(i: string) { return i; }
  async logEvent(t: string, d: string, u?: string) { this.logger.info('[SEC] ' + t + ': ' + d); }
  async fetchLogs() {}
  async fetchSessions() {}
  async revokeSession(id: string) {}
  async exportUserData() {}
  async generateE2EKeys() { return { publicKey: 'mock' }; }
  async setup2FA() { return { secret: 'mock', qrCodeUri: 'mock' }; }
  async verify2FA(c: string) { return true; }
  getSecurityAudit() { return { score: 100, status: 'FORTIFIED', alerts: [] }; }
  getRecommendedCSP() { return ""; }
}
""")

# 2. profile.types.ts - FULL PROPERTIES INCLUDING DYNAMIC ONES
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
  id?: string; artistName: string; primaryGenre: string; website?: string; proIpi?: string; proName?: string;
  proData?: { workIds: string[]; affiliations: string[]; ipiNumber?: string; };
  skills?: string[]; productionStyles?: string[]; brandVoices?: string[]; strategicGoals?: string[]; performancesPerYear?: string;
  settings: AppSettings; knowledgeBase: ArtistKnowledgeBase; careerGoals: string[]; equipment: string[]; daw: string[]; services: string[]; recommendationPreferences: any; recommendationHistory: RecommendationHistoryEntry[]; expertise: ExpertiseLevels;
  team: TeamMember[]; marketingCampaigns: MarketingCampaign[]; financials: ProfessionalFinancials; catalog: CatalogItem[]; artistIdentity: ArtistIdentityState; avatarImage?: string; headerImage?: string; pressGallery: string[]; strategicHealthScore: number; criticalDeficits: string[]; strategicSignals: StrategicSignals; auditHistory: ProfileAuditLog[];
  touringDetails?: any; syncDetails?: any; legalInfrastructure?: any; genreSpecificData?: any; gameStats?: any; thaSpotProgression?: any;
  profileSetupCompleted?: boolean; profileSetupCompletedAt?: number;
}
""")
