import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
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
  params?: any;
  cutoff?: number;
}

export interface TrackClip {
  id: string;
  start: number;
  length: number;
  name: string;
  type: 'midi' | 'audio';
  color?: string;
  slotId?: string | null;
}

export type ArrangementClip = TrackClip;

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
  synthParams?: any;
  patternSlots?: PatternSlot[];
  activePatternSlotId?: string | null;
  automationLanes?: AutomationLane[];
}

export interface StudioProjectData {
  tracks: TrackModel[];
  selectedTrackId: number | null;
  bpm: number;
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  public static readonly DRUM_TRACK_ID = 100;
  private static readonly PATTERN_STEPS = 64;

  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private audioSession = inject(AudioSessionService);
  private logger = inject(LoggingService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(0);
  activeLoopBars = signal(64);
  structure = signal<SongSection[]>([]);
  performerScenes = signal<PerformerScene[]>(this.createDefaultScenes());
  projectLoaded = signal(true);
  activeSceneId = signal<string | null>(null);

  constructor() {
    this.setupInitialTracks();
  }

  private setupInitialTracks() {
    this.addTrack('Lead Synth', 'grand-piano-v2');
    this.addTrack('S.M.U.V.E. DRUMS', 'trap-808-elite', MusicManagerService.DRUM_TRACK_ID);
    this.selectedTrackId.set(0);
  }

  private createDefaultScenes(): PerformerScene[] {
    return [
      { id: 'scene-1', name: 'Intro', color: '#3b82f6', slotId: 'slot-0' },
      { id: 'scene-2', name: 'Verse', color: '#10b981', slotId: 'slot-1' },
      { id: 'scene-3', name: 'Chorus', color: '#f59e0b', slotId: 'slot-2' },
      { id: 'scene-4', name: 'Drop', color: '#ef4444', slotId: 'slot-3' },
    ];
  }

  ensureTrack(instrumentId: string) {
    if (!this.tracks().some(t => t.instrumentId === instrumentId)) {
      this.addTrack('Track ' + (this.tracks().length + 1), instrumentId);
    }
  }

  addTrack(name: string, instrumentId: string) {
    const id = this.tracks().length;
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);
    const newTrack: TrackModel = {
      id,
      name,
      instrumentId,
      type: 'midi',
      color: this.getTrackColor(id),
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
      synthParams: preset?.synth || { type: 'sine' },
      patternSlots: this.createDefaultSlots()
    };
    this.tracks.update(ts => [...ts, newTrack]);
    return id;
  }

  private createDefaultSlots(): PatternSlot[] {
    const slots: PatternSlot[] = [];
    for (let i = 0; i < 8; i++) {
      slots.push({
        id: `slot-${i}`,
        name: `Pattern ${i + 1}`,
        versions: [{ id: 'v1', name: 'v1', steps: new Array(64).fill(false), notes: [] }],
        activeVersionId: 'v1'
      });
    }
    return slots;
  }

  private getTrackColor(index: number): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  removeTrack(id: number) {
    this.tracks.update(ts => ts.filter(t => t.id !== id));
    if (this.selectedTrackId() === id) {
      this.selectedTrackId.set(this.tracks()[0]?.id || null);
    }
  }

  launchScene(id: string) {
    this.activeSceneId.set(id);
    const scene = this.performerScenes().find(s => s.id === id);
    if (scene) {
      this.tracks().forEach(t => this.setActivePatternSlot(t.id, scene.slotId));
    }
  }

  setActivePatternSlot(trackId: number, slotId: string) {
    this.tracks.update(tracks => tracks.map(track => {
      if (track.id !== trackId) return track;
      const persisted = this.persistActivePattern(track);
      const slot = persisted.patternSlots?.find(s => s.id === slotId);
      const version = slot?.versions.find(v => v.id === slot.activeVersionId);
      if (!version) return persisted;
      return {
        ...persisted,
        activePatternSlotId: slotId,
        notes: this.cloneNotes(version.notes),
        steps: [...version.steps]
      };
    }));
  }

  private persistActivePattern(track: TrackModel): TrackModel {
    if (!track.patternSlots) return track;
    const patternSlots = track.patternSlots.map(slot => {
      if (slot.id !== track.activePatternSlotId && track.activePatternSlotId !== null) return slot;
      return {
        ...slot,
        versions: slot.versions.map(v => v.id === slot.activeVersionId ? {
          ...v, steps: [...track.steps], notes: this.cloneNotes(track.notes)
        } : v)
      };
    });
    return { ...track, patternSlots };
  }

  private cloneNotes(notes: TrackNote[]): TrackNote[] {
    return notes.map(n => ({ ...n }));
  }

