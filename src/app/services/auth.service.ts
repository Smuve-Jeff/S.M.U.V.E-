import { Injectable, inject, signal, computed } from '@angular/core';
import { SecurityService } from './security.service';
import { LoggingService } from './logging.service';
import { UserProfileService, initialProfile } from './user-profile.service';

const APP_SECURITY_CONFIG = {
  auth_salt: 'smuve_v4_executive_secure_link',
  encryption_key: 'smuve_v4_neural_key',
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
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private logger = inject(LoggingService);
  private securityService = inject(SecurityService);
  private profileService = inject(UserProfileService);

  private _isAuthenticated = signal(false);
  private _currentUser = signal<AuthUser | null>(null);

  isAuthenticated = this._isAuthenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();

  constructor() {
    this.loadSession();
  }

  private encrypt(data: string): string {
    const salted = data + '|' + APP_SECURITY_CONFIG.auth_salt;
    return btoa(unescape(encodeURIComponent(salted)));
  }

  private decrypt(encoded: string): string | null {
    try {
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const [data, key] = decoded.split('|');
      if (key === APP_SECURITY_CONFIG.auth_salt) {
        return data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const encryptedSession = localStorage.getItem('smuve_auth_session');
      if (encryptedSession) {
        const sessionData = this.decrypt(encryptedSession);
        if (sessionData) {
          const user = JSON.parse(sessionData);
          this._currentUser.set(user);
          this._isAuthenticated.set(true);
          await this.profileService.loadProfile(user.id);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load session:', error);
      this.clearSession();
    }
  }

  private saveSession(user: AuthUser): void {
    try {
      localStorage.setItem(
        'smuve_auth_session',
        this.encrypt(JSON.stringify(user))
      );
    } catch (error) {
      this.logger.error('Failed to save session:', error);
    }
  }

  private clearSession(): void {
    localStorage.removeItem('smuve_auth_session');
  }

  async login(
    credentials: AuthCredentials
  ): Promise<{ success: boolean; message: string }> {
    const user: AuthUser = {
      id: 'user_123',
      email: credentials.email,
      artistName: 'Pro Artist',
      role: 'Admin',
      permissions: ['ALL'],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 100,
    };
    this._currentUser.set(user);
    this._isAuthenticated.set(true);
    this.saveSession(user);
    await this.profileService.loadProfile(user.id);
    return { success: true, message: 'Welcome back.' };
  }

  async register(
    credentials: AuthCredentials,
    artistName: string
  ): Promise<{ success: boolean; message: string }> {
    return this.login(credentials);
  }

  logout(): void {
    this._currentUser.set(null);
    this._isAuthenticated.set(false);
    this.clearSession();
  }
}
