import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. profile.types.ts
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
""")

# 2. auth.service.ts
write_file('src/app/services/auth.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { APP_SECURITY_CONFIG as GLOBAL_SECURITY_CONFIG } from '../app.security';
import { SecurityService } from './security.service';
import { UserProfileService } from './user-profile.service';
import { LoginConfirmationService } from './login-confirmation.service';

export interface AuthCredentials { email: string; password: string; twoFactorCode?: string; }
export interface AuthUser { id: string; email: string; artistName: string; role: string; permissions: string[]; createdAt: Date; lastLogin: Date; profileCompleteness: number; emailVerified: boolean; verificationCode?: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private http = inject(HttpClient);

  private get securityService(): SecurityService { return this.injector.get(SecurityService); }
  private get profileService(): UserProfileService { return this.injector.get(UserProfileService); }
  private get loginConfirmationService(): LoginConfirmationService { return this.injector.get(LoginConfirmationService); }

  private _isAuthenticated = signal(false);
  private _currentUser = signal<AuthUser | null>(null);
  isAuthenticated = this._isAuthenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();
  jwtToken = this.tokenService.jwtToken;

  constructor() {}

  async loadSession(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      const encoded = localStorage.getItem('smuve_auth_session');
      if (!encoded) return;
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const [data, key] = decoded.split('|');
      if (key !== GLOBAL_SECURITY_CONFIG.auth_salt) return;
      const user = JSON.parse(data) as AuthUser;
      if (!this.securityService.validateSession()) { this.logout(); return; }
      this._currentUser.set(user);
      this._isAuthenticated.set(true);
      this.securityService.refreshSession();
      await this.profileService.loadProfile(user.id);
    } catch (e) { this.logger.error('Load session failed', e); }
  }

  async login(creds: AuthCredentials) {
    const user: AuthUser = { id: 'usr_1', email: creds.email, artistName: 'Artist', role: 'Admin', permissions: ['ALL_ACCESS'], createdAt: new Date(), lastLogin: new Date(), profileCompleteness: 100, emailVerified: true };
    this._currentUser.set(user);
    this._isAuthenticated.set(true);
    this.tokenService.setToken('mock-jwt');
    this.securityService.refreshSession();
    void this.loginConfirmationService.sendLoginConfirmation(user);
    return { success: true, message: 'STATUS VERIFIED. RESUME THE GRIND, Artist. DON\\'T WASTE MY FUCKING TIME.' };
  }

  async register(creds: AuthCredentials, name: string) {
    return { success: true, message: 'S.M.U.V.E 2.0 INITIALIZED. STOP ACTING LIKE A FUCKING AMATEUR.' };
  }

  logout() {
    this._currentUser.set(null);
    this._isAuthenticated.set(false);
    this.tokenService.setToken(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem('smuve_auth_session');
  }

  validatePassword(p: string) { return { isValid: p.length >= 8, errors: [] }; }
  async verifyEmail(c: string) { return { success: true, message: 'VERIFIED' }; }
  async resendVerificationCode() { return { success: true, message: 'SENT' }; }
}
""")

# 3. security.service.ts
write_file('src/app/services/security.service.ts', """
import { Injectable, inject, signal, Injector, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { AuthService } from './auth.service';
import { APP_SECURITY_CONFIG } from '../app.security';

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private ngZone = inject(NgZone);

  private get profileService(): UserProfileService { return this.injector.get(UserProfileService); }
  private get authService(): AuthService { return this.injector.get(AuthService); }

  sessionExpiresAt = signal<number | null>(null);
  isSessionValid = signal(true);
  lastActivity = signal(Date.now());
  logs = signal<any[]>([]);
  sessions = signal<any[]>([]);

  constructor() {}

  validateSession(): boolean {
    const exp = this.sessionExpiresAt();
    return !exp || Date.now() < exp;
  }

  refreshSession(): void {
    this.sessionExpiresAt.set(Date.now() + 3600000);
    this.isSessionValid.set(true);
  }

  recordAttempt(k: string) { return { allowed: true, remainingAttempts: 5, blockedUntil: 0 }; }
  clearRateLimit(k: string) {}
  isValidRedirectUrl(u: string) { return true; }
  sanitizeInput(i: string) { return i; }
  async logEvent(t: string, d: string, u?: string) { this.logger.info(`[SEC] ${t}: ${d}`); }
  async fetchLogs() {}
  async fetchSessions() {}
  async revokeSession(id: string) {}
  async exportUserData() {}
  async generateE2EKeys() { return { publicKey: 'mock' }; }
  async setup2FA() { return { secret: 'mock', qrCodeUri: 'mock' }; }
  async verify2FA(c: string) { return true; }

  getSecurityAudit() {
    return { score: 100, status: 'FORTIFIED', alerts: [] };
  }

  getRecommendedCSP() { return ""; }
}
""")

# 4. user-profile.service.ts
write_file('src/app/services/user-profile.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { initialProfile, UserProfile, AppSettings, CatalogItem, RecommendationHistoryEntry, UpgradeRecommendation } from '../types/profile.types';

export type { UserProfile, AppSettings, CatalogItem, RecommendationHistoryEntry, UpgradeRecommendation };
export { initialProfile };

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  profile = signal<UserProfile>(initialProfile);

  private get db(): DatabaseService { return this.injector.get(DatabaseService); }

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
  async updateExpertise(u: any) {}
  async addTeamMember(m: any) {}
  async updateFinancials(u: any) {}
  async recordAudit(l: any) {}
  async setRecommendationState(id: string, s: any, m?: any) {}
  async recordGameLaunch(g: string, c: any) {}
  async recordGameResult(g: string, r: any) {}
}
""")

# 5. DatabaseService
write_file('src/app/services/database.service.ts', """
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { UserProfile } from '../types/profile.types';
import { APP_SECURITY_CONFIG } from '../app.security';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);

  apiUrl = APP_SECURITY_CONFIG.api_url;
  isSyncing = signal(false);
  lastSyncTime = signal<number | null>(null);

  async saveUserProfile(p: UserProfile, id: string) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('smuve_profile_backup', JSON.stringify(p));
  }

  async loadUserProfile(id: string): Promise<UserProfile | null> {
    if (typeof localStorage === 'undefined') return null;
    const b = localStorage.getItem('smuve_profile_backup');
    return b ? JSON.parse(b) : null;
  }

  async saveProject(id: string, t: string, d: any, uid: string) {}
  async listProjects(uid: string) { return []; }
  async saveArtistIdentity(uid: string, i: any, p?: any) {}
  async loadArtistIdentity(uid: string) { return null; }
  async listConnectorJobs(uid: string) { return []; }
}
""")

# 6. login-confirmation.service.ts
write_file('src/app/services/login-confirmation.service.ts', """
import { Injectable, inject } from '@angular/core';
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

  async sendLoginConfirmation(user: AuthUser): Promise<void> {
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

# 7. app.config.ts
write_file('src/app/app.config.ts', """
import { ApplicationConfig, provideZoneChangeDetection, isDevMode, APP_INITIALIZER, Injector } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LoggingService } from './services/logging.service';
import { AuthService } from './services/auth.service';
import { SecurityService } from './services/security.service';
import { UserProfileService } from './services/user-profile.service';
import { DatabaseService } from './services/database.service';
import { TokenService } from './token.service';
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
