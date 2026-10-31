import { Injectable, inject } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class NeuralMixerService {
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  /**
   * A rough balance heuristic, not an analysis: every track's gain is nudged by
   * a random amount within ±5%, and a safety compressor is added to tracks that
   * have no FX. Nothing here reads the audio or touches EQ, so the UI must not
   * describe it as an AI mix or an EQ balance.
   */
  applyNeuralMix() {
    this.logger.info('Applying Neural Mix across all tracks...');
    this.musicManager.tracks().forEach((track) => {
      // Simulate intelligent gain adjustment
      const randomAdjustment = (Math.random() - 0.5) * 0.1;
      this.musicManager.updateVolume(
        track.id,
        Math.max(0, Math.min(1.5, track.gain + randomAdjustment))
      );

      // Auto-enable basic FX if missing
      if (track.fxSlots.length === 0) {
        this.musicManager.tracks.update((ts) =>
          ts.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  fxSlots: [
                    {
                      id: 'fx-auto-1',
                      type: 'Compressor',
                      params: {},
                      enabled: true,
                    },
                  ],
                }
              : t
          )
        );
        // The write above bypasses the manager's FX-chain sync.
        this.musicManager.syncTrackFxChain(track.id);
      }
    });
  }
}
