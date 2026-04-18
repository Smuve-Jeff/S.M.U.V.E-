import { Injectable, inject } from '@angular/core';
import {
  MusicManagerService,
  TrackModel,
  FxSlot,
} from './music-manager.service';

@Injectable({ providedIn: 'root' })
export class NeuralMixerService {
  private musicManager = inject(MusicManagerService);

  suggestForTrack(trackId: number) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;

        const suggestion = this.getHeuristicSuggestion(t);
        const updated = { ...t, ...suggestion };

        this.musicManager.engine.updateTrack(t.id, {
          gain: updated.gain,
          pan: updated.pan,
          sendA: updated.sendA,
          sendB: updated.sendB,
          fxSlots: updated.fxSlots,
        });

        return updated;
      })
    );
  }

  applyNeuralMix() {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        const suggestion = this.getHeuristicSuggestion(t);
        return { ...t, ...suggestion };
      })
    );

    this.musicManager.tracks().forEach((t) => {
      this.musicManager.engine.updateTrack(t.id, {
        gain: t.gain,
        pan: t.pan,
        sendA: t.sendA,
        sendB: t.sendB,
        fxSlots: t.fxSlots,
      });
    });
  }

  private getHeuristicSuggestion(t: TrackModel): Partial<TrackModel> {
    const name = t.name.toLowerCase();
    let gain = t.gain;
    let pan = t.pan;
    let sendA = t.sendA;
    let sendB = t.sendB;
    const fxSlots = [...t.fxSlots];

    if (name.includes('kick')) {
      gain = 0.85;
      pan = 0;
      this.ensureFx(fxSlots, 'compressor', { threshold: -12, ratio: 4 });
    } else if (name.includes('vocal')) {
      gain = 0.95;
      pan = 0;
      sendA = 0.25;
      sendB = 0.15;
      this.ensureFx(fxSlots, 'compressor', { threshold: -18, ratio: 3 });
    } else if (name.includes('bass')) {
      gain = 0.8;
      pan = 0;
      this.ensureFx(fxSlots, 'filter', { type: 'lowpass', frequency: 500 });
    } else if (name.includes('hi-hat')) {
      gain = 0.55;
      pan = 0.2;
    }

    return { gain, pan, sendA, sendB, fxSlots };
  }

  private ensureFx(slots: FxSlot[], type: string, params: any) {
    if (!slots.some((s) => s.type === type)) {
      slots.push({
        id: Math.random().toString(36).substring(7),
        type,
        params,
        enabled: true,
        mix: 1.0,
      });
    }
  }
}
