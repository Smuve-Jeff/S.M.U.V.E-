import { AudioRecorderService } from "../studio/audio-recorder.service";
import { Injectable, inject, signal, effect, computed, WritableSignal } from '@angular/core';
import { LoggingService } from './logging.service';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { FileLoaderService } from './file-loader.service';
import { AiService } from './ai.service';
import { UserProfileService } from './user-profile.service';
import { LocalStorageService } from './local-storage.service';

export interface TrackNote { id: string; midi: number; step: number; length: number; velocity: number; }
export interface PatternVersion { id: string; name: string; createdAt: number; notes: TrackNote[]; steps: boolean[]; stepVelocities: number[]; }
export interface PatternSlot { id: string; name: string; createdAt: number; notes: TrackNote[]; steps: boolean[]; stepVelocities: number[]; versions: PatternVersion[]; }
export interface FxSlot { id: string; type: string; params: any; enabled: boolean; bypass?: boolean; mix?: number; }
export interface GlobalChord { id: string; name: string; midi?: number[]; step?: number; duration?: number; startStep?: number; length?: number; }
export interface SongSection { id: string; name?: string; start?: number; length: number; color: string; label?: string; startBar?: number; }
export interface ArrangementClip { id: string; trackId?: number; start: number; length: number; name?: string; color?: string; type?: string; audioUrl?: string; }
export interface ProjectModel { id: string; name: string; bpm: number; scale: string; key: string; createdAt: number; updatedAt: number; tracks?: TrackModel[]; structure?: SongSection[]; chords?: GlobalChord[]; }

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
  steps: boolean[];
  stepVelocities?: number[];
  patternSlots?: PatternSlot[];
  activePatternSlotId?: string | null;
  euclideanParams?: { pulses: number; steps: number; rotation: number; };
}

@Injectable({ providedIn: 'root' })
export class MusicManagerService {
  private logger = inject(LoggingService);
  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private aiService = inject(AiService);
  private profileService = inject(UserProfileService);
  private localStorage = inject(LocalStorageService);

  private trackSignals = new Map<number, WritableSignal<TrackModel>>();
  private trackIds = signal<number[]>([]);
  public tracks = computed(() => this.trackIds().map(id => this.trackSignals.get(id)!()));

  public currentProject = signal<ProjectModel | null>(null);
  public scale = signal<string>('Major');
  public key = signal<string>('C');
  public selectedTrackId = signal<number | null>(null);
  public currentStep = signal<number>(-1);
  public smartAssist = signal<any>(null);
  public structure = signal<SongSection[]>([]);
  public chords = signal<GlobalChord[]>([]);

  constructor() {
    effect(() => {
      this.tracks();
      this.updateSmartAssist();
    }, { allowSignalWrites: true });
    const recorder = inject(AudioRecorderService);
    recorder.recordingFinished$.subscribe(rec => {
      const armedTrack = this.tracks().find(t => t.armed);
      if (armedTrack) {
        const startBar = Math.floor(this.currentStep() / 16);
        const newClip: ArrangementClip = { id: rec.id, name: armedTrack.name + ' Rec', start: startBar, length: 4, color: armedTrack.color, audioUrl: rec.url };
        this.getTrackSignal(armedTrack.id).update(at => ({ ...at, clips: [...at.clips, newClip] }));
      }
    });

    this.loadLastSession();

    (this.engine as any).onStep = (step: number, time: number) => {
      this.currentStep.set(step);
      for (const t of this.tracks()) {
        if (t.mute || (this.tracks().some(s => s.solo) && !t.solo)) continue;
        if (t.type === 'midi') {
          for (const n of t.notes) {
            if (n.step === step) {
              const velocityScale = t.stepVelocities?.[step] ?? 1;
              (this.engine as any).triggerAttack?.(
                t.id, this.midiToFreq(n.midi), time, n.velocity, n.length, t.gain, t.pan, t.sendA, t.sendB,
                { type: 'triangle', attack: 0.002, decay: 0.08, sustain: 0.7, release: 0.1, cutoff: 7000, q: 0.8 },
                velocityScale
              );
            }
          }
        }
      }
    };

    effect(() => { if (!this.engine.isPlaying()) this.currentStep.set(-1); });
    effect(() => { this.tracks(); this.currentProject(); this.saveProject().catch(() => {}); });
  }

