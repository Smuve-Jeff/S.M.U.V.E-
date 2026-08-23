import {
  Component,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  Output,
  EventEmitter,
  OnInit,
  effect,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';
import { DjMidiService } from '../../services/dj-midi.service';
import { HardwareService } from '../../services/hardware.service';
import { HistoryService } from '../../services/history.service';
import { AutomationService } from '../automation.service';
import { SnackbarService } from '../../services/snackbar.service';
import { ScaleDetectionService } from '../../services/scale-detection.service';
import { QuantizationService } from '../quantization.service';
import { WebGLRenderer } from '../webgl/webgl-renderer';
import {
  PianoRollRenderer,
  PianoRollNote,
} from '../webgl/piano-roll-renderer';

const VELOCITY_LANE_HEIGHT = 80;
const MAX_MIDI = 96;

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './piano-roll.component.html',
  styleUrls: ['./piano-roll.component.css'],
})
export class PianoRollComponent implements OnInit, AfterViewInit, OnDestroy {
  public readonly musicManager = inject(MusicManagerService);
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly touchGestures = inject(EnhancedTouchGestureService);
  private readonly haptic = inject(HapticService);
  public readonly djMidi = inject(DjMidiService);
  private readonly hardware = inject(HardwareService);
  private readonly history = inject(HistoryService);
  private readonly automation = inject(AutomationService);
  private readonly snackbar = inject(SnackbarService);
  private readonly quantization = inject(QuantizationService);
  /** Phase F3 — one-tap auto key/scale detection (Krumhansl–Kessler). */
  private readonly scaleDetection = inject(ScaleDetectionService);

  /** Sustain pedal state (CC64) surfaced from the hardware layer. */
  readonly sustainActive = this.hardware.sustainActive;
  /** Half-pedal state (CC68 < 64 while held) surfaced from the hardware layer. */
  readonly sustainHalfPedal = this.hardware.sustainHalfPedal;
  /** Continuous pedal position 0-127 (CC68) surfaced from the hardware layer. */
  readonly sustainAmount = this.hardware.sustainAmount;
  /** Notes released by the last pedal lift — for the release-count chip. */
  readonly sustainReleaseCount = this.hardware.lastSustainReleaseCount;

  // ── WebGL renderers ──────────────────────────────────────
  private glRenderer!: WebGLRenderer;
  private prRenderer!: PianoRollRenderer;
  private glVelRenderer!: WebGLRenderer;
  private renderRafId: number | null = null;
  private isGlInitialized = false;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('keysSidebar') keysSidebar!: ElementRef<HTMLDivElement>;
  @ViewChild('velocityViewport') velocityViewport!: ElementRef<HTMLDivElement>;
  @ViewChild('glCanvas') glCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('glVelocityCanvas') glVelocityCanvas!: ElementRef<HTMLCanvasElement>;

  @Output() close = new EventEmitter<void>();
  @Output() openBezierEditor = new EventEmitter<string>();

  editMode = signal<'draw' | 'select' | 'erase' | 'chord'>('draw');

  // ── Chord Stamp Tool ──────────────────────────────────────
  selectedChordType = signal<
    'major' | 'minor' | 'min7' | 'maj7' | 'dom7' | 'sus4' | 'dim'
  >('minor');
  chordTypes = [
    { label: 'Maj', value: 'major' as const, intervals: [0, 4, 7] },
    { label: 'Min', value: 'minor' as const, intervals: [0, 3, 7] },
    { label: 'm7', value: 'min7' as const, intervals: [0, 3, 7, 10] },
    { label: 'M7', value: 'maj7' as const, intervals: [0, 4, 7, 11] },
    { label: '7', value: 'dom7' as const, intervals: [0, 4, 7, 10] },
    { label: 'sus4', value: 'sus4' as const, intervals: [0, 5, 7] },
    { label: 'dim', value: 'dim' as const, intervals: [0, 3, 6] },
  ];
  getChordIntervals(): number[] {
    return (
      this.chordTypes.find((c) => c.value === this.selectedChordType())
        ?.intervals ?? [0, 3, 7]
    );
  }

  // ── Ghost Notes ───────────────────────────────────────────
  ghostNotes = computed(() => {
    const selectedId = this.selectedTrack()?.id;
    return this.musicManager
      .tracks()
      .filter((t) => t.id !== selectedId)
      .flatMap((t) => t.notes);
  });

  ghostNoteSet = computed(() => new Set(this.ghostNotes().map((n) => n.id)));
  isGhost(note: TrackNote): boolean {
    return this.ghostNoteSet().has(note.id);
  }

  snap = signal<'1/4' | '1/8' | '1/16' | '1/32' | 'off'>('1/16');
  quantizePresetId = signal<string>(this.quantization.selectedPresetId());
  zoomLevel = signal(1.0);
  gridSteps = signal(64);
  selectedKey = signal('C');
  selectedScale = signal('major');
  scaleLockEnabled = signal(false);
  snapOptions = [
    { label: '1/4', value: '1/4' as const },
    { label: '1/8', value: '1/8' as const },
    { label: '1/16', value: '1/16' as const },
    { label: '1/32', value: '1/32' as const },
    { label: 'Off', value: 'off' as const },
  ];
  quantizePresets = this.quantization.presets;

  selectedNoteIds = signal<Set<string>>(new Set());
  focusedStep = signal(0);
  focusedMidi = signal(60);
  gridHasFocus = signal(false);
  private draggingNotes: {
    startX: number;
    startY: number;
    originalPositions: Map<string, { step: number; midi: number }>;
  } | null = null;

  selectedTrack = this.musicManager.selectedTrack;

  rowHeight = computed(() =>
    Math.max(18, 22 * this.touchGestures.verticalZoomLevel())
  );
  cellWidth = computed(() => Math.max(20, 32 * this.touchGestures.zoomLevel()));
  columns = computed(() => Array.from({ length: 64 }, (_, i) => i));

  viewportNotes = computed(() => this.selectedTrack()?.notes || []);

  displayKeys = computed(() => {
    return Array.from({ length: 96 }, (_, i) => 24 + i);
  });

