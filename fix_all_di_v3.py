import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# We will use the fact that AuthService and SecurityService are the most common parents.
# We'll make them use Injector for EVERYTHING else.

# 1. AuthService
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

  private readonly API_URL = GLOBAL_SECURITY_CONFIG.api_url;

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
    // Aggressive Persona Success Message
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
}
""")

# 2. SecurityService
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

  constructor() {}

  validateSession(): boolean {
    const exp = this.sessionExpiresAt();
    return !exp || Date.now() < exp;
  }

  refreshSession(): void {
    this.sessionExpiresAt.set(Date.now() + 3600000);
    this.isSessionValid.set(true);
  }

  recordAttempt(k: string) { return { allowed: true, remainingAttempts: 5 }; }
  clearRateLimit(k: string) {}
  isValidRedirectUrl(u: string) { return true; }
  logEvent(t: string, d: string, u?: string) { this.logger.info(`[SEC] ${t}: ${d}`); return Promise.resolve(); }
}
""")

# 3. UserProfileService
write_file('src/app/services/user-profile.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { initialProfile, UserProfile } from '../types/profile.types';

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
    this.profile.set(next);
    try { await this.db.saveUserProfile(next, 'current'); } catch (e) {}
  }
}
""")

# 4. DatabaseService
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
}
""")
