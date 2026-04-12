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
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const tracks = this.musicManager.tracks();
      if (tracks.length > 0) {
        const currentHash = JSON.stringify(tracks);
        if (currentHash !== this.lastProjectHash) {
          this.lastProjectHash = currentHash;
          this.syncProject();
        }
      }
    });
  }

  private async syncProject() {
    const tracks = this.musicManager.tracks();
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
        { tracks },
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
