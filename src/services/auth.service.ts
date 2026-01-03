import { Injectable, signal, computed } from '@angular/core';
import { UserProfile, initialProfile } from './user-profile.service';

// This would typically come from a backend response
export interface User {
  id: string;
  email: string;
  token: string; // A mock JWT or session token
  profile: UserProfile;
}

// A mock user for demonstration purposes
const MOCK_USER: User = {
  id: '1',
  email: 'artist@smove.app',
  token: 'fake-jwt-token-for-testing',
  profile: {
    ...initialProfile,
    artistName: 'Smuve Jeff',
    primaryGenre: 'Electronic',
    skills: ['DJing', 'Music Production'],
  }
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => !!this.currentUser());

  constructor() {
    // In a real app, you might check for a token in localStorage
    // and validate it with the server on startup.
  }

  // Simulates a login API call
  async login(email: string, password_redacted: string): Promise<User> {
    console.log(`AuthService: Simulating login for ${email}`);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email.toLowerCase() === MOCK_USER.email) {
          this.currentUser.set(MOCK_USER);
          resolve(MOCK_USER);
        } else {
          reject(new Error('Invalid credentials'));
        }
      }, 1000);
    });
  }

  // Simulates a registration API call
  async register(email: string, password_redacted: string): Promise<User> {
    console.log(`AuthService: Simulating registration for ${email}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        const newUser: User = {
          ...MOCK_USER,
          email: email,
        };
        this.currentUser.set(newUser);
        resolve(newUser);
      }, 1000);
    });
  }

  // Simulates a logout API call
  async logout(): Promise<void> {
    console.log('AuthService: Logging out');
    return new Promise((resolve) => {
      setTimeout(() => {
        this.currentUser.set(null);
        resolve();
      }, 500);
    });
  }

  // In a real app, this would make an API call to fetch the user's profile
  // using the stored token.
  fetchUserProfile(): Promise<UserProfile> {
    return new Promise((resolve, reject) => {
      if (this.isAuthenticated() && this.currentUser()?.profile) {
        resolve(this.currentUser()!.profile);
      } else {
        reject(new Error('Not authenticated'));
      }
    });
  }

  // In a real app, this would make an API call to save the user's profile.
  saveUserProfile(profile: UserProfile): Promise<void> {
    return new Promise((resolve, reject) => {
       if (this.isAuthenticated()) {
         this.currentUser.update(user => user ? ({ ...user, profile }) : null);
         resolve();
       } else {
         reject(new Error('Not authenticated'));
       }
    });
  }
}