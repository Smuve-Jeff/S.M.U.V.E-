import { Injectable, inject } from '@angular/core';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioSessionService } from './audio-session.service';

@Injectable({ providedIn: 'root' })
export class MixerService {
  private musicManager = inject(MusicManagerService);
  private audioSession = inject(AudioSessionService);

  muteAll() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => ({ ...t, mute: true }))
    );
  }

  unmuteAll() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => ({ ...t, mute: false }))
    );
  }

  soloAll() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => ({ ...t, solo: true }))
    );
  }

  clearSolo() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => ({ ...t, solo: false }))
    );
  }

  resetAllLevels() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => ({ ...t, gain: 0.9, pan: 0 }))
    );
    this.musicManager.tracks().forEach((t) => {
      this.musicManager.engine.updateTrack(t.id, { gain: 0.9, pan: 0 });
    });
  }
}
