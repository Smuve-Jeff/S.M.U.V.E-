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
  /**
   * Whether the app should actually block sensitive routes on verification.
   *
   * Derived from the API ("can this deployment send the mail?") rather than
   * from `emailVerified` alone — otherwise an environment without a mail
   * provider locks artists out of routes they can never unlock.
   */
  emailVerificationRequired?: boolean;
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
