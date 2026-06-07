import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { InstrumentsService } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { AudioSessionService } from '../studio/audio-session.service';
import { DatabaseService } from './database.service';
import { UserProfileService } from './user-profile.service';

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

export interface GlobalChord {
  time: number;
  notes: number[];
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

export interface StudioProjectData {
  tracks: TrackModel[];
  structure: SongSection[];
  performerScenes: PerformerScene[];
  selectedTrackId: number | null;
  activeLoopBars: number;
  tempo: number;
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  private static readonly DEFAULT_SLOT_COUNT = 8;
  private static readonly PATTERN_STEPS = 64;
  private static readonly STEPS_PER_BAR = 16;
  private static readonly DEFAULT_CLIP_LENGTH_BARS = 4;
  public static readonly DRUM_TRACK_ID = 100;

  private instruments = inject(InstrumentsService);
  public engine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private audioSession = inject(AudioSessionService);
  private database = inject(DatabaseService);
  private profileService = inject(UserProfileService);

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<number | null>(null);
  currentStep = signal(0);
  tempo = computed(() => this.engine.tempo());
  activeLoopBars = signal(64);
  structure = signal<SongSection[]>([]);
  chords = signal<GlobalChord[]>([]);
  performerScenes = signal<PerformerScene[]>(this.createDefaultScenes());
  projectLoaded = signal(false);

  constructor() {
    effect(() => {
      this.engine.setLoopLengthBars(this.activeLoopBars());
    });

    this.initializeDefaultProject();
    void this.restoreProject();
  }

  snapshotProject(): StudioProjectData {
    return {
      tracks: this.cloneTracks(this.tracks()),
      structure: this.structure().map((section) => ({ ...section })),
      performerScenes: this.performerScenes().map((scene) => ({ ...scene })),
      selectedTrackId: this.selectedTrackId(),
      activeLoopBars: this.activeLoopBars(),
      tempo: this.tempo(),
    };
  }

  private async restoreProject() {
    try {
      const profile = this.profileService.profile();
      const userId = profile.id || 'anonymous';
      const project = await this.database.loadProject(
        'project_v4_auto',
        userId
      );
      if (project?.tracks?.length) {
        this.hydrateProject(project);
      } else {
        this.initializeDefaultProject();
      }
    } catch (error) {
      this.logger.error('Failed to restore project state', error);
      this.initializeDefaultProject();
    } finally {
      this.projectLoaded.set(true);
    }
  }

  private initializeDefaultProject() {
    if (this.tracks().length > 0) {
      return;
    }

    const firstTrackId = this.createTrack('grand-piano-v2');
    this.createTrack('trap-808-elite');
    this.ensureDrumTrack();
    this.selectedTrackId.set(firstTrackId);
    this.structure.set([
      {
        id: 'section-intro',
        name: 'Intro',
        start: 0,
        length: 16,
        color: '#af25f4',
      },
      {
        id: 'section-hook',
        name: 'Hook',
        start: 16,
        length: 16,
        color: '#ec5b13',
      },
      {
        id: 'section-verse',
        name: 'Verse',
        start: 32,
        length: 16,
        color: '#00e5ff',
      },
      {
        id: 'section-outro',
        name: 'Outro',
        start: 48,
        length: 16,
        color: '#10b981',
      },
    ]);
    this.performerScenes.set(this.createDefaultScenes());
  }

  private hydrateProject(project: Partial<StudioProjectData>) {
    const normalizedTracks = Array.isArray(project.tracks)
      ? project.tracks.map((track, index) => this.normalizeTrack(track, index))
      : [];

    if (normalizedTracks.length === 0) {
      this.initializeDefaultProject();
      return;
    }

    this.tracks.set(normalizedTracks);
    this.selectedTrackId.set(
      normalizedTracks.some((track) => track.id === project.selectedTrackId)
        ? (project.selectedTrackId ?? normalizedTracks[0].id)
        : normalizedTracks[0].id
    );
    this.structure.set(
      Array.isArray(project.structure) && project.structure.length
        ? project.structure.map((section) => ({ ...section }))
        : this.createDefaultStructure()
    );
    this.performerScenes.set(this.normalizeScenes(project.performerScenes));
    this.activeLoopBars.set(
      Math.max(4, Math.round(project.activeLoopBars ?? 64))
    );
    if (typeof project.tempo === 'number') {
      this.engine.applyProductionParameter('0', 'tempo', project.tempo);
    }
    this.ensureDrumTrack();
  }

