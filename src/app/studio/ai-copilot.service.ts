import { Injectable, inject } from '@angular/core';
import { MusicManagerService, SongSection } from '../services/music-manager.service';
import { LoggingService } from '../services/logging.service';

@Injectable({
  providedIn: 'root',
})
export class AiCopilotService {
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  suggestStructure() {
    const defaultSections: SongSection[] = [
      { id: '1', name: 'Intro', start: 0, length: 8 },
      { id: '2', name: 'Verse', start: 8, length: 16 },
      { id: '3', name: 'Chorus', start: 24, length: 16 },
    ];
    this.musicManager.structure.set(defaultSections);
    this.logger.info('AI Copilot: Suggested basic song structure.');
  }
}
