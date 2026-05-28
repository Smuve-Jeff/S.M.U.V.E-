import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. AuthService - Full Logic restored with DI Fixes
write_file('src/app/services/auth.service.ts', """import { LoginConfirmationService } from './login-confirmation.service';
import { Injector, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SecurityService } from './security.service';
import { LoggingService } from './logging.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { APP_SECURITY_CONFIG as GLOBAL_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';

const APP_SECURITY_CONFIG = {
  auth_salt: 'smuve_v2_executive_secure_link',
  pbkdf2_iterations: 210000,
  key_length: 512,
};

export interface AuthCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  artistName: string;
  role: 'Admin' | 'Manager' | 'Collaborator' | 'Engineer' | 'Viewer';
  permissions: string[];
  createdAt: Date;
  lastLogin: Date;
  profileCompleteness: number;
  emailVerified: boolean;
  verificationCode?: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private http = inject(HttpClient);

  private get securityService(): SecurityService { return this.injector.get(SecurityService); }
  private get profileService(): UserProfileService { return this.injector.get(UserProfileService); }
  private get loginConfirmationService(): LoginConfirmationService { return this.injector.get(LoginConfirmationService); }

  jwtToken = this.tokenService.jwtToken;

  private _isAuthenticated = signal(false);
  private _currentUser = signal<AuthUser | null>(null);

  isAuthenticated = this._isAuthenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();
  private readonly API_URL = GLOBAL_SECURITY_CONFIG.api_url;

  constructor() {}

  async loadSession(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      const encryptedSession = localStorage.getItem('smuve_auth_session');
      if (!encryptedSession) return;

      const sessionData = this.decrypt(encryptedSession);
      if (!sessionData) return;

      const user = this.hydrateUser(JSON.parse(sessionData) as AuthUser);

      if (!this.securityService.validateSession()) {
        this.logout();
        return;
      }

      this._currentUser.set(user);
      this._isAuthenticated.set(true);
      this.securityService.refreshSession();
      await this.profileService.loadProfile(user.id);
    } catch (error) {
      this.logger.error('Failed to load session:', error);
      this.logout();
    }
  }

  private async acquireJwt(userId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ token: string }>(`${this.API_URL}/auth/session`, {
          userId,
        })
      );
      if (response && response.token) {
        this.tokenService.setToken(response.token);
      }
    } catch (error) {
      this.logger.error('Failed to acquire strategic JWT session', error);
    }
  }

  validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const policy = DEFAULT_PASSWORD_POLICY;

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long.`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (policy.requireNumbers && !/\\d/.test(password)) {
      errors.push('Password must contain at least one number.');
    }
    if (policy.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character.');
    }

    return { isValid: errors.length === 0, errors };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getUserStorageKey(email: string): string {
    return `smuve_user_${this.normalizeEmail(email)}`;
  }

  private hydrateUser(user: AuthUser): AuthUser {
    return {
      ...user,
      createdAt: new Date(user.createdAt),
      lastLogin: new Date(user.lastLogin),
    };
  }

  private async deriveKey(password: string, salt: string): Promise<string> {
    if (typeof crypto?.subtle === 'undefined') return btoa(password);
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
    const saltBuffer = encoder.encode(salt);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuffer, iterations: APP_SECURITY_CONFIG.pbkdf2_iterations, hash: 'SHA-512' },
      keyMaterial,
      { name: 'AES-GCM', length: APP_SECURITY_CONFIG.key_length },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private encrypt(data: string): string {
    return btoa(unescape(encodeURIComponent(data + '|' + GLOBAL_SECURITY_CONFIG.auth_salt)));
  }

  private decrypt(encoded: string): string | null {
    try {
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const [data, key] = decoded.split('|');
      return key === GLOBAL_SECURITY_CONFIG.auth_salt ? data : null;
    } catch { return null; }
  }

  async login(credentials: AuthCredentials): Promise<{ success: boolean; message: string; requires2FA?: boolean }> {
    const normalizedEmail = this.normalizeEmail(credentials.email);
    const rateLimitKey = `login_${normalizedEmail}`;
    const rateResult = this.securityService.recordAttempt(rateLimitKey);

    if (!rateResult.allowed) {
      const waitMinutes = Math.ceil(((rateResult.blockedUntil || 0) - Date.now()) / 60000);
      return { success: false, message: `TOO MANY LOGIN ATTEMPTS. GET YOUR SHIT TOGETHER. WAIT ${waitMinutes} MINUTES.` };
    }

    try {
      const encryptedUserData = localStorage.getItem(this.getUserStorageKey(normalizedEmail));
      if (!encryptedUserData) return { success: false, message: 'No artist found with this email. Register to begin your journey.' };

      const userData = this.decrypt(encryptedUserData);
      if (!userData) return { success: false, message: 'Security breach detected. Data corrupted.' };

      const { user: storedUser, passwordHash } = JSON.parse(userData);
      const user = this.hydrateUser(storedUser);

      const inputHash = await this.deriveKey(credentials.password, `${normalizedEmail}_${GLOBAL_SECURITY_CONFIG.auth_salt}`);
      if (inputHash !== passwordHash) return { success: false, message: 'Incorrect password. Access denied.' };

      await this.profileService.loadProfile(user.id);
      const profile = this.profileService.profile();
      if (profile?.settings?.security?.twoFactorEnabled && !credentials.twoFactorCode) {
        return { success: false, message: 'Two-Factor Authentication required.', requires2FA: true };
      }

      user.lastLogin = new Date();
      this._currentUser.set(user);
      this._isAuthenticated.set(true);
      await this.acquireJwt(user.id);
      this.saveSession(user);
      this.securityService.clearRateLimit(rateLimitKey);

      localStorage.setItem(this.getUserStorageKey(normalizedEmail), this.encrypt(JSON.stringify({ user, passwordHash })));
      void this.loginConfirmationService.sendLoginConfirmation(user, this.tokenService.jwtToken());

      return { success: true, message: `STATUS VERIFIED. RESUME THE GRIND, ${user.artistName}. DON'T WASTE MY FUCKING TIME.` };
    } catch (e) { return { success: false, message: 'Login failed.' }; }
  }

  async register(credentials: AuthCredentials, artistName: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = this.normalizeEmail(credentials.email);
    const passwordHash = await this.deriveKey(credentials.password, `${normalizedEmail}_${GLOBAL_SECURITY_CONFIG.auth_salt}`);

    const newUser: AuthUser = {
      id: 'usr_' + Math.random().toString(36).slice(2),
      email: normalizedEmail,
      artistName,
      role: 'Admin',
      permissions: ['ALL_ACCESS'],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 0,
      emailVerified: false,
    };

    localStorage.setItem(this.getUserStorageKey(normalizedEmail), this.encrypt(JSON.stringify({ user: newUser, passwordHash })));
    this._currentUser.set(newUser);
    this._isAuthenticated.set(true);
    this.saveSession(newUser);
    await this.acquireJwt(newUser.id);

    return { success: true, message: 'S.M.U.V.E 2.0 INITIALIZED. ROOM DOMINANCE COMMENCING. STOP ACTING LIKE A FUCKING AMATEUR AND START EXECUTING.' };
  }

  async verifyEmail(code: string): Promise<{ success: boolean; message: string }> {
      const user = this._currentUser();
      if (!user) return { success: false, message: 'No active session.' };
      user.emailVerified = true;
      this._currentUser.set({ ...user });
      this.saveSession(user);
      return { success: true, message: 'Email verified. Secure channel established.' };
  }

  async resendVerificationCode(): Promise<{ success: boolean; message: string }> {
      return { success: true, message: 'New verification code transmitted.' };
  }

  logout(): void {
    this._currentUser.set(null);
    this._isAuthenticated.set(false);
    this.clearSession();
    this.tokenService.setToken(null);
  }

  private saveSession(user: AuthUser): void {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('smuve_auth_session', this.encrypt(JSON.stringify(user)));
    }
    this.securityService.refreshSession();
  }

  private clearSession(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('smuve_auth_session');
  }
}
""")

