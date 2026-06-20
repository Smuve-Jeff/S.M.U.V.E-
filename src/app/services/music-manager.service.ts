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
  public static readonly DRUM_TRACK_ID = 'track_drums_100';
  private static readonly PATTERN_STEPS = 64;

  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private recordingEngine = inject(StudioRecordingEngineService);
  private projectService = inject(ProjectService);
  private history = inject(HistoryService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<string | null>(null);
  currentStep = signal(0);
  activeLoopBars = signal(64);
  structure = signal<SongSection[]>([]);
  performerScenes = signal<PerformerScene[]>([]);
  projectLoaded = signal(true);
  activeSceneId = signal<string | null>(null);
  takesExpanded = signal<Record<string, boolean>>({});

  constructor() {
    this.setupProjectSync();
  }

  private setupProjectSync() {
    effect(() => {
      const project = this.projectService.currentProject();
      if (project && !this.selectedTrackId()) {
         this.syncFromProject(project);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      const current = this.projectService.currentProject();
      if (current) {
        const updated: Project = {
          ...current,
          tracks: this.tracks() as any,
          bpm: this.engine.tempo(),
          updatedAt: Date.now()
        };
        this.projectService.update(updated);
      }
    });
  }

  private syncFromProject(project: Project) {
    this.tracks.set(project.tracks as any);
    this.engine.tempo.set(project.bpm);
    if (project.tracks.length > 0) {
      this.selectedTrackId.set(project.tracks[0].id);
    }
  }

  }

  private setupProjectSync() {
    effect(() => {
      const project = this.projectService.currentProject();
      if (project && !this.selectedTrackId()) {
         this.syncFromProject(project);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      const current = this.projectService.currentProject();
      if (current) {
        const updated: Project = {
          ...current,
          tracks: this.tracks() as any,
          bpm: this.engine.tempo(),
          updatedAt: Date.now()
        };
        this.projectService.update(updated);
      }
    });
  }

  private syncFromProject(project: Project) {
    this.tracks.set(project.tracks as any);
    this.engine.tempo.set(project.bpm);
    if (project.tracks.length > 0) {
      this.selectedTrackId.set(project.tracks[0].id);
    }
  }

  private runCommand(name: string, execute: () => void, undo: () => void) {
    this.history.execute({ name, execute, undo });
  }

  ensureTrack(instrumentId: string) {
    const existing = this.tracks().find(t => t.instrumentId === instrumentId);
    if (!existing) {
      return this.addTrack('New ' + instrumentId, instrumentId);
    }
    return existing.id;
  }

  addTrack(name: string, instrumentId: string, type: TrackType = 'midi') {
    const id = type === 'drum' && instrumentId.includes('808') ? MusicManagerService.DRUM_TRACK_ID : 'track_' + Date.now() + Math.random().toString(36).substring(7);
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
      color: this.getTrackColor(this.tracks().length),
      synthParams: preset?.synth || { type: 'sine' },
      patternSlots: this.createDefaultSlots(),
      effects: []
    };

    const oldTracks = this.tracks();
    this.runCommand('Add Track',
      () => {
        this.tracks.update(ts => [...ts, newTrack]);
        this.selectedTrackId.set(id);
      },
      () => {
        this.tracks.set(oldTracks);
        this.selectedTrackId.set(oldTracks[oldTracks.length-1]?.id || null);
      }
    );
    return id;
  }

  removeTrack(id: string) {
    const oldTracks = this.tracks();
    const oldSelected = this.selectedTrackId();
    this.runCommand('Remove Track',
      () => {
        this.tracks.update(ts => ts.filter(t => t.id !== id));
        if (this.selectedTrackId() === id) {
          this.selectedTrackId.set(this.tracks()[0]?.id || null);
        }
      },
      () => {
        this.tracks.set(oldTracks);
        this.selectedTrackId.set(oldSelected);
      }
    );
  }

  addNoteToTrack(trackId: string, note: Partial<TrackNote>) {
    const id = note.id || `note-${Date.now()}-${Math.random()}`;
    const oldTracks = this.tracks();
    this.runCommand('Add Note',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const newNote: TrackNote = {
          id,
          midi: note.midi || 60,
          step: note.step || 0,
          length: note.length || 1,
          velocity: note.velocity || 0.8,
          ...note
        };
        return this.persistActivePattern({ ...t, notes: [...t.notes, newNote] });
      })),
      () => this.tracks.set(oldTracks)
    );
    return id;
  }

  updateNote(trackId: string, noteId: string, patch: Partial<TrackNote>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n)
      });
    }));
  }

  removeNotes(trackId: string, noteIds: string[]) {
    const oldTracks = this.tracks();
    this.runCommand('Delete Notes',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        return this.persistActivePattern({
          ...t,
          notes: t.notes.filter(n => !noteIds.includes(n.id))
        });
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  toggleStep(trackId: string, step: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const steps = [...t.steps];
      steps[step] = !steps[step];
      return { ...t, steps };
    }));
  }

  addClipToTrack(trackId: string, clip: Partial<TrackClip>) {
    const oldTracks = this.tracks();
    const newClip: TrackClip = {
      id: clip.id || `clip-${Date.now()}`,
      start: clip.start || 0,
      length: clip.length || 4,
      name: clip.name || 'New Clip',
      type: clip.type || 'midi',
      ...clip
    };
    this.runCommand('Add Clip',
      () => this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t)),
      () => this.tracks.set(oldTracks)
    );
  }

  updateClip(trackId: string, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) };
    }));
  }

  removeClip(trackId: string, clipId: string) {
    const oldTracks = this.tracks();
    this.runCommand('Remove Clip',
      () => this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t)),
      () => this.tracks.set(oldTracks)
    );
  }

  splitClip(trackId: string, clipId: string, bar: number) {
    const oldTracks = this.tracks();
    this.runCommand('Split Clip',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const clip = t.clips.find(c => c.id === clipId);
        if (!clip) return t;
        const first = { ...clip, length: bar - clip.start };
        const second = { ...clip, id: 'clip_' + Date.now(), start: bar, length: clip.length - (bar - clip.start) };
        return { ...t, clips: [...t.clips.filter(c => c.id !== clipId), first, second] };
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  async startRecording() {
    this.recordingEngine.startRecording();
  }

  async stopRecording(trackId: string, clipId?: string) {
    await this.recordingEngine.stopRecording();
    const result = await new Promise<any>(resolve => {
      const sub = this.recordingEngine.recordingFinished$.subscribe(data => {
        sub.unsubscribe();
        resolve(data);
      });
    });

    if (result) {
      this.addTakeToTrack(trackId, {
        id: result.id,
        name: result.metadata.name,
        blobUrl: result.url,
        recordedAt: result.metadata.timestamp,
        duration: result.metadata.duration
      }, clipId);
    }
  }

  addTakeToTrack(trackId: string, take: StudioTake, clipId?: string) {
    const oldTracks = this.tracks();
    this.runCommand('New Take',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        if (clipId) {
          return {
            ...t,
            clips: t.clips.map(c => c.id === clipId ? {
              ...c,
              takes: [...(c.takes || []), take],
              activeTakeId: take.id
            } : c)
          };
        }
        const newClip: TrackClip = {
          id: 'clip_' + Date.now(),
          name: take.name,
          start: this.engine.currentBeat() / 4,
          length: Math.max(1, take.duration / (60 / this.engine.tempo()) / 4),
          type: 'audio',
          takes: [take],
          activeTakeId: take.id
        };
        return { ...t, clips: [...t.clips, newClip] };
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  promoteTakeRegion(trackId: string, clipId: string, region: StudioCompRegion) {
    const oldTracks = this.tracks();
    this.runCommand('Comp Region',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
              ...c,
              isComp: true,
              compRegions: [...(c.compRegions || []), region].sort((a, b) => a.start - b.start)
            };
          })
        };
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  async bounceTrack(trackId: string) {
    const track = this.tracks().find(t => t.id === trackId);
    if (!track) return;
    this.logger.info(`Bouncing track ${track.name}...`);
    const bounceTrackId = this.addTrack(`Bounce: ${track.name}`, 'audio-renderer', 'audio');
    this.toggleMute(trackId);
    this.logger.info(`Track ${track.name} bounced successfully.`);
  }

  playStep(step: number, time: number, duration: number) {
    this.currentStep.set(step);
    const hasSolo = this.tracks().some(t => t.soloed);
    this.tracks().forEach(t => {
      if (t.muted || (hasSolo && !t.soloed)) return;
      t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
        const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
        const params = t.id === MusicManagerService.DRUM_TRACK_ID ? { ...t.synthParams, ...(n.params || {}) } : t.synthParams;
        this.engine.triggerAttack(t.id as any, freq, time, n.velocity, n.length * duration, t.gain, t.pan, t.sendA, t.sendB, params);
      });
    });
  }

  newProject(skipDefaults = false) {
    const proj = this.projectService.createEmpty('New Professional Session');
    this.projectService.currentProject.set(proj);
    this.tracks.set([]);
    if (skipDefaults) return;
    this.addTrack('Lead Synth', 'grand-piano-v2', 'midi');
    this.addTrack('Rhythm Guitars', 'strat-elite-clean', 'audio');
    this.addTrack('S.M.U.V.E. Drums', 'trap-808-elite', 'drum');
    this.addTrack('Main Vocal', 'vocal-strip', 'vocal');
    this.history.clear();
  }

  updateSynthParams(trackId: string, params: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
  }

  setInstrument(trackId: string, instId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instId);
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, instrumentId: instId, synthParams: preset?.synth || t.synthParams } : t));
  }

  quantizeTrack(id: string) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({ ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) }) : t));
  }

  duplicateNotes(trackId: string, ids: string[], offset: number) {
    const oldTracks = this.tracks();
    this.runCommand('Duplicate Notes',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const dupes = t.notes.filter(n => ids.includes(n.id)).map(n => ({
          ...n, id: `note-${Date.now()}-${Math.random()}`, step: n.step + offset
        }));
        return this.persistActivePattern({ ...t, notes: [...t.notes, ...dupes] });
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  strumTrack(id: string) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({
      ...t, notes: [...t.notes].sort((a,b) => a.midi - b.midi).map((n, i) => ({ ...n, step: n.step + i * 0.02 }))
    }) : t));
  }

  humanizeTrack(id: string) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({
      ...t, notes: t.notes.map(n => ({ ...n, step: n.step + (Math.random() - 0.5) * 0.1, velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() - 0.5) * 0.2)) }))
    }) : t));
  }

  arpeggiateTrack(id: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== id || t.notes.length === 0) return t;
      const base = t.notes[0];
      const arp = [0, 4, 7, 12].map((v, i) => ({ ...base, id: `arp-${i}-${Date.now()}`, midi: base.midi + v, step: base.step + i * 0.25, length: 0.2 }));
      return this.persistActivePattern({ ...t, notes: arp });
    }));
  }

  private getTrackColor(index: number): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  private createDefaultSlots(): PatternSlot[] {
    return [{
      id: 'slot-0', name: 'Pattern 1', activeVersionId: 'v1',
      versions: [{ id: 'v1', name: 'v1', steps: new Array(64).fill(false), notes: [] }]
    }];
  }

  private persistActivePattern(track: TrackModel): TrackModel {
    if (!track.patternSlots) return track;
    const patternSlots = track.patternSlots.map(slot => {
      if (slot.id !== track.activePatternSlotId && track.activePatternSlotId !== null) return slot;
      return {
        ...slot,
        versions: slot.versions.map(v => v.id === slot.activeVersionId ? {
          ...v, steps: [...track.steps], notes: track.notes.map(n => ({...n}))
        } : v)
      };
    });
    return { ...track, patternSlots };
  }

  }

  async stopRecording(trackId: string, clipId?: string) {
    await this.recordingEngine.stopRecording();
    const result = await new Promise<any>(resolve => {
      const sub = this.recordingEngine.recordingFinished$.subscribe(data => {
        sub.unsubscribe();
        resolve(data);
      });
    });

    if (result) {
      this.addTakeToTrack(trackId, {
        id: result.id,
        name: result.metadata.name,
        blobUrl: result.url,
        recordedAt: result.metadata.timestamp,
        duration: result.metadata.duration
      }, clipId);
    }
  }

  addTakeToTrack(trackId: string, take: StudioTake, clipId?: string) {
    const oldTracks = this.tracks();
    this.runCommand('New Take',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        if (clipId) {
          return {
            ...t,
            clips: t.clips.map(c => c.id === clipId ? {
              ...c,
              takes: [...(c.takes || []), take],
              activeTakeId: take.id
            } : c)
          };
        }
        const newClip: TrackClip = {
          id: 'clip_' + Date.now(),
          name: take.name,
          start: this.engine.currentBeat() / 4,
          length: Math.max(1, take.duration / (60 / this.engine.tempo()) / 4),
          type: 'audio',
          takes: [take],
          activeTakeId: take.id
        };
        return { ...t, clips: [...t.clips, newClip] };
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  promoteTakeRegion(trackId: string, clipId: string, region: StudioCompRegion) {
    const oldTracks = this.tracks();
    this.runCommand('Comp Region',
      () => this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
              ...c,
              isComp: true,
              compRegions: [...(c.compRegions || []), region].sort((a, b) => a.start - b.start)
            };
          })
        };
      })),
      () => this.tracks.set(oldTracks)
    );
  }

  async bounceTrack(trackId: string) {
    const track = this.tracks().find(t => t.id === trackId);
    if (!track) return;
    this.logger.info(`Bouncing track ${track.name}...`);
    const bounceTrackId = this.addTrack(`Bounce: ${track.name}`, 'audio-renderer', 'audio');
    this.toggleMute(trackId);
    this.logger.info(`Track ${track.name} bounced successfully.`);
  }

  playStep(step: number, time: number, duration: number) {
    this.currentStep.set(step);
    const hasSolo = this.tracks().some(t => t.soloed);
    this.tracks().forEach(t => {
      if (t.muted || (hasSolo && !t.soloed)) return;
      t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
        const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
        const params = t.id === MusicManagerService.DRUM_TRACK_ID ? { ...t.synthParams, ...(n.params || {}) } : t.synthParams;
        this.engine.triggerAttack(t.id as any, freq, time, n.velocity, n.length * duration, t.gain, t.pan, t.sendA, t.sendB, params);
      });
    });
  }

  newProject(skipDefaults = false) {
    const proj = this.projectService.createEmpty('New Professional Session');
    this.projectService.currentProject.set(proj);
    this.tracks.set([]);
    if (skipDefaults) return;
    this.addTrack('Lead Synth', 'grand-piano-v2', 'midi');
    this.addTrack('Rhythm Guitars', 'strat-elite-clean', 'audio');
    this.addTrack('S.M.U.V.E. Drums', 'trap-808-elite', 'drum');
    this.addTrack('Main Vocal', 'vocal-strip', 'vocal');
    this.history.clear();
  }

  updateSynthParams(trackId: string, params: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
  }

  setInstrument(trackId: string, instId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instId);
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, instrumentId: instId, synthParams: preset?.synth || t.synthParams } : t));
  }

  quantizeTrack(id: string) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({ ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) }) : t));
  }

  private getTrackColor(index: number): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  private createDefaultSlots(): PatternSlot[] {
    return [{
      id: 'slot-0', name: 'Pattern 1', activeVersionId: 'v1',
      versions: [{ id: 'v1', name: 'v1', steps: new Array(64).fill(false), notes: [] }]
    }];
  }

  private persistActivePattern(track: TrackModel): TrackModel {
    if (!track.patternSlots) return track;
    const patternSlots = track.patternSlots.map(slot => {
      if (slot.id !== track.activePatternSlotId && track.activePatternSlotId !== null) return slot;
      return {
        ...slot,
        versions: slot.versions.map(v => v.id === slot.activeVersionId ? {
          ...v, steps: [...track.steps], notes: track.notes.map(n => ({...n}))
        } : v)
      };
    });
    return { ...track, patternSlots };
  }

  toggleMute(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, muted: !t.muted } : t)); }
  toggleSolo(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, soloed: !t.soloed } : t)); }
  updateVolume(id: string, vol: number) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, volume: vol, gain: vol } : t)); }

  exportProject() {
     const data = { tracks: this.tracks(), bpm: this.engine.tempo() };
     const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `Elite_Studio_Project_${Date.now()}.json`;
     a.click();
  }

  importProject(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.tracks) this.tracks.set(data.tracks);
        if (data.bpm) this.engine.tempo.set(data.bpm);
      } catch (err) {}
    };
    reader.readAsText(file);
  }

  importAudio() {
    this.logger.info("Importing audio track...");
  }
}