  private ensureDrumTrack() {
    const tracks = this.tracks();
    if (!tracks.some(t => t.id === MusicManagerService.DRUM_TRACK_ID)) {
      const id = MusicManagerService.DRUM_TRACK_ID;
      const color = '#ff4d4d'; // Kick red
      const patternSlots = this.createDefaultPatternSlots();
      const newTrack: TrackModel = {
        id,
        name: 'S.M.U.V.E. DRUMS',
        instrumentId: 'trap-808-elite',
        type: 'midi',
        color,
        notes: [],
        clips: [
          this.createDefaultClip(id, 'Drum Pattern', color, patternSlots[0].id)
        ],
        fxSlots: [],
        gain: 1.0,
        pan: 0,
        sendA: 0,
        sendB: 0,
        mute: false,
        solo: false,
        steps: this.createEmptySteps(),
        patternSlots,
        activePatternSlotId: patternSlots[0].id
      };
      this.tracks.update(t => [...t, newTrack]);
    }
  }

  ensureTrack(instrumentId: string) {
    const id = this.createTrack(instrumentId);
    if (this.selectedTrackId() === null) {
      this.selectedTrackId.set(id);
    }
    return id;
  }

  private createTrack(instrumentId: string) {
    const preset = this.instruments
      .getPresets()
      .find((candidate) => candidate.id === instrumentId);
    const id = this.generateTrackId();
    const color = this.getNextColor();
    const patternSlots = this.createDefaultPatternSlots();
    const activePatternSlotId = patternSlots[0].id;
    const newTrack: TrackModel = {
      id,
      name: preset?.name || 'New Track',
      instrumentId,
      type: 'midi',
      color,
      notes: [],
      clips: [
        this.createDefaultClip(
          id,
          patternSlots[0].name,
          color,
          activePatternSlotId
        ),
      ],
      fxSlots: [],
      gain: 0.8,
      pan: 0,
      sendA: 0,
      sendB: 0,
      mute: false,
      solo: false,
      steps: this.createEmptySteps(),
      synthParams: preset?.synth || {
        type: 'sine',
        attack: 0.1,
        decay: 0.2,
        sustain: 0.5,
        release: 1.0,
        cutoff: 2000,
        q: 1.0,
      },
      patternSlots,
      activePatternSlotId,
      automationLanes: [],
    };
    this.tracks.update((current) => [...current, newTrack]);
    return id;
  }

  private normalizeTrack(
    track: Partial<TrackModel>,
    index: number
  ): TrackModel {
    const id =
      typeof track.id === 'number' && Number.isFinite(track.id)
        ? track.id
        : this.generateTrackId(index);
    const color = track.color || this.getColorForIndex(index);
    const notes = this.cloneNotes(track.notes || []);
    const steps = this.normalizeSteps(track.steps);
    const patternSlots = this.normalizePatternSlots(
      track.patternSlots,
      notes,
      steps
    );
    const activePatternSlotId = this.resolveSlotId(
      patternSlots,
      track.activePatternSlotId
    );
    const activeVersion = this.getActivePatternVersion(
      patternSlots,
      activePatternSlotId
    );
    const normalizedNotes = activeVersion
      ? this.cloneNotes(activeVersion.notes)
      : notes;
    const normalizedSteps = activeVersion ? [...activeVersion.steps] : steps;

    return {
      id,
      name: track.name || `Track ${index + 1}`,
      instrumentId: track.instrumentId || 'grand-piano-v2',
      type: track.type || 'midi',
      color,
      notes: normalizedNotes,
      clips:
        track.clips && track.clips.length
          ? track.clips.map((clip, clipIndex) =>
              this.normalizeClip(clip, clipIndex, color, activePatternSlotId)
            )
          : [
              this.createDefaultClip(
                id,
                patternSlots[0].name,
                color,
                activePatternSlotId
              ),
            ],
      fxSlots: track.fxSlots || [],
      gain: track.gain ?? 0.8,
      pan: track.pan ?? 0,
      sendA: track.sendA ?? 0,
      sendB: track.sendB ?? 0,
      mute: !!track.mute,
      solo: !!track.solo,
      steps: normalizedSteps,
      stepVelocities: track.stepVelocities,
      qualityMode: track.qualityMode,
      audioBuffer: track.audioBuffer,
      synthParams: track.synthParams,
      sidechainTargetTrackId: track.sidechainTargetTrackId ?? null,
      patternSlots,
      activePatternSlotId,
      automationLanes: track.automationLanes || [],
    };
  }

