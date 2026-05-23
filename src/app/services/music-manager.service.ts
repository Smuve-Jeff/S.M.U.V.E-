import { Injectable, inject, signal, computed } from '@angular/core';
import { InstrumentsService, InstrumentPreset } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { FileLoaderService } from './file-loader.service';
import { AudioSessionService } from '../studio/audio-session.service';

export interface TrackNote {
  id: string;
  midi: number;
  step: number;
  length: number;
  velocity: number;
  probability?: number;
}

export interface TrackClip {
  id: string;
  start: number;
  length: number;
  name: string;
  type: 'midi' | 'audio';
}

export interface PatternVersion {
  id: string;
  name: string;
  steps: boolean[];
  notes: TrackNote[];
}

export interface PatternSlot {
  id: string;
  name: string;
  versions: PatternVersion[];
  activeVersionId: string;
}

export interface TrackModel {
  id: number;
  name: string;
  instrumentId: string;
  type: 'midi' | 'audio';
  color: string;
  notes: TrackNote[];
  clips: TrackClip[];
  gain: number;
  pan: number;
  sendA: number;
  sendB: number;
  fxSlots: any[];
  mute: boolean;
  solo: boolean;
  steps: boolean[];
  stepVelocities?: number[];
  qualityMode?: 'ultra' | 'performance';
  audioBuffer?: AudioBuffer;
  synthParams?: any;
  sidechainTargetTrackId?: string | null;
  patternSlots?: PatternSlot[];
  activePatternSlotId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class MusicManagerService {
  private logger = inject(LoggingService);
  private engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);
  private fileLoader = inject(FileLoaderService);
  private audioSession = inject(AudioSessionService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(0);

  structure = signal<any[]>([]);
  chords = signal<any[]>([]);

  constructor() {
    this.init();
  }

  private init() {
    const saved = localStorage.getItem('smuve_studio_session');
    if (saved) {
      try {
        const lastSession = JSON.parse(saved);
        this.tracks.set(
          lastSession.tracks.map((t: any) => this.normalizeTrack(t))
        );
        this.structure.set(lastSession.structure || []);
        this.chords.set(lastSession.chords || []);
        if (lastSession.tracks.length > 0) {
          this.selectedTrackId.set(lastSession.tracks[0].id);
        }
      } catch (e) {
        this.ensureTrack('grand-piano');
      }
    } else {
      this.ensureTrack('grand-piano');
      this.ensureTrack('kit-808-pro');
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
      qualityMode: track.qualityMode || 'ultra',
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
      synthParams: preset.synth || null,
      qualityMode: 'ultra'
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

  setTrackColor(trackId: number, color: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, color } : t));
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

  createPatternSlot(trackId: number, name: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const slot: PatternSlot = {
        id: `slot-${Date.now()}`,
        name,
        versions: [{
          id: 'v-init',
          name: 'Initial',
          steps: [...t.steps],
          notes: [...t.notes]
        }],
        activeVersionId: 'v-init'
      };
      return { ...t, patternSlots: [...(t.patternSlots || []), slot], activePatternSlotId: slot.id };
    }));
  }

  duplicatePatternSlot(trackId: number, slotId: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const slot = t.patternSlots?.find(s => s.id === slotId);
      if (!slot) return t;
      const newSlot: PatternSlot = {
        ...slot,
        id: `slot-${Date.now()}-${Math.random()}`,
        name: `${slot.name} Copy`
      };
      return { ...t, patternSlots: [...(t.patternSlots || []), newSlot] };
    }));
  }

  snapshotPatternVersion(trackId: number, slotId: string, name: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        patternSlots: t.patternSlots?.map(s => {
          if (s.id !== slotId) return s;
          const version: PatternVersion = {
            id: `v-${Date.now()}`,
            name,
            steps: [...t.steps],
            notes: [...t.notes]
          };
          return { ...s, versions: [...s.versions, version], activeVersionId: version.id };
        })
      };
    }));
  }

  recallPatternSlot(trackId: number, slotId: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const slot = t.patternSlots?.find(s => s.id === slotId);
      if (!slot) return t;
      const version = slot.versions.find(v => v.id === slot.activeVersionId);
      if (!version) return t;
      return { ...t, steps: [...version.steps], notes: [...version.notes], activePatternSlotId: slotId };
    }));
  }

  fillPatternLane(trackId: number, density: number) {}
  clearPatternLane(trackId: number) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, steps: new Array(64).fill(false), notes: [] } : t));
  }
  rotatePatternLane(trackId: number, shift: number) {}
  randomizePatternLane(trackId: number, probability: number) {}

  setTrackQualityMode(trackId: number, mode: 'ultra' | 'performance') {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, qualityMode: mode } : t));
  }
}
