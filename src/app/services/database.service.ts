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
      // Here you would implement the logic to save the user profile to your database.
      // For example, using Firestore:
      // await this.firestore.collection('users').doc(user.uid).set(profile);
      console.log('User profile saved:', profile);
    }
  }

  async loadUserProfile(): Promise<UserProfile | null> {
    const user = this.authService.currentUser();
    if (user) {
      // Here you would implement the logic to load the user profile from your database.
      // For example, using Firestore:
      // const doc = await this.firestore.collection('users').doc(user.uid).get();
      // if (doc.exists) {
      //   return doc.data() as UserProfile;
      // }
      console.log('User profile loaded for user:', user.id);
    }
    return null;
  }
}
