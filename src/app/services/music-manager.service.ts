import { Injectable, inject, signal, computed , Injector } from '@angular/core';
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
  offset?: number;
  isSlide?: boolean;
  pan?: number;
  cutoff?: number;
}

export interface TrackClip {
  id: string;
  start: number;
  length: number;
  name: string;
  type: 'midi' | 'audio';
}

export interface ArrangementClip extends TrackClip {}

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

export interface FxSlot {
  id: string;
  type: string;
  params: any;
  enabled: boolean;
  mix?: number;
}

export interface SongSection {
  id: string;
  name: string;
  start: number;
  length: number;
  color?: string;
}

export interface AutomationPoint {
  id: string;
  step: number;
  value: number;
  curve?: 'linear' | 'exp' | 'step';
}

export interface AutomationLane {
  id: string;
  parameter: string;
  points: AutomationPoint[];
  enabled: boolean;
}

export interface TrackModel {
  id: number;
  name: string;
  instrumentId: string;
  type: 'midi' | 'audio';
  color: string;
  notes: TrackNote[];
  clips: TrackClip[];
  fxSlots: FxSlot[];
  gain: number;
  pan: number;
  sendA: number;
  sendB: number;
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
  automationLanes?: AutomationLane[];
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService  {
  private injector = inject(Injector);
  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private fileLoader = inject(FileLoaderService);
  private get audioSession(): AudioSessionService { return this.injector.get(AudioSessionService); }

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(0);
  tempo = computed(() => this.engine.tempo());
  activeLoopBars = signal(4);
  structure = signal<SongSection[]>([]);

  constructor() {
    this.initializeDefaultProject();
  }

  private initializeDefaultProject() {
    this.ensureTrack('grand-piano-v2');
    this.ensureTrack('trap-808-elite');
    this.selectedTrackId.set(this.tracks()[0]?.id || null);
  }

  ensureTrack(instrumentId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);
    const id = Date.now();
    const newTrack: TrackModel = {
      id,
      name: preset?.name || 'New Track',
      instrumentId,
      type: 'midi',
      color: this.getNextColor(),
      notes: [],
      clips: [],
      fxSlots: [],
      gain: 0.8,
      pan: 0,
      sendA: 0,
      sendB: 0,
      mute: false,
      solo: false,
      steps: new Array(64).fill(false),
      synthParams: preset?.synth || { type: 'sine', attack: 0.1, decay: 0.2, sustain: 0.5, release: 1.0, cutoff: 2000, q: 1.0 }
    };
    this.tracks.update(ts => [...ts, newTrack]);
    return id;
  }

  private getNextColor(): string {
    const colors = ['#af25f4', '#ec5b13', '#00e5ff', '#10b981', '#f59e0b', '#f43f5e'];
    return colors[this.tracks().length % colors.length];
  }

  removeTrack(id: number) {
    this.tracks.update(ts => ts.filter(t => t.id !== id));
    if (this.selectedTrackId() === id) this.selectedTrackId.set(null);
  }

  toggleStep(trackId: number, step: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const steps = [...t.steps];
      steps[step] = !steps[step];
      return { ...t, steps };
    }));
  }

  addNoteToTrack(trackId: number, note: Partial<TrackNote>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const newNote: TrackNote = {
        id: `note-${Date.now()}-${Math.random()}`,
        midi: note.midi || 60,
        step: note.step || 0,
        length: note.length || 1,
        velocity: note.velocity || 0.8,
        ...note
      };
      return { ...t, notes: [...t.notes, newNote] };
    }));
  }

  removeNotes(trackId: number, noteIds: string[]) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, notes: t.notes.filter(n => !noteIds.includes(n.id)) };
    }));
  }

  toggleMute(trackId: number) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, mute: !t.mute } : t));
  }

  toggleSolo(trackId: number) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t));
  }

  setInstrument(trackId: number, instrumentId: string) {
     const preset = this.instruments.getPresets().find(p => p.id === instrumentId);
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        return {
           ...t,
           instrumentId,
           name: preset?.name || t.name,
           synthParams: preset?.synth || t.synthParams
        };
     }));
  }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, synthParams: { ...t.synthParams, ...params } };
    }));
  }

  setSidechain(trackId: number, targetId: string | null) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, sidechainTargetTrackId: targetId } : t));
    if (targetId) {
      this.engine.connectSidechain(`${trackId}`, targetId);
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

  arpeggiateTrack(trackId: number) {
     this.logger.info(`Arpeggiating track ${trackId}`);
  }

  strumTrack(trackId: number, strength: number = 0.05) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        const grouped = new Map<number, TrackNote[]>();
        t.notes.forEach(n => {
          if (!grouped.has(n.step)) grouped.set(n.step, []);
          grouped.get(n.step)!.push(n);
        });

        const newNotes = t.notes.map(n => {
          const chord = grouped.get(n.step) || [];
          if (chord.length <= 1) return n;
          const chordSorted = [...chord].sort((a, b) => a.midi - b.midi);
          const index = chordSorted.findIndex(cn => cn.id === n.id);
          return { ...n, step: n.step + index * strength };
        });

        return { ...t, notes: newNotes };
      })
    );
  }

  setNoteParam(trackId: number, noteId: string, param: string, value: any) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        notes: t.notes.map(n => n.id === noteId ? { ...n, [param]: value } : n)
      };
    }));
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

  recordLiveNote(midi: number, velocity: number) {
    const selectedId = this.selectedTrackId();
    if (!selectedId || !this.audioSession.isRecording()) return;

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

  midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setActivePatternSlot(trackId: number, slotId: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, activePatternSlotId: slotId } : t));
  }

  playStep(step: number, time: number, duration: number, customCtx?: BaseAudioContext) {
    this.currentStep.set(step);
    this.tracks().forEach(track => {
      if (track.mute) return;
      track.notes.filter(n => Math.floor(n.step) === step).forEach(note => {
         const freq = this.midiToFreq(note.midi);
         this.engine.triggerAttack(
           track.id,
           freq,
           time,
           note.velocity,
           note.length * duration,
           track.gain,
           track.pan,
           track.sendA,
           track.sendB,
           track.synthParams || { type: 'sine' },
           1,
           customCtx
         );
      });
    });
  }

  importAudioTrack() {
     this.logger.info('Importing audio track...');
  }

  addAutomationLane(trackId: number, parameter: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const lanes = t.automationLanes || [];
      return { ...t, automationLanes: [...lanes, { id: `lane-${Date.now()}`, parameter, points: [], enabled: true }] };
    }));
  }
}
