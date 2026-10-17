import { Injectable, signal } from '@angular/core';
import { UserProfile, initialProfile } from '../types/profile.types';

@Injectable({ providedIn: 'root' })
export class ProfileStoreService {
  profile = signal<UserProfile>(initialProfile);

  setProfile(p: UserProfile) {
    this.profile.set(p);
  }
}
