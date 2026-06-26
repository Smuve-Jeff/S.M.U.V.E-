import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { ProjectService } from './project.service';
import { HistoryService } from './history.service';
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
}

export interface TrackClip extends StudioClip {
  loop?: boolean;
}

export interface SongSection {
  id: string;
  name: string;
  start: number;
  length: number;
  color?: string;
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

export interface TrackModel extends StudioTrack {
  id: string;
  instrumentId: string;
  notes: TrackNote[];
  steps: boolean[];
  fxSlots: FxSlot[];
  synthParams?: any;
  gain: number;
  sendA: number;
  sendB: number;
  activePatternSlotId?: string | null;
  patternSlots?: PatternSlot[];
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  public static readonly DRUM_TRACK_ID = 'track_drums_100';

  public engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);
  private logger = inject(LoggingService);
  private projectService = inject(ProjectService);
  private history = inject(HistoryService);
  private recordingEngine = inject(StudioRecordingEngineService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<string | null>(null);
  currentStep = signal(0);
  activeSceneId = signal<string | null>(null);
  takesExpanded = signal<Record<string, boolean>>({});

  activeLoopBars = signal(64);
  structure = signal<SongSection[]>([]);
  performerScenes = signal<PerformerScene[]>([]);
  projectLoaded = signal(true);

  selectedTrack = computed(() => this.tracks().find(t => t.id === this.selectedTrackId()) || null);

  constructor() {
    this.setupProjectSync();
    this.engine.onScheduleStep = (step, time, duration) => {
       this.currentStep.set(step);
       this.playStep(step, time, duration);
    };
  }

  private setupProjectSync() {
    effect(() => {
      const project = this.projectService.currentProject();
      if (project && this.tracks().length === 0) {
         this.tracks.set(project.tracks as any);
         this.engine.tempo.set(project.bpm);
      }
    }, { allowSignalWrites: true });
  }

  private runCommand(name: string, execute: () => void, undo: () => void) {
    this.history.execute({ name, execute, undo });
  }

  newProject(skipDefaults = false) {
    const oldTracks = this.tracks();
    this.runCommand('New Project', () => {
      this.tracks.set([]);
      this.selectedTrackId.set(null);
      this.engine.stop();
      if (!skipDefaults) {
         this.addTrack('Piano', 'grand-piano');
         this.addTrack('Drums', 'trap-808-elite', 'drum');
      }
    }, () => this.tracks.set(oldTracks));
  }

  addTrack(name: string, instrumentId: string, type: TrackType = 'midi') {
    const id = instrumentId.includes('drum') ? MusicManagerService.DRUM_TRACK_ID : 'track_' + Date.now() + Math.random();
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);

    const newTrack: TrackModel = {
      id, name, type, instrumentId,
      muted: false, soloed: false, volume: 0.8, gain: 0.8, pan: 0,
      clips: [], notes: [], steps: new Array(64).fill(false),
      fxSlots: [{ id: 'fx1', type: 'Reverb', params: {}, enabled: true }],
      sendA: 0, sendB: 0,
      color: '#af25f4',
      synthParams: preset?.synth || { type: 'sine' },
      effects: [],
      patternSlots: this.createDefaultSlots(),
      activePatternSlotId: 'slot-0'
    };

    this.tracks.update(ts => [...ts, newTrack]);
    this.selectedTrackId.set(id);
    return id;
  }

  private createDefaultSlots(): PatternSlot[] {
    return [{
      id: 'slot-0', name: 'Pattern 1', activeVersionId: 'v1',
      versions: [{ id: 'v1', name: 'v1', steps: new Array(64).fill(false), notes: [] }]
    }];
  }

  removeTrack(id: string) {
    this.tracks.update(ts => ts.filter(t => t.id !== id));
    if (this.selectedTrackId() === id) this.selectedTrackId.set(null);
  }

