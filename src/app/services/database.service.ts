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

  /**
   * Persists a profile under `userId`'s keys (local backup + cloud).
   *
   * Ownership is enforced here as well as in `UserProfileService`, so no caller
   * — present or future — can write one account's record into another account's
   * slot by passing a session-derived key. A profile with no stamp (a stock or
   * freshly imported record) is allowed through, because there is no owner to
   * compare and the caller stamps it as part of saving.
   */
  async saveUserProfile(profile: UserProfile, userId: string): Promise<void> {
    const owner = typeof profile?.id === 'string' ? profile.id.trim() : '';
    const destination = typeof userId === 'string' ? userId.trim() : '';
    if (owner && destination && owner !== destination) {
      this.logger.warn(
        'Profile save refused: the record is stamped with a different account than the destination key.'
      );
      return;
    }

    const keepBackup = profile.settings?.security?.keepLocalProfileBackup !== false;
    if (typeof localStorage !== 'undefined') {
      try {
        if (keepBackup) {
          localStorage.setItem(
            this.getProfileBackupKey(userId),
            JSON.stringify(profile)
          );
        } else {
          localStorage.removeItem(this.getProfileBackupKey(userId));
        }
      } catch (error) {
        this.logger.warn('Local profile backup unavailable; cloud sync will continue.', error);
      }
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
          if (typeof localStorage !== 'undefined' && profile.settings?.security?.keepLocalProfileBackup !== false) {
            try {
              localStorage.setItem(
                this.getProfileBackupKey(userId),
                JSON.stringify(profile)
              );
            } catch (error) {
              this.logger.warn('Could not refresh local profile backup.', error);
            }
          } else if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.getProfileBackupKey(userId));
          }
          return profile;
        }
      } catch (error) {
        // Cloud sync is optional when no backend profile is available; continue
        // with the local backup without reporting this expected fallback as an
        // application-wide error on login or workspace initialization.
        this.logger.warn('Cloud profile unavailable; checking local backup.', error);
      }
    }

    if (typeof localStorage === 'undefined') return null;
    // When the cloud profile records backup-off, discard a stale local copy and
    // never silently revive it offline.
    if (localStorage.getItem(this.getProfileBackupKey(userId))) {
      try {
        const localProfile = JSON.parse(localStorage.getItem(this.getProfileBackupKey(userId)) || 'null');
        if (localProfile?.settings?.security?.keepLocalProfileBackup === false) return null;
      } catch {
        localStorage.removeItem(this.getProfileBackupKey(userId));
      }
    }
    // Backwards compatibility: older builds saved under the generic
    // 'current' key, so fall back to it when the id-keyed backup is absent.
    // Never fall back to the shared legacy keys for a real account id: those
    // keys predate account-scoped storage and can contain another signed-in
    // person's profile on a shared browser.
    const backup = userId === 'current'
      ? localStorage.getItem(this.getProfileBackupKey(userId)) ||
        localStorage.getItem(this.getProfileBackupKey())
      : localStorage.getItem(this.getProfileBackupKey(userId));
    if (!backup) return null;
    try {
      const parsed = JSON.parse(backup);
      if (parsed?.settings?.security?.keepLocalProfileBackup === false) {
        localStorage.removeItem(this.getProfileBackupKey(userId));
        return null;
      }
      return parsed;
    } catch (error) {
      this.logger.warn('Discarding unreadable local profile backup.', error);
      return null;
    }
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
    const localProject = await this.localStorageService.getItem(
      'projects',
      projectId
    );
    if (
      localProject &&
      (!userId || !localProject.userId || localProject.userId === userId)
    ) {
      return localProject.data || null;
    }

    if (
      userId &&
      userId !== 'anonymous' &&
      typeof navigator !== 'undefined' &&
      navigator.onLine
    ) {
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

    return null;
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

  async uploadAsset(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await firstValueFrom(
        this.http.post<{ url: string }>(
          `${this.API_URL}/upload`,
          formData,
          this.getHeaders()
        )
      );
      return response.url;
    } catch (error) {
      this.logger.error('Failed to upload asset to R2', error);
      throw error;
    }
  }
}
