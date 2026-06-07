import { Injectable, inject, signal, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SecurityService } from './security.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { UserStoreService, AuthUser } from './user-store.service';
import { APP_SECURITY_CONFIG as GLOBAL_SECURITY_CONFIG } from '../app.security';

export interface AuthCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}
export type { AuthUser };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private injector = inject(Injector);
  private tokenService = inject(TokenService);
  private userStore = inject(UserStoreService);
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  currentUser = this.userStore.user;
  isAuthenticated = this.userStore.isAuthenticated;
  jwtToken = this.tokenService.jwtToken;

  private get securityService(): SecurityService {
    return this.injector.get(SecurityService);
  }
  private get profileService(): UserProfileService {
    return this.injector.get(UserProfileService);
  }

  constructor() {}

  async loadSession() {
    if (typeof localStorage === 'undefined') return;
    const session = localStorage.getItem('smuve_auth_session');
    if (!session) return;
    try {
      const decoded = decodeURIComponent(escape(atob(session)));
      const [data, key] = decoded.split('|');
      if (key !== GLOBAL_SECURITY_CONFIG.auth_salt) return;
      const user = JSON.parse(data);
      this.userStore.setUser(user);
      await this.profileService.loadProfile(user.id);
    } catch (e) {}
  }

  async login(creds: AuthCredentials) {
    const user: AuthUser = {
      id: 'usr_1',
      email: creds.email,
      artistName: 'Artist',
      role: 'Admin',
      permissions: ['ALL_ACCESS'],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 100,
      emailVerified: true,
    };
    this.userStore.setUser(user);
    this.tokenService.setToken('mock-jwt');
    return {
      success: true,
      message:
        "STATUS VERIFIED. RESUME THE GRIND, Artist. DON'T WASTE MY FUCKING TIME.",
    };
  }

  async register(creds: any, artistName?: string) {
    return this.login(creds);
  }

  logout() {
    this.userStore.setUser(null);
    this.tokenService.setToken(null);
    if (typeof localStorage !== 'undefined')
      localStorage.removeItem('smuve_auth_session');
  }

  validatePassword(p: string) {
    return { isValid: p.length >= 8, errors: [] };
  }
  async verifyEmail(c: string) {
    return { success: true, message: 'VERIFIED' };
  }
  async resendVerificationCode() {
    return { success: true, message: 'SENT' };
  }
}