  addNoteToTrack(trackId: string, note: TrackNote) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: [...t.notes, note] } : t));
  }

  updateNote(trackId: string, noteId: string, patch: Partial<TrackNote>) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) } : t));
  }

  removeNotes(trackId: string, noteIds: string[]) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: t.notes.filter(n => !noteIds.includes(n.id)) } : t));
  }

  addClipToTrack(trackId: string, clip: Partial<TrackClip>) {
    const newClip: TrackClip = { id: 'clip_' + Date.now(), start: 0, length: 4, name: 'Clip', type: 'midi', ...clip };
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t));
  }

  updateClip(trackId: string, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) } : t));
  }

  removeClip(trackId: string, clipId: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t));
  }

  splitClip(trackId: string, clipId: string, bar: number) {
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== trackId) return t;
        const clip = t.clips.find(c => c.id === clipId);
        if (!clip) return t;
        const first = { ...clip, length: bar - clip.start };
        const second = { ...clip, id: 'clip_' + Date.now(), start: bar, length: clip.length - (bar - clip.start) };
        return { ...t, clips: [...t.clips.filter(c => c.id !== clipId), first, second] };
     }));
  }

  playStep(step: number, time: number, duration: number) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    this.tracks().forEach(t => {
      if (t.muted) return;

      t.clips.forEach(clip => {
        // Handle MIDI Notes
        if (bar >= clip.start && bar < clip.start + clip.length) {
          t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
             if (n.probability === undefined || Math.random() < n.probability) {
                const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
                this.engine.triggerAttack(t.id, freq, time, n.velocity, n.length * duration, t.gain, t.pan, 0, 0, t.synthParams);
             }
          });

          // Handle Audio Playback (Trigger at start of bar for now)
          if (clip.type === 'audio' && stepInBar === 0 && bar === clip.start) {
             const audioData = (clip as any).audioData;
             if (audioData) {
                const rate = this.engine.calculatePlaybackRate((clip as any).originalBpm || this.engine.tempo());
                this.engine.triggerSampler(t.id, audioData, time, t.gain, t.pan, clip.length * 4 * (60/this.engine.tempo()), rate);
             }
          }
        }
      });
    });
  }

  quantizeTrack(id: string, noteIds?: string[]) {
    this.tracks.update(ts => ts.map(t => t.id === id ? {
      ...t, notes: t.notes.map(n => (!noteIds || noteIds.includes(n.id)) ? { ...n, step: Math.round(n.step) } : n)
    } : t));
  }
  humanizeTrack(id: string, noteIds?: string[]) {
    this.tracks.update(ts => ts.map(t => t.id === id ? {
      ...t, notes: t.notes.map(n => (!noteIds || noteIds.includes(n.id)) ? {
        ...n, step: n.step + (Math.random()-0.5)*0.1, velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random()-0.5)*0.2))
      } : n)
    } : t));
  }
  strumTrack(id: string, noteIds?: string[]) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== id) return t;
      const sorted = [...t.notes].sort((a, b) => a.midi - b.midi);
      let strumIndex = 0;
      return { ...t, notes: sorted.map(n => (!noteIds || noteIds.includes(n.id)) ? { ...n, step: n.step + strumIndex++ * 0.02 } : n) };
    }));
  }
  arpeggiateTrack(id: string, noteIds?: string[]) {
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== id) return t;
        const targetNotes = noteIds ? t.notes.filter(n => noteIds.includes(n.id)) : t.notes;
        if (targetNotes.length === 0) return t;

        const newNotes: any[] = t.notes.filter(n => !targetNotes.includes(n));
        targetNotes.forEach(base => {
           [0, 4, 7, 12].forEach((v, i) => {
              newNotes.push({
                ...base,
                id: `arp_${base.id}_${i}_${Date.now()}`,
                midi: base.midi + v,
                step: base.step + i * 0.25,
                length: 0.25
              });
           });
        });
        return { ...t, notes: newNotes };
     }));
  }

  toggleMute(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, muted: !t.muted } : t)); }
  toggleSolo(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, soloed: !t.soloed } : t)); }
  updateVolume(id: string, vol: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, volume: vol, gain: vol } : t));
    this.engine.updateTrack(id, { gain: vol });
  }

  updateSend(id: string, send: 'A' | 'B', value: number) {
    const patch = send === 'A' ? { sendA: value } : { sendB: value };
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    this.engine.updateTrack(id, patch);
  }

  updateSynthParams(trackId: string, params: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
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

  recordLiveNote(midi: number, velocity: number) {
     const trackId = this.selectedTrackId();
     if (trackId) {
        this.addNoteToTrack(trackId, { id: 'rec_' + Date.now(), midi, step: this.engine.visualStep() % 64, length: 1, velocity });
     }
  }

  launchScene(id: string) { this.activeSceneId.set(id); }
  promoteTakeRegion(t: string, c: string, r: any) {}
  async bounceTrack(id: string) { this.logger.info('Bouncing track...'); }

  setActivePatternSlot(trackId: string, slotId: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, activePatternSlotId: slotId } : t));
  }
  duplicateNotes(trackId: string, ids: string[], offset: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const dupes = t.notes.filter(n => ids.includes(n.id)).map(n => ({
        ...n, id: `note-${Date.now()}-${Math.random()}`, step: n.step + offset
      }));
      return { ...t, notes: [...t.notes, ...dupes] };
    }));
  }
  setInstrument(trackId: string, instId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instId);
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, instrumentId: instId, synthParams: preset?.synth || t.synthParams } : t));
  }
  ensureTrack(instrumentId: string) {
    const existing = this.tracks().find(t => t.instrumentId === instrumentId);
    if (!existing) {
      return this.addTrack('New ' + instrumentId, instrumentId);
    }
    return existing.id;
  }
  importAudio() { this.logger.info("Importing audio track..."); }
  startRecording() { this.recordingEngine.startRecording(); }
  stopRecording(id: string) {
     this.recordingEngine.stopRecording();
     return Promise.resolve(null);
  }
  addAutomationLane(trackId: string, param: string) { this.logger.info(`Added automation lane for ${param}`); }
  snapshotProject(): Project | null {
    const current = this.projectService.currentProject();
    if (!current) return null;
    return {
      ...current,
      tracks: this.tracks() as any,
      bpm: this.engine.tempo(),
      updatedAt: Date.now()
    };
  }
}
