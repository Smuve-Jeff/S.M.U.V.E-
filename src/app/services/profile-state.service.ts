import { Injectable, signal } from '@angular/core';
import { UserProfile, initialProfile } from '../types/profile.types';

@Injectable({
  providedIn: 'root',
})
export class ProfileStateService {
  profile = signal<UserProfile>(initialProfile);

  setProfile(p: UserProfile) {
    this.profile.set(p);
  }
}