  private normalizePatternSlots(
    slots: PatternSlot[] | undefined,
    fallbackNotes: TrackNote[],
    fallbackSteps: boolean[]
  ) {
    if (!Array.isArray(slots) || slots.length === 0) {
      const nextSlots = this.createDefaultPatternSlots();
      nextSlots[0].versions[0] = {
        ...nextSlots[0].versions[0],
        notes: this.cloneNotes(fallbackNotes),
        steps: [...fallbackSteps],
      };
      return nextSlots;
    }

    return slots.map((slot, index) => {
      const versions =
        Array.isArray(slot.versions) && slot.versions.length
          ? slot.versions.map((version, versionIndex) => ({
              id: version.id || `version-${index}-${versionIndex}`,
              name: version.name || `Take ${versionIndex + 1}`,
              notes: this.cloneNotes(version.notes || []),
              steps: this.normalizeSteps(version.steps),
            }))
          : [
              {
                id: `version-${index}-0`,
                name: 'Take 1',
                notes: index === 0 ? this.cloneNotes(fallbackNotes) : [],
                steps:
                  index === 0 ? [...fallbackSteps] : this.createEmptySteps(),
              },
            ];
      const activeVersionId = versions.some(
        (version) => version.id === slot.activeVersionId
      )
        ? slot.activeVersionId
        : versions[0].id;

      return {
        id: slot.id || `slot-${index}`,
        name: slot.name || `Slot ${index + 1}`,
        versions,
        activeVersionId,
      };
    });
  }

  private normalizeClip(
    clip: Partial<TrackClip>,
    index: number,
    color: string,
    fallbackSlotId: string
  ): TrackClip {
    return {
      id: clip.id || `clip-${Date.now()}-${index}`,
      start: Math.max(0, clip.start ?? 0),
      length: Math.max(
        0.25,
        clip.length ?? MusicManagerService.DEFAULT_CLIP_LENGTH_BARS
      ),
      name: clip.name || `Clip ${index + 1}`,
      type: clip.type || 'midi',
      color: clip.color || color,
      slotId: clip.slotId || fallbackSlotId,
    };
  }

  private normalizeScenes(scenes: PerformerScene[] | undefined) {
    const defaults = this.createDefaultScenes();
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return defaults;
    }

    return defaults.map((fallback, index) => ({
      ...fallback,
      ...scenes[index],
      slotId: scenes[index]?.slotId || fallback.slotId,
    }));
  }

  private createDefaultScenes() {
    return Array.from(
      { length: MusicManagerService.DEFAULT_SLOT_COUNT },
      (_, index) => ({
        id: `scene-${index}`,
        name: `Scene ${index + 1}`,
        color: this.getColorForIndex(index),
        slotId: `slot-${index}`,
      })
    );
  }

  private createDefaultStructure() {
    return [
      {
        id: 'section-intro',
        name: 'Intro',
        start: 0,
        length: 16,
        color: '#af25f4',
      },
      {
        id: 'section-hook',
        name: 'Hook',
        start: 16,
        length: 16,
        color: '#ec5b13',
      },
      {
        id: 'section-verse',
        name: 'Verse',
        start: 32,
        length: 16,
        color: '#00e5ff',
      },
      {
        id: 'section-outro',
        name: 'Outro',
        start: 48,
        length: 16,
        color: '#10b981',
      },
    ];
  }

  private createDefaultPatternSlots() {
    return Array.from(
      { length: MusicManagerService.DEFAULT_SLOT_COUNT },
      (_, index) => ({
        id: `slot-${index}`,
        name: `Slot ${index + 1}`,
        versions: [
          {
            id: `slot-${index}-version-0`,
            name: 'Take 1',
            steps: this.createEmptySteps(),
            notes: [],
          },
        ],
        activeVersionId: `slot-${index}-version-0`,
      })
    );
  }

  private createDefaultClip(
    trackId: number,
    slotName: string,
    color: string,
    slotId: string
  ): TrackClip {
    return {
      id: `clip-${trackId}-0`,
      start: 0,
      length: MusicManagerService.DEFAULT_CLIP_LENGTH_BARS,
      name: slotName,
      type: 'midi',
      color,
      slotId,
    };
  }

  private createEmptySteps() {
    return new Array(MusicManagerService.PATTERN_STEPS).fill(false);
  }

  private normalizeSteps(steps?: boolean[]) {
    return Array.from(
      { length: MusicManagerService.PATTERN_STEPS },
      (_, index) => !!steps?.[index]
    );
  }

