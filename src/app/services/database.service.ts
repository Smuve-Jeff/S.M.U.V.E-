import { Injectable, inject, signal } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { LoggingService } from './logging.service';
import { AuthService } from './auth.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private API_URL = 'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

  isSyncing = signal(false);
  lastSyncTime = signal<number | null>(null);

  async saveUserProfile(profile: UserProfile): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(this.http.post(`${this.API_URL}/profile`, {
          userId: user.id,
          profileData: profile
        }));
        this.lastSyncTime.set(Date.now());
        this.logger.info('User profile synced to cloud');
      } catch (error) {
        this.logger.error('Failed to sync profile to cloud', error);
        localStorage.setItem('smuve_user_profile_backup', JSON.stringify(profile));
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async loadUserProfile(): Promise<UserProfile | null> {
    const user = this.authService.currentUser();
    if (user) {
      try {
        const profile = await firstValueFrom(this.http.get<UserProfile>(`${this.API_URL}/profile/${user.id}`));
        this.lastSyncTime.set(Date.now());
        return profile;
      } catch (error) {
        this.logger.error('Failed to load profile from cloud', error);
        const backup = localStorage.getItem('smuve_user_profile_backup');
        return backup ? JSON.parse(backup) : null;
      }
    }
    return null;
  }

  // Project Cloud Sync
  async saveProject(projectId: string, title: string, projectData: any): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(this.http.post(`${this.API_URL}/projects`, {
          projectId,
          userId: user.id,
          title,
          projectData
        }));
        this.lastSyncTime.set(Date.now());
        this.logger.info(`Project ${title} synced to cloud`);
      } catch (error) {
        this.logger.error(`Failed to sync project ${title} to cloud`, error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async listProjects(): Promise<any[]> {
    const user = this.authService.currentUser();
    if (user) {
      try {
        return await firstValueFrom(this.http.get<any[]>(`${this.API_URL}/projects/${user.id}`));
      } catch (error) {
        this.logger.error('Failed to list projects from cloud', error);
      }
    }
    return [];
  }
}
