import { Injectable, inject, signal, effect, computed } from '@angular/core';
import { LoggingService } from './logging.service';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { FileLoaderService } from './file-loader.service';
import { UserProfileService } from './user-profile.service';

export interface TrackNote {
  id: string;
  midi: number;
  step: number;
  length: number;
  velocity: number;
}

export interface FxSlot {
  id: string;
  type: string;
  params: any;
  enabled: boolean;
  bypass?: boolean;
  mix?: number;
}

export interface GlobalChord {
  id: string;
  name: string;
  midi?: number[];
  step?: number;
  duration?: number;
  startStep?: number;
  length?: number;
}

export interface SongSection {
  id: string;
  name?: string;
  start?: number;
  length: number;
  color: string;
  label?: string;
  startBar?: number;
}

export interface ArrangementClip {
  id: string;
  trackId?: number;
  start: number;
  length: number;
  name?: string;
  color?: string;
  type?: string;
}

export interface TrackModel {
  id: number;
  name: string;
  instrumentId: string;
  type: "midi" | "audio";
  color: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  notes: TrackNote[];
  clips: ArrangementClip[];
  gain: number;
  pan: number;
  sendA: number;
  sendB: number;
  fxSlots: FxSlot[];
  mute: boolean;
  solo: boolean;
  steps: boolean[];
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  private logger = inject(LoggingService);
  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private profileService = inject(UserProfileService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal<number>(-1);

  structure = signal<SongSection[]>([]);
  chords = signal<GlobalChord[]>([]);

  constructor() {
    this.loadLastSession();

    (this.engine as any).onStep = (step: number, time: number) => {
      this.currentStep.set(step);
      for (const t of this.tracks()) {
        if (t.mute) continue;
        if (this.tracks().some((s) => s.solo) && !t.solo) continue;

        if (t.type === 'midi') {
          for (const n of t.notes) {
            if (n.step === step) {
               (this.engine as any).triggerAttack?.(t.id, this.midiToFreq(n.midi), time, n.velocity, n.length, t.gain, t.pan, t.sendA, t.sendB, {
                  type: "triangle", attack: 0.002, decay: 0.08, sustain: 0.7, release: 0.1, cutoff: 7000, q: 0.8
               });
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
    const lastSession = (profile?.knowledgeBase as any)?.lastDawSession;

    if (lastSession && lastSession.tracks && lastSession.tracks.length > 0) {
      this.logger.info('MusicManager: Restoring last session...');
      this.tracks.set(lastSession.tracks);
      this.engine.tempo.set(lastSession.tempo || 120);
      this.engine.loopStart.set(lastSession.loopStart || 0);
      this.engine.loopEnd.set(lastSession.loopEnd || 16);

      for (const t of lastSession.tracks) {
        this.engine.ensureTrack({
          id: t.id,
          name: t.name,
          instrumentId: t.instrumentId,
          gain: t.gain,
          pan: t.pan,
          sendA: t.sendA,
          sendB: t.sendB,
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
      type: "midi",
      color: "#EC5B13",
      notes: [],
      clips: [],
      gain: 0.9,
      pan: 0,
      sendA: 0.1,
      sendB: 0.05,
      fxSlots: [],
      mute: false,
      solo: false,
      steps: new Array(64).fill(false),
    };
    this.tracks.update((v) => [...v, track]);
    this.engine.ensureTrack({
      id: track.id,
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
    const presets = this.instruments.getPresets();
    const preset = presets.find((item) => item.id === presetId);
    const resolvedPreset = preset ?? presets[0];
    if (!resolvedPreset) {
      this.logger.warn('MusicManager: No instrument presets available.');
      return;
    }
    const currentTrack = this.tracks().find((t) => t.id === trackId);
    const currentPresetName = presets.find(
      (item) => item.id === currentTrack?.instrumentId
    )?.name;
    const shouldRename =
      !currentTrack?.name || currentTrack.name === currentPresetName;
    const resolvedName = shouldRename
      ? resolvedPreset.name
      : currentTrack?.name ?? resolvedPreset.name;
    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? {
              ...t,
              instrumentId: resolvedPreset.id,
              name: resolvedName,
            }
          : t
      )
    );
    this.engine.updateTrack(trackId, {
      instrumentId: resolvedPreset.id,
      name: resolvedName,
    });
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
          ? {
              ...t,
              notes: [
                ...t.notes,
                {
                  id: Math.random().toString(36).substring(7),
                  midi,
                  step,
                  length,
                  velocity,
                },
              ],
            }
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
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId) {
          const newNotes = t.notes.filter((n) => n.id !== noteId);
          const newSteps = new Array(64).fill(false);
          newNotes.forEach((n) => {
            if (n.step >= 0 && n.step < 64) newSteps[n.step] = true;
          });
          return { ...t, notes: newNotes, steps: newSteps };
        }
        return t;
      })
    );
  }

  removeNote(trackId: number, midi: number, step: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId) {
          const newNotes = t.notes.filter(
            (n) => !(n.midi === midi && n.step === step)
          );
          const newSteps = new Array(64).fill(false);
          newNotes.forEach((n) => {
            if (n.step >= 0 && n.step < 64) newSteps[n.step] = true;
          });
          return { ...t, notes: newNotes, steps: newSteps };
        }
        return t;
      })
    );
  }

  clearTrack(trackId: number) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, notes: [] } : t))
    );
  }

  removeTrack(id: number) {
    this.tracks.update((ts) => ts.filter((t) => t.id !== id));
    if (this.selectedTrackId() === id) {
      this.selectedTrackId.set(
        this.tracks().length > 0 ? this.tracks()[0].id : null
      );
    }
  }

  reorderTrack(fromIndex: number, toIndex: number) {
    this.tracks.update(ts => {
      const result = [...ts];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }

  setTrackColor(id: number, color: string) {
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, color } : t));
  }

  batchMute(ids: number[], mute: boolean) {
    this.tracks.update(ts => ts.map(t => ids.includes(t.id) ? { ...t, mute } : t));
  }

  async importAudioTrack() {
    const files = await this.fileLoader.pickLocalFiles("audio/*");
    if (files && files.length > 0) {
      const file = files[0];
      const buffer = await this.fileLoader.decodeToAudioBuffer(this.engine.ctx, file);
      const id = Math.floor(Math.random() * 1e9);
      const track: TrackModel = {
        id,
        name: file.name,
        instrumentId: "audio-clip",
        type: "audio",
        color: "#10B981",
        audioUrl: URL.createObjectURL(file),
        audioBuffer: buffer,
        notes: [],
        clips: [],
        gain: 0.8,
        pan: 0,
        sendA: 0.1,
        sendB: 0.05,
        fxSlots: [],
        mute: false,
        solo: false,
        steps: new Array(64).fill(false),
      };
      this.tracks.update(ts => [...ts, track]);
      this.selectedTrackId.set(id);
    }
  }

  toggleMute(id: number) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, mute: !t.mute } : t))
    );
  }

  toggleSolo(id: number) {
    const isSolo = this.tracks().find((t) => t.id === id)?.solo;
    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, solo: !isSolo } : { ...t, solo: false }
      )
    );
  }

  toggleStep(trackId: number, stepIndex: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
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
              velocity: 0.8,
            });
          } else {
            newNotes = newNotes.filter((n) => n.step !== stepIndex);
          }
          return { ...t, steps: newSteps, notes: newNotes };
        }
        return t;
      })
    );
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
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId) {
          const newNotes = t.notes.map((n) =>
            n.id === noteId ? { ...n, ...patch } : n
          );
          const newSteps = new Array(64).fill(false);
          newNotes.forEach((n) => {
            if (n.step >= 0 && n.step < 64) newSteps[n.step] = true;
          });
          return { ...t, notes: newNotes, steps: newSteps };
        }
        return t;
      })
    );
  }

  addNoteToTrack(trackId: number, note: Omit<TrackNote, 'id'>) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId) {
          const newNotes = [
            ...t.notes,
            { ...note, id: Math.random().toString(36).substring(7) },
          ];
          const newSteps = new Array(64).fill(false);
          newNotes.forEach((n) => {
            if (n.step >= 0 && n.step < 64) newSteps[n.step] = true;
          });
          return { ...t, notes: newNotes, steps: newSteps };
        }
        return t;
      })
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
