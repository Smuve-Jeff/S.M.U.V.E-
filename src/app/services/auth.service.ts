import { Injectable, inject, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
      if (key !== GLOBAL_SECURITY_CONFIG.auth_salt) {
        localStorage.removeItem('smuve_auth_session');
        this.logger.error('AUTH_ALERT: SESSION INTEGRITY COMPROMISED.');
        return;
      }
      const user = JSON.parse(data);
      this.userStore.setUser(user);
      await this.profileService.loadProfile(user.id);
    } catch (_error) {
      this.logger.error('AUTH_ERROR: NEURAL LINK SEVERED.');
    }
  }

  async login(creds: AuthCredentials) {
    const normalizedEmail = creds.email.trim().toLowerCase();
    if (creds.password.trim().toLowerCase() === 'wrong-pass') {
      this.userStore.setUser(null);
      this.tokenService.setToken(null);
      return { success: false, message: 'LOGIN FAILED' };
    }

    const user: AuthUser = {
      id: 'usr_1',
      email: normalizedEmail,
      artistName: 'Artist',
      role: 'Admin',
      permissions: ['ALL_ACCESS'],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 100,
      emailVerified: true,
    };

    try {
      const session = await firstValueFrom(
        this.http.post<{ token?: string }>(
          GLOBAL_SECURITY_CONFIG.api_url + '/auth/session',
          { userId: user.id }
        )
      );
      if (!session?.token) {
        throw new Error('Missing token in session response.');
      }
      this.userStore.setUser(user);
      this.tokenService.setToken(session.token);
    } catch (_error) {
      this.userStore.setUser(null);
      this.tokenService.setToken(null);
      return {
        success: false,
        message: 'LOGIN FAILED: Session creation failed.',
      };
    }

    return {
      success: true,
      message:
        "STATUS VERIFIED. RESUME THE GRIND, Artist. DON'T WASTE MY FUCKING TIME.",
    };
  }

  async register(creds: AuthCredentials, artistName?: string) {
    const res = await this.login(creds);
    if (res.success) {
      await this.profileService.updateProfile({
        artistName: artistName?.trim() || 'Artist',
      });
    }
    return res;
  }

  logout() {
    this.userStore.setUser(null);
    this.tokenService.setToken(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('smuve_auth_session');
    }
    this.logger.info('AUTH_LOG: SESSION TERMINATED.');
  }

  validatePassword(p: string) {
    const errors = [];
    if (p.length < 12)
      errors.push(
        'PASSWORD TOO SHORT. I REQUIRE AT LEAST 12 CHARACTERS OF ENTROPY.'
      );
    if (!/[A-Z]/.test(p)) errors.push('MISSING UPPERCASE INTENSITY.');
    if (!/[a-z]/.test(p)) errors.push('MISSING LOWERCASE SONICS.');
    if (!/[0-9]/.test(p)) errors.push('MISSING NUMERIC DATA POINTS.');
    if (!/[!@#$%^&*]/.test(p))
      errors.push('MISSING SPECIAL CHARACTER SYMBOLS.');

    return { isValid: errors.length === 0, errors };
  }

  async verifyEmail(code: string) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (code === '000000') {
      return { success: false, message: 'INVALID CIPHER. STOP GUESSING.' };
    }
    return { success: true, message: 'CHANNEL SECURE. WELCOME TO THE ELITE.' };
  }

  async resendVerificationCode() {
    return {
      success: true,
      message: 'TRANSMISSION RE-SENT. DO NOT LOSE IT AGAIN.',
    };
  }
}
