import { Injectable, inject, signal } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private http = inject(HttpClient);
  private localStorageService = inject(LocalStorageService);
  private API_URL =
    'https://smuve-v4-backend-9951606049235487441.onrender.com/api';

  isSyncing = signal(false);
  lastSyncTime = signal<number | null>(null);

  async saveUserProfile(profile: UserProfile, userId: string): Promise<void> {
    localStorage.setItem('smuve_user_profile_backup', JSON.stringify(profile));

    if (userId && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(
          this.http.post(`${this.API_URL}/profile`, {
            userId,
            profileData: profile,
          })
        );
        this.lastSyncTime.set(Date.now());
      } catch (error) {
        this.logger.error('Failed to sync profile to cloud', error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async loadUserProfile(userId: string): Promise<UserProfile | null> {
    if (userId && navigator.onLine) {
      try {
        const profile = await firstValueFrom(
          this.http.get<UserProfile>(`${this.API_URL}/profile/${userId}`)
        );
        if (profile) {
          localStorage.setItem(
            'smuve_user_profile_backup',
            JSON.stringify(profile)
          );
          return profile;
        }
      } catch (error) {
        this.logger.error('Failed to load profile from cloud', error);
      }
    }

    const backup = localStorage.getItem('smuve_user_profile_backup');
    return backup ? JSON.parse(backup) : null;
  }

  async saveProject(
    projectId: string,
    title: string,
    projectData: any,
    userId: string
  ): Promise<void> {
    await this.localStorageService.saveItem('projects', {
      id: projectId,
      title,
      data: projectData,
      userId: userId || 'anonymous',
      updatedAt: Date.now(),
    });

    if (userId && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(
          this.http.post(`${this.API_URL}/projects`, {
            projectId,
            userId,
            title,
            projectData,
          })
        );
        this.lastSyncTime.set(Date.now());
      } catch (error) {
        this.logger.error(`Failed to sync project ${title} to cloud`, error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async listProjects(userId: string): Promise<any[]> {
    const localProjects =
      await this.localStorageService.getAllItems('projects');
    if (userId && navigator.onLine) {
      try {
        return await firstValueFrom(
          this.http.get<any[]>(`${this.API_URL}/projects/${userId}`)
        );
      } catch (error) {
        this.logger.error('Failed to list projects from cloud', error);
      }
    }
    return localProjects;
  }
}
