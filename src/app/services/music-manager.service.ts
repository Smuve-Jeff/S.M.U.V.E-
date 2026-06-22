import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { ProjectService } from './project.service';
import { HistoryService, Command } from './history.service';
import { Project, StudioTrack, StudioClip, StudioTake, TrackType, StudioCompRegion, Task } from '../types';

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
  params?: any;
  cutoff?: number;
  resonance?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

export interface TrackClip extends StudioClip {}

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

export interface PerformerScene {
  id: string;
  name: string;
  color: string;
  slotId: string;
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

export interface TrackModel extends StudioTrack {
  id: string;
  instrumentId: string;
  notes: TrackNote[];
  steps: boolean[];
  fxSlots: FxSlot[];
  activePatternSlotId?: string | null;
  patternSlots?: PatternSlot[];
  automationLanes?: AutomationLane[];
  synthParams?: any;
  gain: number;
  sendA: number;
  sendB: number;
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  public static readonly DRUM_TRACK_ID = 'DRUM_TRACK';

  public engine = inject(AudioEngineService);
  public instruments = inject(InstrumentsService);
  public projectService = inject(ProjectService);
  public history = inject(HistoryService);
  public logger = inject(LoggingService);

  public tracks = signal<TrackModel[]>([]);
  public currentStep = signal(0);
  public tempo = computed(() => this.engine.tempo());

  addTrack(name: string, instrumentId: string, type: TrackType = 'midi') {
    const id = (type === 'drum' || instrumentId.includes('808')) ? MusicManagerService.DRUM_TRACK_ID : 'track_' + Date.now() + Math.random().toString(36).substring(7);
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);

    const newTrack: TrackModel = {
      id,
      name,
      type,
      instrumentId,
      muted: false,
      soloed: false,
      volume: 0.8,
      gain: 0.8,
      pan: 0,
      clips: [],
      notes: [],
      steps: new Array(64).fill(false),
      fxSlots: [],
      sendA: 0,
      sendB: 0,
      color: '#4444ff'
    };
    this.tracks.update(ts => [...ts, newTrack]);
    return id;
  }

  updateTrackNotes(trackId: string, notes: TrackNote[]) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes } : t));
  }

  playStep(step: number, time: number, duration: number) {
    this.currentStep.set(step);
    const hasSolo = this.tracks().some(t => t.soloed);
    this.tracks().forEach(t => {
      if (t.muted || (hasSolo && !t.soloed)) return;
      t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
        const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
        const params = { ...t.synthParams, ...(n.params || {}) };
        this.engine.triggerAttack(t.id, freq, time, n.velocity, n.length * duration, t.gain, t.pan, t.sendA, t.sendB, params);
      });
    });
  }

  newProject(skipDefaults = false) {
    this.tracks.set([]);
    if (skipDefaults) return;
    this.addTrack('Elite Piano', 'grand-piano', 'midi');
    this.addTrack('Studio Drums', 'trap-808-elite', 'drum');
  }
}
