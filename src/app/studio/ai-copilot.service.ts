import { Injectable, inject } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { AiService } from '../services/ai.service';

@Injectable({
  providedIn: 'root',
})
export class AiCopilotService {
  private readonly musicManager = inject(MusicManagerService);
  private readonly aiService = inject(AiService);

  getStats() {
    const tracks = this.musicManager.tracks();
    const releaseReadyCount = tracks.filter(
      (t) => (t as any).status === 'ready'
    ).length;
    const activeLoopBars = this.musicManager.activeLoopBars();
    return { releaseReadyCount, activeLoopBars };
  }

  applySuggestions() {}
}
