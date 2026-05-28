import sys
import os

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# 1. UserProfileService - No longer holds state
write_file('src/app/services/user-profile.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { ProfileStateService } from './profile-state.service';
import { UserProfile, ProfileAuditLog } from '../types/profile.types';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private state = inject(ProfileStateService);

  profile = this.state.profile;

  private get db(): any { return this.injector.get(require('./database.service').DatabaseService); }

  async loadProfile(id: string = 'current') {
    try {
      const saved = await this.db.loadUserProfile(id);
      if (saved) this.state.setProfile(saved);
    } catch (e) { this.logger.error('Profile load failed', e); }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p } as UserProfile;
    this.state.setProfile(next);
    try { await this.db.saveUserProfile(next, 'current'); } catch (e) {}
  }

  async acquireUpgrade(u: any) {}
  async completeUpgrade(u: any) {}
  async recordAudit(l: ProfileAuditLog) { await this.updateProfile({ strategicHealthScore: l.score }); }
}
""")

# 2. AuthService - No longer holds state
write_file('src/app/services/auth.service.ts', """
import { Injectable, inject, signal, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SessionStateService } from './session-state.service';
import { TokenService } from './token.service';
import { LoggingService } from './logging.service';
import { APP_SECURITY_CONFIG as GLOBAL_SECURITY_CONFIG } from '../app.security';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private injector = inject(Injector);
  private sessionState = inject(SessionStateService);
  private tokenService = inject(TokenService);
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  currentUser = this.sessionState.currentUser;
  isAuthenticated = this.sessionState.isAuthenticated;
  jwtToken = this.tokenService.jwtToken;

  private get securityService(): any { return this.injector.get(require('./security.service').SecurityService); }
  private get profileService(): any { return this.injector.get(require('./user-profile.service').UserProfileService); }

  async loadSession() {
    if (typeof localStorage === 'undefined') return;
    const session = localStorage.getItem('smuve_auth_session');
    if (!session) return;
    try {
      const decoded = decodeURIComponent(escape(atob(session)));
      const [data, key] = decoded.split('|');
      if (key !== GLOBAL_SECURITY_CONFIG.auth_salt) return;
      const user = JSON.parse(data);
      this.sessionState.setUser(user);
      await this.profileService.loadProfile(user.id);
    } catch (e) {}
  }

  async login(creds: any) {
    const user = { id: 'usr_1', email: creds.email, artistName: 'Artist', role: 'Admin', permissions: ['ALL_ACCESS'] };
    this.sessionState.setUser(user as any);
    this.tokenService.setToken('mock-jwt');
    return { success: true, message: 'STATUS VERIFIED.' };
  }

  logout() {
    this.sessionState.setUser(null);
    this.tokenService.setToken(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem('smuve_auth_session');
  }

  validatePassword(p: string) { return { isValid: true, errors: [] }; }
}
""")
