import { Injectable, Injector, inject, effect, signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { DatabaseService } from './database.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { OfflineSyncService } from './offline-sync.service';
import { AuthService } from './auth.service';

/** Shown when this device refused to store the session. */
const LOCAL_SAVE_FAILED =
  'Changes could not be saved on this device. Export a backup before leaving.';

@Injectable({
  providedIn: 'root',
})
export class AutoSaveService {
  private musicManager = inject(MusicManagerService);
  private databaseService = inject(DatabaseService);
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);
  private offlineSync = inject(OfflineSyncService);
  private injector = inject(Injector);

  private lastProjectHash = '';
  private lastProfileHash = '';
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);
  /** True when project is saved locally (offline-safe) */
  readonly isLocalSaved = signal(false);

  /**
   * Whether the active session is guest clearance.
   *
   * Resolved lazily (AuthService imports this chain) and read inside the
   * autosave effect so signing in or out re-evaluates the gate.
   */
  private get isGuestSession(): boolean {
    try {
      return this.injector.get(AuthService).isGuest();
    } catch {
      // Auth unavailable in a lightweight host: treat it as a normal session.
      return false;
    }
  }

  constructor() {
    effect(() => {
      if (!this.musicManager.projectLoaded()) {
        return;
      }

      // Guests never persist: their scratch work would otherwise overwrite the
      // browser's shared autosave slot (and be synced under a guest id that no
      // account owns). The clearance page tells them work is not saved.
      if (this.isGuestSession) {
        return;
      }

      const snapshot = this.musicManager.snapshotProject();
      // A fresh session has no selected project yet. Keep the autosave
      // effect idle instead of dereferencing the intentionally-null snapshot
      // during application bootstrap (including the public login route).
      if (!snapshot?.tracks?.length) {
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
   * Instant local save — never blocks the editor, but it can fail (quota,
   * blocked storage). A failure clears the local-saved flag and reports it
   * rather than leaving a previous success claiming the work is safe.
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
      // A previous local-save failure is resolved by this successful write.
      if (this.lastError() === LOCAL_SAVE_FAILED) this.lastError.set(null);
    } catch (e) {
      this.isLocalSaved.set(false);
      this.lastError.set(LOCAL_SAVE_FAILED);
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
    // A delayed save from a project that was deleted or deselected must not
    // recreate it after the user has confirmed deletion.
    if (!projectData || this.musicManager.snapshotProject()?.id !== projectData.id) return;
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
        await this.offlineSync.queueOperation(
          'UPDATE',
          '/api/projects/' + projectId,
          {
            projectId,
            projectTitle,
            projectData,
            userId,
          }
        );
      } catch {
        // Silent — local save already succeeded
      }
      this.logger.error(
        'AutoSaveService: Cloud sync failed, queued for retry',
        error
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
