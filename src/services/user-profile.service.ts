
import { Injectable, signal, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface UserProfile {
  artistName: string;
  primaryGenre: string;
  secondaryGenres: string[];
  skills: string[];
  careerGoals: string[];
  currentFocus: string;
  influences: string;
  bio: string;
  links: { [key: string]: string; };
}

export const initialProfile: UserProfile = {
  artistName: 'New Artist',
  primaryGenre: '',
  secondaryGenres: [],
  skills: [],
  careerGoals: [],
  currentFocus: '',
  influences: '',
  bio: 'Describe your musical journey...',
  links: {},
};

const USER_PROFILE_STORAGE_KEY = 'aura_user_profile';

@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  private authService = inject(AuthService);
  profile = signal<UserProfile>(initialProfile);

  constructor() {
    // When the user logs in, fetch their profile.
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.loadProfile();
      } else {
        this.profile.set(initialProfile);
      }
    });
  }

  private async loadProfile(): Promise<void> {
    try {
      const userProfile = await this.authService.fetchUserProfile();
      this.profile.set(userProfile);
    } catch (error) {
      console.error('UserProfileService: Failed to load profile', error);
      // Handle error, maybe show a notification to the user
    }
  }

  async updateProfile(newProfile: UserProfile): Promise<void> {
    try {
      await this.authService.saveUserProfile(newProfile);
      this.profile.set(newProfile);
    } catch (error) {
      console.error('UserProfileService: Failed to save profile', error);
      // Handle error, maybe show a notification to the user
    }
  }
}
