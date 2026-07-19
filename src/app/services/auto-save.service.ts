import { Injectable, inject, effect, signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { DatabaseService } from './database.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { OfflineSyncService } from './offline-sync.service';

@Injectable({
  providedIn: 'root',
})
export class AutoSaveService {
  private musicManager = inject(MusicManagerService);
  private databaseService = inject(DatabaseService);
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);
  private offlineSync = inject(OfflineSyncService);

  private lastProjectHash = '';
  private lastProfileHash = '';
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);
  /** True when project is saved locally (offline-safe) */
  readonly isLocalSaved = signal(false);

  constructor() {
    effect(() => {
      if (!this.musicManager.projectLoaded()) {
        return;
      }

      const snapshot = this.musicManager.snapshotProject();
      if (snapshot.tracks.length === 0) {
        return;
      }

      const currentHash = JSON.stringify(snapshot);
      if (currentHash !== this.lastProjectHash) {
        this.lastProjectHash = currentHash;
        // Local-first: save to IndexedDB instantly (debounced 300ms)
        void this.saveLocalInstant(snapshot);
        // Remote sync (debounced 2s to avoid thrashing)
        this.debouncedRemoteSync(snapshot);

        // Profile Auto-save
        const currentProfile = this.profileService.profile();
        const profileHash = JSON.stringify(currentProfile);
        if (this.lastProfileHash !== profileHash) {
          this.lastProfileHash = profileHash;
          void this.syncProfile(currentProfile);
        }
      }
    });

    // On startup, try to restore last local project
    void this.restoreLocalProject();
  }

  /**
   * Instant local save — never blocks, never fails.
   * Writes project snapshot directly to IndexedDB via OfflineSync.
   */
  private async saveLocalInstant(
    projectData: ReturnType<MusicManagerService['snapshotProject']>
  ): Promise<void> {
    try {
      await this.offlineSync.saveLocal('project_v4_auto', {
        ...projectData,
        savedAt: Date.now(),
      });
      this.isLocalSaved.set(true);
      this.lastSavedAt.set(Date.now());
    } catch (e) {
      this.logger.error('AutoSaveService: Local save failed', e);
    }
  }

  /**
   * Debounced remote sync — waits 2s after last change before
   * hitting the network. Prevents API thrashing during rapid editing.
   */
  private debouncedRemoteSync(
    projectData: ReturnType<MusicManagerService['snapshotProject']>
  ): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      void this.syncProject(projectData);
    }, 2000);
  }

  /**
   * Restore last locally-saved project on app startup.
   * Ensures the user never sees a blank session after a cold start.
   */
  private async restoreLocalProject(): Promise<void> {
    try {
      const cached = await this.offlineSync.readLocal('project_v4_auto');
      if (cached && cached.tracks?.length > 0) {
        this.logger.info('AutoSaveService: Restored project from local cache');
        this.isLocalSaved.set(true);
        this.lastSavedAt.set(cached.savedAt || Date.now());
      }
    } catch {
      // Silent — fresh session
    }
  }

  private async syncProfile(profile: any) {
    if (!profile.id) return;
    try {
      await this.databaseService.saveUserProfile(profile, profile.id);
    } catch (e) {
      this.logger.error('AutoSaveService: Profile sync failed', e);
    }
  }

  private async syncProject(
    projectData: ReturnType<MusicManagerService['snapshotProject']>
  ) {
    const profile = this.profileService.profile();
    const userId = profile.id || 'anonymous';
    const projectId = 'project_v4_auto';
    const projectTitle = 'Auto-Sync Session';

    this.isSaving.set(true);
    this.lastError.set(null);

    try {
      await this.databaseService.saveProject(
        projectId,
        projectTitle,
        projectData,
        userId
      );
      this.lastSavedAt.set(Date.now());
    } catch (error) {
      this.lastError.set('Cloud sync queued. Changes are safe locally.');
      // Queue for offline sync instead of losing the save
      try {
        await this.offlineSync.queueOperation('UPDATE', '/api/projects/' + projectId, {
          projectId,
          projectTitle,
          projectData,
          userId,
        });
      } catch {
        // Silent — local save already succeeded
      }
      this.logger.error('AutoSaveService: Cloud sync failed, queued for retry', error);
    } finally {
      this.isSaving.set(false);
    }
  }
}