  addNoteToTrack(trackId: number, note: Partial<TrackNote>) {
    const id = note.id || `note-${Date.now()}-${Math.random()}`;
    this.tracks.update(ts => ts.map(t => {
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
    }));
    return id;
  }

  updateNote(trackId: number, noteId: string, patch: Partial<TrackNote>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n)
      });
    }));
  }

  removeNotes(trackId: number, noteIds: string[]) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({
        ...t,
        notes: t.notes.filter(n => !noteIds.includes(n.id))
      });
    }));
  }

  toggleStep(trackId: number, step: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const steps = [...t.steps];
      steps[step] = !steps[step];
      return { ...t, steps };
    }));
  }

  addClipToTrack(trackId: number, clip: Partial<TrackClip>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const newClip: TrackClip = {
        id: clip.id || `clip-${Date.now()}`,
        start: clip.start || 0,
        length: clip.length || 4,
        name: clip.name || 'New Clip',
        type: clip.type || 'midi',
        ...clip
      };
      return { ...t, clips: [...t.clips, newClip] };
    }));
  }

  updateClip(trackId: number, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...patch } : c) };
    }));
  }

  removeClip(trackId: number, clipId: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t));
  }

  splitClip(trackId: number, clipId: string, bar: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const clip = t.clips.find(c => c.id === clipId);
      if (!clip) return t;
      const first = { ...clip, length: bar - clip.start };
      const second = { ...clip, id: `clip-${Date.now()}`, start: bar, length: clip.length - (bar - clip.start) };
      return { ...t, clips: [...t.clips.filter(c => c.id !== clipId), first, second] };
    }));
  }

  toggleMute(id: number) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, mute: !t.mute } : t)); }
  toggleSolo(id: number) { this.tracks.update(ts => ts.map(t => t.id === id ? { ...t, solo: !t.solo } : t)); }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, synthParams: { ...t.synthParams, ...params } } : t));
  }

  setInstrument(trackId: number, instId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instId);
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, instrumentId: instId, synthParams: preset?.synth || t.synthParams } : t));
  }

  quantizeTrack(id: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({ ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) }) : t));
  }

  humanizeTrack(id: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({
      ...t, notes: t.notes.map(n => ({ ...n, step: n.step + (Math.random() - 0.5) * 0.1, velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() - 0.5) * 0.2)) }))
    }) : t));
  }

  arpeggiateTrack(id: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== id || t.notes.length === 0) return t;
      const base = t.notes[0];
      const arp = [0, 4, 7, 12].map((v, i) => ({ ...base, id: `arp-${i}-${Date.now()}`, midi: base.midi + v, step: base.step + i * 0.25, length: 0.2 }));
      return this.persistActivePattern({ ...t, notes: arp });
    }));
  }

  strumTrack(id: number) {
    this.tracks.update(ts => ts.map(t => t.id === id ? this.persistActivePattern({
      ...t, notes: t.notes.sort((a,b) => a.midi - b.midi).map((n, i) => ({ ...n, step: n.step + i * 0.02 }))
    }) : t));
  }

  duplicateNotes(trackId: number, ids: string[], offset: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const dupes = t.notes.filter(n => ids.includes(n.id)).map(n => ({ ...n, id: `note-${Date.now()}-${Math.random()}`, step: n.step + offset }));
      return this.persistActivePattern({ ...t, notes: [...t.notes, ...dupes] });
    }));
  }

  recordLiveNote(midi: number, velocity: number) {
    const trackId = this.selectedTrackId();
    if (trackId === null) return undefined;
    return this.addNoteToTrack(trackId, { midi, step: this.currentStep() % 64, velocity, length: 1 });
  }

  playStep(step: number, time: number, duration: number, customCtx?: any) {
    this.currentStep.set(step);
    const hasSolo = this.tracks().some(t => t.solo);
    this.tracks().forEach(t => {
      if (t.mute || (hasSolo && !t.solo)) return;
      t.notes.filter(n => Math.floor(n.step) === step % 64).forEach(n => {
        const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
        const params = t.id === MusicManagerService.DRUM_TRACK_ID ? { ...t.synthParams, ...(n.params || {}) } : t.synthParams;
        this.engine.triggerAttack(t.id, freq, time, n.velocity, n.length * duration, t.gain, t.pan, t.sendA, t.sendB, params, 1, customCtx);
      });
    });
  }

  snapshotProject(): StudioProjectData {
    return { tracks: this.tracks(), selectedTrackId: this.selectedTrackId(), bpm: this.engine.tempo() };
  }

  importProject(file: File) {}
  exportProject() {}
  importAudioTrack() {}
  setNoteParam(tid: number, nid: string, p: string, v: any) { this.updateNote(tid, nid, { [p]: v }); }
  addAutomationLane(tid: number, p: string) {}
}
