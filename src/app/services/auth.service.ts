import { Injectable, signal } from '@angular/core';
import { UserProfile } from './user-profile.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private _isAuthenticated = signal(false);
  private _userProfile: UserProfile | null = null;

  isAuthenticated = this._isAuthenticated.asReadonly();

  constructor() {
    // In a real app, you'd check for a token in localStorage
    // and validate it with a backend to set the initial auth state.
  }

  login(userProfile: UserProfile): void {
    // Simulate a login, in a real app this would involve a backend call
    this._userProfile = userProfile;
    this._isAuthenticated.set(true);
    // In a real app, you would store the auth token securely
  }

  logout(): void {
    this._userProfile = null;
    this._isAuthenticated.set(false);
    // In a real app, you would clear the auth token
  }

  async fetchUserProfile(): Promise<UserProfile | null> {
    // Simulate fetching user profile from a backend
    if (this._isAuthenticated()) {
      return Promise.resolve(this._userProfile);
    }
    return Promise.resolve(null);
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    // Simulate saving user profile to a backend
    if (this._isAuthenticated()) {
      this._userProfile = profile;
      return Promise.resolve();
    }
    return Promise.reject('User not authenticated');
  }
}
