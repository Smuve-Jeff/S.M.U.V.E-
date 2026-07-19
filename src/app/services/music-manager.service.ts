import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { ProjectService } from './project.service';
import { HistoryService } from './history.service';
import { InstrumentsService } from './instruments.service';
import { StemSeparationService } from './stem-separation.service';
import { IdeaRecipe } from './ideas-generator.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { LoggingService } from './logging.service';
import {
  Project,
  StudioTrack,
  StudioClip,
  StudioTake,
  TrackType,
} from '../types/studio.types';

export interface TrackNote {
  id: string;
  midi: number;
  step: number;
  length: number;
  velocity: number;
  params?: any;
  probability?: number;
  isSlide?: boolean;
}

export interface FxSlot {
  id: string;
  type: string;
  params: any;
  enabled: boolean;
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
  activeVersionId: string;
  versions: PatternVersion[];
}

export interface SongSection {
  id: string;
  name: string;
  start: number;
  length: number;
  color?: string;
}

export interface PerformerScene {
  id: string;
  name: string;
  color: string;
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
  /** Pro: Phase inversion state */
  phaseInvert?: boolean;
  /** Pro: Stereo Width / Pan amount (-1..1) */
  stereoWidth?: number;
  /** Pro: Map of auxBusId -> level (0..1) */
  auxSends?: Record<string, number>;
  activePatternSlotId?: string | null;
  patternSlots?: PatternSlot[];
  swingAmount?: number;
  collapsed?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MusicManagerService {
  public static readonly DRUM_TRACK_ID = 'track_drums_100';

  public engine = inject(AudioEngineService);
  public activePatternSlotId = signal('slot-0');
  public patternSlots = signal([{ id: 'slot-0', name: 'Pattern 1' }]);

  private projectService = inject(ProjectService);
  private history = inject(HistoryService);
  private instruments = inject(InstrumentsService);
  private recordingEngine = inject(StudioRecordingEngineService);
  private stemSplitter = inject(StemSeparationService);
  private logger = inject(LoggingService);

  /**
   * AudioBuffer cache for stem-derived audio clips.
   *
   * `clone()` (used by HistoryService via JSON.parse/stringify) destroys
   * AudioBuffers because they're not JSON-serializable. Storing the raw
   * buffers here — keyed by clip id — keeps them alive across undo/redo.
   */
  public stemAudioCache = new Map<string, AudioBuffer>();

  tracks = signal<TrackModel[]>([]);
  selectedTrackId = signal<string | null>(null);
  currentStep = signal(0);
  activeSceneId = signal<string | null>(null);
  takesExpanded = signal<Record<string, boolean>>({});

  /**
   * Cross-link request: one component (Arrangement, DrumMachine) asks the
   * Studio shell to jump into another view (typically piano-roll) with a
   * specific track selected and an optional note range to spotlight.
   *
   * The `timestamp` lets observers dedupe / detect newly emitted
   * requests without comparing deep object identity.
   */
  crossLinkRequest = signal<{
    view: 'piano-roll';
    trackId: string;
    noteRange?: { startStep: number; endStep: number };
    label?: string;
    timestamp: number;
  } | null>(null);

  requestCrossLink(req: {
    view: 'piano-roll';
    trackId: string;
    noteRange?: { startStep: number; endStep: number };
    label?: string;
  }) {
    this.crossLinkRequest.set({ ...req, timestamp: Date.now() });
  }

  clearCrossLink() {
    this.crossLinkRequest.set(null);
  }

  activeLoopBars = signal(64);
  structure = signal<SongSection[]>([]);
  performerScenes = signal<PerformerScene[]>([]);
  projectLoaded = signal(true);

  selectedTrack = computed(
    () => this.tracks().find((t) => t.id === this.selectedTrackId()) || null
  );

  constructor() {
    this.setupProjectSync();
    this.engine.onScheduleStep = (step, time, duration) => {
      this.currentStep.set(step);
      this.playStep(step, time, duration);
    };
  }

  private setupProjectSync() {
    effect(
      () => {
        const project = this.projectService.currentProject();
        if (project && this.tracks().length === 0) {
          this.tracks.set((project.tracks || []) as any);
          this.engine.tempo.set(project.bpm || 120);
          this.history.clear();
        }
      },
      { allowSignalWrites: true }
    );
  }

  // ── History-aware mutation primitives ──────────────────────────────

  /** Run a regular (non-coalesced) reversible command. */
  private runCommand(name: string, execute: () => void, undo: () => void) {
    this.history.execute({ name, execute, undo });
  }

  /** Run a coalesced command — merges with previous on matching mergeKey. */
  private runMerge(
    mergeKey: string,
    name: string,
    execute: () => void,
    undo: () => void
  ) {
    this.history.coalesce({ name, execute, undo, mergeKey });
  }

  /** Deep-clone plain-object arrays (notes, clips, tracks). */
  private clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  /** Default one-slot pattern rack attached to a fresh track. */
  private createDefaultSlots(): PatternSlot[] {
    return [
      {
        id: 'slot-0',
        name: 'Pattern 1',
        activeVersionId: 'v1',
        versions: [
          {
            id: 'v1',
            name: 'v1',
            steps: new Array(64).fill(false),
            notes: [],
          },
        ],
      },
    ];
  }

  // ── Project lifecycle ──────────────────────────────────────────────

  newProject(skipDefaults = false) {
    const oldTracks = this.clone(this.tracks());
    const oldSelected = this.selectedTrackId();
    this.runCommand(
      'New Project',
      () => {
        this.tracks.set([]);
        this.selectedTrackId.set(null);
        this.engine.stop();
        if (!skipDefaults) {
          this.addTrack('Piano', 'grand-piano');
          this.addTrack('Drums', 'trap-808-elite', 'drum');
        }
      },
      () => {
        this.tracks.set(this.clone(oldTracks));
        this.selectedTrackId.set(oldSelected);
      }
    );
    this.history.clear();
  }

  loadProject(snapshot: any) {
    if (!snapshot) return;
    this.logger.info('Loading project snapshot...');
    this.history.clear();
  }

  // ── Tracks ─────────────────────────────────────────────────────────

  addTrack(name: string, instrumentId: string, type: TrackType = 'midi') {
    const id = instrumentId.includes('drum')
      ? MusicManagerService.DRUM_TRACK_ID
      : 'track_' + Date.now() + Math.random();
    const preset = this.instruments
      .getPresets()
      .find((p) => p.id === instrumentId);

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
      fxSlots: [{ id: 'fx1', type: 'Reverb', params: {}, enabled: true }],
      sendA: 0,
      sendB: 0,
      color: '#af25f4',
      synthParams: preset?.synth || { type: 'sine' },
      effects: [],
      patternSlots: this.createDefaultSlots(),
      activePatternSlotId: 'slot-0',
    };

    this.tracks.update((ts) => [...ts, newTrack]);
    this.selectedTrackId.set(id);
    return id;
  }