  private cloneNotes(notes: TrackNote[]) {
    return (notes || []).map((note) => ({ ...note }));
  }

  private cloneTracks(tracks: TrackModel[]) {
    return tracks.map((track) => ({
      ...track,
      notes: this.cloneNotes(track.notes),
      clips: track.clips.map((clip) => ({ ...clip })),
      fxSlots: track.fxSlots.map((slot) => ({ ...slot })),
      steps: [...track.steps],
      patternSlots: (track.patternSlots || []).map((slot) => ({
        ...slot,
        versions: slot.versions.map((version) => ({
          ...version,
          steps: [...version.steps],
          notes: this.cloneNotes(version.notes),
        })),
      })),
      automationLanes: (track.automationLanes || []).map((lane) => ({
        ...lane,
        points: lane.points.map((point) => ({ ...point })),
      })),
    }));
  }

  private resolveSlotId(patternSlots: PatternSlot[], slotId?: string | null) {
    return patternSlots.some((slot) => slot.id === slotId)
      ? slotId || patternSlots[0].id
      : patternSlots[0].id;
  }

  private getActivePatternVersion(
    patternSlots: PatternSlot[] | undefined,
    slotId: string | null | undefined
  ) {
    const slot = (patternSlots || []).find(
      (candidate) => candidate.id === slotId
    );
    if (!slot) {
      return null;
    }

    return (
      slot.versions.find((version) => version.id === slot.activeVersionId) ||
      slot.versions[0]
    );
  }

  private persistActivePattern(track: TrackModel) {
    const patternSlots = (track.patternSlots || []).map((slot) => {
      if (slot.id !== track.activePatternSlotId) {
        return slot;
      }

      return {
        ...slot,
        versions: slot.versions.map((version) =>
          version.id === slot.activeVersionId
            ? {
                ...version,
                steps: [...track.steps],
                notes: this.cloneNotes(track.notes),
              }
            : version
        ),
      };
    });

    return {
      ...track,
      patternSlots,
    };
  }

  private getSlotName(track: TrackModel, slotId: string) {
    return (
      track.patternSlots?.find((slot) => slot.id === slotId)?.name || 'Pattern'
    );
  }

  private getNextClipStart(track: TrackModel) {
    return track.clips.reduce(
      (max, clip) => Math.max(max, clip.start + clip.length),
      0
    );
  }

  private getTrackColorForId(trackId: number) {
    return (
      this.tracks().find((track) => track.id === trackId)?.color ||
      this.getNextColor()
    );
  }

  private generateTrackId(seed = 0) {
    const maxId = this.tracks().reduce(
      (max, track) => Math.max(max, track.id),
      Date.now() + seed
    );
    return maxId + 1;
  }

  private getNextColor(): string {
    return this.getColorForIndex(this.tracks().length);
  }

  private getColorForIndex(index: number): string {
    const colors = [
      '#af25f4',
      '#ec5b13',
      '#00e5ff',
      '#10b981',
      '#f59e0b',
      '#f43f5e',
    ];
    return colors[index % colors.length];
  }

  removeTrack(id: number) {
    this.tracks.update((tracks) => tracks.filter((track) => track.id !== id));
    if (this.selectedTrackId() === id) {
      this.selectedTrackId.set(this.tracks()[0]?.id || null);
    }
  }

