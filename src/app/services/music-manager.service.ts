import { Injectable, signal, effect, inject } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { InstrumentsService } from './instruments.service';
import { UserProfileService } from './user-profile.service';

export type TrackNote = {
  id: string;
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
  mute: boolean;
  solo: boolean;
  steps: boolean[];
}

@Injectable({ providedIn: 'root' })
export class MusicManagerService {
  public engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);
  private profileService = inject(UserProfileService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(-1);
  automationData = signal<Record<string, number[]>>({});

  constructor() {
    // Initial setup if no tracks exist
    setTimeout(() => {
        if (this.tracks().length === 0) {
            this.loadLastSession();
        }
    }, 500);

    // Bridge engine scheduler to request notes
    this.engine.onScheduleStep = (stepIndex, when, stepDur) => {
      this.currentStep.set(stepIndex);
      const dur = stepDur * 0.95;
      const anySolo = this.tracks().some(t => t.solo);
      for (const t of this.tracks()) {
        if (t.mute || (anySolo && !t.solo)) continue;
        const inst = this.instruments
          .getPresets()
          .find((p) => p.id === t.instrumentId);
        if (!inst) continue;
        for (const n of t.notes) {
          if (n.step === stepIndex) {
            const freq = this.midiToFreq(n.midi);
            if (inst.type === 'synth') {
              this.engine.playSynth(
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
              // sample fallback
              this.engine.playSynth(
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

  private loadLastSession() {
    const profile = this.profileService.profile();
    const lastSession = (profile.knowledgeBase as any).lastDawSession;

    if (lastSession && lastSession.tracks && lastSession.tracks.length > 0) {
      console.log('MusicManager: Restoring last session...');
      this.tracks.set(lastSession.tracks);
      this.engine.tempo.set(lastSession.tempo || 120);
      this.engine.loopStart.set(lastSession.loopStart || 0);
      this.engine.loopEnd.set(lastSession.loopEnd || 16);

      // Register tracks with engine
      for (const t of lastSession.tracks) {
          this.engine.ensureTrack({
              id: t.id,
              name: t.name,
              instrumentId: t.instrumentId,
              gain: t.gain,
              pan: t.pan,
              sendA: t.sendA,
              sendB: t.sendB
          });
      }
      if (lastSession.tracks.length > 0) {
          this.selectedTrackId.set(lastSession.tracks[0].id);
      }
    } else {
      this.ensureTrack('Piano');
    }
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
      mute: false,
      solo: false,
      steps: new Array(64).fill(false),
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
          ? { ...t, notes: [...t.notes, { id: Math.random().toString(36).substring(7), midi, step, length, velocity }] }
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


  deleteNoteById(trackId: number, noteId: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id === trackId) {
        const newNotes = t.notes.filter(n => n.id !== noteId);
        const newSteps = new Array(64).fill(false);
        newNotes.forEach(n => { if (n.step >= 0 && n.step < 64) newSteps[n.step] = true; });
        return { ...t, notes: newNotes, steps: newSteps };
      }
      return t;
    }));
  }

  removeNote(trackId: number, midi: number, step: number) {
    this.tracks.update((ts) => ts.map((t) => {
      if (t.id === trackId) {
        const newNotes = t.notes.filter((n) => !(n.midi === midi && n.step === step));
        const newSteps = new Array(64).fill(false);
        newNotes.forEach(n => { if (n.step >= 0 && n.step < 64) newSteps[n.step] = true; });
        return { ...t, notes: newNotes, steps: newSteps };
      }
      return t;
    }));
  }

  clearTrack(trackId: number) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, notes: [] } : t))
    );
  }


  removeTrack(id: number) {
    this.tracks.update(ts => ts.filter(t => t.id !== id));
    if (this.selectedTrackId() === id) {
      this.selectedTrackId.set(this.tracks().length > 0 ? this.tracks()[0].id : null);
    }
  }

  toggleMute(id: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, mute: !t.mute } : t));
  }

  toggleSolo(id: number) {
    const isSolo = this.tracks().find(t => t.id === id)?.solo;
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, solo: !isSolo } : { ...t, solo: false }));
  }

  toggleStep(trackId: number, stepIndex: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id === trackId) {
        const newSteps = [...t.steps];
        newSteps[stepIndex] = !newSteps[stepIndex];
        let newNotes = [...t.notes];
        if (newSteps[stepIndex]) {
          newNotes.push({
            id: Math.random().toString(36).substring(7),
            midi: this.getDefaultPitchForTrack(t),
            step: stepIndex,
            length: 1,
            velocity: 0.8
          });
        } else {
          newNotes = newNotes.filter(n => n.step !== stepIndex);
        }
        return { ...t, steps: newSteps, notes: newNotes };
      }
      return t;
    }));
  }

  private getDefaultPitchForTrack(track: TrackModel): number {
    if (track.instrumentId.includes('kit')) {
      if (track.name.toLowerCase().includes('kick')) return 36;
      if (track.name.toLowerCase().includes('snare')) return 38;
      if (track.name.toLowerCase().includes('hat')) return 42;
    }
    return 60;
  }

  updateNote(trackId: number, noteId: string, patch: Partial<TrackNote>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id === trackId) {
        const newNotes = t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n);
        const newSteps = new Array(64).fill(false);
        newNotes.forEach(n => { if (n.step >= 0 && n.step < 64) newSteps[n.step] = true; });
        return { ...t, notes: newNotes, steps: newSteps };
      }
      return t;
    }));
  }

  addNoteToTrack(trackId: number, note: Omit<TrackNote, 'id'>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id === trackId) {
        const newNotes = [...t.notes, { ...note, id: Math.random().toString(36).substring(7) }];
        const newSteps = new Array(64).fill(false);
        newNotes.forEach(n => { if (n.step >= 0 && n.step < 64) newSteps[n.step] = true; });
        return { ...t, notes: newNotes, steps: newSteps };
      }
      return t;
    }));
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
