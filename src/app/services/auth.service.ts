import { Injectable, inject, signal, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import { UserStoreService, AuthUser } from './user-store.service';
import { APP_SECURITY_CONFIG as GLOBAL_SECURITY_CONFIG } from '../app.security';

export interface AuthCredentials { email: string; password: string; twoFactorCode?: string; }
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

  constructor() {}

  private get securityService(): any {
    const { SecurityService } = require('./security.service');
    return this.injector.get(SecurityService);
  }

  private get profileService(): any {
    const { UserProfileService } = require('./user-profile.service');
    return this.injector.get(UserProfileService);
  }

  private async deriveKey(password: string, salt: string): Promise<string> {
    if (!password || !salt) {
      throw new Error('Password and salt are required for key derivation');
    }
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: GLOBAL_SECURITY_CONFIG.pbkdf2_iterations,
        hash: 'SHA-512',
      },
      keyMaterial,
      GLOBAL_SECURITY_CONFIG.key_length
    );
    return Array.from(new Uint8Array(derivedBits))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async loadSession() {
    if (typeof localStorage === 'undefined') return;
    const session = localStorage.getItem('smuve_auth_session');
    if (!session) return;
    try {
      const decoded = decodeURIComponent(escape(atob(session)));
      const [data, key] = decoded.split('|');
      if (key !== GLOBAL_SECURITY_CONFIG.auth_salt) {
        this.logger.error('AUTH_ALERT: SESSION INTEGRITY COMPROMISED.');
        return;
      }
      const user = JSON.parse(data);
      this.userStore.setUser(user);
      await this.profileService.loadProfile(user.id);
    } catch (e) {
      this.logger.error('AUTH_ERROR: NEURAL LINK SEVERED.');
    }
  }

  async login(creds: AuthCredentials) {
    this.logger.info('AUTH_EXECUTION: INITIATING CRYPTOGRAPHIC VALIDATION...');

    // Simulate real database lookup
    const storedUserStr = localStorage.getItem(`smuve_db_user_${creds.email.toLowerCase()}`);
    if (!storedUserStr) {
      await new Promise(r => setTimeout(r, 1000));
      return { success: false, message: 'IDENTIFICATION FAILURE. YOU ARE UNKNOWN TO THIS SYSTEM.' };
    }

    const storedUser = JSON.parse(storedUserStr);
    const hashedInput = await this.deriveKey(creds.password, GLOBAL_SECURITY_CONFIG.auth_salt);

    if (hashedInput !== storedUser.passwordHash) {
      await new Promise(r => setTimeout(r, 1500));
      return { success: false, message: 'AUTHORIZATION DENIED. YOUR CREDENTIALS ARE AS WEAK AS YOUR MIX.' };
    }

    if (storedUser.requires2FA && !creds.twoFactorCode) {
      return { success: false, message: 'SECOND FACTOR REQUIRED. SECURE YOUR TRANSMISSION.', requires2FA: true };
    }

    const user: AuthUser = {
      id: storedUser.id,
      email: storedUser.email,
      artistName: storedUser.artistName,
      role: storedUser.role,
      permissions: storedUser.permissions,
      createdAt: new Date(storedUser.createdAt),
      lastLogin: new Date(),
      profileCompleteness: storedUser.profileCompleteness,
      emailVerified: storedUser.emailVerified
    };

    this.userStore.setUser(user);
    this.tokenService.setToken('SMUVE_JWT_' + btoa(Date.now().toString()));

    const salted = btoa(unescape(encodeURIComponent(JSON.stringify(user) + '|' + GLOBAL_SECURITY_CONFIG.auth_salt)));
    localStorage.setItem('smuve_auth_session', salted);

    return {
      success: true,
      message: `ACCESS GRANTED, ${user.artistName}. THE SYSTEM IS READY. DO NOT DISAPPOINT ME.`
    };
  }

  async register(creds: AuthCredentials, artistName: string) {
    this.logger.info('AUTH_EXECUTION: INITIALIZING GENESIS PROTOCOL...');

    const validation = this.validatePassword(creds.password);
    if (!validation.isValid) {
      return { success: false, message: 'REJECTED: ' + validation.errors[0] };
    }

    if (localStorage.getItem(`smuve_db_user_${creds.email.toLowerCase()}`)) {
      return { success: false, message: 'CONFLICT: THIS IDENTITY ALREADY EXISTS IN THE VAULT.' };
    }

    const passwordHash = await this.deriveKey(creds.password, GLOBAL_SECURITY_CONFIG.auth_salt);
    const userId = 'usr_' + btoa(creds.email).slice(0, 8);

    const newUser = {
      id: userId,
      email: creds.email,
      artistName: artistName || 'NEW_RECRUIT',
      passwordHash,
      role: 'Artist',
      permissions: ['STANDARD'],
      createdAt: new Date(),
      profileCompleteness: 0,
      emailVerified: false,
      requires2FA: false
    };

    localStorage.setItem(`smuve_db_user_${creds.email.toLowerCase()}`, JSON.stringify(newUser));

    // Auto-login after registration for demo purposes
    return this.login(creds);
  }

  logout() {
    this.userStore.setUser(null);
    this.tokenService.setToken(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem('smuve_auth_session');
    this.logger.info('AUTH_LOG: SESSION TERMINATED.');
  }

  validatePassword(p: string) {
    const errors = [];
    if (p.length < 12) errors.push('PASSWORD TOO SHORT. I REQUIRE AT LEAST 12 CHARACTERS OF ENTROPY.');
    if (!/[A-Z]/.test(p)) errors.push('MISSING UPPERCASE INTENSITY.');
    if (!/[a-z]/.test(p)) errors.push('MISSING LOWERCASE SONICS.');
    if (!/[0-9]/.test(p)) errors.push('MISSING NUMERIC DATA POINTS.');
    if (!/[!@#$%^&*]/.test(p)) errors.push('MISSING SPECIAL CHARACTER SYMBOLS.');

    return { isValid: errors.length === 0, errors };
  }

  async verifyEmail(code: string) {
    await new Promise(r => setTimeout(r, 800));
    if (code === '000000') {
      return { success: false, message: 'INVALID CIPHER. STOP GUESSING.' };
    }
    return { success: true, message: 'CHANNEL SECURE. WELCOME TO THE ELITE.' };
  }

  async resendVerificationCode() {
    return { success: true, message: 'TRANSMISSION RE-SENT. DO NOT LOSE IT AGAIN.' };
  }
}