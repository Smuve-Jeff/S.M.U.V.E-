import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  id: string;
  email: string;
  artistName: string;
  role: string;
  permissions: string[];
  createdAt: Date;
  lastLogin: Date;
  profileCompleteness: number;
  emailVerified: boolean;
  verificationCode?: string;
}

@Injectable({ providedIn: 'root' })
export class UserStoreService {
  user = signal<AuthUser | null>(null);
  isAuthenticated = signal(false);

  setUser(user: AuthUser | null) {
    this.user.set(user);
    this.isAuthenticated.set(!!user);
  }
}
