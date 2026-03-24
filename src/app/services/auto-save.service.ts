import { Injectable, inject, effect } from '@angular/core';
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

    await this.databaseService.saveProject(
      projectId,
      projectTitle,
      { tracks },
      userId
    );
  }
}
