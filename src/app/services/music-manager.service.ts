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
}

export interface TrackClip extends StudioClip {
  loop?: boolean;
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

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<string | null>(null);
  currentStep = signal(0);
  activeSceneId = signal<string | null>(null);
  takesExpanded = signal<Record<string, boolean>>({});

  selectedTrack = computed(() => this.tracks().find(t => t.id === this.selectedTrackId()) || null);

  constructor() {
    this.setupProjectSync();

    // Bind engine scheduler to step sequencer
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
      effects: []
    };

    this.tracks.update(ts => [...ts, newTrack]);
    this.selectedTrackId.set(id);
    return id;
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
    this.tracks().forEach(t => {
      if (t.muted) return;
      // Play notes from Clips that intersect this bar/step
      t.clips.forEach(clip => {
         if (bar >= clip.start && bar < clip.start + clip.length) {
            const relStep = (step % 64) - (clip.start * 16);
            // This logic needs more care for looping clips, but for now:
            t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
               if (n.probability === undefined || Math.random() < n.probability) {
                  const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
                  this.engine.triggerAttack(t.id, freq, time, n.velocity, n.length * duration, t.gain, t.pan, 0, 0, t.synthParams);
               }
            });
         }
      });
    });
  }

  quantizeTrack(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) } : t)); }
  humanizeTrack(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, notes: t.notes.map(n => ({ ...n, step: n.step + (Math.random()-0.5)*0.1, velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random()-0.5)*0.2)) })) } : t)); }
  strumTrack(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, notes: [...t.notes].sort((a,b) => a.midi - b.midi).map((n, i) => ({ ...n, step: n.step + i * 0.02 })) } : t)); }
  arpeggiateTrack(id: string) {
     this.tracks.update(ts => ts.map(t => {
        if (t.id !== id || t.notes.length === 0) return t;
        const base = t.notes[0];
        const arp = [0, 4, 7, 12].map((v, i) => ({ ...base, id: 'arp_' + i + Date.now(), midi: base.midi + v, step: base.step + i * 0.25, length: 0.2 }));
        return { ...t, notes: arp };
     }));
  }

  toggleMute(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, muted: !t.muted } : t)); }
  toggleSolo(id: string) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, soloed: !t.soloed } : t)); }
  updateVolume(id: string, vol: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, volume: vol, gain: vol } : t));
    this.engine.updateTrack(id, { gain: vol });
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
}
