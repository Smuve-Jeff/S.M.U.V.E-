import { Injectable, inject, effect, signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { DatabaseService } from './database.service';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class AutoSaveService {
  private musicManager = inject(MusicManagerService);
  private databaseService = inject(DatabaseService);
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);

  private lastProjectHash = '';
  private lastProfileHash = '';
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);

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
        void this.syncProject(snapshot);

        // Profile Auto-save
        const currentProfile = this.profileService.profile();
        const profileHash = JSON.stringify(currentProfile);
        if (this.lastProfileHash !== profileHash) {
          this.lastProfileHash = profileHash;
          void this.syncProfile(currentProfile);
        }
      }
    });
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
      this.lastError.set('Auto-save failed. Changes remain local until retry.');
      this.logger.error('AutoSaveService: Failed to sync project', error);
    } finally {
      this.isSaving.set(false);
    }
  }
}