  removeTrack(id: string) {
    const list = this.tracks();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const snapshot = this.clone(list[idx]);
    const prevSelected = this.selectedTrackId();
    this.runCommand(
      'Remove Track · ' + snapshot.name,
      () => {
        this.tracks.update((ts) => ts.filter((t) => t.id !== id));
        if (this.selectedTrackId() === id) this.selectedTrackId.set(null);
      },
      () => {
        this.tracks.update((ts) => {
          const next = [...ts];
          next.splice(idx, 0, snapshot);
          return next;
        });
        this.selectedTrackId.set(prevSelected);
      }
    );
  }

  setInstrument(trackId: string, instId: string) {
    const t = this.tracks().find((x) => x.id === trackId);
    if (!t) return;
    const oldInstrument = t.instrumentId;
    const oldSynth = this.clone(t.synthParams);
    const preset = this.instruments.getPresets().find((p) => p.id === instId);
    this.runCommand(
      'Switch Instrument · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  instrumentId: instId,
                  synthParams: preset?.synth || x.synthParams,
                }
              : x
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? { ...x, instrumentId: oldInstrument, synthParams: oldSynth }
              : x
          )
        );
      }
    );
  }

  // ── Notes ──────────────────────────────────────────────────────────

  addNoteToTrack(trackId: string, note: TrackNote) {
    const noteClone = this.clone(note);
    this.runCommand(
      'Add Note · ' + note.midi,
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId ? { ...t, notes: [...t.notes, noteClone] } : t
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId
              ? { ...t, notes: t.notes.filter((n) => n.id !== noteClone.id) }
              : t
          )
        );
      }
    );
  }

  removeNotes(trackId: string, noteIds: string[]) {
    const track = this.tracks().find((t) => t.id === trackId);
    if (!track || noteIds.length === 0) return;
    const removed = this.clone(
      track.notes.filter((n) => noteIds.includes(n.id))
    );
    this.runCommand(
      'Delete ' + noteIds.length + ' Note' + (noteIds.length === 1 ? '' : 's'),
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId
              ? { ...t, notes: t.notes.filter((n) => !noteIds.includes(n.id)) }
              : t
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId ? { ...t, notes: [...t.notes, ...removed] } : t
          )
        );
      }
    );
  }

  updateNote(trackId: string, noteId: string, patch: Partial<TrackNote>) {
    const t = this.tracks().find((x) => x.id === trackId);
    const note = t?.notes.find((n) => n.id === noteId);
    if (!note) return;
    const prev = this.clone(note);
    const next = { ...note, ...patch };
    this.runCommand(
      'Edit Note · ' + next.midi,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  notes: x.notes.map((n) =>
                    n.id === noteId ? { ...n, ...patch } : n
                  ),
                }
              : x
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  notes: x.notes.map((n) =>
                    n.id === noteId ? prev : n
                  ),
                }
              : x
          )
        );
      }
    );
  }

  duplicateNotes(trackId: string, ids: string[], offset: number) {
    const t = this.tracks().find((x) => x.id === trackId);
    if (!t) return;
    const sources = t.notes.filter((n) => ids.includes(n.id));
    const dupes = sources.map((n) => ({
      ...this.clone(n),
      id: 'note-' + Date.now() + '-' + Math.random(),
      step: n.step + offset,
    }));
    this.runCommand(
      'Duplicate ' + dupes.length + ' Note' + (dupes.length === 1 ? '' : 's'),
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId ? { ...x, notes: [...x.notes, ...dupes] } : x
          )
        );
      },
      () => {
        const dupeIds = new Set(dupes.map((d) => d.id));
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? { ...x, notes: x.notes.filter((n) => !dupeIds.has(n.id)) }
              : x
          )
        );
      }
    );
  }

  applyChordStamp(
    trackId: string,
    baseMidi: number,
    step: number,
    chordType: string
  ) {
    const intervals: Record<string, number[]> = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      maj7: [0, 4, 7, 11],
      min7: [0, 3, 7, 10],
      dom7: [0, 4, 7, 10],
      sus4: [0, 5, 7],
    };
    const offsets = intervals[chordType] || [0];
    const stamped: TrackNote[] = offsets.map((interval) => ({
      id: 'chord_' + Date.now() + '_' + interval,
      midi: baseMidi + interval,
      step,
      length: 1,
      velocity: 0.8,
    }));
    this.runCommand(
      'Stamp Chord · ' + chordType,
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId
              ? { ...t, notes: [...t.notes, ...stamped.map((n) => this.clone(n))] }
              : t
          )
        );
      },
      () => {
        const stampedIds = new Set(stamped.map((n) => n.id));
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: t.notes.filter((n) => !stampedIds.has(n.id)),
                }
              : t
          )
        );
      }
    );
  }

  recordLiveNote(midi: number, velocity: number) {
    // Reads selection-time state — wraps a single addNoteToTrack as history step
    const trackId = this.selectedTrackId();
    if (!trackId) return;
    this.addNoteToTrack(trackId, {
      id: 'rec_' + Date.now(),
      midi,
      step: this.engine.visualStep() % 64,
      length: 1,
      velocity,
    });
  }

  // ── Mixer (mute / solo / volume / pan / sends) ──────────────────────

  toggleMute(id: string) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const wasMuted = !!t.muted;
    this.runCommand(
      (wasMuted ? 'Unmute · ' : 'Mute · ') + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, muted: !x.muted } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, muted: wasMuted } : x))
        );
      }
    );
  }

  toggleSolo(id: string) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const wasSoloed = !!t.soloed;
    this.runCommand(
      (wasSoloed ? 'Unsolo · ' : 'Solo · ') + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, soloed: !x.soloed } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, soloed: wasSoloed } : x))
        );
      }
    );
  }

  updateVolume(id: string, vol: number) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const oldGain = t.gain;
    const newGain = Math.max(0, Math.min(1.5, vol));
    // Coalesce: consecutive fader moves on the same track collapse to one
    // undo step that rewinds to the original pre-drag volume.
    this.runMerge(
      'volume:' + id,
      'Set Volume · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === id
              ? { ...x, gain: newGain, volume: newGain }
              : x
          )
        );
        this.engine.updateTrack(id, { gain: newGain });
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === id ? { ...x, gain: oldGain, volume: oldGain } : x
          )
        );
        this.engine.updateTrack(id, { gain: oldGain });
      }
    );
  }

  updateTrackPan(id: string, val: number) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const oldPan = t.pan;
    const newPan = Math.max(-1, Math.min(1, val / 100));
    this.runMerge(
      'pan:' + id,
      'Set Pan · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, pan: newPan } : x))
        );
        this.engine.updateTrack(id, { pan: newPan });
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, pan: oldPan } : x))
        );
        this.engine.updateTrack(id, { pan: oldPan });
      }
    );
  }

  togglePhase(id: string) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const inverted = !t.phaseInvert;
    this.tracks.update((ts) =>
      ts.map((x) => (x.id === id ? { ...x, phaseInvert: inverted } : x))
    );
    this.engine.updateTrack(id, { phaseInvert: inverted });
  }

  updateStereoWidth(id: string, val: number) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const width = Math.max(-1, Math.min(1, val / 100));
    this.tracks.update((ts) =>
      ts.map((x) => (x.id === id ? { ...x, stereoWidth: width } : x))
    );
    this.engine.updateTrack(id, { pan: width }); // Reusing pan node for simple implementation
  }

  updateSend(id: string, send: 'A' | 'B', value: number) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const oldSend = send === 'A' ? t.sendA : t.sendB;
    const newSend = Math.max(0, Math.min(1, value));
    this.runMerge(
      'send' + send + ':' + id,
      'Set Send ' + send + ' · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            send === 'A'
              ? x.id === id
                ? { ...x, sendA: newSend }
                : x
              : x.id === id
                ? { ...x, sendB: newSend }
                : x
          )
        );
        this.engine.updateTrack(
          id,
          send === 'A' ? { sendA: newSend } : { sendB: newSend }
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            send === 'A'
              ? x.id === id
                ? { ...x, sendA: oldSend }
                : x
              : x.id === id
                ? { ...x, sendB: oldSend }
                : x
          )
        );
        this.engine.updateTrack(
          id,
          send === 'A' ? { sendA: oldSend } : { sendB: oldSend }
        );
      }
    );
  }

  updateSynthParams(trackId: string, params: any) {
    const t = this.tracks().find((x) => x.id === trackId);
    if (!t) return;
    const oldParams = this.clone(t.synthParams);
    const newParams = { ...t.synthParams, ...params };
    this.runCommand(
      'Edit Synth · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId ? { ...x, synthParams: newParams } : x
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId ? { ...x, synthParams: oldParams } : x
          )
        );
      }
    );
  }

  // ── Clips ──────────────────────────────────────────────────────────

  addClipToTrack(trackId: string, clip: Partial<StudioClip>) {
    const newClip: StudioClip = {
      id: 'clip_' + Date.now(),
      start: 0,
      length: 4,
      name: 'Clip',
      type: 'midi',
      ...clip,
    };
    const clipClone = this.clone(newClip);
    this.runCommand(
      'Add Clip · ' + clipClone.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId ? { ...t, clips: [...t.clips, clipClone] } : t
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId
              ? { ...t, clips: t.clips.filter((c) => c.id !== clipClone.id) }
              : t
          )
        );
      }
    );
  }

  updateClip(trackId: string, clipId: string, patch: Partial<StudioClip>) {
    const t = this.tracks().find((x) => x.id === trackId);
    const clip = t?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const prev = this.clone(clip);
    this.runCommand(
      'Edit Clip · ' + (patch.name || clip.name),
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  clips: x.clips.map((c) =>
                    c.id === clipId ? { ...c, ...patch } : c
                  ),
                }
              : x
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  clips: x.clips.map((c) =>
                    c.id === clipId ? prev : c
                  ),
                }
              : x
          )
        );
      }
    );
  }

  removeClip(trackId: string, clipId: string) {
    const t = this.tracks().find((x) => x.id === trackId);
    const clip = t?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const snapshot = this.clone(clip);
    this.runCommand(
      'Remove Clip · ' + clip.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? { ...x, clips: x.clips.filter((c) => c.id !== clipId) }
              : x
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId ? { ...x, clips: [...x.clips, snapshot] } : x
          )
        );
      }
    );
  }

  splitClip(trackId: string, clipId: string, bar: number) {
    const t = this.tracks().find((x) => x.id === trackId);
    const clip = t?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const original = this.clone(clip);
    const first = this.clone({
      ...clip,
      length: bar - clip.start,
    });
    const secondId = 'clip_' + Date.now() + '_b';
    const second = this.clone({
      ...clip,
      id: secondId,
      start: bar,
      length: clip.length - (bar - clip.start),
    });
    this.runCommand(
      'Split Clip · ' + clip.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => {
            if (x.id !== trackId) return x;
            return {
              ...x,
              clips: [
                ...x.clips.filter((c) => c.id !== clipId),
                first,
                second,
              ],
            };
          })
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) =>
            x.id === trackId
              ? {
                  ...x,
                  clips: [
                    ...x.clips.filter(
                      (c) => c.id !== secondId
                    ),
                    original,
                  ],
                }
              : x
          )
        );
      }
    );
  }

  // ── Bulk-mutate current notes (array wholesale replace for clean undo) ─

  quantizeTrack(id: string, noteIds?: string[]) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const before = this.clone(t.notes);
    const after = t.notes.map((n) =>
      noteIds && !noteIds.includes(n.id)
        ? n
        : { ...n, step: Math.round(n.step) }
    );
    this.runCommand(
      'Quantize · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: after } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: before } : x))
        );
      }
    );
  }

  humanizeTrack(id: string, noteIds?: string[]) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const before = this.clone(t.notes);
    const after = t.notes.map((n) =>
      noteIds && !noteIds.includes(n.id)
        ? n
        : {
            ...n,
            step: n.step + (Math.random() - 0.5) * 0.1,
            velocity: Math.max(
              0.1,
              Math.min(1, n.velocity + (Math.random() - 0.5) * 0.2)
            ),
          }
    );
    this.runCommand(
      'Humanize · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: after } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: before } : x))
        );
      }
    );
  }

  strumTrack(id: string, noteIds?: string[]) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const before = this.clone(t.notes);
    const sortedAsc = [...t.notes].sort((a, b) => a.midi - b.midi);
    const targetIds = noteIds ?? sortedAsc.map((n) => n.id);
    const targets = sortedAsc.filter((n) => targetIds.includes(n.id));
    const { step: _ignored, ...rest } = targets[0] ?? { step: 0 };
    const after = t.notes.map((n) => {
      if (!targetIds.includes(n.id)) return n;
      const idx = targets.indexOf(n);
      return { ...n, step: n.step + idx * 0.02 };
    });
    this.runCommand(
      'Strum · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: after } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: before } : x))
        );
      }
    );
  }

  arpeggiateTrack(id: string, noteIds?: string[]) {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return;
    const before = this.clone(t.notes);
    const targetIds = new Set(noteIds ?? t.notes.map((n) => n.id));
    const targets = t.notes.filter((n) => targetIds.has(n.id));
    const others = t.notes.filter((n) => !targetIds.has(n.id));
    if (targets.length === 0) return;
    const arpNotes: TrackNote[] = [];
    targets.forEach((base) => {
      [0, 4, 7, 12].forEach((v, i) => {
        arpNotes.push({
          ...this.clone(base),
          id: `arp_${base.id}_${i}_${Date.now()}`,
          midi: base.midi + v,
          step: base.step + i * 0.25,
          length: 0.25,
        });
      });
    });
    const arpIds = new Set(arpNotes.map((n) => n.id));
    const after = [...others, ...arpNotes];
    this.runCommand(
      'Arpeggiate · ' + t.name,
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: after } : x))
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((x) => (x.id === id ? { ...x, notes: before } : x))
        );
      }
    );
  }

  // ── Pattern slots / scenes / takes (kept lightweight) ─────────────

  setActivePatternSlotId(id: string) {
    this.activePatternSlotId.set(id);
  }

  addPatternSlot() {
    const id = 'slot-' + Date.now();
    this.patternSlots.update((ps) => [
      ...ps,
      { id, name: 'Pattern ' + (ps.length + 1) },
    ]);
  }

  setActivePatternSlot(trackId: string, slotId: string) {
    this.runCommand(
      'Switch Pattern Slot',
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId ? { ...t, activePatternSlotId: slotId } : t
          )
        );
      },
      () => {
        this.tracks.update((ts) =>
          ts.map((t) =>
            t.id === trackId ? { ...t, activePatternSlotId: t.activePatternSlotId } : t
          )
        );
      }
    );
  }

  // ── Routing / bus (not history-tracked; they're a UX affordance) ──

  setTrackBus(trackId: string, busId: string | undefined) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, busId } : t))
    );
    this.engine.updateTrack(trackId, { busId });
  }

  setPadRouting(padId: string, busId: string) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === MusicManagerService.DRUM_TRACK_ID) {
          const newPads =
            (t as any).pads?.map((p: any) =>
              p.id === padId ? { ...p, busId } : p
            ) || [];
          return { ...t, pads: newPads };
        }
        return t;
      })
    );
  }

  updateDrumSwing(amount: number) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === MusicManagerService.DRUM_TRACK_ID) {
          return { ...t, swingAmount: amount };
        }
        return t;
      })
    );
  }

  // ── Misc helpers (non-history) ────────────────────────────────────

  ensureTrack(instrumentId: string) {
    const existing = this.tracks().find((t) => t.instrumentId === instrumentId);
    if (!existing) {
      return this.addTrack('New ' + instrumentId, instrumentId);
    }
    return existing.id;
  }

  snapshotProject(): Project | null {
    const current = this.projectService.currentProject();
    if (!current) return null;
    return {
      ...current,
      tracks: this.tracks() as any,
      bpm: this.engine.tempo(),
      updatedAt: Date.now(),
    };
  }

  importProject(file: File) {
    if (!file) return;
    const oldTracks = this.clone(this.tracks());
    const oldBpm = this.engine.tempo();
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = JSON.parse(e.target.result);
        this.runCommand(
          'Import Project',
          () => {
            if (data.tracks) this.tracks.set(data.tracks);
            if (data.bpm) this.engine.tempo.set(data.bpm);
          },
          () => {
            this.tracks.set(this.clone(oldTracks));
            this.engine.tempo.set(oldBpm);
          }
        );
      } catch (err) {
        console.error('Import failed', err);
      }
    };
    reader.readAsText(file);
  }

  launchScene(id: string) {
    this.activeSceneId.set(id);
  }
  promoteTakeRegion(t: string, c: string, r: any) {}
  async bounceTrack(id: string) {
    this.logger.info('Bouncing track...');
  }

  importAudio() {
    this.logger.info('Importing audio track...');
  }
  startRecording() {
    this.recordingEngine.startRecording();
  }
  stopRecording(id: string) {
    this.recordingEngine.stopRecording();
    return Promise.resolve(null);
  }

  addAutomationLane(trackId: string, param: string) {
    this.logger.info(`Added automation lane for ${param}`);
  }

  // ── Generated recipes (blank-canvas killer) ───────────────────────

  /**
   * One-tap setup: snapshot current state, wipe, populate with the recipe's
   * curated tracks + drum steps + bpm. Single reversible history step.
   */
  applyGeneratedRecipe(recipe: IdeaRecipe): void {
    const beforeTracks = this.clone(this.tracks());
    const beforeBpm = this.engine.tempo();
    const beforeSel = this.selectedTrackId();

    // Build all new tracks in memory first.
    const newTracks: TrackModel[] = [];
    const stepsByTrack = new Map<string, boolean[]>();
    recipe.tracks.forEach((rt) => {
      const built = this.buildRecipeTrack(rt);
      newTracks.push(built);
      if (rt.drum) {
        stepsByTrack.set(
          built.id,
          this.expandDrumPattern(rt.drum.kick, rt.drum.snare, rt.drum.hat)
        );
      }
    });
    // Apply drum steps for tracks that have a drum pattern.
    if (stepsByTrack.size) {
      newTracks.forEach((t) => {
        const steps = stepsByTrack.get(t.id);
        if (steps) t.steps = steps;
      });
    }

    const setTempo = (bpm: number) => this.engine.tempo.set(bpm);
    const restore = () => {
      this.stemAudioCache.clear();
      this.tracks.set(this.clone(beforeTracks));
      this.selectedTrackId.set(beforeSel);
      setTempo(beforeBpm);
    };

    this.history.execute({
      name: 'Generate · ' + recipe.name,
      execute: () => {
        this.tracks.set(newTracks);
        this.selectedTrackId.set(newTracks[0]?.id ?? null);
        setTempo(recipe.bpm);
      },
      undo: restore,
    });
  }

  /** Build a `TrackModel` matching addTrack()'s shape, from a recipe track. */
  private buildRecipeTrack(rt: {
    name: string;
    instrumentId: string;
    notes: IdeaRecipe['tracks'][0]['notes'];
  }): TrackModel {
    const id = rt.instrumentId.includes('drum')
      ? MusicManagerService.DRUM_TRACK_ID
      : 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const preset = this.instruments.getPresets().find((p) => p.id === rt.instrumentId);
    return {
      id,
      name: rt.name,
      type: rt.instrumentId.includes('drum') ? 'drum' : 'midi',
      instrumentId: rt.instrumentId,
      muted: false,
      soloed: false,
      volume: 0.8,
      gain: 0.8,
      pan: 0,
      clips: [],
      notes: rt.notes.map((n, i) => ({
        id: `recipe_${id}_${i}`,
        midi: n.midi,
        step: n.step,
        length: n.length,
        velocity: n.velocity,
      })),
      steps: new Array(64).fill(false),
      fxSlots: [{ id: 'fx1', type: 'Reverb', params: {}, enabled: true }],
      sendA: 0,
      sendB: 0,
      color: '#af25f4',
      synthParams: preset?.synth || { type: 'sine' },
      effects: [],
      patternSlots: this.createDefaultSlots(),
      activePatternSlotId: 'slot-0',
    };
  }

  /** Expand 3 lane-arrays (kick/snare/hat) → single 64-step boolean array. */
  private expandDrumPattern(
    kick: number[],
    snare: number[],
    hat: number[]
  ): boolean[] {
    const steps = new Array(64).fill(false);
    [...kick, ...snare, ...hat].forEach((i) => {
      if (i >= 0 && i < 64) steps[i] = true;
    });
    return steps;
  }

  /**
   * Create 4 audio tracks from a stem split — caches audio buffers in
   * `stemAudioCache` keyed by clip id, so audio survives undo/redo
   * (which would otherwise JSON-strip the AudioBuffer reference).
   */
  addStemsAsAudioTracks(stems: {
    vocals: AudioBuffer;
    drums: AudioBuffer;
    bass: AudioBuffer;
    instrumental: AudioBuffer;
    other?: AudioBuffer;
  }): void {
    const beforeTracks = this.clone(this.tracks());
    const beforeSel = this.selectedTrackId();

    const labels: Record<keyof typeof stems, string> = {
      vocals: '🎤 Vocals',
      drums: '🥁 Drums',
      bass: '🎸 Bass',
      instrumental: '🎹 Instrumental',
      other: '🎺 Other',
    };

    // Build tracks + clip refs (no buffer refs on the tracks signal itself).
    const builtRefs: Array<{
      trackId: string;
      clipId: string;
      name: string;
      buffer: AudioBuffer;
    }> = [];
    const newTracks: TrackModel[] = [];
    (Object.keys(stems) as (keyof typeof stems)[]).forEach((key) => {
      const buf = stems[key];
      if (!buf) return;
      const trackId =
        'track_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const clipId = 'stem_' + Date.now() + '_' + key;
      const barsAt124 = Math.ceil(buf.duration / (60 / 124 / 4));
      const track = this.buildRecipeTrack({
        name: labels[key] ?? key,
        instrumentId: 'sampler-elite',
        notes: [],
      });
      track.id = trackId;
      track.type = 'audio';
      newTracks.push(track);
      builtRefs.push({ trackId, clipId, name: labels[key] ?? key, buffer: buf });
    });

    const restore = () => {
      builtRefs.forEach((r) => this.stemAudioCache.delete(r.clipId));
      this.tracks.set(this.clone(beforeTracks));
      this.selectedTrackId.set(beforeSel);
    };

    this.history.execute({
      name: 'Add Stems (Split)',
      execute: () => {
        builtRefs.forEach((r) => {
          this.stemAudioCache.set(r.clipId, r.buffer);
          // Add the audio clip referencing the cache by id.
          this.addClipToTrack(r.trackId, {
            id: r.clipId,
            name: r.name,
            start: 0,
            length: Math.max(1, builtRefs[0] ? Math.ceil(builtRefs[0].buffer.duration / (60 / 124 / 4)) : 4),
            type: 'audio',
            audioRefId: r.clipId,
          } as any);
        });
        this.tracks.set(newTracks);
      },
      undo: restore,
    });
  }

  // ── Playback engine stepper ───────────────────────────────────────

  playStep(step: number, time: number, duration: number) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const isOffbeat = stepInBar % 2 !== 0;
    const drumTrack = this.tracks().find(
      (t) => t.id === MusicManagerService.DRUM_TRACK_ID
    );
    const swingOffset = isOffbeat ? (drumTrack as any)?.swingAmount || 0 : 0;
    const swungTime = time + swingOffset * duration * 0.5;

    this.tracks().forEach((t) => {
      if (t.muted) return;

      t.clips.forEach((clip) => {
        if (bar >= clip.start && bar < clip.start + clip.length) {
          t.notes
            .filter((n) => Math.floor(n.step) === step % 64)
            .forEach((n) => {
              if (
                n.probability === undefined ||
                Math.random() < n.probability
              ) {
                const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
                this.engine.triggerAttack(
                  t.id,
                  freq,
                  swungTime,
                  n.velocity,
                  n.length * duration,
                  t.gain,
                  t.pan,
                  0,
                  0,
                  t.synthParams
                );
              }
            });

          if (clip.type === 'audio' && stepInBar === 0 && bar === clip.start) {
            // Audio can be either inline (legacy) or cached by id (stem splits).
            const audioData =
              (clip as any).audioData ||
              ((clip as any).audioRefId &&
                this.stemAudioCache.get((clip as any).audioRefId));
            if (audioData) {
              const rate = this.engine.calculatePlaybackRate(
                (clip as any).originalBpm || this.engine.tempo()
              );
              this.engine.triggerSampler(
                t.id,
                audioData,
                swungTime,
                t.gain,
                t.pan,
                clip.length * 4 * (60 / this.engine.tempo()),
                rate
              );
            }
          }
        }
      });
    });
  }

  isStepActive(track: TrackModel, stepIdx: number): boolean {
    return track.notes.some((n) => Math.floor(n.step) === stepIdx);
  }

  createBus(name: string) {
    return this.addTrack(name, 'bus', 'bus');
  }
}