  getTrackSignal(id: number): WritableSignal<TrackModel> {
    const s = this.trackSignals.get(id);
    if (!s) throw new Error(`Track ${id} not found`);
    return s;
  }

  updateTracks(updater: (ts: TrackModel[]) => TrackModel[]) {
    const currentTracks = this.tracks();
    const newTracks = updater(currentTracks);
    newTracks.forEach(nt => {
      const existing = this.trackSignals.get(nt.id);
      if (existing) existing.set(nt);
      else {
        this.trackSignals.set(nt.id, signal(nt));
        this.trackIds.update(ids => [...ids, nt.id]);
      }
    });
    const currentIds = this.trackIds();
    const newIds = newTracks.map(t => t.id);
    currentIds.forEach(id => {
      if (!newIds.includes(id)) {
        this.trackSignals.delete(id);
        this.trackIds.update(ids => ids.filter(tid => tid !== id));
      }
    });
  }

  ensureTrack(presetIdOrName: string): number {
    const presets = this.instruments.getPresets();
    const preset = presets.find((p) => p.id === presetIdOrName || p.name === presetIdOrName) || presets[0];
    const id = Math.floor(Math.random() * 1e9);
    const track: TrackModel = {
      id, name: preset.name, instrumentId: preset.id, type: 'midi', qualityMode: 'ultra', color: '#EC5B13',
      notes: [], clips: [], gain: 0.9, pan: 0, sendA: 0.1, sendB: 0.05, fxSlots: [],
      mute: false, solo: false, steps: new Array(64).fill(false), stepVelocities: new Array(64).fill(1),
      patternSlots: [], activePatternSlotId: null,
    };
    this.trackSignals.set(id, signal(track));
    this.trackIds.update(ids => [...ids, id]);
    this.engine.ensureTrack({ id: track.id, name: track.name, instrumentId: track.instrumentId, gain: track.gain, pan: track.pan, sendA: track.sendA, sendB: track.sendB });
    if (this.selectedTrackId() == null) this.selectedTrackId.set(id);
    return id;
  }

  removeTrack(id: number) { this.trackIds.update((ids) => ids.filter((tid) => tid !== id)); this.trackSignals.delete(id); if (this.selectedTrackId() === id) this.selectedTrackId.set(this.trackIds().length > 0 ? this.trackIds()[0] : null); }
  toggleMute(id: number) { this.getTrackSignal(id).update(t => ({ ...t, mute: !t.mute })); }
  toggleSolo(id: number) { const isSolo = this.getTrackSignal(id)().solo; this.trackIds().forEach(tid => { this.getTrackSignal(tid).update(t => ({ ...t, solo: tid === id ? !isSolo : false })); }); }

  toggleStep(trackId: number, stepIndex: number) {
    this.getTrackSignal(trackId).update((t) => {
      const newSteps = [...t.steps]; newSteps[stepIndex] = !newSteps[stepIndex];
      let newNotes = [...t.notes];
      if (newSteps[stepIndex]) {
        newNotes.push({ id: Math.random().toString(36).substring(7), midi: this.getDefaultPitchForTrack(t), step: stepIndex, length: 1, velocity: 0.8 });
      } else {
        newNotes = newNotes.filter((n) => n.step !== stepIndex);
      }
      return { ...t, steps: newSteps, notes: newNotes, stepVelocities: t.stepVelocities ?? new Array(64).fill(1) };
    });
  }

  setStepVelocity(trackId: number, stepIndex: number, velocity: number) {
    this.getTrackSignal(trackId).update((t) => {
      const current = t.stepVelocities ? [...t.stepVelocities] : new Array(64).fill(1);
      const clampedStepIndex = Math.max(0, Math.min(63, stepIndex));
      const clampedVelocity = Math.max(0, Math.min(1, velocity));
      current[clampedStepIndex] = clampedVelocity;
      return { ...t, stepVelocities: current };
    });
  }