  selectionCount = computed(() => this.selectedNoteIds().size);
  selectionAnnouncement = computed(() => {
    const count = this.selectionCount();
    if (count === 0) return 'No notes selected';
    return `${count} note${count === 1 ? '' : 's'} selected`;
  });
  selectedNoteVelocity = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0.8;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.velocity ?? 0.8).toFixed(2));
  });
  selectedNoteProbability = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 1.0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.probability ?? 1.0).toFixed(2));
  });
  selectedNoteMicroOffset = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.microOffset ?? 0).toFixed(3));
  });
  selectedNotePitchBend = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 0;
    const first = track.notes.find((n) => ids.has(n.id));
    return Number((first?.pitchBend ?? 0).toFixed(2));
  });
  selectedNoteArticulation = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 'normal';
    const first = track.notes.find((n) => ids.has(n.id));
    return first?.articulation ?? 'normal';
  });
  selectedNoteLength = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return 1;
    const first = track.notes.find((n) => ids.has(n.id));
    return first?.length ?? 1;
  });
  /** True when every selected note is a slide note. */
  selectedNoteIsSlide = computed(() => {
    const track = this.selectedTrack();
    const ids = this.selectedNoteIds();
    if (!track || ids.size === 0) return false;
    return Array.from(ids).every((id) => {
      const n = track.notes.find((x) => x.id === id);
      return n?.isSlide === true;
    });
  });

  /** FL-style slide toggle: marks/unmarks the selection as a pitch-glide note. */
  toggleSlideOnSelection(): void {
    const track = this.selectedTrack();
    if (!track) return;
    const ids = this.selectedNoteIds();
    if (ids.size === 0) return;
    const next = !this.selectedNoteIsSlide();
    Array.from(ids).forEach((id) => {
      const note = track.notes.find((n) => n.id === id);
      this.musicManager.updateNote(track.id, id, {
        isSlide: next,
        // Give a sensible default glide target (+2 semitones) unless already set
        ...(next && note?.pitchBend === undefined
          ? { pitchBend: 2 }
          : {}),
      });
    });
    this.haptic.medium();
    this.snackbar.info(
      next
        ? `Slide on — ${ids.size} note${ids.size > 1 ? 's' : ''} will glide pitch`
        : `Slide off — ${ids.size} note${ids.size > 1 ? 's' : ''}`
    );
  }
  articulationOptions = [
    { label: 'Normal', value: 'normal' as const },
    { label: 'Staccato', value: 'staccato' as const },
    { label: 'Legato', value: 'legato' as const },
    { label: 'Portamento', value: 'portamento' as const },
    { label: 'Pizzicato', value: 'pizzicato' as const },
    { label: 'Accent', value: 'accent' as const },
  ];

  showPrecisionPanel = signal(false);
  showTempoMenu = signal(false);
  readonly metronomeEnabled = this.audioEngine.metronomeEnabled;
  readonly tempoPresets = [80, 90, 100, 110, 120, 124, 128, 140, 150, 160];
  private readonly tapTempoBuffer = signal<number[]>([]);
  readonly tapBpmGuess = computed(() => {
    const taps = this.tapTempoBuffer();
    if (taps.length < 2) return null;
    const intervals = taps.slice(1).map((tap, index) => tap - taps[index]);
    const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    return Math.max(20, Math.min(300, Math.round(60000 / average)));
  });

  // ── Bezier / Automation ──────────────────────────────────
  showAutomationMenu = signal(false);
  automationParam = signal<'velocity' | 'cutoff' | 'pan' | 'volume'>('velocity');

  openBezierForCurrentLane(): void {
    const trackId = this.selectedTrack()?.id || 'main';
    const laneId = `${trackId}_${this.automationParam()}`;
    this.openBezierEditor.emit(laneId);
    this.showAutomationMenu.set(false);
  }

  toggleAutomationMenu(): void {
    this.showAutomationMenu.update((v) => !v);
  }

  setAutomationParam(param: string): void {
    this.automationParam.set(param as any);
    this.openBezierForCurrentLane();
  }

  // ── CC Lane Strip (Mod, Expression, Pan, Cutoff + Pitch Bend) ──
  ccLanes = [
    { id: 'mod', label: 'Mod', cc: 1, color: '#A855F7', param: 'modulation', type: 'cc' },
    { id: 'expr', label: 'Expr', cc: 11, color: '#EC4899', param: 'expression', type: 'cc' },
    { id: 'pan', label: 'Pan', cc: 10, color: '#2BA09C', param: 'pan', type: 'cc' },
    { id: 'cut', label: 'Cut', cc: 74, color: '#D97706', param: 'cutoff', type: 'cc' },
    { id: 'bend', label: 'PB', cc: 0, color: '#38BDF8', param: 'pitchbend', type: 'pitchbend' },
  ] as const;

  showCcLane = signal(false);
  activeCcLane = signal<string | null>(null);

  /** Per-lane MIDI controller number — defaults to the lane's stock CC. */
  ccLaneController = signal<Record<string, number>>({
    mod: 1,
    expr: 11,
    pan: 10,
    cut: 74,
    bend: 0,
  });

  /** Per-lane MIDI channel (0-15) for both send and learn-matching. */
  ccLaneChannel = signal<Record<string, number>>({
    mod: 0,
    expr: 0,
    pan: 0,
    cut: 0,
    bend: 0,
  });

  /** Lane currently waiting for a MIDI Learn capture, or null. */
  ccLaneLearnTarget = signal<string | null>(null);

  /** Start MIDI Learn for a lane — next incoming CC (on its channel) assigns it. */
  startCcLaneLearn(laneId: string): void {
    this.djMidi.startPerformerLearn('cc_lane_' + laneId);
    this.ccLaneLearnTarget.set(laneId);
    this.haptic.medium();
  }

  cancelCcLaneLearn(): void {
    this.djMidi.cancelPerformerLearn();
    this.ccLaneLearnTarget.set(null);
    this.haptic.light();
  }

  /** True while this lane is the active learn target. */
  isCcLaneLearning(laneId: string): boolean {
    return this.ccLaneLearnTarget() === laneId;
  }

  /** Set the MIDI channel a lane sends / matches on (0-15). */
  setCcLaneChannel(laneId: string, channel: number): void {
    const ch = Math.max(0, Math.min(15, Math.round(channel)));
    this.ccLaneChannel.update((v) => ({ ...v, [laneId]: ch }));
    this.haptic.light();
  }

  /** Arm CC automation recording — writes keyframes at the playhead while playing. */
  ccRecordArmed = signal(false);
  private ccSubscription: { unsubscribe: () => void } | null = null;
  private pbSubscription: { unsubscribe: () => void } | null = null;
  private noteOnSubscription: { unsubscribe: () => void } | null = null;
  private noteOffSubscription: { unsubscribe: () => void } | null = null;

  /** Notes still ringing because the sustain pedal is held. */
  private sustainedNotes = new Set<number>();

  /** Track the current value (0-127) for each CC lane for draw interaction */
  ccLaneValues = signal<Record<string, number>>({
    mod: 0,
    expr: 64,
    pan: 64,
    cut: 127,
    bend: 64,
  });

  /**
   * Readout of recorded keyframes per CC lane, mapped to % positions on the
   * lane track (x = step / totalSteps, y = value / 127).
   */
  ccLaneReadouts = computed(() => {
    const trackId = this.selectedTrack()?.id || 'main';
    const steps = Math.max(1, this.gridSteps());
    const out: Record<string, { x: number; y: number }[]> = {};
    for (const lane of this.ccLanes) {
      const autoLane = this.automation.lanes().find(
        (l) =>
          l.target.trackId === trackId && l.target.parameter === `cc_${lane.param}`
      );
      out[lane.id] = (autoLane?.points ?? []).map((p) => ({
        x: Math.max(0, Math.min(100, (p.time / steps) * 100)),
        y: Math.max(0, Math.min(100, (p.value / 127) * 100)),
      }));
    }
    return out;
  });

  /** Snapshot of every CC lane's recorded points, keyed by lane id. */
  private snapshotCcLanes(): Record<string, { time: number; value: number }[]> {
    const trackId = this.selectedTrack()?.id || 'main';
    const snap: Record<string, { time: number; value: number }[]> = {};
    for (const lane of this.ccLanes) {
      const autoLane = this.automation.lanes().find(
        (l) =>
          l.target.trackId === trackId && l.target.parameter === `cc_${lane.param}`
      );
      snap[lane.id] = (autoLane?.points ?? []).map((p) => ({
        time: p.time,
        value: p.value,
      }));
    }
    return snap;
  }

  /** Apply a CC lane snapshot back onto the automation lanes. */
  private restoreCcLanes(
    snap: Record<string, { time: number; value: number }[]>
  ): void {
    const trackId = this.selectedTrack()?.id || 'main';
    for (const lane of this.ccLanes) {
      const autoLane = this.automation.ensureLane(trackId, `cc_${lane.param}`, {
        min: 0,
        max: 127,
      });
      this.automation.setPoints(
        autoLane.id,
        (snap[lane.id] ?? []).map((p) => ({ time: p.time, value: p.value }))
      );
    }
  }

  toggleCcRecord(): void {
    const wasArmed = this.ccRecordArmed();
    this.ccRecordArmed.update((v) => !v);
    this.haptic.medium();

    if (!wasArmed) return;
    // Disarming: commit a single undoable step for the whole recording pass
    const recorded = this.snapshotCcLanes();
    this.history.execute({
      name: 'Record CC automation',
      execute: () => this.restoreCcLanes(recorded),
      undo: () => this.restoreCcLanes(this.recordSnapshot ?? {}),
    });
    this.recordSnapshot = null;
    // Bezier readout sync: auto-open the editor for the most-recently drawn lane
    if (this.lastRecordedLaneId) {
      const laneId = this.lastRecordedLaneId;
      this.lastRecordedLaneId = null;
      this.openBezierEditor.emit(laneId);
    }
  }

  /** Real automation lane id most recently written by CC recording. */
  private lastRecordedLaneId: string | null = null;

  private learnEffect: { destroy: () => void } | null = null;

  private recordSnapshot: Record<string, { time: number; value: number }[]> | null = null;

  /**
   * Live note preview — plays a note through the engine; when the sustain
   * pedal is held the note rings much longer.
   */
  private previewNoteOn(note: number, velocity: number): void {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const duration = this.sustainActive() ? 3.0 : 0.6;
    // Sustained or bend-tuned previews glide the pitch over the note
    const glideTo =
      this.sustainActive() && this.previewGlideSemitones !== 0
        ? freq * Math.pow(2, this.previewGlideSemitones / 12)
        : undefined;
    const previewTime = this.musicManager.engine?.ctx?.currentTime ?? 0;
    this.musicManager.engine?.playSynth?.(
      previewTime,
      freq,
      duration,
      Math.max(0.05, velocity),
      0,
      glideTo !== undefined ? { type: 'sine', glideTo } : { type: 'sine' }
    );
  }

  /** Semitone glide amount for live preview (0 = none). */
  private previewGlideSemitones = 0;

  private previewNoteOff(note: number): void {
    if (this.sustainActive()) {
      this.sustainedNotes.add(note);
    } else {
      this.sustainedNotes.delete(note);
    }
  }

  /**
   * Tap-to-audition for the key sidebar — the same zero-latency pointer feel
   * as the drum pads. Pointer pressure maps to strike velocity (neutral
   * pressure from a plain mouse/touch is a full strike; force-touch scales
   * down toward a soft tap).
   */
  auditionKey(midi: number, event: PointerEvent): void {
    const pressure = event.pressure;
    const velocity =
      !pressure || pressure <= 0
        ? 1
        : Math.max(0.25, Math.min(1, pressure / 0.5));
    this.previewNoteOn(midi, velocity);
    this.haptic.drumHit(velocity);
  }

  /**
   * Write a CC keyframe for a lane at the current playhead step.
   * Target parameter uses the lane's stable param key (e.g. `cc_pan`).
   */
  private recordCcKeyframe(laneId: string, value: number): void {
    const lane = this.ccLanes.find((l) => l.id === laneId);
    if (!lane) return;
    const trackId = this.selectedTrack()?.id || 'main';
    const autoLane = this.automation.ensureLane(trackId, `cc_${lane.param}`, {
      interpolation: 'linear',
      min: 0,
      max: 127,
    });
    const playhead = Math.floor(
      (this.musicManager.engine?.visualStep?.() ?? 0) % this.gridSteps()
    );
    this.automation.addPoint(autoLane.id, playhead, Math.round(value));
    this.lastRecordedLaneId = autoLane.id;
    this.haptic.light();
  }

  /** Record a drawn CC value if recording is armed and transport is playing. */
  private recordCcIfArmed(laneId: string, value: number): void {
    if (!this.ccRecordArmed()) return;
    if (!this.audioSession.isPlaying()) return;
    this.recordCcKeyframe(laneId, value);
  }

  /** Called with incoming MIDI CC (0-127) from an external controller. */
  private handleIncomingCc(controller: number, value: number, channel = 0): void {
    // Match by learned/stock controller AND per-lane channel
    const lane = this.ccLanes.find((l) => {
      const ctrl = this.ccLaneController()[l.id] ?? l.cc;
      const ch = this.ccLaneChannel()[l.id] ?? 0;
      return ctrl === controller && ch === channel;
    });
    if (!lane) return;
    const clamped = Math.max(0, Math.min(127, Math.round(value)));
    this.ccLaneValues.update((v) => ({ ...v, [lane.id]: clamped }));
    this.recordCcIfArmed(lane.id, clamped);
  }

  /** Called with incoming MIDI pitch bend (-1..1) → bend lane value 0..127. */
  private handleIncomingPitchBend(value: number): void {
    const clamped = Math.max(-1, Math.min(1, value));
    const mapped = Math.round((clamped + 1) * 63.5); // -1..1 → 0..127
    this.ccLaneValues.update((v) => ({ ...v, bend: mapped }));
    this.recordCcIfArmed('bend', mapped);
  }

  /** CC lane draw interaction — same pattern as velocity lane */
  onCcPointerDown(event: PointerEvent, laneId: string): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height || 24;
    const value = Math.max(0, Math.min(127, Math.round((1 - y / height) * 127)));
    this.updateCcLaneValue(laneId, value);
  }

  onCcPointerMove(event: PointerEvent, laneId: string): void {
    if (event.buttons !== 1) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height || 24;
    const value = Math.max(0, Math.min(127, Math.round((1 - y / height) * 127)));
    this.updateCcLaneValue(laneId, value);
  }

  private updateCcLaneValue(laneId: string, value: number): void {
    this.ccLaneValues.update((v) => ({ ...v, [laneId]: value }));
    this.haptic.light();
    const lane = this.ccLanes.find((l) => l.id === laneId);
    if (lane) {
      const channel = this.ccLaneChannel()[laneId] ?? 0;
      const controller = this.ccLaneController()[laneId] ?? lane.cc;
      if (lane.type === 'pitchbend') {
        // Bend lane stores 0..127 → normalize to -1..1 for the 14-bit MIDI PB message
        this.djMidi.sendPitchBend((value / 127) * 2 - 1, channel);
      } else {
        this.djMidi.sendCC(controller, value, channel);
      }
      this.recordCcIfArmed(laneId, value);
    }
  }

  toggleCcLane(laneId: string): void {
    if (this.activeCcLane() === laneId) {
      this.activeCcLane.set(null);
      this.showCcLane.set(false);
    } else {
      this.activeCcLane.set(laneId);
      this.showCcLane.set(true);
    }
    this.haptic.light();
  }

  openBezierForCcLane(laneId: string): void {
    const trackId = this.selectedTrack()?.id || 'main';
    const lane = this.ccLanes.find((l) => l.id === laneId);
    if (!lane) return;
    // Resolve the REAL automation lane id so the bezier editor finds it
    const autoLane = this.automation.ensureLane(trackId, `cc_${lane.param}`, {
      interpolation: 'linear',
      min: 0,
      max: 127,
    });
    this.openBezierEditor.emit(autoLane.id);
    this.haptic.light();
  }

  highlightedRange = computed(
    () => this.musicManager.crossLinkRequest()?.noteRange ?? null
  );
  highlightedNoteIds = computed(() => {
    const r = this.highlightedRange();
    if (!r) return new Set<string>();
    const ids = new Set<string>();
    (this.selectedTrack()?.notes ?? []).forEach((n) => {
      if (n.step >= r.startStep && n.step <= r.endStep) ids.add(n.id);
    });
    return ids;
  });
  isHighlighted(note: TrackNote): boolean {
    return this.highlightedNoteIds().has(note.id);
  }

  private lastHandledTimestamp = 0;

  constructor() {
    effect(() => {
      const req = this.musicManager.crossLinkRequest?.();
      if (!req || !req.noteRange) return;
      if (req.timestamp === this.lastHandledTimestamp) return;
      if (req.timestamp <= this.lastHandledTimestamp) return;
      this.lastHandledTimestamp = req.timestamp;
      if (this.scrollContainer) {
        this.scrollToHighlight(req.noteRange);
      }
    });

    // MIDI Learn capture: when the DJ service records a mapping for a lane we
    // are waiting on, adopt the learned controller + channel immediately.
    // (Created in the constructor so it runs inside an injection context.)
    this.learnEffect = effect(() => {
      const map = this.djMidi.performerCCMap?.() ?? [];
      const target = this.ccLaneLearnTarget();
      if (!target) return;
      const mapping = map.find((m) => m.target === 'cc_lane_' + target);
      if (mapping) {
        this.ccLaneController.update((v) => ({ ...v, [target]: mapping.controller }));
        this.ccLaneChannel.update((v) => ({ ...v, [target]: mapping.channel }));
        this.ccLaneLearnTarget.set(null);
        this.haptic.medium();
      }
    });
  }

  // ── Lifecycle ────────────────────────────────────────────

  ngOnInit() {
    // Listen for external MIDI CC controllers (CC1/10/11/74) → live lane value + record
    this.ccSubscription = this.djMidi.performerCC.subscribe((event) => {
      this.handleIncomingCc(event.controller, event.value * 127, event.channel ?? 0);
    });
    // Pitch bend wheel (0xE0) → bend lane live value + record
    this.pbSubscription = this.djMidi.performerPitchBend.subscribe((event) => {
      this.handleIncomingPitchBend(event.value);
    });
    // External keyboard note preview (sustain-aware)
    this.noteOnSubscription = this.djMidi.performerNoteOn.subscribe((event) => {
      this.previewNoteOn(event.note, event.velocity ?? 0.8);
    });
    this.noteOffSubscription = this.djMidi.performerNoteOff.subscribe((event) => {
      this.previewNoteOff(event.note);
    });
  }

  ngAfterViewInit() {
    this.initWebGL();
    this.scheduleRender();
  }

  ngOnDestroy() {
    this.ccSubscription?.unsubscribe();
    this.pbSubscription?.unsubscribe();
    this.noteOnSubscription?.unsubscribe();
    this.noteOffSubscription?.unsubscribe();
    this.learnEffect?.destroy();
    if (this.renderRafId !== null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.glRenderer?.destroy();
    this.glVelRenderer?.destroy();
  }

  private initWebGL(): void {
    try {
      this.glRenderer = new WebGLRenderer();
      this.glRenderer.initialize(this.glCanvas.nativeElement);
      this.prRenderer = new PianoRollRenderer(this.glRenderer);

      this.glVelRenderer = new WebGLRenderer();
      this.glVelRenderer.initialize(this.glVelocityCanvas.nativeElement);

      this.isGlInitialized = true;
      this.markDirty();
    } catch (e) {
      console.warn('WebGL init failed for piano roll', e);
    }
  }

  // ── Render loop ──────────────────────────────────────────

  private scheduleRender(): void {
    const tick = () => {
      this.renderRafId = requestAnimationFrame(tick);
      if (this.isGlInitialized) {
        const isPlaying = this.audioSession.isPlaying();
        if (isPlaying || this.glRenderer.isDirty) {
          this.renderPianoRoll();
        }
      }
    };
    this.renderRafId = requestAnimationFrame(tick);
  }

  private markDirty(): void {
    this.glRenderer?.markDirty();
    this.glVelRenderer?.markDirty();
  }

  private renderPianoRoll(): void {
    const gridCanvas = this.glCanvas?.nativeElement;
    const container = this.scrollContainer?.nativeElement;
    if (!gridCanvas || !container || !this.isGlInitialized) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Resize
    if (gridCanvas.width !== Math.round(cw * dpr) || gridCanvas.height !== Math.round(ch * dpr)) {
      this.glRenderer.resize();
    }

    const pps = this.cellWidth();
    const rh = this.rowHeight();
    this.prRenderer.setPixelsPerStep(pps);
    this.prRenderer.setRowHeight(rh);
    this.prRenderer.setMidiRange(24, 24 + MAX_MIDI - 1);

    const camera = {
      scrollX: container.scrollLeft / dpr,
      scrollY: container.scrollTop / dpr,
      zoom: 1.0,
    };

    // Build note data
    const prNotes: PianoRollNote[] = [];
    const mainNotes = this.selectedTrack()?.notes ?? [];
    const ghostNotes = this.ghostNotes();
    const selIds = this.selectedNoteIds();
    const hlIds = this.highlightedNoteIds();

    for (const note of ghostNotes) {
      prNotes.push({
        id: note.id,
        midi: note.midi,
        step: note.step,
        length: note.length,
        velocity: note.velocity,
        selected: false,
        isGhost: true,
        isHighlighted: false,
      });
    }

    for (const note of mainNotes) {
      prNotes.push({
        id: note.id,
        midi: note.midi,
        step: note.step,
        length: note.length,
        velocity: note.velocity,
        selected: selIds.has(note.id),
        isGhost: false,
        isHighlighted: hlIds.has(note.id),
        isSlide: note.isSlide === true,
        slideTarget: note.midi + (note.pitchBend ?? 0),
      });
    }

    const playheadStep = this.musicManager.engine?.visualStep?.() ?? 0;
    const totalSteps = this.gridSteps();

    this.glRenderer.clear(0.03, 0.05, 0.10, 1.0);
    this.prRenderer.render(prNotes, playheadStep, totalSteps, camera, MAX_MIDI);

    // Velocity lane
    const velCanvas = this.glVelocityCanvas?.nativeElement;
    const velViewport = this.velocityViewport?.nativeElement;
    if (velCanvas && velViewport) {
      const vw = velViewport.clientWidth;
      if (velCanvas.width !== Math.round(vw * dpr) || velCanvas.height !== Math.round(VELOCITY_LANE_HEIGHT * dpr)) {
        this.glVelRenderer.resize();
      }

      const velCamera = {
        scrollX: velViewport.scrollLeft / dpr,
        scrollY: 0,
        zoom: 1.0,
      };

      const selVelMap = new Map<string, number>();
      selIds.forEach((id) => {
        const n = mainNotes.find((nn) => nn.id === id);
        if (n) selVelMap.set(id, n.velocity);
      });

      this.glVelRenderer.clear(0.04, 0.06, 0.11, 1.0);
      this.prRenderer.renderVelocityLane(
        prNotes.filter((n) => !n.isGhost),
        selVelMap,
        playheadStep,
        totalSteps,
        velCamera,
        VELOCITY_LANE_HEIGHT,
        0
      );
    }
  }

  // ── Scroll helpers ───────────────────────────────────────

  scrollToHighlight(range: { startStep: number; endStep: number }) {
    setTimeout(() => {
      if (!this.scrollContainer) return;
      const target = Math.max(0, range.startStep - 4) * this.cellWidth();
      this.scrollContainer.nativeElement.scrollTo({
        left: target,
        behavior: 'smooth',
      });
    }, 60);
  }

  dismissCrossLink() {
    if (this.musicManager.crossLinkRequest()) {
      this.musicManager.clearCrossLink();
    }
  }

  // ── Wheel zoom ───────────────────────────────────────────

  onGridWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    this.zoomLevel.update((v) => Math.max(0.25, Math.min(3.0, v + delta)));
    this.markDirty();
  }

  // ── Touch interactions ───────────────────────────────────
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private isSwiping = false;
  private lastPinchZoom = 1;
  private drawFromTouch = false;

  onGridTouchStart(event: TouchEvent) {
    this.touchStartTime = Date.now();
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.isSwiping = false;
      this.drawFromTouch = false;
    }
    if (event.touches.length === 2) {
      this.lastPinchZoom = this.touchGestures.zoomLevel();
      try { this.touchGestures.handlePinch(event); } catch {}
    }
  }

  onGridTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      try {
        this.touchGestures.handlePinch(event);
        const newZoom = this.touchGestures.zoomLevel();
        if (Math.abs(newZoom - this.lastPinchZoom) > 0.15) {
          this.haptic.preset('tick');
          this.lastPinchZoom = newZoom;
        }
      } catch {}
    }
    if (event.touches.length === 1 && this.editMode() === 'draw') {
      const dx = event.touches[0].clientX - this.touchStartX;
      const dy = event.touches[0].clientY - this.touchStartY;
      if (Math.hypot(dx, dy) > 15 && !this.drawFromTouch) {
        this.isSwiping = true;
      }
    }
  }

  onGridTouchEnd(event: TouchEvent) {
    if (event.changedTouches.length === 1 && !this.isSwiping) {
      const touch = event.changedTouches[0];
      const container = this.scrollContainer?.nativeElement;
      if (!container) return;
      const { step, midi, rowFraction } = this.getGridPosition(
        container,
        touch.clientX,
        touch.clientY
      );
      this.handleGridInteraction(step, midi, {
        rowFraction,
        previewExisting: true,
      });
      this.drawFromTouch = true;
    }
    this.isSwiping = false;
  }

  // ── Pointer interaction on grid canvas ───────────────────

  onGridPointerDown(event: PointerEvent) {
    // Touch screens also dispatch compatibility pointer events. Drawing here
    // and again in touchend creates duplicate notes, so let the touch path own
    // touch editing and reserve pointer handling for mouse/pen input.
    if (event.pointerType === 'touch') return;
    this.dismissCrossLink();
    const container = event.currentTarget as HTMLElement;
    const { step, midi, rowFraction } = this.getGridPosition(
      container,
      event.clientX,
      event.clientY
    );
    this.handleGridInteraction(step, midi, {
      shiftKey: event.shiftKey,
      rowFraction,
      dragStart: { x: event.clientX, y: event.clientY },
      previewExisting: true,
    });
  }

  onNotePointerDown(event: PointerEvent, note: TrackNote) {
    // Touch taps are owned by the touch gesture path. Letting a compatibility
    // pointer event also select/drag here makes mobile note editing race the
    // grid touchend handler.
    if (event.pointerType === 'touch') return;
    event.stopPropagation();
    this.dismissCrossLink();
    const track = this.selectedTrack();
    if (!track) return;
    if (!event.shiftKey && !this.selectedNoteIds().has(note.id)) {
      this.selectedNoteIds.set(new Set([note.id]));
    } else if (event.shiftKey) {
      const next = new Set(this.selectedNoteIds());
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      this.selectedNoteIds.set(next);
    }
    this.markDirty();

    if (this.editMode() === 'erase') {
      this.musicManager.removeNotes(track.id, [note.id]);
      this.markDirty();
      return;
    }

    this.startDraggingSelection(event.clientX, event.clientY);
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent) {
    if (this.draggingNotes) {
      const dx = e.clientX - this.draggingNotes.startX;
      const dy = e.clientY - this.draggingNotes.startY;
      const dSteps = dx / this.cellWidth();
      const dMidi = -Math.round(dy / this.rowHeight());
      const track = this.musicManager.selectedTrack();
      if (!track) return;
      this.draggingNotes.originalPositions.forEach((pos, id) => {
        this.musicManager.updateNote(track.id, id, {
          step: Math.max(0, pos.step + dSteps),
          midi: Math.max(0, Math.min(127, pos.midi + dMidi)),
        });
      });
      this.markDirty();
    }
  }

  @HostListener('pointerup')
  onPointerUp() {
    this.draggingNotes = null;
  }

  // ── Velocity lane interaction ────────────────────────────

  onVelocityPointerDown(event: PointerEvent) {
    this.dismissCrossLink();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left + (event.currentTarget as HTMLElement).scrollLeft;
    const y = event.clientY - rect.top;
    const step = Math.max(0, Math.floor(x / this.cellWidth()));
    const velocity = Math.max(0.1, Math.min(1.5, 1 - y / 60));
    const track = this.selectedTrack();
    if (!track) return;
    const note = track.notes.find((n) => Math.floor(n.step) === step);
    if (note) {
      this.musicManager.updateNote(track.id, note.id, { velocity });
      this.haptic.velocity(velocity);
      this.markDirty();
    }
  }

  onVelocityPointerMove(event: PointerEvent) {
    if (event.buttons !== 1) return;
    this.onVelocityPointerDown(event);
  }

  // ── Note creation ────────────────────────────────────────

  private createNoteAt(step: number, midi: number) {
    const track = this.selectedTrack();
    if (!track) return;
    const snappedStep = this.applySnap(step);
    const constrainedMidi = this.scaleLockEnabled()
      ? this.constrainMidiToScale(midi)
      : midi;
    if (this.editMode() === 'chord') {
      const intervals = this.getChordIntervals();
      intervals.forEach((interval, idx) => {
        const noteMidi = constrainedMidi + interval;
        if (noteMidi >= 0 && noteMidi <= 127) {
          this.musicManager.addNoteToTrack(track.id, {
            id: 'chord-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
            midi: noteMidi,
            step: snappedStep,
            length: this.lengthFromSnap(),
            velocity: idx === 0 ? 0.9 : 0.75,
          });
          // Audition each chord voice so the stamped chord is heard immediately.
          this.previewNoteOn(noteMidi, idx === 0 ? 0.9 : 0.75);
        }

        private getGridPosition(
          container: HTMLElement,
          clientX: number,
          clientY: number
        ): { step: number; midi: number; rowFraction: number } {
          const rect = container.getBoundingClientRect();
          const x = clientX - rect.left + container.scrollLeft;
          const y = clientY - rect.top + container.scrollTop;
          const step = Math.max(0, x / this.cellWidth());
          const rowHeight = this.rowHeight();
          const rowIndex = Math.floor(y / rowHeight);
          const midi = Math.max(24, Math.min(119, 24 + (MAX_MIDI - 1 - rowIndex)));
          const rowFraction = (y % rowHeight) / rowHeight;
          return { step, midi, rowFraction };
        }

        private findNoteAt(step: number, midi: number): TrackNote | undefined {
          return this.selectedTrack()?.notes.find(
            (note) =>
              note.midi === midi &&
              step >= note.step &&
              step <= note.step + Math.max(0.125, note.length)
          );
        }

        private startDraggingSelection(clientX: number, clientY: number): void {
          const originalPositions = new Map<string, { step: number; midi: number }>();
          this.selectedNoteIds().forEach((id) => {
            const note = this.selectedTrack()?.notes.find((candidate) => candidate.id === id);
            if (note) originalPositions.set(id, { step: note.step, midi: note.midi });
          });
          this.draggingNotes = {
            startX: clientX,
            startY: clientY,
            originalPositions,
          };
        }

        private updateSelectionForNote(note: TrackNote, append = false): void {
          if (!append) {
            this.selectedNoteIds.set(new Set([note.id]));
            return;
          }
          const next = new Set(this.selectedNoteIds());
          if (next.has(note.id)) next.delete(note.id);
          else next.add(note.id);
          this.selectedNoteIds.set(next);
        }

        private handleGridInteraction(
          step: number,
          midi: number,
          options: {
            shiftKey?: boolean;
            rowFraction?: number;
            dragStart?: { x: number; y: number };
            previewExisting?: boolean;
          } = {}
        ): void {
          const track = this.selectedTrack();
          if (!track) return;
          const normalizedStep = Math.max(0, step);
          const normalizedMidi = Math.max(24, Math.min(119, midi));
          this.focusedStep.set(
            Math.max(0, Math.min(this.gridSteps() - 1, Math.round(normalizedStep)))
          );
          this.focusedMidi.set(normalizedMidi);

          const existing = this.findNoteAt(normalizedStep, normalizedMidi);
          if (existing) {
            if (this.editMode() === 'erase') {
              this.musicManager.removeNotes(track.id, [existing.id]);
            } else {
              this.updateSelectionForNote(existing, !!options.shiftKey);
              if (options.previewExisting) {
                this.previewNoteOn(existing.midi, existing.velocity ?? 0.8);
              }
              if (this.editMode() === 'select' && options.dragStart) {
                this.startDraggingSelection(options.dragStart.x, options.dragStart.y);
              }
            }
            this.haptic.light();
            this.markDirty();
            return;
          }

          if (this.editMode() === 'select') {
            if (!options.shiftKey) {
              this.selectedNoteIds.set(new Set());
              this.markDirty();
            }
            return;
          }

          if (this.editMode() === 'erase') {
            this.haptic.light();
            return;
          }

          const velocity = Math.max(
            0.15,
            Math.min(1, 1 - (options.rowFraction ?? 0.35) * 0.6)
          );
          this.createNoteAt(normalizedStep, normalizedMidi);
          if (this.editMode() !== 'chord') {
            const created = this.findNoteAt(this.applySnap(normalizedStep), normalizedMidi);
            if (created) {
              this.musicManager.updateNote(track.id, created.id, {
                velocity: Number(velocity.toFixed(2)),
              });
              this.selectedNoteIds.set(new Set([created.id]));
            }
          }
          this.markDirty();
        }
      });
      this.haptic.medium();
    } else {
      this.musicManager.addNoteToTrack(track.id, {
        id: 'note-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        midi: constrainedMidi,
        step: snappedStep,
        length: this.lengthFromSnap(),
        velocity: 0.8,
      });
      // Mouse/pen draw — audition the note the instant it lands.
      this.previewNoteOn(constrainedMidi, 0.8);
      this.haptic.light();
    }
    this.markDirty();
  }

  private applySnap(step: number): number {
    switch (this.snap()) {
      case '1/4': return Math.round(step / 4) * 4;
      case '1/8': return Math.round(step / 2) * 2;
      case '1/16': return Math.round(step);
      case '1/32': return Math.round(step * 2) / 2;
      default: return step;
    }
  }

  private lengthFromSnap(): number {
    switch (this.snap()) {
      case '1/4': return 4;
      case '1/8': return 2;
      case '1/16': return 1;
      case '1/32': return 0.5;
      default: return 1;
    }
  }

  // ── Existing utility methods ─────────────────────────────

  setEditMode(mode: 'draw' | 'select' | 'erase' | 'chord') {
    this.editMode.set(mode);
    this.haptic.light();
  }

  setKey(key: string) { this.selectedKey.set(key); this.haptic.light(); }
  setScale(scale: string) { this.selectedScale.set(scale); this.haptic.light(); }
  toggleScaleLock() { this.scaleLockEnabled.update((v) => !v); this.haptic.light(); }

  // ── Phase F3: Auto Key/Scale Detection ─────────────────────
  /**
   * Analyze the selected track's notes and apply the detected key + scale
   * to the editor. Beats FL Mobile's manual scale picker — one tap guesses
   * the key from the actual melody (Krumhansl–Kessler weighted histogram).
   */
  autoDetectScale(): void {
    const track = this.selectedTrack();
    const notes = track?.notes ?? [];
    if (notes.length === 0) {
      this.snackbar.info('Add some notes first — detection reads the melody');
      return;
    }
    const result = this.scaleDetection.detectKeyAndScale(notes);
    if (!result) return;
    this.selectedKey.set(result.key);
    this.selectedScale.set(result.scale);
    this.haptic.medium();
    this.markDirty();
    this.snackbar.success(
      `✨ ${result.key} ${this.detectedScaleLabel(
        result.scale
      )} · ${Math.round(result.confidence * 100)}% match`
    );
  }

  /** Friendly label for a detected scale value (mirrors scaleOptions). */
  private detectedScaleLabel(scale: string): string {
    return (
      this.scaleOptions.find((s) => s.value === scale)?.label ??
      scale.charAt(0).toUpperCase() + scale.slice(1)
    );
  }

  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  zoomIn() { this.zoomLevel.update((v) => Math.min(3.0, v + 0.25)); this.haptic.light(); this.markDirty(); }
  zoomOut() { this.zoomLevel.update((v) => Math.max(0.25, v - 0.25)); this.haptic.light(); this.markDirty(); }

  fitToPage(): void {
    const totalSteps = this.musicManager.tracks().reduce((max, track: any) => {
      const length = (track.notes ?? []).reduce(
        (m: number, n: any) => Math.max(m, (n.step ?? 0) + (n.length ?? 0)), 0
      );
      const clipLength = (track.clips ?? []).reduce(
        (m: number, c: any) => Math.max(m, ((c.start ?? 0) + (c.length ?? 0)) * 16),
        0
      );
      return Math.max(max, length, clipLength);
    }, 0) + 16;
    const targetZoom = Math.max(0.25, Math.min(3, 96 / Math.max(1, totalSteps)));
    this.zoomLevel.set(targetZoom);
    this.markDirty();
  }

  expandGrid() { this.gridSteps.update((v) => Math.min(256, v + 16)); this.markDirty(); }

  togglePlay(): void {
    this.audioEngine.resume();
    this.audioSession.togglePlay();
  }

  toggleMetronome(): void {
    this.audioEngine.resume();
    this.audioEngine.toggleMetronome();
  }

  nudgeTempo(delta: number): void {
    const next = Math.max(20, Math.min(300, this.audioEngine.tempo() + delta));
    this.audioEngine.tempo.set(next);
  }

  setTempo(bpm: number): void {
    this.audioEngine.tempo.set(bpm);
    this.showTempoMenu.set(false);
  }

  tapTempo(): void {
    const now = performance.now();
    this.tapTempoBuffer.update((buffer) => {
      const fresh = buffer.filter((tap) => tap > now - 2500);
      fresh.push(now);
      return fresh.slice(-8);
    });
    const guess = this.tapBpmGuess();
    if (guess !== null) {
      this.audioEngine.tempo.set(guess);
      this.haptic.light();
    } else {
      this.haptic.medium();
    }
  }

  onGridKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      const track = this.selectedTrack();
      if (!track) return;
      this.selectedNoteIds.set(new Set(track.notes.map((note) => note.id)));
      this.markDirty();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
      return;
    }

    if (event.key === 'Escape') {
      this.selectedNoteIds.set(new Set());
      this.markDirty();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleGridInteraction(this.focusedStep(), this.focusedMidi(), {
        rowFraction: 0.35,
        previewExisting: true,
      });
      return;
    }

    const keyMap: Record<string, { step: number; midi: number }> = {
      ArrowLeft: { step: -1, midi: 0 },
      ArrowRight: { step: 1, midi: 0 },
      ArrowUp: { step: 0, midi: 1 },
      ArrowDown: { step: 0, midi: -1 },
    };
    const move = keyMap[event.key];
    if (!move) return;

    event.preventDefault();
    if (event.shiftKey && this.selectionCount() > 0) {
      const track = this.selectedTrack();
      if (!track) return;
      Array.from(this.selectedNoteIds()).forEach((id) => {
        const note = track.notes.find((candidate) => candidate.id === id);
        if (!note) return;
        this.musicManager.updateNote(track.id, id, {
          step: Math.max(0, note.step + move.step),
          midi: Math.max(0, Math.min(127, note.midi + move.midi)),
        });
      });
      this.markDirty();
      return;
    }

    this.focusedStep.update((value) =>
      Math.max(0, Math.min(this.gridSteps() - 1, value + move.step))
    );
    this.focusedMidi.update((value) =>
      Math.max(24, Math.min(119, value + move.midi))
    );
  }

  beatLabels = computed(() => {
    const cw = this.cellWidth();
    const steps = this.gridSteps();
    const labels: { label: string; pos: number }[] = [];
    for (let i = 0; i < steps; i += 4) {
      labels.push({ label: String(Math.floor(i / 16) + 1) + '.' + ((i % 16) / 4 + 1), pos: i * cw });
    }
    return labels;
  });

  keyOptions = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  scaleOptions = [
    { label: 'Major', value: 'major' },
    { label: 'Minor', value: 'minor' },
    { label: 'Blues', value: 'blues' },
    { label: 'Penta', value: 'pentatonic' },
    { label: 'Chromatic', value: 'chromatic' },
  ];

  setSnap(snap: '1/4' | '1/8' | '1/16' | '1/32' | 'off') { this.snap.set(snap); this.haptic.light(); }
  setQuantizePreset(presetId: string): void {
    this.quantizePresetId.set(presetId);
    this.quantization.selectedPresetId.set(presetId);
    this.haptic.light();
  }

  quantizeSelection(): void {
    this.quantizeByIds(Array.from(this.selectedNoteIds()));
  }

  quantizeTrack(): void {
    const track = this.selectedTrack();
    if (!track) return;
    this.quantizeByIds(track.notes.map((n) => n.id));
  }

  duplicateSelection(): void {
    const track = this.selectedTrack();
    const ids = Array.from(this.selectedNoteIds());
    if (!track || ids.length === 0) return;
    this.musicManager.duplicateNotes(track.id, ids, this.lengthFromSnap());
    this.haptic.light();
    this.markDirty();
  }

  deleteSelection(): void {
    const track = this.selectedTrack();
    const ids = Array.from(this.selectedNoteIds());
    if (!track || ids.length === 0) return;
    this.musicManager.removeNotes(track.id, ids);
    this.selectedNoteIds.set(new Set());
    this.haptic.medium();
    this.markDirty();
  }

  setSelectedVelocity(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { velocity: value }));
    this.markDirty();
  }
  setSelectedProbability(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { probability: value }));
  }
  setSelectedMicroOffset(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { microOffset: Number(value.toFixed(3)) }));
  }
  setSelectedPitchBend(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { pitchBend: Number(value.toFixed(2)) }));
  }
  setSelectedArticulation(value: string) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { articulation: value as any }));
    this.haptic.light();
  }
  setSelectedLength(value: number) {
    const track = this.selectedTrack(); if (!track) return;
    Array.from(this.selectedNoteIds()).forEach((id) => this.musicManager.updateNote(track.id, id, { length: Math.max(0.125, value) }));
  }
  togglePrecisionPanel() { this.showPrecisionPanel.update((v) => !v); this.haptic.light(); }

  gridWidth = computed(() => this.gridSteps() * this.cellWidth());
  canvasHeight = computed(() => MAX_MIDI * this.rowHeight());
  rowTopPx(midi: number): number { return (MAX_MIDI - 1 - (midi - 24)) * this.rowHeight(); }
  noteTopPx(midi: number): number { return (MAX_MIDI - 1 - (midi - 24)) * this.rowHeight(); }

  playheadPx(): number {
    const step = this.musicManager.engine?.visualStep?.() ?? 0;
    return (step % this.gridSteps()) * this.cellWidth();
  }

  syncKeyScroll() {
    if (this.scrollContainer && this.keysSidebar) {
      this.keysSidebar.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollTop;
    }
    if (this.scrollContainer && this.velocityViewport) {
      this.velocityViewport.nativeElement.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
    }
  }

  onVelocityScroll(event: Event) {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollLeft = (event.target as HTMLElement).scrollLeft;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    if (
      ev.target instanceof HTMLInputElement ||
      ev.target instanceof HTMLTextAreaElement ||
      ev.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (ev.key === 'd' || ev.key === 'D') this.setEditMode('draw');
    if (ev.key === 's' || ev.key === 'S') this.setEditMode('select');
    if (ev.key === 'e' || ev.key === 'E') this.setEditMode('erase');
    if (ev.key === 'c' || ev.key === 'C') this.setEditMode('chord');
  }

  humanizeNotes() {
    const track = this.selectedTrack(); if (!track) return;
    this.haptic.medium();
    this.musicManager.humanizeTrack(track.id);
    this.markDirty();
  }

  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  /** True when the key is a member of the selected key + scale (F3 upgrade:
   *  previously hardcoded to C major; now follows the key/scale selector). */
  isInScale(midi: number): boolean {
    return this.scaleDetection.isInScale(midi, this.selectedKey(), this.selectedScale());
  }
  getKeyName(midi: number): string { return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]; }
  getOctaveLabel(midi: number): string { return Math.floor(midi / 12 - 1).toString(); }

  private constrainMidiToScale(midi: number): number {
    if (this.scaleDetection.isInScale(midi, this.selectedKey(), this.selectedScale())) {
      return midi;
    }
    for (let distance = 1; distance <= 6; distance++) {
      const up = midi + distance;
      if (
        up <= 127 &&
        this.scaleDetection.isInScale(up, this.selectedKey(), this.selectedScale())
      ) {
        return up;
      }
      const down = midi - distance;
      if (
        down >= 0 &&
        this.scaleDetection.isInScale(down, this.selectedKey(), this.selectedScale())
      ) {
        return down;
      }
    }
    return midi;
  }

  private quantizeByIds(noteIds: string[]): void {
    const track = this.selectedTrack();
    if (!track || noteIds.length === 0) return;
    const selectedSet = new Set(noteIds);
    const targetNotes = track.notes.filter((n) => selectedSet.has(n.id));
    const result = this.quantization.quantizeNotes(
      targetNotes,
      this.quantizePresetId()
    );
    if (result.changedCount === 0) {
      this.snackbar.info('Notes already on grid');
      return;
    }
    const before = track.notes.map((n) => ({ ...n }));
    const quantizedById = new Map(result.quantized.map((n) => [n.id, n]));
    const after = track.notes.map((note) => {
      const q = quantizedById.get(note.id);
      return q ? { ...note, step: q.step } : note;
    });

    this.history.execute({
      name: `Quantize · ${targetNotes.length} note${targetNotes.length === 1 ? '' : 's'}`,
      execute: () =>
        this.musicManager.tracks.update((tracks) =>
          tracks.map((t) => (t.id === track.id ? { ...t, notes: after } : t))
        ),
      undo: () =>
        this.musicManager.tracks.update((tracks) =>
          tracks.map((t) => (t.id === track.id ? { ...t, notes: before } : t))
        ),
    });
    this.haptic.medium();
    this.markDirty();
    this.snackbar.success(
      `Quantized ${result.changedCount}/${targetNotes.length} note${targetNotes.length === 1 ? '' : 's'}`
    );
  }
}
