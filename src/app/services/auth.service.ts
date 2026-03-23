import { LoggingService } from './logging.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import { UserProfile, initialProfile } from './user-profile.service';
import { APP_SECURITY_CONFIG } from '../app.security';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  artistName: string;
  createdAt: Date;
  lastLogin: Date;
  profileCompleteness: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private logger = inject(LoggingService);
  private _isAuthenticated = signal(false);
  private _currentUser = signal<AuthUser | null>(null);
  private _userProfile = signal<UserProfile | null>(null);

  isAuthenticated = this._isAuthenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();

  profileCompleteness = computed(() => {
    const profile = this._userProfile();
    if (!profile) return 0;

    let completedFields = 0;
    let totalFields = 0;

    totalFields += 5;
    if (profile.artistName && profile.artistName !== 'New Artist') completedFields++;
    if (profile.stageName) completedFields++;
    if (profile.location) completedFields++;
    if (profile.bio && profile.bio !== 'Describe your musical journey...') completedFields++;
    if (profile.primaryGenre) completedFields++;

    totalFields += 4;
    if (profile.secondaryGenres.length > 0) completedFields++;
    if (profile.musicalInfluences) completedFields++;
    if (profile.artistsYouSoundLike.length > 0) completedFields++;
    if (profile.uniqueSound) completedFields++;

    totalFields += 3;
    if (profile.yearsActive > 0) completedFields++;
    if (profile.skills.length > 0) completedFields++;
    if (profile.formalTraining) completedFields++;

    totalFields += 4;
    if (profile.careerGoals.length > 0) completedFields++;
    if (profile.currentFocus) completedFields++;
    if (profile.biggestChallenge) completedFields++;
    if (profile.upcomingProjects) completedFields++;

    totalFields += 3;
    if (profile.promotionChannels.length > 0) completedFields++;
    if (profile.revenueStreams.length > 0) completedFields++;
    if (profile.contentStrategy) completedFields++;

    totalFields += 2;
    if (profile.daw.length > 0) completedFields++;
    if (profile.equipment.length > 0) completedFields++;

    totalFields += 1;
    if (Object.keys(profile.links).length > 0) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  });

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

  private loadSession(): void {
    try {
      const encryptedSession = localStorage.getItem('smuve_auth_session');
      const encryptedProfile = localStorage.getItem('smuve_user_profile');

      if (encryptedSession && encryptedProfile) {
        const sessionData = this.decrypt(encryptedSession);
        const profileData = this.decrypt(encryptedProfile);

        if (sessionData && profileData) {
          const user = JSON.parse(sessionData);
          const profile = JSON.parse(profileData);

          this._currentUser.set(user);
          this._userProfile.set(profile);
          this._isAuthenticated.set(true);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load session:', error);
      this.clearSession();
    }
  }

  private saveSession(user: AuthUser, profile: UserProfile): void {
    try {
      localStorage.setItem('smuve_auth_session', this.encrypt(JSON.stringify(user)));
      localStorage.setItem('smuve_user_profile', this.encrypt(JSON.stringify(profile)));
    } catch (error) {
      this.logger.error('Failed to save session:', error);
    }
  }

  private clearSession(): void {
    localStorage.removeItem('smuve_auth_session');
    localStorage.removeItem('smuve_user_profile');
  }

  async register(
    credentials: AuthCredentials,
    artistName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const existingUser = localStorage.getItem(`smuve_user_${credentials.email}`);
      if (existingUser) {
        return {
          success: false,
          message: 'An artist with this email already exists in the S.M.U.V.E 4.2 system.',
        };
      }

      const newUser: AuthUser = {
        id: this.generateUserId(),
        email: credentials.email,
        artistName: artistName,
        createdAt: new Date(),
        lastLogin: new Date(),
        profileCompleteness: 0,
      };

      const newProfile: UserProfile = {
        ...initialProfile,
        artistName: artistName,
      };

      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        this.encrypt(JSON.stringify({
          user: newUser,
          passwordHash: this.hashPassword(credentials.password),
        }))
      );

      this._currentUser.set(newUser);
      this._userProfile.set(newProfile);
      this._isAuthenticated.set(true);
      this.saveSession(newUser, newProfile);

      return {
        success: true,
        message: 'Welcome to S.M.U.V.E 4.2 Your journey to greatness begins now.',
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
  ): Promise<{ success: boolean; message: string }> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const encryptedUserData = localStorage.getItem(`smuve_user_${credentials.email}`);
      if (!encryptedUserData) {
        return {
          success: false,
          message: 'No artist found with this email. Register to begin your journey.',
        };
      }

      const userData = this.decrypt(encryptedUserData);
      if (!userData) {
         return {
          success: false,
          message: 'Security breach detected. Data corrupted.',
        };
      }

      const { user, passwordHash } = JSON.parse(userData);

      if (this.hashPassword(credentials.password) !== passwordHash) {
        return {
          success: false,
          message: 'Incorrect password. Access denied.',
        };
      }

      user.lastLogin = new Date();

      const encryptedProfile = localStorage.getItem('smuve_user_profile');
      const profileData = encryptedProfile ? this.decrypt(encryptedProfile) : null;
      const profile = profileData ? JSON.parse(profileData) : initialProfile;

      this._currentUser.set(user);
      this._userProfile.set(profile);
      this._isAuthenticated.set(true);
      this.saveSession(user, profile);

      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        this.encrypt(JSON.stringify({ user, passwordHash }))
      );

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
    this._currentUser.set(null);
    this._userProfile.set(null);
    this._isAuthenticated.set(false);
    this.clearSession();
  }

  async fetchUserProfile(): Promise<UserProfile> {
    if (!this._isAuthenticated()) {
      throw new Error('Not authenticated');
    }
    return this._userProfile() || initialProfile;
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (!this._isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    this._userProfile.set(profile);

    const user = this._currentUser();
    if (user) {
      this.saveSession(user, profile);
    }
  }

  private generateUserId(): string {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private hashPassword(password: string): string {
    let hash = 0;
    const salt = APP_SECURITY_CONFIG.auth_salt;
    const saltedPassword = password + salt;

    for (let j = 0; j < 5; j++) {
        for (let i = 0; i < saltedPassword.length; i++) {
            const char = saltedPassword.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
    }
    return Math.abs(hash).toString(36) + (hash >>> 0).toString(16);
  }
}
