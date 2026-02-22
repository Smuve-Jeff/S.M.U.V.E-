import { Injectable, inject } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private authService = inject(AuthService);

  constructor() {}

  async saveUserProfile(profile: UserProfile): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      localStorage.setItem('smuve_user_profile', JSON.stringify(profile));
      console.log('User profile saved to localStorage:', profile);
    }
  }

  async loadUserProfile(): Promise<UserProfile | null> {
    const user = this.authService.currentUser();
    if (user) {
      const profileData = localStorage.getItem('smuve_user_profile');
      if (profileData) {
        console.log('User profile loaded from localStorage for user:', user.id);
        return JSON.parse(profileData);
      }
    }
    return null;
  }
}
