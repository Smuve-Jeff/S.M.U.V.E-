import { APP_SECURITY_CONFIG } from '../app.security';
import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfile } from '../types/profile.types';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { firstValueFrom } from 'rxjs';
import { ArtistIdentityState } from '../types/artist-identity.types';
import { TokenService } from './token.service';
import { OfflineSyncService } from './offline-sync.service';
import { saveJson, deleteSaved } from './guarded-storage';

/** In-process queue endpoint for profile cloud retries (no fetch URL). */
export const PROFILE_SYNC_ENDPOINT = 'smuve://profile-sync';

const PROFILE_SYNC_FAILED =
  'Profile cloud sync failed. Changes are on this device and queued for retry.';
const PROFILE_SYNC_DEAD_LETTERED =
  'Profile sync stopped after repeated retries. Reconnect, then retry the profile sync.';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private logger = inject(LoggingService);
  private http = inject(HttpClient);
  private localStorageService = inject(LocalStorageService);
  private tokenService = inject(TokenService);
  private offlineSync = inject(OfflineSyncService);
  private API_URL = APP_SECURITY_CONFIG.api_url;

  /** True while a profile write is on this device but not confirmed in the cloud. */
  readonly cloudSyncPending = signal(false);
  /** True once the queued profile retry exhausted its attempts. */
  readonly cloudSyncDeadLettered = computed(() =>
    this.offlineSync
      .deadLetteredEndpoints()
      .includes(PROFILE_SYNC_ENDPOINT)
  );
  private readonly profileSyncError = signal<string | null>(null);
  /** Human-readable reason for the last failed profile cloud write. */
  readonly cloudSyncError = computed(() =>
    this.cloudSyncDeadLettered()
      ? PROFILE_SYNC_DEAD_LETTERED
      : this.profileSyncError()
  );

  constructor() {
    // Replay queued profile writes through the same verified path. The queued
    // payload is a fallback: the device backup is refreshed on every save, so
    // a retry sends the latest profile rather than an older snapshot.
    this.offlineSync.registerEndpointHandler(
      PROFILE_SYNC_ENDPOINT,
      async (item) => {
        const userId = String(item.payload?.userId || '').trim();
        const profile =
          this.readLocalProfileBackup(userId) || item.payload?.profile;
        if (!profile) {
          throw new Error('No profile copy is available to retry.');
        }
        const synced = await this.syncProfileToCloud(profile, userId, false);
        if (!synced) {
          throw new Error('Profile cloud sync is still failing.');
        }
      }
    );
  }

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    // A legacy local/demo token is not signed by the API. Presenting it as a
    // bearer credential only earns a 401 that can tear down the session; the
    // interceptor applies the same rule to requests without their own header.
    return token && this.tokenService.isApiToken()
      ? { headers: { Authorization: 'Bearer ' + token } }
      : {};
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

  private readProfileBackup(key: string): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private removeProfileBackup(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') deleteSaved(key, 'localStorage');
    } catch {
      // A blocked store keeps a stale copy; it is never trusted while blocked.
    }
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
  async saveUserProfile(profile: UserProfile, userId: string): Promise<boolean> {
    const owner = typeof profile?.id === 'string' ? profile.id.trim() : '';
    const destination = typeof userId === 'string' ? userId.trim() : '';
    if (owner && destination && owner !== destination) {
      this.logger.warn(
        'Profile save refused: the record is stamped with a different account than the destination key.'
      );
      return false;
    }

    const keepBackup = profile.settings?.security?.keepLocalProfileBackup !== false;
    if (typeof localStorage !== 'undefined') {
      try {
        if (keepBackup) {
          saveJson(this.getProfileBackupKey(userId), profile, 'localStorage');
        } else {
          deleteSaved(this.getProfileBackupKey(userId), 'localStorage');
        }
      } catch (error) {
        this.logger.warn('Local profile backup unavailable; cloud sync will continue.', error);
      }
    }

    return this.syncProfileToCloud(profile, destination, true);
  }

  /**
   * The one cloud write for profiles. Success clears the pending state; any
   * failure keeps it visible and queues a retry so a background save can never
   * be presented as synced when the cloud did not accept it.
   */
  private async syncProfileToCloud(
    profile: UserProfile,
    userId: string,
    queueRetry: boolean
  ): Promise<boolean> {
    if (!userId) {
      // No cloud destination exists (guest/signed-out): nothing to retry.
      return false;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
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
        this.cloudSyncPending.set(false);
        this.profileSyncError.set(null);
        // A confirmed write makes any dead-lettered profile retry obsolete.
        await this.clearProfileDeadLetters();
        // Only the provider confirming the write counts as cloud sync; the
        // local backup does not.
        return true;
      } catch (error) {
        this.logger.error('Failed to sync profile to cloud', error);
        this.cloudSyncPending.set(true);
        this.profileSyncError.set(PROFILE_SYNC_FAILED);
        if (queueRetry) await this.queueProfileRetry(profile, userId);
        return false;
      } finally {
        this.isSyncing.set(false);
      }
    }

    // Offline: the device has the profile and the queue will replay it.
    this.cloudSyncPending.set(true);
    this.profileSyncError.set(
      'Waiting for a connection. Profile changes are on this device.'
    );
    if (queueRetry) await this.queueProfileRetry(profile, userId);
    return false;
  }

  /** The latest device copy, used so a retry never posts a stale profile. */
  readLocalProfileBackup(userId: string): UserProfile | null {
    const raw = this.readProfileBackup(this.getProfileBackupKey(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserProfile;
    } catch {
      return null;
    }
  }

  /** Re-queue profile writes that exhausted their automatic retries. */
  async retryProfileCloudSync(): Promise<void> {
    // No dead letter for this endpoint: there is nothing to scan for.
    if (!this.cloudSyncDeadLettered()) return;
    try {
      const dead = (await this.offlineSync.listDeadLetters()).filter(
        (item) => item.endpoint === PROFILE_SYNC_ENDPOINT
      );
      if (!dead.length) return;
      // Mark pending before replaying: the queue may process synchronously and
      // a late write here would overwrite a successful result.
      this.cloudSyncPending.set(true);
      this.profileSyncError.set(PROFILE_SYNC_FAILED);
      for (const item of dead) {
        await this.offlineSync.replayDeadLetter(item.id);
      }
    } catch (error) {
      this.logger.warn('Could not retry the dead-lettered profile write', error);
    }
  }

  /** Drop dead-lettered profile writes once a fresh write reaches the cloud. */
  private async clearProfileDeadLetters(): Promise<void> {
    // Read the store itself: the cached endpoint list is only refreshed on a
    // queue update, so a stale copy would leave a dead letter behind after the
    // cloud already accepted the write. One store read per confirmed save.
    try {
      const dead = await this.offlineSync.listDeadLetters();
      for (const item of dead) {
        if (item.endpoint === PROFILE_SYNC_ENDPOINT) {
          await this.offlineSync.clearDeadLetter(item.id);
        }
      }
    } catch (error) {
      this.logger.warn('Could not clear dead-lettered profile writes', error);
    }
  }

  private async queueProfileRetry(
    profile: UserProfile,
    userId: string
  ): Promise<void> {
    try {
      if (await this.offlineSync.hasPending(PROFILE_SYNC_ENDPOINT)) return;
      await this.offlineSync.queueOperation(
        'UPDATE',
        PROFILE_SYNC_ENDPOINT,
        { userId, profile }
      );
    } catch (error) {
      this.logger.warn('Could not queue the profile sync retry', error);
    }
  }

  /**
   * Remove this device's copy only. The account and its cloud record stay, and
   * the next save writes a fresh local copy when local backup is enabled.
   */
  removeLocalProfileBackup(userId: string): void {
    this.removeProfileBackup(this.getProfileBackupKey(userId));
    if (userId === 'current') {
      // Older builds also wrote the generic fallback key.
      this.removeProfileBackup(this.getProfileBackupKey());
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
              saveJson(this.getProfileBackupKey(userId), profile, 'localStorage');
            } catch (error) {
              this.logger.warn('Could not refresh local profile backup.', error);
            }
          } else {
            this.removeProfileBackup(this.getProfileBackupKey(userId));
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

    // An unreadable store means no local backup, never a failed boot.
    const userBackup = this.readProfileBackup(this.getProfileBackupKey(userId));
    // When the cloud profile records backup-off, discard a stale local copy and
    // never silently revive it offline.
    if (userBackup) {
      try {
        const localProfile = JSON.parse(userBackup);
        if (localProfile?.settings?.security?.keepLocalProfileBackup === false) return null;
      } catch {
        this.removeProfileBackup(this.getProfileBackupKey(userId));
      }
    }
    // Backwards compatibility: older builds saved under the generic
    // 'current' key, so fall back to it when the id-keyed backup is absent.
    // Never fall back to the shared legacy keys for a real account id: those
    // keys predate account-scoped storage and can contain another signed-in
    // person's profile on a shared browser.
    const backup = userId === 'current'
      ? userBackup || this.readProfileBackup(this.getProfileBackupKey())
      : userBackup;
    if (!backup) return null;
    try {
      const parsed = JSON.parse(backup);
      if (parsed?.settings?.security?.keepLocalProfileBackup === false) {
        deleteSaved(this.getProfileBackupKey(userId), 'localStorage');
        return null;
      }
      return parsed;
    } catch (error) {
      this.logger.warn('Discarding unreadable local profile backup.', error);
      return null;
    }
  }

  /**
   * Local project save. Cloud writes go through CloudSyncService.push /
   * queuePush exclusively — a single versioned contract — so every cloud
   * row is a restorable bundle instead of a legacy unversioned upsert.
   * The global sync pill still reflects this write via the shared signals.
   */
  async saveProject(
    projectId: string,
    title: string,
    projectData: any,
    userId: string
  ): Promise<void> {
    this.isSyncing.set(true);
    try {
      await this.localStorageService.saveItem('projects', {
        id: projectId,
        title,
        data: projectData,
        userId: userId || 'anonymous',
        updatedAt: Date.now(),
      });
      this.lastSyncTime.set(Date.now());
    } finally {
      this.isSyncing.set(false);
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
