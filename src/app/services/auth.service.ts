import { Injectable, signal, computed } from '@angular/core';
import { UserProfile, initialProfile } from './user-profile.service';

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
  private _isAuthenticated = signal(false);
  private _currentUser = signal<AuthUser | null>(null);
  private _userProfile = signal<UserProfile | null>(null);

  isAuthenticated = this._isAuthenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();

  // Calculate profile completeness to encourage artists to fill out more info
  profileCompleteness = computed(() => {
    const profile = this._userProfile();
    if (!profile) return 0;

    let completedFields = 0;
    let totalFields = 0;

    // Basic Info (5 fields)
    totalFields += 5;
    if (profile.artistName && profile.artistName !== 'New Artist')
      completedFields++;
    if (profile.stageName) completedFields++;
    if (profile.location) completedFields++;
    if (profile.bio && profile.bio !== 'Describe your musical journey...')
      completedFields++;
    if (profile.primaryGenre) completedFields++;

    // Musical Identity (4 fields)
    totalFields += 4;
    if (profile.secondaryGenres.length > 0) completedFields++;
    if (profile.musicalInfluences) completedFields++;
    if (profile.artistsYouSoundLike.length > 0) completedFields++;
    if (profile.uniqueSound) completedFields++;

    // Experience & Expertise (3 fields)
    totalFields += 3;
    if (profile.yearsActive > 0) completedFields++;
    if (profile.skills.length > 0) completedFields++;
    if (profile.formalTraining) completedFields++;

    // Career & Goals (4 fields)
    totalFields += 4;
    if (profile.careerGoals.length > 0) completedFields++;
    if (profile.currentFocus) completedFields++;
    if (profile.biggestChallenge) completedFields++;
    if (profile.upcomingProjects) completedFields++;

    // Marketing & Business (3 fields)
    totalFields += 3;
    if (profile.promotionChannels.length > 0) completedFields++;
    if (profile.revenueStreams.length > 0) completedFields++;
    if (profile.contentStrategy) completedFields++;

    // Equipment & Setup (2 fields)
    totalFields += 2;
    if (profile.daw.length > 0) completedFields++;
    if (profile.equipment.length > 0) completedFields++;

    // Social & Links (1 field)
    totalFields += 1;
    if (Object.keys(profile.links).length > 0) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  });

  constructor() {
    // Check for existing session in localStorage
    this.loadSession();
  }

  private loadSession(): void {
    try {
      const sessionData = localStorage.getItem('smuve_auth_session');
      const profileData = localStorage.getItem('smuve_user_profile');

      if (sessionData && profileData) {
        const user = JSON.parse(sessionData);
        const profile = JSON.parse(profileData);

        this._currentUser.set(user);
        this._userProfile.set(profile);
        this._isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      this.clearSession();
    }
  }

  private saveSession(user: AuthUser, profile: UserProfile): void {
    try {
      localStorage.setItem('smuve_auth_session', JSON.stringify(user));
      localStorage.setItem('smuve_user_profile', JSON.stringify(profile));
    } catch (error) {
      console.error('Failed to save session:', error);
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
      // Simulate API call to backend
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Check if email already exists (simulate)
      const existingUser = localStorage.getItem(
        `smuve_user_${credentials.email}`
      );
      if (existingUser) {
        return {
          success: false,
          message:
            'An artist with this email already exists in the S.M.U.V.E system.',
        };
      }

      // Create new user
      const newUser: AuthUser = {
        id: this.generateUserId(),
        email: credentials.email,
        artistName: artistName,
        createdAt: new Date(),
        lastLogin: new Date(),
        profileCompleteness: 0,
      };

      // Create initial profile
      const newProfile: UserProfile = {
        ...initialProfile,
        artistName: artistName,
      };

      // Store credentials securely (in real app, this would be on backend)
      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        JSON.stringify({
          user: newUser,
          passwordHash: this.hashPassword(credentials.password), // Simple hash for demo
        })
      );

      // Set session
      this._currentUser.set(newUser);
      this._userProfile.set(newProfile);
      this._isAuthenticated.set(true);
      this.saveSession(newUser, newProfile);

      return {
        success: true,
        message: 'Welcome to S.M.U.V.E Your journey to greatness begins now.',
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
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Check credentials
      const userData = localStorage.getItem(`smuve_user_${credentials.email}`);
      if (!userData) {
        return {
          success: false,
          message:
            'No artist found with this email. Register to begin your journey.',
        };
      }

      const { user, passwordHash } = JSON.parse(userData);

      if (this.hashPassword(credentials.password) !== passwordHash) {
        return {
          success: false,
          message: 'Incorrect password. Access denied.',
        };
      }

      // Update last login
      user.lastLogin = new Date();

      // Load profile
      const profileData = localStorage.getItem('smuve_user_profile');
      const profile = profileData ? JSON.parse(profileData) : initialProfile;

      // Set session
      this._currentUser.set(user);
      this._userProfile.set(profile);
      this._isAuthenticated.set(true);
      this.saveSession(user, profile);

      // Update stored user data
      localStorage.setItem(
        `smuve_user_${credentials.email}`,
        JSON.stringify({ user, passwordHash })
      );

      return {
        success: true,
        message: `Welcome back, ${user.artistName}. S.M.U.V.E has been waiting.`,
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
    // Simple hash for demo purposes - in production use proper hashing (bcrypt, etc.)
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
