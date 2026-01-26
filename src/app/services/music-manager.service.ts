import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { InstrumentsService } from './instruments.service';

export type TrackNote = {
  midi: number;
  step: number;
  length: number;
  velocity: number;
};
export interface TrackModel {
  id: number;
  name: string;
  instrumentId: string;
  notes: TrackNote[];
  gain: number;
  pan: number;
  sendA: number;
  sendB: number;
}

@Injectable({ providedIn: 'root' })
export class MusicManagerService {
  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(-1);
  automationData = signal<Record<string, number[]>>({});

  constructor(
    public engine: AudioEngineService,
    public instruments: InstrumentsService
  ) {
    this.ensureTrack('Piano');
    // Bridge engine scheduler to request notes
    engine.onScheduleStep = (stepIndex, when, stepDur) => {
      this.currentStep.set(stepIndex);
      const _spb = 60 / engine.tempo();
      const dur = stepDur * 0.95;
      for (const t of this.tracks()) {
        const inst = instruments
          .getPresets()
          .find((p) => p.id === t.instrumentId);
        if (!inst) continue;
        for (const n of t.notes) {
          if (n.step === stepIndex) {
            const freq = this.midiToFreq(n.midi);
            if (inst.type === 'synth') {
              engine.playSynth(
                when,
                freq,
                dur,
                n.velocity,
                t.pan,
                t.gain,
                t.sendA,
                t.sendB,
                inst.synth as any
              );
            } else {
              // sample fallback: synth tone placeholder until samples are plugged in
              engine.playSynth(
                when,
                freq,
                dur,
                n.velocity,
                t.pan,
                t.gain,
                t.sendA,
                t.sendB,
                {
                  type: 'triangle',
                  attack: 0.002,
                  decay: 0.08,
                  sustain: 0.7,
                  release: 0.1,
                  cutoff: 7000,
                  q: 0.8,
                }
              );
            }
          }
        }
      }
    };

    effect(() => {
      if (!this.engine.isPlaying()) {
        this.currentStep.set(-1);
      }
    });
  }

  midiToFreq(m: number) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  ensureTrack(presetIdOrName: string): number {
    const presets = this.instruments.getPresets();
    const preset =
      presets.find(
        (p) => p.id === presetIdOrName || p.name === presetIdOrName
      ) || presets[0];
    const id = Math.floor(Math.random() * 1e9);
    const track: TrackModel = {
      id,
      name: preset.name,
      instrumentId: preset.id,
      notes: [],
      gain: 0.9,
      pan: 0,
      sendA: 0.1,
      sendB: 0.05,
    };
    this.tracks.update((v) => [...v, track]);
    this.engine.ensureTrack({
      id,
      name: track.name,
      instrumentId: track.instrumentId,
      gain: track.gain,
      pan: track.pan,
      sendA: track.sendA,
      sendB: track.sendB,
    });
    if (this.selectedTrackId() == null) this.selectedTrackId.set(id);
    return id;
  }

  setInstrument(trackId: number, presetId: string) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, instrumentId: presetId } : t))
    );
    this.engine.updateTrack(trackId, { instrumentId: presetId });
  }

  addNote(
    trackId: number,
    midi: number,
    step: number,
    length = 1,
    velocity = 0.9
  ) {
    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? { ...t, notes: [...t.notes, { midi, step, length, velocity }] }
          : t
      )
    );
  }

  updateNoteVelocity(
    trackId: number,
    midi: number,
    step: number,
    velocity: number
  ) {
    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: t.notes.map((n) =>
                n.midi === midi && n.step === step ? { ...n, velocity } : n
              ),
            }
          : t
      )
    );
  }

  removeNote(trackId: number, midi: number, step: number) {
    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: t.notes.filter(
                (n) => !(n.midi === midi && n.step === step)
              ),
            }
          : t
      )
    );
  }

  clearTrack(trackId: number) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, notes: [] } : t))
    );
  }

  setTempo(bpm: number) {
    this.engine.tempo.set(bpm);
  }
  play() {
    this.engine.start();
  }
  stop() {
    this.engine.stop();
    this.currentStep.set(-1);
  }
  setLoop(start: number, end: number) {
    this.engine.loopStart.set(start);
    this.engine.loopEnd.set(end);
  }
}
