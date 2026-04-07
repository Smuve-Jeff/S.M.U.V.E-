import { Injectable, inject, signal } from '@angular/core';
import { SecurityService } from './security.service';
import { LoggingService } from './logging.service';
import { UserProfileService, initialProfile } from './user-profile.service';

const APP_SECURITY_CONFIG = {
  auth_salt: 'smuve_v4_executive_secure_link',
  pbkdf2_iterations: 100000,
  key_length: 256,
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
    void this.loadSession();
  }

  private async deriveKey(password: string, salt: string): Promise<string> {
    if (typeof crypto?.subtle === 'undefined') {
      // Fallback for environments without SubtleCrypto
      return this.hashPassword(password);
    }

    try {
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
          iterations: APP_SECURITY_CONFIG.pbkdf2_iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        APP_SECURITY_CONFIG.key_length
      );

      return Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return this.hashPassword(password);
    }
  }

  private encrypt(data: string): string {
    const salted = data + '|' + APP_SECURITY_CONFIG.auth_salt;
    return btoa(unescape(encodeURIComponent(salted)));
  }

  private decrypt(encoded: string): string | null {
    try {
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const [data, key] = decoded.split('|');
      return key === APP_SECURITY_CONFIG.auth_salt ? data : null;
    } catch {
      return null;
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const encryptedSession = localStorage.getItem('smuve_auth_session');
      if (!encryptedSession) return;

      const sessionData = this.decrypt(encryptedSession);
      if (!sessionData) return;

      const user = JSON.parse(sessionData) as AuthUser;

      // Validate session with security service
      if (!this.securityService.validateSession()) {
        this.clearSession();
        return;
      }

      this._currentUser.set(user);
      this._isAuthenticated.set(true);
      this.securityService.refreshSession();
      await this.profileService.loadProfile(user.id);
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
      this.securityService.refreshSession();
    } catch (error) {
      this.logger.error('Failed to save session:', error);
    }
  }

  private clearSession(): void {
    localStorage.removeItem('smuve_auth_session');
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  private hashPassword(password: string): string {
    // Lightweight client-side hash for mock/local auth only.
    // Do NOT treat as secure.
    let hash = 0;
    const input = `${password}|${APP_SECURITY_CONFIG.auth_salt}`;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return `h_${Math.abs(hash)}`;
  }

  private generateSecureId(prefix: string): string {
    return `${prefix}_${crypto?.randomUUID?.() || this.generateUserId()}`;
  }

  async register(
    credentials: AuthCredentials,
    artistName: string
  ): Promise<{ success: boolean; message: string }> {
    // Check rate limiting
    const rateLimitKey = `register_${credentials.email}`;
    const rateResult = this.securityService.recordAttempt(rateLimitKey);

    if (!rateResult.allowed) {
      const waitMinutes = Math.ceil(
        ((rateResult.blockedUntil || 0) - Date.now()) / 60000
      );
      return {
        success: false,
        message: `Too many registration attempts. Please wait ${waitMinutes} minutes.`,
      };
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const existingUser = localStorage.getItem(
        `smuve_user_${credentials.email}`
      );
      if (existingUser) {
        return {
          success: false,
          message:
            'An artist with this email already exists in the S.M.U.V.E 4.2 system.',
        };
      }

      // Derive secure password hash using PBKDF2
      const passwordHash = await this.deriveKey(
        credentials.password,
        `${credentials.email}_${APP_SECURITY_CONFIG.auth_salt}`
      );

      const newUser: AuthUser = {
        id: this.generateUserId(),
        email: credentials.email,
        artistName: this.securityService.sanitizeInput(artistName),
        role: 'Admin',
        permissions: ['ALL_ACCESS'],
        createdAt: new Date(),
        lastLogin: new Date(),
        profileCompleteness: 0,
      };

      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        this.encrypt(
          JSON.stringify({
            user: newUser,
            passwordHash,
          })
        )
      );

      this._currentUser.set(newUser);
      this._isAuthenticated.set(true);
      this.saveSession(newUser);
      this.securityService.clearRateLimit(rateLimitKey);

      await this.profileService.updateProfile({
        ...initialProfile,
        artistName: this.securityService.sanitizeInput(artistName),
      } as any);

      await this.securityService.logEvent(
        'ACCOUNT_CREATED',
        'New artist account registered.',
        newUser.id
      );

      return {
        success: true,
        message:
          'Welcome to S.M.U.V.E 4.2. Your journey to greatness begins now.',
      };
    } catch {
      return {
        success: false,
        message: 'Registration failed. The system encountered an error.',
      };
    }
  }

  async login(
    credentials: AuthCredentials
  ): Promise<{ success: boolean; message: string; requires2FA?: boolean }> {
    // Check rate limiting
    const rateLimitKey = `login_${credentials.email}`;
    const rateResult = this.securityService.recordAttempt(rateLimitKey);

    if (!rateResult.allowed) {
      const waitMinutes = Math.ceil(
        ((rateResult.blockedUntil || 0) - Date.now()) / 60000
      );
      await this.securityService.logEvent(
        'LOGIN_BLOCKED',
        `Login blocked due to rate limiting for ${credentials.email}`
      );
      return {
        success: false,
        message: `Too many login attempts. Please wait ${waitMinutes} minutes.`,
      };
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const encryptedUserData = localStorage.getItem(
        `smuve_user_${credentials.email}`
      );
      if (!encryptedUserData) {
        return {
          success: false,
          message:
            'No artist found with this email. Register to begin your journey.',
        };
      }

      const userData = this.decrypt(encryptedUserData);
      if (!userData) {
        return {
          success: false,
          message: 'Security breach detected. Data corrupted.',
        };
      }

      const { user, passwordHash } = JSON.parse(userData) as {
        user: AuthUser;
        passwordHash: string;
      };

      // Verify password using PBKDF2 derivation
      const inputHash = await this.deriveKey(
        credentials.password,
        `${credentials.email}_${APP_SECURITY_CONFIG.auth_salt}`
      );

      // Support both legacy and new hash formats
      const isValidPassword =
        inputHash === passwordHash ||
        this.hashPassword(credentials.password) === passwordHash;

      if (!isValidPassword) {
        await this.securityService.logEvent(
          'LOGIN_FAILURE',
          `Failed login attempt for ${credentials.email}`,
          user.id
        );
        return {
          success: false,
          message: `Incorrect password. Access denied. ${rateResult.remainingAttempts} attempts remaining.`,
        };
      }

      // Mock 2FA check based on profile settings.
      const profile = this.profileService.profile() || (initialProfile as any);
      if (
        profile?.settings?.security?.twoFactorEnabled &&
        !credentials.twoFactorCode
      ) {
        return {
          success: false,
          message: 'Two-Factor Authentication required.',
          requires2FA: true,
        };
      }
      if (
        profile?.settings?.security?.twoFactorEnabled &&
        credentials.twoFactorCode &&
        credentials.twoFactorCode !== '123456'
      ) {
        await this.securityService.logEvent(
          '2FA_FAILURE',
          'Invalid 2FA code entered.',
          user.id
        );
        return {
          success: false,
          message: 'Invalid 2FA code. Access denied.',
        };
      }

      user.lastLogin = new Date();

      this._currentUser.set(user);
      this._isAuthenticated.set(true);
      this.saveSession(user);
      this.securityService.clearRateLimit(rateLimitKey);

      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        this.encrypt(JSON.stringify({ user, passwordHash }))
      );

      const sessionId = this.generateSecureId('sess');
      void sessionId;

      await this.securityService.logEvent(
        'LOGIN_SUCCESS',
        `Artist ${user.artistName} logged in successfully.`,
        user.id
      );
      await this.profileService.loadProfile(user.id);

      return {
        success: true,
        message: `Welcome back, ${user.artistName}. S.M.U.V.E 4.2 has been waiting.`,
      };
    } catch {
      return {
        success: false,
        message: 'Login failed. The system encountered an error.',
      };
    }
  }

  logout(): void {
    const user = this._currentUser();
    if (user) {
      void this.securityService.logEvent(
        'LOGOUT',
        `Artist ${user.artistName} logged out.`,
        user.id
      );
    }
    this._currentUser.set(null);
    this._isAuthenticated.set(false);
    this.clearSession();
  }
}