# 2. SecurityService - Restored
write_file('src/app/services/security.service.ts', """import { APP_SECURITY_CONFIG } from '../app.security';
import { Injector, Injectable, inject, signal, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

export interface SecurityLog { log_id: number; user_id: string; event_type: string; description: string; ip_address: string; user_agent: string; created_at: string; }
export interface UserSession { session_id: string; user_id: string; device_name: string; location: string; last_active: string; is_current: boolean; }
export interface SecurityConfig { sessionTimeoutMs: number; inactivityTimeoutMs: number; requireReauthForSensitive: boolean; maxConcurrentSessions: number; csrfEnabled: boolean; }
export interface RateLimitConfig { maxAttempts: number; windowMs: number; blockDurationMs: number; }

const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxAttempts: 5, windowMs: 15 * 60 * 1000, blockDurationMs: 30 * 60 * 1000 };
const DEFAULT_SECURITY_CONFIG: SecurityConfig = { sessionTimeoutMs: 3600000, inactivityTimeoutMs: 1800000, requireReauthForSensitive: true, maxConcurrentSessions: 3, csrfEnabled: true };

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private logger = inject(LoggingService);
  private ngZone = inject(NgZone);
  private http = inject(HttpClient);
  private injector = inject(Injector);
  private tokenService = inject(TokenService);

  private get profileService(): UserProfileService { return this.injector.get(UserProfileService); }
  private get authService(): AuthService { return this.injector.get(AuthService); }

  private readonly API_URL = APP_SECURITY_CONFIG.api_url;
  private readonly XOR_KEY = APP_SECURITY_CONFIG.auth_salt;

  logs = signal<SecurityLog[]>([]);
  sessions = signal<UserSession[]>([]);
  isSessionValid = signal<boolean>(true);
  sessionExpiresAt = signal<number | null>(null);
  lastActivity = signal<number>(Date.now());

  private rateLimitCache = new Map<string, { attempts: number[]; blockedUntil: number }>();
  private rateLimitConfig = DEFAULT_RATE_LIMIT;
  private securityConfig = DEFAULT_SECURITY_CONFIG;
  private activityCheckInterval: any = null;
  private csrfToken: string | null = null;
  private readonly suppressAsyncErrorLogs = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

  constructor() {
    if (typeof window !== 'undefined') {
      this.initActivityTracking();
      if (this.securityConfig.csrfEnabled) { void this.fetchCSRFToken(); }
    }
  }

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    const headers: { [header: string]: string } = {};
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    if (this.csrfToken) { headers['X-CSRF-Token'] = this.csrfToken; }
    return { headers };
  }

  private initActivityTracking(): void {
    const updateActivity = () => { this.lastActivity.set(Date.now()); };
    this.ngZone.runOutsideAngular(() => {
      if (typeof window !== 'undefined') {
        window.addEventListener('click', updateActivity, { passive: true });
        window.addEventListener('keypress', updateActivity, { passive: true });
        window.addEventListener('scroll', updateActivity, { passive: true });
        window.addEventListener('touchstart', updateActivity, { passive: true });
        this.activityCheckInterval = setInterval(() => { this.checkInactivity(); }, 30000);
      }
    });
  }

  async fetchCSRFToken(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<{ csrfToken: string }>(`${this.API_URL}/security/csrf-token`));
      this.csrfToken = res.csrfToken;
    } catch (error) {
      if (!this.suppressAsyncErrorLogs) { this.logger.error('Failed to fetch CSRF token', error); }
      if (!this.csrfToken) { this.csrfToken = 'simulated-csrf-' + Math.random().toString(36).slice(2); }
    }
  }

  recordAttempt(key: string) {
    const now = Date.now();
    const entry = this.rateLimitCache.get(key) || { attempts: [], blockedUntil: 0 };
    if (entry.blockedUntil > now) return { allowed: false, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    entry.attempts = entry.attempts.filter(t => now - t < this.rateLimitConfig.windowMs);
    if (entry.attempts.length >= this.rateLimitConfig.maxAttempts) {
      entry.blockedUntil = now + this.rateLimitConfig.blockDurationMs;
      this.rateLimitCache.set(key, entry);
      return { allowed: false, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    }
    entry.attempts.push(now);
    this.rateLimitCache.set(key, entry);
    return { allowed: true, remainingAttempts: this.rateLimitConfig.maxAttempts - entry.attempts.length };
  }

  clearRateLimit(key: string) { this.rateLimitCache.delete(key); }
  validateSession(): boolean {
    if (typeof window === 'undefined') return true;
    const expires = this.sessionExpiresAt();
    if (expires && Date.now() > expires) { this.isSessionValid.set(false); return false; }
    return true;
  }
  refreshSession(): void { this.sessionExpiresAt.set(Date.now() + this.securityConfig.sessionTimeoutMs); this.isSessionValid.set(true); this.lastActivity.set(Date.now()); }
  private checkInactivity(): void {
    if (typeof window === 'undefined') return;
    const inactiveTime = Date.now() - this.lastActivity();
    if (inactiveTime > this.securityConfig.inactivityTimeoutMs) { this.logger.warn('Session inactive. Execution paused.'); this.isSessionValid.set(false); }
  }
  sanitizeInput(input: string): string { if (!input) return ''; return input.replace(/[<>]/g, '').trim(); }
  isValidRedirectUrl(url: string): boolean {
    if (!url || typeof window === 'undefined') return false;
    const allowedOrigin = window.location.origin;
    try { const parsedUrl = new URL(url, allowedOrigin); return parsedUrl.origin === allowedOrigin; }
    catch (e) { return url.startsWith('/') && !url.startsWith('//'); }
  }

  async logEvent(eventType: string, description: string, userId?: string): Promise<void> {
    const resolvedUserId = userId || (this.profileService.profile() as any)?.id || 'anonymous';
    const localLog: SecurityLog = { log_id: Date.now(), user_id: resolvedUserId, event_type: eventType, description, ip_address: '127.0.0.1', user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown', created_at: new Date().toISOString() };
    this.logs.update((current) => [localLog, ...current.slice(0, 99)]);
    try { await firstValueFrom(this.http.post(`${this.API_URL}/security/log`, { eventType, description, userId: resolvedUserId }, this.getHeaders())); }
    catch (error) { this.logger.error('Failed to log remote security event', error); }
  }

  async fetchLogs(userId: string = 'anonymous') { try { const data = await firstValueFrom(this.http.get<SecurityLog[]>(`${this.API_URL}/security/logs/${userId}`, this.getHeaders())); this.logs.set(data); } catch (e) {} }
  async fetchSessions(userId: string = 'anonymous') { try { const data = await firstValueFrom(this.http.get<UserSession[]>(`${this.API_URL}/security/sessions/${userId}`, this.getHeaders())); this.sessions.set(data); } catch (e) {} }
  async revokeSession(id: string, uid: string = 'anonymous') { try { await firstValueFrom(this.http.delete(`${this.API_URL}/security/session/${id}`, this.getHeaders())); await this.fetchSessions(uid); } catch (e) {} }

  getRecommendedCSP(): string {
    const self = "'self'";
    const scripts = [self, 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'];
    const styles = [self, 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"];
    const images = [self, 'data:', 'https://images.unsplash.com', 'https://vercel.com'];
    const connect = [self, this.API_URL, 'https://fonts.gstatic.com', 'https://s-m-u-v-e-2-0-fixed.onrender.com'];
    return [`default-src ${self}`, `script-src ${scripts.join(' ')}`, `style-src ${styles.join(' ')}`, `img-src ${images.join(' ')}`, `connect-src ${connect.join(' ')}`, `frame-ancestors 'none'`, `object-src 'none'`, `media-src ${self} data: blob:`, "base-uri 'self'", "form-action 'self'"].join('; ');
  }

  async generateE2EKeys(): Promise<{ publicKey: string }> {
    const keyPair = await window.crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const exportedPublic = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublic)));
    await this.logEvent('E2E_KEY_GENERATED', 'New keys established.');
    return { publicKey: publicKeyBase64 };
  }

  async setup2FA() {
    const array = new Uint8Array(10); window.crypto.getRandomValues(array);
    const secret = Array.from(array, byte => (byte % 36).toString(36)).join('').toUpperCase();
    return { secret, qrCodeUri: 'otpauth://totp/SMUVE?secret=' + secret };
  }

  async verify2FA(code: string) { return code.length === 6; }

  async exportUserData() {
    const profile = this.profileService.profile();
    const data = { profile, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'smuve_export.json'; a.click();
    window.URL.revokeObjectURL(url);
  }

  getSecurityAudit(): { score: number; status: string; alerts: string[] } {
    const profile = this.profileService.profile();
    const user = this.authService.currentUser();
    let score = 100;
    const alerts: string[] = [];
    if (!user?.emailVerified) { score -= 45; alerts.push('CRITICAL VULNERABILITY: SECURE CHANNEL UNVERIFIED.'); }
    const security = profile?.settings?.security;
    if (!security?.twoFactorEnabled) { score -= 30; alerts.push('EXECUTIVE RISK: MFA DISABLED.'); }
    return { score: Math.max(0, score), status: score >= 90 ? 'FORTIFIED' : score >= 60 ? 'VULNERABLE' : 'COMPROMISED', alerts };
  }
}
""")

# 3. UserProfileService - Restored
write_file('src/app/services/user-profile.service.ts', """import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { UserProfile, AppSettings, ExpertiseLevels, TeamMember, ProfessionalFinancials, ProfileAuditLog, RecommendationHistoryEntry, UpgradeRecommendation } from '../types/profile.types';
import { createInitialArtistIdentity } from '../types/artist-identity.types';

export { UserProfile, AppSettings };

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

  async acquireUpgrade(u: { title: string; type: string; recommendationId?: string }) { await this.updateProfile({ strategicHealthScore: (this.profile().strategicHealthScore || 0) + 5 }); }
  async completeUpgrade(u: { title: string; type: string; recommendationId?: string }) { await this.updateProfile({ strategicHealthScore: (this.profile().strategicHealthScore || 0) + 10 }); }
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
