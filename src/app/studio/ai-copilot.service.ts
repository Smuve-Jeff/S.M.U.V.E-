
import { Injectable, inject } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { NeuralOrchestratorService } from '../services/ai.service';
import { NotificationService } from '../services/notification.service';

@Injectable({
  providedIn: 'root'
})
export class AiCopilotService {
  private musicManager = inject(MusicManagerService);
  private neuralOrchestrator = inject(NeuralOrchestratorService);
  private notificationService = inject(NotificationService);

  getSuggestions(): string[] {
    const suggestions = [];
    const tracks = this.musicManager.tracks();
    const releaseReadyCount = tracks.filter(t => t.status === 'ready').length;
    const activeLoopBars = this.musicManager.activeLoopBars();

    if (tracks.length < 4) {
      suggestions.push('Consider adding more tracks to create a fuller sound.');
    }

    if (releaseReadyCount === 0) {
      suggestions.push('None of your tracks are marked as "ready". Try finalizing a few tracks to move forward.');
    }

    if (activeLoopBars < 8) {
      suggestions.push('Your current loop is a bit short. Try extending it to at least 8 bars to allow for more variation.');
    }

    return suggestions;
  }

  applySuggestions() {
    const suggestions = this.getSuggestions();
    if (suggestions.length === 0) {
      this.notificationService.show('No suggestions to apply.', 'info');
      return;
    }

    // Simulate applying suggestions
    this.musicManager.tracks.update(tracks => {
      return tracks.map(track => {
        return {
          ...track,
          gain: track.gain * 0.8, // Lower gain of all tracks
        };
      });
    });

    this.notificationService.show('Arrangement Co-Pilot suggestions applied!', 'success');
  }
}
