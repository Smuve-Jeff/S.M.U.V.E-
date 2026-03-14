import { LoggingService } from './logging.service';
import { Injectable, inject } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { AuthService } from './auth.service';
import { APP_SECURITY_CONFIG } from '../app.security';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private authService = inject(AuthService);
  private readonly SECRET_KEY = APP_SECURITY_CONFIG.encryption_key;

  constructor() {}

  private encrypt(data: string): string {
    const salted = data + '|' + this.SECRET_KEY;
    return btoa(unescape(encodeURIComponent(salted)));
  }

  private decrypt(encoded: string): string | null {
    try {
      const decoded = decodeURIComponent(escape(atob(encoded)));
      const [data, key] = decoded.split('|');
      if (key === this.SECRET_KEY) {
        return data;
      }
      return null;
    } catch (e) {
      this.logger.error('Decryption failed', e);
      return null;
    }
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      const encryptedData = this.encrypt(JSON.stringify(profile));
      localStorage.setItem('smuve_user_profile', encryptedData);
      this.logger.info('User profile saved securely to localStorage');
    }
  }

  async loadUserProfile(): Promise<UserProfile | null> {
    const user = this.authService.currentUser();
    if (user) {
      const profileData = localStorage.getItem('smuve_user_profile');
      if (profileData) {
        const decryptedData = this.decrypt(profileData);
        if (decryptedData) {
          this.logger.info('User profile loaded securely for user:', user.id);
          return JSON.parse(decryptedData);
        }
      }
    }
    return null;
  }
}
