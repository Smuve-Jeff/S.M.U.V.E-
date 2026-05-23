import { Injectable, inject } from '@angular/core';
import {
  MusicManagerService,
  SongSection,
} from '../services/music-manager.service';
import { AiService } from '../services/ai.service';
import { NotificationService } from '../services/notification.service';

@Injectable({
  providedIn: 'root',
})
export class AiCopilotService {
  private readonly musicManager = inject(MusicManagerService);
  private readonly aiService = inject(AiService);
  private readonly notificationService = inject(NotificationService);

  getStats() {
    const tracks = this.musicManager.tracks();
    const releaseReadyCount = tracks.filter(
      (t) => (t as any).status === 'ready'
    ).length;
    const activeLoopBars = this.musicManager.activeLoopBars();
    return { releaseReadyCount, activeLoopBars };
  }

  async applySuggestions() {
    this.notificationService.show(
      'Arrangement Co-Pilot: Analyzing Project Structure...',
      'info'
    );

    const stats = this.getStats();
    const prompt = `Analyze this music project: ${this.musicManager.tracks().length} tracks, ${stats.activeLoopBars} bars. Suggest a professional song structure.`;

    const suggestion = await this.aiService.getAIResponse(prompt);

    if (this.musicManager.structure().length === 0) {
      const defaultSections: SongSection[] = [
        {
          id: 'sec-intro',
          name: 'Intro',
          start: 1,
          length: 8,
          color: '#4f46e5',
        },
        {
          id: 'sec-verse1',
          name: 'Verse 1',
          start: 9,
          length: 16,
          color: '#0ea5e9',
        },
        {
          id: 'sec-chorus1',
          name: 'Chorus 1',
          start: 25,
          length: 8,
          color: '#d946ef',
        },
      ];
      this.musicManager.structure.set(defaultSections);
      this.notificationService.show(
        'Co-Pilot: Structural Blueprint Applied',
        'success'
      );
    } else {
      this.notificationService.show(
        'Co-Pilot Insight: ' + suggestion.substring(0, 60) + '...',
        'info'
      );
    }
  }
}