  toggleStep(trackId: number, step: number) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        const steps = [...track.steps];
        steps[step] = !steps[step];
        return this.persistActivePattern({
          ...track,
          steps,
        });
      })
    );
  }

  addNoteToTrack(trackId: number, note: Partial<TrackNote>): string | undefined {
    let createdNoteId: string | undefined;
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        const newNote: TrackNote = {
          id: `note-${Date.now()}-${Math.random()}`,
          midi: note.midi || 60,
          step: note.step || 0,
          length: note.length || 1,
          velocity: note.velocity || 0.8,
          ...note,
        };
        createdNoteId = newNote.id;
        const nextTrack = {
          ...track,
          notes: [...track.notes, newNote],
        };
        return this.persistActivePattern(nextTrack);
      })
    );
    return createdNoteId;
  }

  removeNotes(trackId: number, noteIds: string[]) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        const nextTrack = {
          ...track,
          notes: track.notes.filter((note) => !noteIds.includes(note.id)),
        };
        return this.persistActivePattern(nextTrack);
      })
    );
  }

      addClipToTrack(trackId: number, clip: Partial<TrackClip> = {}) {
    const track = this.tracks().find((candidate) => candidate.id === trackId);
    if (!track) return;
    const slotId = clip.slotId || track.activePatternSlotId || 'slot-0';
    const nextClip: TrackClip = {
      id: clip.id || 'clip-' + trackId + '-' + Date.now(),
      start: Math.max(0, clip.start ?? this.getNextClipStart(track)),
      length: Math.max(0.25, clip.length ?? MusicManagerService.DEFAULT_CLIP_LENGTH_BARS),
      name: clip.name || this.getSlotName(track, slotId),
      type: clip.type || 'midi',
      color: clip.color || track.color,
      slotId,
    };
    this.tracks.update((tracks) =>
      tracks.map((candidate) => candidate.id === trackId ? { ...candidate, clips: [...candidate.clips, nextClip] } : candidate)
    );
  }

  updateClip(trackId: number, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch, start: Math.max(0, patch.start ?? clip.start), length: Math.max(0.25, patch.length ?? clip.length) } : clip),
        };
      })
    );
  }

  moveClip(fromTrackId: number, toTrackId: number, clipId: string, patch: Partial<TrackClip>) {
    let movingClip: any = null;
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id === fromTrackId) {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) {
          movingClip = { ...clip, ...patch };
          return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
        }
      }
      return t;
    }));
    if (movingClip) {
      this.tracks.update(tracks => tracks.map(t => {
        if (t.id === toTrackId) return { ...t, clips: [...t.clips, movingClip] };
        return t;
      }));
    }
  }

  splitClip(trackId: number, clipId: string, splitBar: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const clipIndex = t.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return t;
      const clip = t.clips[clipIndex];
      if (splitBar <= clip.start || splitBar >= clip.start + clip.length) return t;
      const firstPart = { ...clip, length: splitBar - clip.start };
      const secondPart = { ...clip, id: 'clip-' + trackId + '-' + Date.now(), start: splitBar, length: clip.length - (splitBar - clip.start) };
      const nextClips = [...t.clips];
      nextClips.splice(clipIndex, 1, firstPart, secondPart);
      return { ...t, clips: nextClips };
    }));
  }

  toggleMute(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, mute: !t.mute } : t));
  }

  toggleSolo(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, solo: !t.solo } : t));
  }

  setInstrument(trackId: number, instrumentId: string) {
    const preset = this.instruments.getPresets().find(p => p.id === instrumentId);
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, instrumentId, name: preset?.name || t.name, synthParams: preset?.synth || t.synthParams };
    }));
  }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, synthParams: { ...(t.synthParams || {}), ...params } } : t));
  }

  setSidechain(trackId: number, targetId: string | null) {
    this.tracks.update(tracks => tracks.map(t => t.id === trackId ? { ...t, sidechainTargetTrackId: targetId } : t));
    if (targetId) this.engine.connectSidechain(trackId.toString(), targetId);
  }

  quantizeTrack(trackId: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({ ...t, notes: t.notes.map(n => ({ ...n, step: Math.round(n.step) })) });
    }));
  }

  humanizeTrack(trackId: number, intensity: number = 0.08) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => ({
          ...n,
          step: n.step + (Math.random() - 0.5) * intensity,
          velocity: Math.max(0.1, Math.min(1.2, n.velocity + (Math.random() - 0.5) * intensity * 2)),
          offset: (n.offset || 0) + (Math.random() - 0.5) * 0.02
        }))
      });
    }));
  }

  arpeggiateTrack(trackId: number, pattern: number[] = [0, 4, 7, 12]) {
    this.tracks.update(tracks => tracks.map(track => {
      if (track.id !== trackId) return track;
      const sortedNotes = [...track.notes].sort((a, b) => a.step - b.step);
      if (sortedNotes.length === 0) return track;
      const nextNotes: any[] = [];
      sortedNotes.forEach(note => {
        pattern.forEach((interval, j) => {
          nextNotes.push({ ...note, id: 'arp-' + note.id + '-' + j, midi: note.midi + interval, step: note.step + (j * 0.25), length: 0.2 });
        });
      });
      return this.persistActivePattern({ ...track, notes: nextNotes });
    }));
  }

  strumTrack(trackId: number, strength: number = 0.05) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const grouped = new Map();
      t.notes.forEach(n => {
        if (!grouped.has(n.step)) grouped.set(n.step, []);
        grouped.get(n.step).push(n);
      });
      return this.persistActivePattern({
        ...t,
        notes: t.notes.map(n => {
          const chord = grouped.get(n.step) || [];
          if (chord.length <= 1) return n;
          const index = [...chord].sort((a, b) => a.midi - b.midi).findIndex(c => c.id === n.id);
          return { ...n, step: n.step + index * strength };
        })
      });
    }));
  }

  setNoteParam(trackId: number, noteId: string, param: string, value: any) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return this.persistActivePattern({ ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, [param]: value } : n) });
    }));
  }

  duplicateNotes(trackId: number, noteIds: string[], stepOffset: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const notesToDuplicate = t.notes.filter(n => noteIds.includes(n.id));
      return this.persistActivePattern({
        ...t,
        notes: [...t.notes, ...notesToDuplicate.map(n => ({ ...n, id: 'note-' + Date.now() + '-' + Math.random(), step: n.step + stepOffset }))]
      });
    }));
  }

  recordLiveNote(midi: number, velocity: number): string | undefined {
    const selectedId = this.selectedTrackId();
    if (!selectedId || !this.audioSession.isRecording()) return undefined;
    const currentStepValue = Math.floor(this.engine.currentBeat() * this.engine.stepsPerBeat()) % MusicManagerService.PATTERN_STEPS;
    const noteId = 'note-' + Date.now() + '-' + Math.random();
    this.addNoteToTrack(selectedId, { id: noteId, midi, step: currentStepValue, length: 0.1, velocity });
    return noteId;
  }

  midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setActivePatternSlot(trackId: number, slotId: string) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId || !track.patternSlots?.length) return track;
        const persistedTrack = this.persistActivePattern(track);
        const nextVersion = this.getActivePatternVersion(persistedTrack.patternSlots, slotId);
        if (!nextVersion) return persistedTrack;
        return {
          ...persistedTrack,
          activePatternSlotId: slotId,
          notes: this.cloneNotes(nextVersion.notes),
          steps: [...nextVersion.steps],
        };
      })
    );
  }

  playStep(step: number, time: number, duration: number, customCtx?: any) {
    this.currentStep.set(step);
    const hasSoloTrack = this.tracks().some((track) => track.solo);
    this.tracks().forEach((track) => {
      if (track.mute || (hasSoloTrack && !track.solo)) return;
      const clips = track.clips.length ? track.clips : [
        this.createDefaultClip(track.id, this.getSlotName(track, track.activePatternSlotId || track.patternSlots?.[0]?.id || 'slot-0'), track.color, track.activePatternSlotId || track.patternSlots?.[0]?.id || 'slot-0')
      ];
      const slotLookups = new Map();
      const notesToPlay: any[] = [];
      clips.forEach((clip) => {
        const slotId = clip.slotId || track.activePatternSlotId;
        const version = this.getActivePatternVersion(track.patternSlots, slotId);
        if (!version) return;
        const lookupKey = slotId || 'active-slot';
        let noteLookup = slotLookups.get(lookupKey);
        if (!noteLookup) {
          noteLookup = new Map();
          version.notes.forEach((note) => {
            const noteStep = Math.floor(note.step);
            if (!noteLookup.has(noteStep)) noteLookup.set(noteStep, []);
            noteLookup.get(noteStep).push(note);
          });
          slotLookups.set(lookupKey, noteLookup);
        }
        const clipStartStep = Math.round(clip.start * MusicManagerService.STEPS_PER_BAR);
        const clipLengthSteps = Math.max(1, Math.round(clip.length * MusicManagerService.STEPS_PER_BAR));
        const clipRelativeStep = step - clipStartStep;
        if (clipRelativeStep >= 0 && clipRelativeStep < clipLengthSteps) {
          (noteLookup.get(clipRelativeStep % MusicManagerService.PATTERN_STEPS) || []).forEach(n => notesToPlay.push(n));
        }
      });
      notesToPlay.forEach((note) => {
        const freq = this.midiToFreq(note.midi);
        const synthParams = { ...(track.synthParams || { type: 'sine' }), ...(note.cutoff ? { cutoff: note.cutoff } : {}) };
        this.engine.triggerAttack(track.id, freq, time, note.velocity, note.length * duration, track.gain, note.pan ?? track.pan, track.sendA, track.sendB, synthParams, 1, customCtx);
      });
    });
  }

  addAutomationLane(trackId: number, parameter: string) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) return track;
        const lanes = track.automationLanes || [];
        return { ...track, automationLanes: [...lanes, { id: 'lane-' + Date.now(), parameter, points: [], enabled: true }] };
      })
    );
  }

  importAudioTrack() { this.logger.info('Importing audio track...'); }
}