  addNote(trackId: number, midi: number, step: number, length = 1, velocity = 0.9) {
    this.getTrackSignal(trackId).update(t => ({
      ...t, notes: [...t.notes, { id: Math.random().toString(36).substring(7), midi, step, length, velocity }]
    }));
  }

  updateNote(trackId: number, noteId: string, patch: Partial<TrackNote>) {
    this.getTrackSignal(trackId).update(t => ({
      ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n)
    }));
  }

  addNoteToTrack(trackId: number, note: Omit<TrackNote, 'id'>) {
    this.getTrackSignal(trackId).update(t => ({
      ...t, notes: [...t.notes, { ...note, id: Math.random().toString(36).substring(7) }]
    }));
  }

  deleteNoteById(trackId: number, noteId: string) {
    this.getTrackSignal(trackId).update(t => ({
      ...t, notes: t.notes.filter(n => n.id !== noteId)
    }));
  }

  removeNote(trackId: number, midi: number, step: number) {
    this.getTrackSignal(trackId).update(t => ({
      ...t, notes: t.notes.filter(n => !(n.midi === midi && n.step === step))
    }));
  }

  clearTrack(trackId: number) { this.getTrackSignal(trackId).update((t) => ({ ...t, notes: [] })); }
  setTrackColor(trackId: number, color: string) { this.getTrackSignal(trackId).update(t => ({ ...t, color })); }
  setTrackQualityMode(trackId: number, mode: 'ultra' | 'performance') { this.getTrackSignal(trackId).update(t => ({ ...t, qualityMode: mode })); }

  setInstrument(trackId: number, presetId: string) {
    const presets = this.instruments.getPresets();
    const preset = presets.find(p => p.id === presetId) || presets[0];
    this.getTrackSignal(trackId).update(t => ({ ...t, instrumentId: preset.id, name: preset.name, fxSlots: (preset as any).defaultFx || t.fxSlots }));
    this.engine.updateTrack(trackId, { instrumentId: preset.id, name: preset.name });
  }

  async importAudioTrack() {
    const files = await this.fileLoader.pickLocalFiles('audio/*');
    if (files && files.length > 0) {
      const file = files[0]; const id = Math.floor(Math.random() * 1e9); const url = URL.createObjectURL(file);
      const track: TrackModel = {
        id, name: file.name, instrumentId: 'audio-player', type: 'audio', audioUrl: url, color: '#A855F7',
        notes: [], clips: [], gain: 0.8, pan: 0, sendA: 0, sendB: 0, fxSlots: [], mute: false, solo: false, steps: new Array(64).fill(false)
      };
      this.trackSignals.set(id, signal(track));
      this.trackIds.update(ids => [...ids, id]);
      this.selectedTrackId.set(id);
    }
  }

  batchMute(ids: number[], mute: boolean) {
    ids.forEach(id => this.getTrackSignal(id).update(t => ({ ...t, mute })));
  }

  reorderTrack(fromIndex: number, toIndex: number) {
    this.trackIds.update(ids => {
      const result = [...ids];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }

  fillPatternLane(trackId: number, density = 0.5) {
    this.getTrackSignal(trackId).update(t => {
      const nextSteps = t.steps.map(() => Math.random() < density);
      const nextNotes = nextSteps.map((on, i) => on ? { id: Math.random().toString(36).substring(7), midi: this.getDefaultPitchForTrack(t), step: i, length: 1, velocity: 0.8 } : null).filter((n): n is TrackNote => !!n);
      return { ...t, steps: nextSteps, notes: nextNotes };
    });
  }

  clearPatternLane(trackId: number) {
    this.getTrackSignal(trackId).update(t => ({ ...t, steps: new Array(64).fill(false), notes: t.notes.filter(n => n.step >= 64) }));
  }

  rotatePatternLane(trackId: number, shift = 1) {
    this.getTrackSignal(trackId).update(t => {
      const len = 64;
      const nextSteps = [...t.steps.slice(-shift), ...t.steps.slice(0, -shift)];
      const nextNotes = t.notes.map(n => ({ ...n, step: n.step < 64 ? (n.step + shift) % 64 : n.step }));
      return { ...t, steps: nextSteps, notes: nextNotes };
    });
  }

  randomizePatternLane(trackId: number, density = 0.4) { this.fillPatternLane(trackId, density); }

  createPatternSlot(trackId: number, name = 'Pattern') {
    this.getTrackSignal(trackId).update(t => {
      const slot: PatternSlot = { id: Math.random().toString(36).substring(2, 9), name, createdAt: Date.now(), notes: t.notes.map(n => ({...n})), steps: [...t.steps], stepVelocities: [...(t.stepVelocities ?? new Array(64).fill(1))], versions: [] };
      return { ...t, patternSlots: [...(t.patternSlots ?? []), slot], activePatternSlotId: slot.id };
    });
  }

  duplicatePatternSlot(trackId: number, slotId: string) {
    this.getTrackSignal(trackId).update(t => {
      const source = t.patternSlots?.find(s => s.id === slotId);
      if (!source) return t;
      const clone = { ...source, id: Math.random().toString(36).substring(2, 9), name: `${source.name} Copy` };
      return { ...t, patternSlots: [...(t.patternSlots ?? []), clone], activePatternSlotId: clone.id };
    });
  }

  snapshotPatternVersion(trackId: number, slotId: string, name = 'Version') {
    this.getTrackSignal(trackId).update(t => {
      const slots = t.patternSlots?.map(s => s.id === slotId ? { ...s, versions: [...s.versions, { id: Math.random().toString(36).substring(2, 9), name, createdAt: Date.now(), notes: s.notes.map(n => ({...n})), steps: [...s.steps], stepVelocities: [...s.stepVelocities] }] } : s);
      return { ...t, patternSlots: slots };
    });
  }

  recallPatternSlot(trackId: number, slotId: string) {
    this.getTrackSignal(trackId).update(t => {
      const slot = t.patternSlots?.find(s => s.id === slotId);
      if (!slot) return t;
      return { ...t, notes: slot.notes.map(n => ({...n})), steps: [...slot.steps], stepVelocities: [...slot.stepVelocities], activePatternSlotId: slot.id };
    });
  }

  generateEuclideanPattern(trackId: number, pulses: number, steps: number, rotation = 0) {
    this.getTrackSignal(trackId).update(t => {
      const newSteps = new Array(64).fill(false);
      for (let i = 0; i < steps; i++) { if (((i * pulses + rotation) % steps) < pulses) newSteps[i] = true; }
      const newNotes = newSteps.map((on, i) => on ? { id: Math.random().toString(36).substring(7), midi: this.getDefaultPitchForTrack(t), step: i, length: 1, velocity: 0.8 } : null).filter((n): n is TrackNote => !!n);
      return { ...t, steps: newSteps, notes: newNotes, euclideanParams: { pulses, steps, rotation } };
    });
  }

  applyGenreTemplate(trackId: number, genre: string) {
    this.getTrackSignal(trackId).update(t => {
      let steps = new Array(64).fill(false);
      if (genre === 'Trap') [0, 8, 16, 24, 32, 40, 48, 56].forEach(i => steps[i] = true);
      else if (genre === 'Techno') [0, 4, 8, 12, 16, 20, 24, 28].forEach(i => steps[i] = true);
      const newNotes = steps.map((on, i) => on ? { id: Math.random().toString(36).substring(7), midi: this.getDefaultPitchForTrack(t), step: i, length: 1, velocity: 0.8 } : null).filter((n): n is TrackNote => !!n);
      return { ...t, steps, notes: newNotes };
    });
  }

  async listProjects(): Promise<ProjectModel[]> { return this.localStorage.getAllItems('projects'); }

  async createNewProject(name: string) {
    this.stop(); this.trackIds.set([]); this.trackSignals.clear(); this.structure.set([]); this.chords.set([]);
    const project: ProjectModel = { id: Math.random().toString(36).substring(2, 11), name: name || 'Untitled Project', bpm: 124, scale: 'Major', key: 'C', createdAt: Date.now(), updatedAt: Date.now() };
    this.currentProject.set(project); this.engine.tempo.set(124); this.scale.set('Major'); this.key.set('C'); this.ensureTrack('grand-piano'); await this.saveProject();
  }

  async saveProject() {
    const project = this.currentProject();
    if (!project) return;
    await this.localStorage.saveItem('projects', { ...project, tracks: this.tracks().map(t => ({...t, audioBuffer: undefined})), structure: this.structure(), chords: this.chords() });
  }

  async loadProject(id: string) {
    const data = await this.localStorage.getItem('projects', id);
    if (!data) return;
    this.trackIds.set([]); this.trackSignals.clear();
    data.tracks?.forEach((t: any) => { this.trackSignals.set(t.id, signal(t)); this.trackIds.update(ids => [...ids, t.id]); this.engine.ensureTrack(t); });
    this.currentProject.set({ id: data.id, name: data.name, bpm: data.bpm, scale: data.scale, key: data.key, createdAt: data.createdAt, updatedAt: data.updatedAt });
  }

  private loadLastSession() {
    const saved = localStorage.getItem('SMUVE_LAST_SESSION');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        session.tracks?.forEach((t: any) => { this.trackSignals.set(t.id, signal(this.normalizeTrack(t))); this.trackIds.update(ids => [...ids, t.id]); this.engine.ensureTrack(t); });
      } catch {
        this.ensureTrack('grand-piano');
      }
    } else { this.ensureTrack('grand-piano'); }
  }

  private normalizeTrack(track: TrackModel): TrackModel {
    return { ...track, qualityMode: track.qualityMode ?? 'ultra', stepVelocities: track.stepVelocities ?? new Array(64).fill(1), patternSlots: track.patternSlots ?? [], activePatternSlotId: track.activePatternSlotId ?? null, steps: track.steps ?? new Array(64).fill(false), clips: track.clips ?? [], notes: track.notes ?? [], fxSlots: track.fxSlots ?? [] };
  }

  private midiToFreq(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }
  private getDefaultPitchForTrack(t: TrackModel): number { if (t.instrumentId.includes('kit')) { if (t.name.toLowerCase().includes('kick')) return 36; if (t.name.toLowerCase().includes('snare')) return 38; if (t.name.toLowerCase().includes('hat')) return 42; } return 60; }
  setTempo(bpm: number) { this.engine.tempo.set(bpm); }
  play() { this.engine.start(); }
  stop() { this.engine.stop(); this.currentStep.set(-1); }
  setLoop(start: number, end: number) { this.engine.loopStart.set(start); this.engine.loopEnd.set(end); }
  commitPatternToArrangement(trackId: number, slotId: string, start: number) { this.getTrackSignal(trackId).update(t => ({ ...t, clips: [...t.clips, { id: 'clip_' + Math.random().toString(36).substr(2, 9), name: 'Pattern', start, length: 4, color: t.color }] })); }
  updateNoteVelocity(trackId: number, midi: number, step: number, velocity: number) { this.getTrackSignal(trackId).update(t => ({ ...t, notes: t.notes.map(n => n.midi === midi && n.step === step ? { ...n, velocity } : n) })); }

  updateSmartAssist() {
    const trackCount = this.trackIds().length;
    const totalNotes = this.tracks().reduce((sum, t) => sum + t.notes.length, 0);
    const density = Math.min(1, (trackCount * 0.1) + (totalNotes * 0.001));

    // Heuristic energy calculation
    const avgVelocity = totalNotes > 0
      ? this.tracks().reduce((sum, t) => sum + t.notes.reduce((nSum, n) => nSum + n.velocity, 0), 0) / totalNotes
      : 0.5;
    const energy = Math.min(1, density * 0.5 + avgVelocity * 0.5);

    const assist = this.aiService.getProductionSmartAssist({
      arrangementDensity: density,
      midMaskingRisk: density * 0.8,
      transientSharpness: energy,
      lowBandEnergy: this.tracks().filter(t => t.name.toLowerCase().includes('kick') || t.name.toLowerCase().includes('bass')).length / (trackCount || 1)
    });

    this.smartAssist.set(assist);
  }
}
