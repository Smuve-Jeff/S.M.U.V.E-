import { AudioRecorderService } from '../studio/audio-recorder.service';
import { Injectable, inject, signal, effect } from '@angular/core';
import { LoggingService } from './logging.service';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { FileLoaderService } from './file-loader.service';
import { UserProfileService } from './user-profile.service';
import { AudioSessionService } from '../studio/audio-session.service';

export interface TrackNote {
  id: string;
  midi: number;
  step: number;
  length: number;
  velocity: number;
  probability?: number;
}

export interface PatternVersion {
  id: string;
  name: string;
  createdAt: number;
  notes: TrackNote[];
  steps: boolean[];
  stepVelocities: number[];
}

export interface PatternSlot {
  id: string;
  name: string;
  createdAt: number;
  notes: TrackNote[];
  steps: boolean[];
  stepVelocities: number[];
  versions: PatternVersion[];
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
  audioUrl?: string;
}

export interface TrackModel {
  id: number;
  name: string;
  instrumentId: string;
  type: 'midi' | 'audio';
  qualityMode?: 'ultra' | 'performance';
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
  armed?: boolean;
  mute: boolean;
  solo: boolean;
  sidechainTargetTrackId?: string | null;
  synthParams?: any;
  steps: boolean[];
  stepVelocities?: number[];
  patternSlots?: PatternSlot[];
  activePatternSlotId?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  projectBPM = signal(120);
  activeLoopBars = signal(4);
  private logger = inject(LoggingService);
  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private profileService = inject(UserProfileService);
  private audioSession = inject(AudioSessionService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(-1);
  structure = signal<SongSection[]>([]);
  chords = signal<GlobalChord[]>([]);

  constructor() {
    this.loadLastSession();

    effect(() => {
      const state = {
        tracks: this.tracks(),
        structure: this.structure(),
        chords: this.chords(),
      };
      localStorage.setItem('smuve_last_session', JSON.stringify(state));
    });

    this.engine.onScheduleStep = (
      step: number,
      time: number,
      stepDur: number
    ) => {
      this.currentStep.set(step);
      for (const t of this.tracks()) {
        if (t.mute) continue;
        if (this.tracks().some((s) => s.solo) && !t.solo) continue;

        if (t.type === 'midi') {
          for (const n of t.notes) {
            if (Math.floor(n.step) === step) {
              if (n.probability !== undefined && Math.random() > n.probability)
                continue;
              const velocityScale = t.stepVelocities?.[step] ?? 1;
              const noteDuration = (n.length || 1) * stepDur;
              const preset = this.instruments
                .getPresets()
                .find((p) => p.id === t.instrumentId);

              const synthParams = t.synthParams || preset?.synth || {
                type: "triangle",
                attack: 0.002,
                decay: 0.08,
                sustain: 0.7,
                release: 0.1,
                cutoff: 7000,
                q: 0.8,
              };

              this.engine.triggerAttack(
                t.id,
                this.midiToFreq(n.midi),
                time,
                n.velocity,
                noteDuration,
                t.gain,
                t.pan,
                t.sendA,
                t.sendB,
                synthParams,
                velocityScale
              );

              if (this.audioSession.isRecording()) {
                this.engine.recorder.pendingMidi.push({
                  pitch: n.midi,
                  startTime: time,
                  duration: noteDuration,
                  velocity: n.velocity * velocityScale,
                });
              }
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
    const saved = localStorage.getItem('smuve_last_session');
    if (saved) {
      const lastSession = JSON.parse(saved);
      this.tracks.set(
        lastSession.tracks.map((t: any) => this.normalizeTrack(t))
      );
      this.structure.set(lastSession.structure || []);
      this.chords.set(lastSession.chords || []);
      if (lastSession.tracks.length > 0) {
        this.selectedTrackId.set(lastSession.tracks[0].id);
      }
    } else {
      this.ensureTrack('grand-piano');
    }
  }

  private normalizeTrack(track: any): TrackModel {
    return {
      ...track,
      notes: track.notes || [],
      clips: track.clips || [],
      fxSlots: track.fxSlots || [],
      mute: !!track.mute,
      solo: !!track.solo,
      steps: track.steps || new Array(64).fill(false),
      type: track.type || 'midi',
      color: track.color || '#af25f4',
      patternSlots: track.patternSlots || [],
      stepVelocities: track.stepVelocities || new Array(64).fill(1),
      synthParams: track.synthParams || null,
    };
  }

  midiToFreq(m: number) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  ensureTrack(presetIdOrName: string, customName?: string): number {
    const presets = this.instruments.getPresets();
    const preset =
      presets.find(
        (p) => p.id === presetIdOrName || p.name === presetIdOrName
      ) || presets[0];
    const id = Math.floor(Math.random() * 1e9);
    const track: TrackModel = {
      id,
      name: customName || preset.name,
      instrumentId: preset.id,
      type: 'midi',
      qualityMode: 'ultra',
      color: '#af25f4',
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
      stepVelocities: new Array(64).fill(1),
      patternSlots: [],
      activePatternSlotId: null,
      synthParams: preset.synth || null
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

  addTrack(name: string, instrumentId: string) {
    return this.ensureTrack(instrumentId, name);
  }

  setInstrument(trackId: number, presetId: string) {
    const presets = this.instruments.getPresets();
    const preset = presets.find((item) => item.id === presetId);
    const resolvedPreset = preset ?? presets[0];

    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId
          ? { ...t, instrumentId: resolvedPreset.id, name: resolvedPreset.name, synthParams: resolvedPreset.synth }
          : t
      )
    );
    this.engine.updateTrack(trackId, {
      instrumentId: resolvedPreset.id,
      name: resolvedPreset.name,
    });
  }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
  }

  setSidechain(trackId: number, targetId: string | null) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, sidechainTargetTrackId: targetId } : t));
    if (targetId) {
      this.engine.connectSidechain(`${trackId}`, targetId);
    } else {
      const track = this.tracks().find(t => t.id === trackId);
      if (track?.sidechainTargetTrackId) {
         this.engine.disconnectSidechain(`${trackId}`, track.sidechainTargetTrackId);
      }
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

  removeTrack(id: number) {
    this.tracks.update((ts) => ts.filter((t) => t.id !== id));
    this.engine.removeTrack(id);
    if (this.selectedTrackId() === id) {
      const remaining = this.tracks();
      this.selectedTrackId.set(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  addNoteToTrack(trackId: number, note: Partial<TrackNote>) {
    const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const fullNote: TrackNote = {
      id,
      midi: note.midi || 60,
      step: note.step || 0,
      length: note.length || 1,
      velocity: note.velocity || 0.8,
      probability: note.probability,
    };

    this.tracks.update((ts) =>
      ts.map((t) =>
        t.id === trackId ? { ...t, notes: [...t.notes, fullNote] } : t
      )
    );
  }

  updateNote(trackId: number, noteId: string, patch: Partial<TrackNote>) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          notes: t.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
        };
      })
    );
  }

  removeNotes(trackId: number, noteIds: string[]) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          notes: t.notes.filter((n) => !noteIds.includes(n.id)),
        };
      })
    );
  }

  toggleStep(trackId: number, step: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        const nextSteps = [...t.steps];
        nextSteps[step] = !nextSteps[step];

        let nextNotes = [...t.notes];
        if (nextSteps[step]) {
          nextNotes.push({
            id: `step-${trackId}-${step}`,
            midi: 36, // default C1
            step,
            length: 1,
            velocity: 0.8
          });
        } else {
          nextNotes = nextNotes.filter(n => n.step !== step);
        }

        return { ...t, steps: nextSteps, notes: nextNotes };
      })
    );
  }

  reorderTrack(fromIndex: number, toIndex: number) {
    this.tracks.update((ts) => {
      const next = [...ts];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async importAudioTrack() {
    const files = await this.fileLoader.pickLocalFiles('audio/*');
    if (files.length > 0) {
      const file = files[0];
      const buffer = await this.fileLoader.decodeToAudioBuffer(
        this.engine.getContext(),
        file
      );
      const id = Math.floor(Math.random() * 1e9);
      const track: TrackModel = {
        id,
        name: file.name,
        instrumentId: 'audio-player',
        type: 'audio',
        color: '#38bdf8',
        notes: [],
        clips: [
          {
            id: `clip-${Date.now()}`,
            start: 0,
            length: Math.ceil(buffer.duration / 2), // approx bars
            name: file.name,
            type: 'audio',
          },
        ],
        audioBuffer: buffer,
        gain: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
        fxSlots: [],
        mute: false,
        solo: false,
        steps: new Array(64).fill(false),
      };
      this.tracks.update((v) => [...v, track]);
    }
  }

  quantizeTrack(trackId: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          notes: t.notes.map((n) => ({ ...n, step: Math.round(n.step) })),
        };
      })
    );
  }

  humanizeTrack(trackId: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          notes: t.notes.map((n) => ({
            ...n,
            step: n.step + (Math.random() - 0.5) * 0.1,
            velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() - 0.5) * 0.1)),
          })),
        };
      })
    );
  }

  duplicateNotes(trackId: number, noteIds: string[], stepOffset: number) {
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const notesToDup = t.notes.filter(n => noteIds.includes(n.id));
        const newNotes = notesToDup.map(n => ({
           ...n,
           id: `note-${Date.now()}-${Math.random()}`,
           step: n.step + stepOffset
        }));
        return { ...t, notes: [...t.notes, ...newNotes] };
     }));
  }

  setStepVelocity(trackId: number, step: number, velocity: number) {
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const velocities = t.stepVelocities ? [...t.stepVelocities] : new Array(64).fill(1);
        velocities[step] = velocity;
        return { ...t, stepVelocities: velocities };
     }));
  }

  recordLiveNote(note: string, velocity: number) {
    const selectedId = this.selectedTrackId();
    if (!selectedId || !this.audioSession.isRecording()) return;

    const names = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const octave = parseInt(note.slice(-1));
    const name = note.slice(0, -1);
    const midi = (octave + 1) * 12 + names.indexOf(name);

    const beat = this.engine.currentBeat();
    const stepsPerBeat = this.engine.stepsPerBeat();
    const currentStepValue = Math.floor(beat * stepsPerBeat) % 64;

    this.addNoteToTrack(selectedId, {
      midi,
      step: currentStepValue,
      length: 1,
      velocity: velocity,
    });
  }

  createPatternSlot(trackId: number, name: string) {}
  duplicatePatternSlot(trackId: number, slotId: string) {}
  snapshotPatternVersion(trackId: number, slotId: string, name: string) {}
  recallPatternSlot(trackId: number, slotId: string) {}
  fillPatternLane(trackId: number, density: number) {}
  clearPatternLane(trackId: number) {}
  rotatePatternLane(trackId: number, shift: number) {}
  randomizePatternLane(trackId: number, probability: number) {}
  setTrackQualityMode(trackId: number, mode: 'ultra' | 'performance') {}
}
