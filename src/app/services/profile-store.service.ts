import { Injectable, signal } from '@angular/core';
import { UserProfile, initialProfile } from '../types/profile.types';

@Injectable({ providedIn: 'root' })
export class ProfileStoreService {
  profile = signal<UserProfile>(initialProfile);
  /**
   * True once `UserProfileService.loadProfile()` has installed the artist's
   * stored profile. Before that the store holds `initialProfile`, so anything
   * that reads a setting as "the artist's choice" must wait for this — a
   * persisted write against the placeholder would save a stock profile over
   * the real one.
   */
  readonly hydrated = signal(false);

  setProfile(p: UserProfile) {
    this.profile.set(p);
  }

  /** Called by `loadProfile()` only, once a real profile is installed. */
  markHydrated() {
    this.hydrated.set(true);
  }
}
