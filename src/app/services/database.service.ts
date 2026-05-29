import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, inject, signal } from '@angular/core';
import { UserProfile } from '../types/profile.types';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { firstValueFrom } from 'rxjs';
import { ArtistIdentityState } from '../types/artist-identity.types';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private http = inject(HttpClient);
  private localStorageService = inject(LocalStorageService);
  private tokenService = inject(TokenService);
  private API_URL = APP_SECURITY_CONFIG.api_url;

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    return token ? { headers: { Authorization: 'Bearer ' + token } } : {};
  }

  get apiUrl(): string {
    return this.API_URL;
  }

  isSyncing = signal(false);
  lastSyncTime = signal<number | null>(null);

  private getProfileBackupKey(userId?: string): string {
    return userId
      ? `smuve_user_profile_backup_${userId}`
      : 'smuve_user_profile_backup';
  }

  async saveUserProfile(profile: UserProfile, userId: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        this.getProfileBackupKey(userId),
        JSON.stringify(profile)
      );
    }

    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(
          this.http.post(
            `${this.API_URL}/profile`,
            { userId, profileData: profile },
            this.getHeaders()
          )
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
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const profile = await firstValueFrom(
          this.http.get<UserProfile>(
            `${this.API_URL}/profile/${userId}`,
            this.getHeaders()
          )
        );
        if (profile) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(
              this.getProfileBackupKey(userId),
              JSON.stringify(profile)
            );
          }
          return profile;
        }
      } catch (error) {
        this.logger.error('Failed to load profile from cloud', error);
      }
    }

    if (typeof localStorage === 'undefined') return null;
    const backup =
      localStorage.getItem(this.getProfileBackupKey(userId)) ||
      localStorage.getItem(this.getProfileBackupKey());
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

    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(
          this.http.post(
            `${this.API_URL}/projects`,
            { projectId, userId, title, projectData },
            this.getHeaders()
          )
        );
        this.lastSyncTime.set(Date.now());
      } catch (error) {
        this.logger.error(`Failed to sync project ${title} to cloud`, error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async loadProject(projectId: string, userId: string): Promise<any | null> {
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const project = await firstValueFrom(
          this.http.get<any>(
            `${this.API_URL}/projects/${userId}/${projectId}`,
            this.getHeaders()
          )
        );
        if (project?.projectData) {
          return project.projectData;
        }
        if (project?.data) {
          return project.data;
        }
        if (project?.tracks || project?.structure) {
          return project;
        }
      } catch (error) {
        this.logger.error(
          `Failed to load project ${projectId} from cloud`,
          error
        );
      }
    }

    const localProject = await this.localStorageService.getItem(
      'projects',
      projectId
    );
    if (!localProject) {
      return null;
    }

    if (userId && localProject.userId && localProject.userId !== userId) {
      return null;
    }

    return localProject.data || null;
  }

  async listProjects(userId: string): Promise<any[]> {
    const localProjects =
      await this.localStorageService.getAllItems('projects');
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        return await firstValueFrom(
          this.http.get<any[]>(
            `${this.API_URL}/projects/${userId}`,
            this.getHeaders()
          )
        );
      } catch (error) {
        this.logger.error('Failed to list projects from cloud', error);
      }
    }
    return localProjects;
  }

  async saveArtistIdentity(
    userId: string,
    identity: ArtistIdentityState,
    profile?: UserProfile
  ): Promise<void> {
    await this.localStorageService.saveItem('projects', {
      id: `artist-identity:${userId}`,
      userId,
      identity,
      profileSnapshot: profile,
      updatedAt: Date.now(),
    });

    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      this.isSyncing.set(true);
      try {
        await firstValueFrom(
          this.http.post(
            `${this.API_URL}/identity`,
            { userId, identity, profileData: profile },
            this.getHeaders()
          )
        );
        this.lastSyncTime.set(Date.now());
      } catch (error) {
        this.logger.error('Failed to sync artist identity to cloud', error);
      } finally {
        this.isSyncing.set(false);
      }
    }
  }

  async loadArtistIdentity(
    userId: string
  ): Promise<ArtistIdentityState | null> {
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const response = await firstValueFrom(
          this.http.get<{ identity: ArtistIdentityState }>(
            `${this.API_URL}/identity/${userId}`,
            this.getHeaders()
          )
        );
        if (response?.identity) return response.identity;
      } catch (error) {
        this.logger.error('Failed to load artist identity from cloud', error);
      }
    }

    const backup = await this.localStorageService.getItem(
      'projects',
      `artist-identity:${userId}`
    );
    return backup?.identity || null;
  }

  async listConnectorJobs(userId: string): Promise<any[]> {
    if (userId && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        return await firstValueFrom(
          this.http.get<any[]>(
            `${this.API_URL}/identity/${userId}/connectors`,
            this.getHeaders()
          )
        );
      } catch (error) {
        this.logger.error('Failed to list connector jobs from cloud', error);
      }
    }
    return [];
  }
}
