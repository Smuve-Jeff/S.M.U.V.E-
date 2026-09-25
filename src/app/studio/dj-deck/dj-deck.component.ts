import { DjMidiService } from '../../services/dj-midi.service';
import { HapticService } from '../../services/haptic.service';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  input,
  computed,
  inject,
  effect,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTheme, Stems } from '../../services/user-context.service';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';
import { LibraryService } from '../../services/library.service';
import { FormsModule } from '@angular/forms';
import { DeckService } from '../../services/deck.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { DatabaseService } from '../../services/database.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { RecordingStatusService } from '../recording-status.service';
import { SwipeContainerComponent } from '../shared/swipe-container/swipe-container.component';

const RECORDING_TIMER_UPDATE_INTERVAL_MILLIS = 250;
const MIN_ROLL_INTERVAL_MILLIS = 50;
const MIN_SAMPLER_RETURN_MILLIS = 80;
const SCRATCH_VELOCITY_NORMALIZER = 8;
const EQ_LOW_RANGE = [0, 3] as const;
const EQ_MID_RANGE = [3, 7] as const;
const EQ_HIGH_RANGE = [7, 10] as const;

// Defensive bounds applied at the UI layer. The downstream services and
// AudioEngine also clamp internally, but sanitising here keeps the in-flight
// signal state valid (no NaN/Infinity leaking into deck signals).
const PLAYBACK_RATE_MIN = 0.5;
const PLAYBACK_RATE_MAX = 2;
const BASS_BOOST_MAX = 1;
const MASTER_VOLUME_MIN = 0;
const MASTER_VOLUME_MAX = 1.5;
const CROSSFADE_MIN = -1;
const CROSSFADE_MAX = 1;
const DECK_GAIN_MIN = 0;
const DECK_GAIN_MAX = 2;
const SEND_GAIN_MIN = 0;
const SEND_GAIN_MAX = 1;
const FX_AMOUNT_MIN = 0;
const FX_AMOUNT_MAX = 1;
const STEM_GAIN_MIN = 0;
const STEM_GAIN_MAX = 2;
const EQ_BAND_MIN = 0;
const EQ_BAND_MAX = 2;
const FILTER_FREQ_MIN = 20;
const FILTER_FREQ_MAX = 22050;
const SATURATION_MIN = 0;
const SATURATION_MAX = 1;
const LOOP_PRESET_BEAT_MIN = 1 / 32;
const LOOP_PRESET_BEAT_MAX = 32;

// ── Vintage booth tuning ──────────────────────────────────────────────
/** Seconds of audio visible in one waveform lane. */
const WAVEFORM_WINDOW_SECONDS = 4;
/** Columns in the pre-rendered whole-track peak strip. */
const WAVEFORM_OVERVIEW_COLUMNS = 3200;
const WAVEFORM_OVERVIEW_HEIGHT = 96;
/** A parked booth still repaints (slowly) so seeks/cues show up. */
const IDLE_REPAINT_INTERVAL_MILLIS = 180;
/** Platter momentum decay time constant after a scratch release. */
const PLATTER_SPIN_DECAY_MILLIS = 520;
const MAX_PLATTER_SPIN_DEG_PER_SEC = 1080;
/** Rotation speed of a real record — 33⅓ and 45 RPM. */
const PLATTER_DEG_PER_SEC_33 = 200;
const PLATTER_DEG_PER_SEC_45 = 270;
/** Vertical drag distance (px) for a full rotary-knob sweep. */
const KNOB_DRAG_RANGE_PX = 170;
const KNOB_FINE_DRAG_RANGE_PX = 720;
/** Fractions of the tonearm rail that map onto the record's first/last groove. */
const TONEARM_TRAVEL_START = 0.05;
const TONEARM_TRAVEL_END = 0.95;
/** Rotary controls backed by the deck/key lock-free parameter set. */
export type DjKnobParam =
  | 'eqHigh'
  | 'eqMid'
  | 'eqLow'
  | 'filter'
  | 'gain'
  | 'fxAmount'
  | 'master'
  | 'drive';

type KnobDrag = {
  param: DjKnobParam;
  deck: 'A' | 'B';
  startY: number;
  startNormalized: number;
  fine: boolean;
};

@Component({
  selector: 'app-dj-deck',
  templateUrl: './dj-deck.component.html',
  styleUrls: [
    './dj-deck.component.css',
    /* Console-grade DJ booth + mixer polish shared with app-mixer.
       Registered here (not in studio.component.css) because Angular's
       emulated encapsulation scopes each stylesheet to its own
       component's template — a parent stylesheet can never reach
       these elements. Component-specific booth layer stays last so it
       wins styling ties. */
    '../subcomponent-refinement.css',
    './dj-booth-refinement.css',
    '../shared/platform-ux.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeContainerComponent],
})
export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {
  samplerCategory = signal<'drums' | 'fx' | 'vocals'>('drums');
  fxMode = signal<
    'autowah' | 'echo' | 'damp' | 'reverb' | 'chorus' | 'phaser' | 'rotate'
  >('echo');
  readonly fxModes: Array<{
    id: 'autowah' | 'echo' | 'damp' | 'reverb' | 'chorus' | 'phaser' | 'rotate';
    label: string;
  }> = [
    { id: 'autowah', label: 'AUTO WAH' },
    { id: 'echo', label: 'ECHO' },
    { id: 'damp', label: 'DAMP' },
    { id: 'reverb', label: 'REVERB' },
    { id: 'chorus', label: 'CHORUS' },
    { id: 'phaser', label: 'PHASER' },
    { id: 'rotate', label: 'ROTATE' },
  ];
  readonly samplePackOptions = Array.from({ length: 27 }, (_, index) => ({
    id: `pack-${index + 1}`,
    label: `Pack ${index + 1}`,
  }));
  activeSamplePack = signal('pack-1');
  private djMidiService = inject(DjMidiService);
  @ViewChild('waveformA') waveformA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformB') waveformB!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterA') meterA!: ElementRef<HTMLCanvasElement>;
  @ViewChild('meterB') meterB!: ElementRef<HTMLCanvasElement>;

  private neuralOrchestrator = inject(AiService);
  theme = input<AppTheme>(inject(UIService).activeTheme());

  midiEnabled = signal(false);
  phantomPowerEnabled = signal(false);
  showSampleLibrary = signal(false);
  isMobile = signal(false);

  hasNeuralStemSplitter = computed(() =>
    this.neuralOrchestrator.isUnlocked('upg-neural-stem-splitter')
  );
  stems = ['vocals', 'drums', 'bass', 'instrumental'];

  rotationA = signal(0);
  rotationB = signal(0);
  scratchVelocityA = signal(0);
  scratchVelocityB = signal(0);
  masterVolume = signal(0.85);

  // ── Vintage booth state ────────────────────────────────────────────
  /** Master tube-drive amount (the DRIVE knob owns this; the engine mirrors it). */
  saturation = signal(0.1);
  /** Motor speed per deck — a real turntable runs at 33⅓ or 45 RPM. */
  platterRpm = signal<Record<'A' | 'B', 33 | 45>>({ A: 33, B: 45 });
  /** Visual record momentum (deg/s) carried out of a scratch release. */
  platterSpin = signal<Record<'A' | 'B', number>>({ A: 0, B: 0 });
  /** Deck whose tonearm is currently being dragged to the groove. */
  tonearmDragging = signal<'A' | 'B' | null>(null);
  /** Rotary knob under the finger — drives the "engaged" highlight. */
  activeKnob = signal<{ deck: 'A' | 'B'; param: DjKnobParam } | null>(null);
  /**
   * Analog filter select per channel (HPF/LPF), mirroring a hardware switch.
   * Derived from the deck state rather than kept in a second signal, so the
   * switch can never disagree with the engine about which filter is engaged.
   */
  filterMode = computed<Record<'A' | 'B', 'lowpass' | 'highpass'>>(() => {
    const mode = (deck: 'A' | 'B') =>
      this.getDeckState(deck).filterMode === 'highpass' ? 'highpass' : 'lowpass';
    return { A: mode('A'), B: mode('B') };
  });
  /** Beat-quantized loop bounds, mirrored from the engine region for the UI. */
  loopRegion = signal<
    Record<'A' | 'B', { start: number; end: number } | null>
  >({ A: null, B: null });
  precisionEqA = signal<number[]>(new Array(10).fill(1));
  precisionEqB = signal<number[]>(new Array(10).fill(1));
  currentBeat = this.engine.currentBeat;
  phasePosition = computed(() => {
    const beat = this.currentBeat();
    return (beat % 1) * 100;
  });

  private recorder: MediaRecorder | null = null;
  recording = signal(false);
  recordingElapsedMs = signal(0);
  recordingDurationLabel = computed(() =>
    this.formatDuration(this.recordingElapsedMs())
  );
  sessionNotice = signal('Ready to scratch, save, and export.');

  private animFrame: number | null = null;
  private syncInterval: any = null;
  private recordingInterval: any = null;
  private activeTouchA: number | null = null;
  private activeTouchB: number | null = null;
  private recordingStartedAt: number | null = null;
  private lastRenderTimestamp = 0;
  private lastFullPaintTimestamp = 0;
  private resizeHandle: ReturnType<typeof setTimeout> | null = null;
  private knobDrag: KnobDrag | null = null;
  private tonearmBounds: Record<
    'A' | 'B',
    { left: number; width: number } | null
  > = { A: null, B: null };
  /** Off-screen whole-track peak strip, rebuilt once per loaded track. */
  private waveformOverview: Record<'A' | 'B', HTMLCanvasElement | null> = {
    A: null,
    B: null,
  };
  private waveformOverviewSource: Record<'A' | 'B', Float32Array | null> = {
    A: null,
    B: null,
  };
  private meterPeak: Record<'A' | 'B', number> = { A: 0, B: 0 };
  private cuePalette: string[] | null = null;
  private hostElement = inject(ElementRef<HTMLElement>);
  private haptics = inject(HapticService);
  performanceMode = signal<'cue' | 'roll' | 'sampler'>('cue');
  private tapTimes: { [key: string]: number[] } = { A: [], B: [] };
  readonly rollPadLabels = ['1/8', '1/4', '1/2', '1', '2', '4', '8', '16'];
  readonly rollPadBeats = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
  readonly samplerPadBeats = [0.25, 0.5, 1, 1, 2, 2, 4, 4];

  isScratchingA = signal(false);
  isScratchingB = signal(false);

  slipProgressA = computed(() => {
    const deck = this.deckService.deckA();
    if (!deck.slip) return 0;
    return this.rotationA() % 360;
  });

  slipProgressB = computed(() => {
    const deck = this.deckService.deckB();
    if (!deck.slip) return 0;
    return this.rotationB() % 360;
  });
  activeRollPadA = signal<number | null>(null);
  activeRollPadB = signal<number | null>(null);
  activeSamplerPadA = signal<number | null>(null);
  activeSamplerPadB = signal<number | null>(null);
  isFlatView = signal(false);
  private lastAngleA = 0;
  private lastAngleB = 0;
  private platterCenters: Record<'A' | 'B', { x: number; y: number } | null> = {
    A: null,
    B: null,
  };
  private wasPlaying: Record<'A' | 'B', boolean> = { A: false, B: false };
  private rollState: Record<
    'A' | 'B',
    {
      padIndex: number;
      origin: number;
      duration: number;
      loopDuration: number;
      startedAt: number;
      playbackRate: number;
      wasPlaying: boolean;
    } | null
  > = { A: null, B: null };
  private rollIntervals: Record<'A' | 'B', any> = { A: null, B: null };
  private samplerReturnTimers: Record<'A' | 'B', any> = { A: null, B: null };

  public uiService = inject(UIService);
  private recordingStatus = inject(RecordingStatusService);
  private profileService = inject(UserProfileService);

  /**
   * Keep the live crossfader behavior aligned with the DJ settings tab
   * (curve + hamster orientation). Reads only the dj settings slice, so it
   * fires on profile load and whenever the user changes those toggles.
   */
  private applyDjSettings = effect(() => {
    const dj = this.profileService.profile().settings?.dj;
    if (!dj) return;
    this.deckService.setXfCurve(dj.crossfaderCurve || 'power');
    this.deckService.setHamster(!!dj.hamsterMode);
  });
  private databaseService = inject(DatabaseService);

  pitchAPercentage = computed(
    () => `${(this.deckService.deckA().playbackRate * 100).toFixed(1)}%`
  );
  pitchBPercentage = computed(
    () => `${(this.deckService.deckB().playbackRate * 100).toFixed(1)}%`
  );
  deckATempo = computed(() => this.getEffectiveDeckBpm('A'));
  deckBTempo = computed(() => this.getEffectiveDeckBpm('B'));
  crossfadeMixA = computed(() =>
    Math.round(((1 - this.deckService.crossfade()) / 2) * 100)
  );
  crossfadeMixB = computed(() =>
    Math.round(((1 + this.deckService.crossfade()) / 2) * 100)
  );

  constructor(
    private fileLoader: FileLoaderService,
    private exportService: ExportService,
    public library: LibraryService,
    public deckService: DeckService,
    public engine: AudioEngineService
  ) {}

  ngOnInit() {
    this.djMidiService.initMidi();
    this.checkMobile();
    this.configureSyncInterval();
  }

  ngAfterViewInit() {
    this.resizeCanvases();
    this.startAnimationLoop();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    if (this.resizeHandle) clearTimeout(this.resizeHandle);
    this.clearRollInterval('A');
    this.clearRollInterval('B');
    this.clearSamplerReturnTimer('A');
    this.clearSamplerReturnTimer('B');
  }

  /**
   * Android fires `resize` once per orientation-change frame (and again while
   * the on-screen keyboard animates). Rebuilding the sync timer on each event
   * used to thrash timers and canvases mid-performance, so the work is
   * coalesced into a single trailing layout pass.
   */
  @HostListener('window:resize')
  onResize() {
    if (this.resizeHandle) return;
    this.resizeHandle = setTimeout(() => {
      this.resizeHandle = null;
      this.checkMobile();
      this.configureSyncInterval();
      this.resizeCanvases();
      this.requestRepaint();
    }, 120);
  }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 1024);
    }
  }

  private configureSyncInterval() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    const interval = this.isMobile() || this.uiService.isLowPower() ? 90 : 50;
    this.syncInterval = setInterval(() => {
      // A parked booth does not need 20 Hz of signal churn into OnPush state:
      // only mirror the engine while something is actually moving.
      const a = this.deckService.deckA();
      const b = this.deckService.deckB();
      if (
        !a.isPlaying &&
        !b.isPlaying &&
        !this.isScratchingA() &&
        !this.isScratchingB()
      ) {
        return;
      }
      this.deckService.syncProgress();
    }, interval);
  }

  /** Force the next animation frame to repaint (used after user interactions). */
  private requestRepaint() {
    this.lastFullPaintTimestamp = 0;
  }

  /**
   * Match each canvas's backing store to its CSS box at device pixel ratio.
   * Doing this on layout changes (instead of per frame) keeps the 30/60 fps
   * paint loop free of layout reads, which is what made the booth stutter on
   * mid-range Android hardware.
   */
  private resizeCanvases() {
    if (typeof window === 'undefined') return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const size = (canvas?: HTMLCanvasElement) => {
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    size(this.waveformA?.nativeElement);
    size(this.waveformB?.nativeElement);
    size(this.meterA?.nativeElement);
    size(this.meterB?.nativeElement);
  }

  private startAnimationLoop() {
    const loop = (timestamp: number) => {
      this.animFrame = requestAnimationFrame(loop);

      const frameBudget =
        this.isMobile() || this.uiService.isLowPower() ? 1000 / 30 : 1000 / 60;
      if (
        this.lastRenderTimestamp &&
        timestamp - this.lastRenderTimestamp < frameBudget
      ) {
        return;
      }
      const deltaMs = this.lastRenderTimestamp
        ? timestamp - this.lastRenderTimestamp
        : frameBudget;
      this.lastRenderTimestamp = timestamp;

      this.updateRotations(deltaMs);

      // A parked booth repaints on a slow tick instead of 30/60 times a second,
      // which keeps idle CPU (and battery) off the floor on Android while still
      // showing seeks, cue flag changes and needle settling.
      const idleFor = timestamp - this.lastFullPaintTimestamp;
      if (!this.isBoothLive() && idleFor < IDLE_REPAINT_INTERVAL_MILLIS) {
        return;
      }
      this.lastFullPaintTimestamp = timestamp;

      this.drawWaveforms();
      this.drawMeters();
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  /** True while any deck transports signal, so the booth should paint fast. */
  private isBoothLive() {
    const a = this.deckService.deckA();
    const b = this.deckService.deckB();
    return (
      a.isPlaying ||
      b.isPlaying ||
      this.isScratchingA() ||
      this.isScratchingB() ||
      this.platterSpin().A !== 0 ||
      this.platterSpin().B !== 0 ||
      this.tonearmDragging() !== null
    );
  }

  /**
   * Records turn at a physical speed, not at a frame rate: every deck advances
   * by real elapsed time, so the platter reads identically at 30 fps (Android),
   * 60 fps (desktop) and everything in between. Leftovers from a scratch
   * release keep spinning down like a free-wheeling platter.
   */
  private updateRotations(deltaMs: number) {
    const seconds = deltaMs / 1000;
    const stateA = this.deckService.deckA();
    const stateB = this.deckService.deckB();
    const rpm = this.platterRpm();

    const motorSpeed = (deck: 'A' | 'B', rate: number) => {
      if (rpm[deck] === 45) return PLATTER_DEG_PER_SEC_45;
      return PLATTER_DEG_PER_SEC_33 * Math.max(0.5, Math.min(2, rate || 1));
    };

    if (stateA.isPlaying && !this.isScratchingA()) {
      this.rotationA.update(
        (r) => (r + motorSpeed('A', stateA.playbackRate) * seconds) % 360
      );
    }
    if (stateB.isPlaying && !this.isScratchingB()) {
      this.rotationB.update(
        (r) => (r + motorSpeed('B', stateB.playbackRate) * seconds) % 360
      );
    }
    this.decayPlatterSpin(seconds);
  }

  /** Free-wheel: decay the visual momentum left behind by a scratch. */
  private decayPlatterSpin(seconds: number) {
    const spin = this.platterSpin();
    if (spin.A === 0 && spin.B === 0) return;
    const decay = Math.exp((-seconds * 1000) / PLATTER_SPIN_DECAY_MILLIS);
    const nextA = spin.A * decay;
    const nextB = spin.B * decay;
    const settledA = Math.abs(nextA) < 1 ? 0 : nextA;
    const settledB = Math.abs(nextB) < 1 ? 0 : nextB;
    this.platterSpin.set({ A: settledA, B: settledB });
    if (settledA && !this.isScratchingA()) {
      this.rotationA.update((r) => (r + settledA * seconds) % 360);
    }
    if (settledB && !this.isScratchingB()) {
      this.rotationB.update((r) => (r + settledB * seconds) % 360);
    }
  }

  private drawWaveforms() {
    this.drawDeckWaveform('A', this.waveformA?.nativeElement);
    this.drawDeckWaveform('B', this.waveformB?.nativeElement);
  }

  /**
   * Booth accent for canvas painting — a 2D context cannot read CSS variables,
   * so the live tokens are resolved from the host element once and reused.
   */
  private boothColor(name: string, fallback: string) {
    try {
      const host = this.hostElement?.nativeElement as HTMLElement | undefined;
      if (!host || typeof window === 'undefined' || !window.getComputedStyle) {
        return fallback;
      }
      return window.getComputedStyle(host).getPropertyValue(name).trim() || fallback;
    } catch {
      return fallback;
    }
  }

  /** Per-slot hot-cue colours (CSS `--cue-N`), cached for the paint loop. */
  private cueColors(): string[] {
    if (this.cuePalette) return this.cuePalette;
    const fallbacks = [
      '#e5453c',
      '#e08a34',
      '#d9b23a',
      '#7ab648',
      '#3f9bd6',
      '#8a6ad6',
      '#d0529f',
      '#9dbf46',
    ];
    this.cuePalette = fallbacks.map((fallback, index) =>
      this.boothColor(`--cue-${index}`, fallback)
    );
    return this.cuePalette;
  }

  /**
   * Pre-render the whole track's peak envelope into an off-screen strip once per
   * loaded track. Painting a 4-second window then costs a single `drawImage`
   * instead of scanning ~10⁵ raw samples every frame — the difference between a
   * smooth booth and a stuttering one on Android.
   */
  private ensureWaveformOverview(deck: 'A' | 'B', data: Float32Array) {
    if (!data.length || typeof document === 'undefined') return;
    if (
      this.waveformOverview[deck] &&
      this.waveformOverviewSource[deck] === data
    ) {
      return;
    }
    const columns = Math.max(
      1,
      Math.min(WAVEFORM_OVERVIEW_COLUMNS, data.length)
    );
    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = WAVEFORM_OVERVIEW_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mid = WAVEFORM_OVERVIEW_HEIGHT / 2;
    ctx.fillStyle = this.boothColor(
      deck === 'A' ? '--vv-a' : '--vv-b',
      deck === 'A' ? '#f0a24a' : '#3fae9c'
    );
    const step = data.length / columns;
    for (let col = 0; col < columns; col++) {
      const start = Math.floor(col * step);
      const end = Math.max(start + 1, Math.floor((col + 1) * step));
      let peak = 0;
      for (let i = start; i < end && i < data.length; i++) {
        const value = Math.abs(data[i]);
        if (value > peak) peak = value;
      }
      const half = Math.max(0.5, peak * mid * 1.3);
      ctx.fillRect(col, mid - half, 1, half * 2);
    }

    this.waveformOverview[deck] = canvas;
    this.waveformOverviewSource[deck] = data;
  }

  private deckDuration(id: 'A' | 'B') {
    const progress = this.engine.getDeckProgress(id);
    return progress.duration || this.getDeckState(id).duration || 0;
  }

  private drawDeckWaveform(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const deck = this.getDeckState(id);
    const data = this.engine.getDeckWaveformData(id);
    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;
    const hairline = Math.max(1, Math.round(height / 48));

    ctx.clearRect(0, 0, width, height);

    const duration = this.deckDuration(id);
    const progress = this.engine.getDeckProgress(id);
    const position = progress.position;

    if (!data.length || !duration) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(0, mid - hairline / 2, width, hairline);
      return;
    }

    this.ensureWaveformOverview(id, data);
    const overview = this.waveformOverview[id];
    const windowStart = Math.max(0, position - WAVEFORM_WINDOW_SECONDS / 2);
    const pxPerSecond = width / WAVEFORM_WINDOW_SECONDS;
    const xOf = (seconds: number) => (seconds - windowStart) * pxPerSecond;

    // 1. The groove itself — one scaled blit of the pre-rendered peak strip.
    if (overview) {
      const sourceScale = overview.width / duration;
      ctx.drawImage(
        overview,
        windowStart * sourceScale,
        0,
        WAVEFORM_WINDOW_SECONDS * sourceScale,
        overview.height,
        0,
        0,
        width,
        height
      );
    }

    // 2. Beat grid: the engraved 4/4 reminders of a printed sleeve.
    const bpm = deck.bpm || 0;
    if (bpm > 0) {
      const beat = 60 / bpm;
      if (beat * pxPerSecond >= 12) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = hairline;
        ctx.beginPath();
        const first = Math.ceil(windowStart / beat) * beat;
        for (
          let t = first;
          t < windowStart + WAVEFORM_WINDOW_SECONDS;
          t += beat
        ) {
          const x = Math.round(xOf(t)) + hairline / 2;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        ctx.stroke();
      }
    }

    // 3. Active loop region — the in/out marks of a locked groove.
    const loop = this.loopRegionOf(id) ?? this.loopRegion()[id];
    if (deck.loop && loop && loop.end > loop.start) {
      const left = Math.max(0, xOf(loop.start));
      const right = Math.min(width, xOf(loop.end));
      if (right > left) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(left, 0, right - left, height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(left, 0, hairline, height);
        ctx.fillRect(right - hairline, 0, hairline, height);
      }
    }

    // 4. Played portion sink — keeps the upcoming groove the bright part.
    const playheadX = Math.max(0, Math.min(width, xOf(position)));
    ctx.fillStyle = 'rgba(8, 7, 5, 0.5)';
    ctx.fillRect(0, 0, playheadX, height);

    // 5. Hot-cue pennants, coloured per slot like a Rekordbox strip.
    const cues = this.cueColors();
    deck.hotCues.forEach((cuePosition, index) => {
      if (cuePosition === null) return;
      const x = xOf(cuePosition);
      if (x < -hairline || x > width + hairline) return;
      ctx.fillStyle = cues[index % cues.length];
      ctx.fillRect(x, 0, Math.max(hairline, 2), height * 0.34);
      ctx.fillRect(x, height * 0.34, Math.max(hairline, 2), height * 0.66);
    });

    // 6. Slip marker: where the groove would have been without the scratch.
    if (progress.slipPosition !== progress.position) {
      const slipX = xOf(progress.slipPosition);
      if (slipX > -8 && slipX < width + 8) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.lineWidth = hairline;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(slipX, 0);
        ctx.lineTo(slipX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 7. Stylus position.
    ctx.fillStyle = this.boothColor('--vv-ink', '#f3ead9');
    ctx.fillRect(playheadX - hairline, 0, hairline * 2, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(playheadX - hairline * 3, 0, hairline * 6, height);
    ctx.fillStyle = this.boothColor('--vv-ink', '#f3ead9');
    ctx.fillRect(playheadX - hairline, 0, hairline * 2, height);
  }

  private drawMeters() {
    this.drawMeter('A', this.meterA?.nativeElement);
    this.drawMeter('B', this.meterB?.nativeElement);
  }

  /**
   * Vintage console VU ladder: discrete lamp segments (green → amber → red)
   * with a slow-falling peak-hold line, exactly like the meter bridge of a
   * 1970s mixer. Deliberately bar-based rather than a needle so the same
   * canvas reads correctly as a narrow channel strip on Android.
   */
  private drawMeter(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const level = Math.max(0, Math.min(1, this.engine.getDeckLevel(id)));
    const held = Math.max(level, this.meterPeak[id] * 0.93);
    this.meterPeak[id] = held;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.boothColor('--vv-meter-well', '#0b0906');
    ctx.fillRect(0, 0, width, height);

    const segments = 22;
    const gap = Math.max(1, Math.round(height / (segments * 3)));
    const segmentHeight = (height - gap * (segments - 1)) / segments;
    const lamp = (position: number) =>
      position > 0.86
        ? '#c0392b'
        : position > 0.68
          ? '#e0a13a'
          : this.boothColor('--vv-lamp', '#7bb648');

    for (let index = 0; index < segments; index++) {
      const position = (index + 1) / segments;
      const y = height - (index + 1) * segmentHeight - index * gap;
      const lit = position <= level + 0.0001;
      ctx.fillStyle = lit ? lamp(position) : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, y, width, Math.max(1, segmentHeight));
    }

    // Peak-hold hairline falls slowly so transients stay readable.
    const peakY = height - held * height;
    ctx.fillStyle =
      held > 0.95 ? '#ff5a45' : this.boothColor('--vv-ink', '#f3ead9');
    ctx.fillRect(0, Math.max(0, peakY - 1), width, Math.max(1, width * 0.12));
  }

  getDeckLevel(id: 'A' | 'B') {
    return this.engine.getDeckLevel(id);
  }

  deckProgressPercent(deck: 'A' | 'B') {
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    if (!d.duration) return 0;
    return Math.max(0, Math.min(1, d.progress / d.duration));
  }

  progressRingStyle(deck: 'A' | 'B') {
    const pct = this.deckProgressPercent(deck);
    const accent =
      deck === 'A'
        ? 'var(--color-primary, #10b981)'
        : 'var(--color-accent, #f59e0b)';
    const deg = pct * 360;
    return `conic-gradient(${accent} ${deg}deg, rgba(148,163,184,0.2) ${deg}deg 360deg)`;
  }

  async loadTrackFor(deckId: 'A' | 'B') {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (!files?.length) return;
    const file = files[0];
    const buffer = await this.fileLoader.decodeToAudioBuffer(
      this.engine.getContext(),
      file
    );
    this.deckService.loadDeckBuffer(deckId, buffer, file.name);
    // A new record: drop the cached peak strip and any stale loop marks, then
    // repaint immediately instead of waiting for the idle tick.
    this.waveformOverview[deckId] = null;
    this.waveformOverviewSource[deckId] = null;
    this.resetLoopMarkers(deckId);
    this.deckService.syncProgress();
    this.requestRepaint();
    this.sessionNotice.set(`Deck ${deckId}: ${file.name} on the platter.`);
  }

  tapBpm(deck: 'A' | 'B') {
    const now = Date.now();
    if (!this.tapTimes[deck]) this.tapTimes[deck] = [];
    this.tapTimes[deck].push(now);
    if (this.tapTimes[deck].length > 4) this.tapTimes[deck].shift();
    if (this.tapTimes[deck].length > 1) {
      const diffs = [];
      for (let i = 1; i < this.tapTimes[deck].length; i++) {
        diffs.push(this.tapTimes[deck][i] - this.tapTimes[deck][i - 1]);
      }
      const avg = diffs.reduce((a, b) => a + b) / diffs.length;
      const bpm = Math.round(60000 / avg);
      this.deckService.setBpm(deck, bpm);
    }
  }

  /**
   * Apply a newly selected FX mode immediately at each deck's current
   * depth. Clicking a mode chip must disengage the previous effect's
   * audio (autowah filter, damp EQ, reverb/rotate sends, insert wet) —
   * waiting for the next knob drag would leave the old effect audible
   * while the UI already shows the new mode.
   */
  selectFxMode(
    mode: 'autowah' | 'echo' | 'damp' | 'reverb' | 'chorus' | 'phaser' | 'rotate'
  ) {
    this.fxMode.set(mode);
    const engage = (deck: 'A' | 'B') => {
      const state = this.getDeckState(deck);
      if (!state.track) return;
      this.deckService.setFx(deck, mode, this.clampFxAmount(state.fxAmount));
    };
    engage('A');
    engage('B');
  }

  handlePadDown(
    deck: 'A' | 'B',
    index: number,
    event?: MouseEvent | TouchEvent
  ) {
    if (this.performanceMode() !== 'roll') return;
    event?.preventDefault();
    this.haptics.impact('medium');
    this.startRoll(deck, index);
  }

  handlePadRelease(deck: 'A' | 'B', index: number) {
    if (this.performanceMode() !== 'roll') return;
    const activePad =
      deck === 'A' ? this.activeRollPadA() : this.activeRollPadB();
    if (activePad !== index) return;
    this.stopRoll(deck);
  }

  handlePadPress(deck: 'A' | 'B', index: number) {
    const mode = this.performanceMode();
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    this.haptics.preset(d.hotCues[index] === null ? 'noteOn' : 'noteOff');
    this.requestRepaint();

    if (mode === 'cue') {
      if (d.hotCues[index] === null) this.deckService.setHotCue(deck, index);
      else this.deckService.jumpToHotCue(deck, index);
      this.sessionNotice.set(
        d.hotCues[index] === null
          ? `Deck ${deck} hot cue ${index + 1} captured.`
          : `Deck ${deck} jumped to hot cue ${index + 1}.`
      );
      return;
    }

    if (mode === 'roll') return;

    if (d.samplerPads[this.samplerCategory()][index] === null) {
      this.deckService.setSamplerPad(deck, index, this.samplerCategory());
      this.sessionNotice.set(`Deck ${deck} sample pad ${index + 1} armed.`);
      return;
    }

    this.triggerSamplerPad(deck, index);
  }

  clearHotCue(deck: 'A' | 'B', index: number, event: MouseEvent) {
    event.preventDefault();
    this.deckService.clearHotCue(deck, index);
    this.sessionNotice.set(`Deck ${deck} hot cue ${index + 1} cleared.`);
  }

  clearPad(deck: 'A' | 'B', index: number, event: MouseEvent) {
    event.preventDefault();
    if (this.performanceMode() === 'roll') {
      this.sessionNotice.set(
        'Roll pads cannot be cleared - they are live performance triggers without stored state.'
      );
      return;
    }

    if (this.performanceMode() === 'sampler') {
      this.deckService.clearSamplerPad(deck, index, this.samplerCategory());
      this.clearSamplerActivePad(deck);
      this.sessionNotice.set(`Deck ${deck} sample pad ${index + 1} cleared.`);
      return;
    }

    this.clearHotCue(deck, index, event);
  }

  getPadLabel(index: number) {
    const mode = this.performanceMode();
    if (mode === 'cue') return `Cue ${index + 1}`;
    if (mode === 'roll') return `${this.rollPadLabels[index] || '1'} Roll`;
    return this.getSamplePadLabel(index);
  }

  isCuePadSet(deck: 'A' | 'B', index: number) {
    return this.getDeckState(deck).hotCues[index] !== null;
  }

  isSamplerPadSet(deck: 'A' | 'B', index: number) {
    return (
      this.getDeckState(deck).samplerPads[this.samplerCategory()][index] !==
      null
    );
  }

  isRollPadActive(deck: 'A' | 'B', index: number) {
    return (
      (deck === 'A' ? this.activeRollPadA() : this.activeRollPadB()) === index
    );
  }

  isSamplerPadActive(
    deck: 'A' | 'B',
    index: number,
    category?: 'drums' | 'fx' | 'vocals'
  ) {
    if (category && category !== this.samplerCategory()) return false;
    return (
      (deck === 'A' ? this.activeSamplerPadA() : this.activeSamplerPadB()) ===
      index
    );
  }

  private toFiniteNumber(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    const numeric =
      typeof value === 'number' ? value : Number(value as unknown);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private clampRange(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  private clampPlaybackRate(rate: number) {
    return this.clampRange(rate, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);
  }

  private clampBassBoost(amount: number) {
    return this.clampRange(amount, 0, BASS_BOOST_MAX);
  }

  private clampMasterVolume(volume: number) {
    return this.clampRange(volume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX);
  }

  private clampCrossfade(value: number) {
    return this.clampRange(value, CROSSFADE_MIN, CROSSFADE_MAX);
  }

  private clampDeckGain(gain: number) {
    return this.clampRange(gain, DECK_GAIN_MIN, DECK_GAIN_MAX);
  }

  private clampSendGain(gain: number) {
    return this.clampRange(gain, SEND_GAIN_MIN, SEND_GAIN_MAX);
  }

  private clampFxAmount(amount: number) {
    return this.clampRange(amount, FX_AMOUNT_MIN, FX_AMOUNT_MAX);
  }

  private clampStemGain(gain: number) {
    return this.clampRange(gain, STEM_GAIN_MIN, STEM_GAIN_MAX);
  }

  private clampEqBand(value: number) {
    return this.clampRange(value, EQ_BAND_MIN, EQ_BAND_MAX);
  }

  private clampFilterFreq(freq: number) {
    return this.clampRange(freq, FILTER_FREQ_MIN, FILTER_FREQ_MAX);
  }

  private clampSaturation(amount: number) {
    return this.clampRange(amount, SATURATION_MIN, SATURATION_MAX);
  }

  private clampLoopBeats(beats: number) {
    return this.clampRange(beats, LOOP_PRESET_BEAT_MIN, LOOP_PRESET_BEAT_MAX);
  }

  private validateStem(stem: string): keyof Stems | null {
    const allowed: Array<keyof Stems> = [
      'vocals',
      'drums',
      'bass',
      'instrumental',
      'other',
    ];
    return (allowed as string[]).includes(stem) ? (stem as keyof Stems) : null;
  }

  setPlaybackRate(deck: 'A' | 'B', rate: any) {
    const r = this.toFiniteNumber(rate);
    this.deckService.setPlaybackRate(deck, this.clampPlaybackRate(r));
  }

  toggleKeyLock(deck: 'A' | 'B') {
    const state = this.getDeckState(deck);
    this.deckService.setKeyLock(deck, !state.keyLock);
    this.sessionNotice.set(
      `Deck ${deck} key lock ${!state.keyLock ? 'enabled' : 'disabled'} (best-effort).`
    );
  }

  setBassBoost(deck: 'A' | 'B', value: any) {
    const amount = this.toFiniteNumber(value);
    this.deckService.setBassBoost(deck, this.clampBassBoost(amount));
  }

  setQuickEq(deck: 'A' | 'B', band: 'high' | 'mid' | 'low') {
    const state = this.getDeckState(deck);
    const currentValue =
      band === 'high'
        ? state.eqHigh
        : band === 'mid'
          ? state.eqMid
          : state.eqLow;
    const nextValue = currentValue > 0.2 ? 0 : 1;
    this.updateEq(deck, band, nextValue);
  }

  setPrecisionEqBand(deck: 'A' | 'B', index: number, value: any) {
    const raw = this.toFiniteNumber(value, 1);
    const precision = deck === 'A' ? this.precisionEqA : this.precisionEqB;
    const current = precision();
    if (index < 0 || index >= current.length) return;
    const updated = [...current];
    updated[index] = this.clampEqBand(raw);
    precision.set(updated);

    const low = this.averageBand(updated, EQ_LOW_RANGE[0], EQ_LOW_RANGE[1]);
    const mid = this.averageBand(updated, EQ_MID_RANGE[0], EQ_MID_RANGE[1]);
    const high = this.averageBand(updated, EQ_HIGH_RANGE[0], EQ_HIGH_RANGE[1]);
    this.deckService.setDeckEq(deck, high, mid, low);
  }

  updateEq(deck: 'A' | 'B', band: 'high' | 'mid' | 'low', val: any) {
    const v = this.toFiniteNumber(val);
    const d =
      deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    let { eqHigh, eqMid, eqLow } = d;
    const clamped = this.clampEqBand(v);
    if (band === 'high') eqHigh = clamped;
    if (band === 'mid') eqMid = clamped;
    if (band === 'low') eqLow = clamped;
    this.deckService.setDeckEq(deck, eqHigh, eqMid, eqLow);
  }

  updateFilter(deck: 'A' | 'B', val: any) {
    const freq = this.toFiniteNumber(val);
    this.deckService.setDeckFilter(deck, this.clampFilterFreq(freq));
  }

  setGain(deck: 'A' | 'B', val: any) {
    const gain = this.toFiniteNumber(val);
    this.deckService.setDeckGain(deck, this.clampDeckGain(gain));
  }

  setSend(deck: 'A' | 'B', send: 'A' | 'B', val: any) {
    const gain = this.toFiniteNumber(val);
    this.deckService.setDeckSend(deck, send, this.clampSendGain(gain));
  }

  setMasterVolume(val: any) {
    const v = this.toFiniteNumber(val);
    const clamped = this.clampMasterVolume(v);
    this.masterVolume.set(clamped);
    this.engine.setMasterOutputLevel(clamped);
  }

  toggleRecording() {
    if (this.recording()) {
      this.sessionNotice.set('Finalizing live mix capture...');
      this.recorder?.stop();
      return;
    }

    const { recorder, result } = this.exportService.startLiveRecording();
    this.recorder = recorder;
    this.recording.set(true);
    this.startRecordingTimer();
    this.sessionNotice.set('Recording live mix...');
    this.recordingStatus.setRecordingSource({
      type: 'dj-deck',
      deckId: 'master',
    });

    recorder.onerror = () => {
      this.sessionNotice.set('Recording failed to complete.');
      this.recordingStatus.clearRecordingSource();
      this.cleanupRecordingState();
    };

    result
      .then((blob) => {
        const extension = blob.type.includes('ogg')
          ? 'ogg'
          : blob.type.includes('wav')
            ? 'wav'
            : 'webm';
        return this.exportService.downloadBlob(
          blob,
          `mix-${Date.now()}.${extension}`
        );
      })
      .then(() => {
        this.sessionNotice.set('Live mix exported successfully.');
        this.recordingStatus.clearRecordingSource();
      })
      .catch(() => {
        this.sessionNotice.set('Live mix export failed.');
        this.recordingStatus.clearRecordingSource();
      })
      .finally(() => {
        this.cleanupRecordingState();
      });
  }

  toggleLoop(deck: 'A' | 'B') {
    this.deckService.toggleLoop(deck);
    const engaged = this.getDeckState(deck).loop;
    if (!engaged) this.resetLoopMarkers(deck);
    this.haptics.preset('loopMarker');
    this.requestRepaint();
    this.sessionNotice.set(
      `Deck ${deck} loop ${engaged ? 'engaged' : 'released'}.`
    );
  }

  sync(deck: 'A' | 'B') {
    this.deckService.sync(deck);
  }

  setStemGain(deck: 'A' | 'B', stem: string, event: Event) {
    const target = event.target as HTMLInputElement | null;
    const gain = target?.valueAsNumber ?? 0;
    const safeStem = this.validateStem(stem);
    if (!safeStem) return;
    this.deckService.onStemGainChange(deck, {
      stem: safeStem,
      gain: this.clampStemGain(gain),
    });
  }

  setCrossfade(val: any) {
    const cf = this.toFiniteNumber(val);
    this.deckService.crossfade.set(this.clampCrossfade(cf));
  }

  onPlatterDown(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const isA = deck === 'A';

    let touchId: number | null = null;
    if ('touches' in event && (event as TouchEvent).touches.length) {
      const touch =
        (event as TouchEvent).changedTouches[0] ||
        (event as TouchEvent).touches[0];
      touchId = touch.identifier;
    }

    if (isA) {
      this.isScratchingA.set(true);
      this.activeTouchA = touchId;
    } else {
      this.isScratchingB.set(true);
      this.activeTouchB = touchId;
    }

    const angle = this.getAngle(event, deck);
    if (isA) this.lastAngleA = angle;
    else this.lastAngleB = angle;

    this.platterCenters[deck] = this.getEventTargetCenter(event);
    const deckState = this.getDeckState(deck);
    this.wasPlaying[deck] = deckState.isPlaying;
    if (deckState.isPlaying) this.engine.pauseDeck(deck);
    // Catching a spinning record cancels the free-wheel of a previous flick.
    this.setPlatterSpin(deck, 0);
    this.haptics.preset('tick');
    this.requestRepaint();
  }

  @HostListener('window:mousemove', ['$event'])
  onPlatterMove(event: MouseEvent) {
    this.handlePlatterMove(event);
  }

  @HostListener('window:touchmove', ['$event'])
  onPlatterTouchMove(event: TouchEvent) {
    this.handlePlatterMove(event);
  }

  private handlePlatterMove(event: MouseEvent | TouchEvent) {
    if (this.knobDrag) this.handleKnobMove(event);
    if (this.tonearmDragging()) this.handleTonearmMove(event);
    if (this.isScratchingA()) this.processScratch('A', event);
    if (this.isScratchingB()) this.processScratch('B', event);
  }

  @HostListener('window:mouseup', ['$event'])
  onPlatterMouseUp(_event: MouseEvent) {
    this.endKnobDrag();
    this.tonearmDragging.set(null);
    // Mouse pointers carry no identifier: a `mouseup` releases every deck that
    // was grabbed with the mouse, and never a deck held by a finger.
    if (this.activeTouchA === null) this.finishScratch('A');
    if (this.activeTouchB === null) this.finishScratch('B');
  }

  @HostListener('window:touchend', ['$event'])
  @HostListener('window:touchcancel', ['$event'])
  onPlatterTouchEnd(event: TouchEvent) {
    this.endKnobDrag();
    this.tonearmDragging.set(null);
    const ended = new Set<number>();
    const changed = event?.changedTouches;
    if (changed) {
      for (const touch of Array.from(changed)) ended.add(touch.identifier);
    }
    this.releaseTouchGrab('A', ended);
    this.releaseTouchGrab('B', ended);
  }

  /**
   * Multi-touch safety net.
   *
   * Every finger that lands anywhere in the booth eventually fires a
   * window-level `touchend` — a pad hit, a crossfader drag, a knob sweep. The
   * previous implementation released *both* platters on any of those, so a
   * live scratch died the moment the other hand touched a performance pad.
   * A deck now only lets go when its own captured touch point ends.
   */
  private releaseTouchGrab(deck: 'A' | 'B', ended: Set<number>) {
    const isA = deck === 'A';
    if (!(isA ? this.isScratchingA() : this.isScratchingB())) return;
    const touchId = isA ? this.activeTouchA : this.activeTouchB;
    if (touchId === null) return;
    if (ended.size && !ended.has(touchId)) return;
    this.finishScratch(deck);
  }

  /** Release every grab regardless of pointer type (used by tests + resets). */
  onPlatterUp() {
    this.finishScratch('A');
    this.finishScratch('B');
  }

  private finishScratch(deck: 'A' | 'B') {
    const isA = deck === 'A';
    if (!(isA ? this.isScratchingA() : this.isScratchingB())) return;

    if (isA) {
      this.isScratchingA.set(false);
      this.activeTouchA = null;
      this.scratchVelocityA.set(0);
    } else {
      this.isScratchingB.set(false);
      this.activeTouchB = null;
      this.scratchVelocityB.set(0);
    }

    const deckState = this.getDeckState(deck);
    const progress = this.engine.getDeckProgress(deck);

    if (deckState.slip && this.wasPlaying[deck]) {
      this.engine.seekDeck(deck, progress.slipPosition);
    }

    this.engine.setDeckRate(deck, deckState.playbackRate, deckState.keyLock);
    if (this.wasPlaying[deck]) this.engine.playDeck(deck);
    this.wasPlaying[deck] = false;
    this.deckService.syncProgress();
    this.requestRepaint();
  }

  private setPlatterSpin(deck: 'A' | 'B', value: number) {
    const clamped = Math.max(
      -MAX_PLATTER_SPIN_DEG_PER_SEC,
      Math.min(MAX_PLATTER_SPIN_DEG_PER_SEC, value)
    );
    const next = { ...this.platterSpin() };
    next[deck] = clamped;
    this.platterSpin.set(next);
  }

  /**
   * Safety net for momentary pads: if a pointer leaves the pad or the OS
   * cancels the touch (gesture steal, notification, scroll interrupt), the
   * button-level (mouseup)/(touchend) handlers never fire and a beat roll
   * would loop forever. Window-level release + touchcancel clears any active
   * roll. No-op when nothing is held, so double-firing with the pad's own
   * handlers is harmless.
   */
  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  @HostListener('window:touchcancel')
  onGlobalPointerRelease() {
    if (this.activeRollPadA() !== null) this.stopRoll('A');
    if (this.activeRollPadB() !== null) this.stopRoll('B');
  }

  private processScratch(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const angle = this.getAngle(event, deck);
    const lastAngle = deck === 'A' ? this.lastAngleA : this.lastAngleB;
    let delta = angle - lastAngle;

    // Normalise delta into the principal range [-π, π] so we never feed
    // multi-revolution jumps to the audio engine or the scrub math.
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    // Use the advanced scratch engine
    const scratchDelta = (delta / (2 * Math.PI)) * 2; // Arbitrary scaling for feel
    this.deckService.scratch(deck, scratchDelta);

    const scrubSecondsPerRadian = 1.8 / (2 * Math.PI);
    const scrub = delta * scrubSecondsPerRadian;

    const progress = this.engine.getDeckProgress(deck).position;
    const duration = this.engine.getDeckProgress(deck).duration;
    let newPos = progress + scrub;
    if (newPos < 0) newPos = 0;
    if (duration) newPos = Math.min(duration, newPos);

    this.engine.seekDeck(deck, newPos);

    const SECONDS_PER_FRAME = 0.016;
    const velocity = (delta / SECONDS_PER_FRAME) * scrubSecondsPerRadian;
    this.engine.setDeckRate(deck, velocity, false);
    const velocityValue = Math.max(
      -1,
      Math.min(1, velocity / SCRATCH_VELOCITY_NORMALIZER)
    );
    if (deck === 'A') this.scratchVelocityA.set(velocityValue);
    else this.scratchVelocityB.set(velocityValue);

    const degreeDelta = delta * (180 / Math.PI);
    if (deck === 'A') {
      this.rotationA.update((r) => r + degreeDelta);
      this.lastAngleA = angle;
    } else {
      this.rotationB.update((r) => r + degreeDelta);
      this.lastAngleB = angle;
    }
    // Carry the flick out of the release: the record keeps free-wheeling and
    // slows down on its own, like a hand-spun platter.
    this.setPlatterSpin(deck, degreeDelta / SECONDS_PER_FRAME);
    this.requestRepaint();
  }

  private getAngle(event: MouseEvent | TouchEvent, deck?: 'A' | 'B'): number {
    const { x, y } = this.getPointerPosition(event, deck);
    const fallbackCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const storedCenter = deck ? this.platterCenters[deck] : null;
    const center =
      storedCenter || this.getEventTargetCenter(event) || fallbackCenter;
    return Math.atan2(y - center.y, x - center.x);
  }

  private getPointerPosition(event: MouseEvent | TouchEvent, deck?: 'A' | 'B') {
    if ('touches' in event && (event as TouchEvent).touches.length) {
      const targetId = deck === 'A' ? this.activeTouchA : this.activeTouchB;
      let touch = Array.from((event as TouchEvent).touches).find(
        (t) => t.identifier === targetId
      );
      if (!touch) touch = (event as TouchEvent).touches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
  }

  private getEventTargetCenter(event: MouseEvent | TouchEvent) {
    const target = event.currentTarget as HTMLElement | null;
    if (target && target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }

  setSaturation(val: any) {
    const amount = this.toFiniteNumber(val);
    const clamped = this.clampSaturation(amount);
    this.saturation.set(clamped);
    this.engine.setSaturation(clamped);
  }

  /** Normalised (0..1) position of the DRIVE knob for its engraved scale. */
  saturationPercent() {
    return Math.round(this.saturation() * 100);
  }

  // ───────────────────────────────────────────────────────────────
  // Vintage turntable transport — tonearm, motor, rotary controls
  // ───────────────────────────────────────────────────────────────

  /** 0 = first groove, 1 = run-out groove. Mirrors the cue position. */
  tonearmRatio(deck: 'A' | 'B') {
    const duration = this.deckDuration(deck);
    if (!duration) return 0;
    return this.clampRange(
      this.engine.getDeckProgress(deck).position / duration,
      0,
      1
    );
  }

  /** Degrees the arm swings around its rear-right pivot. */
  tonearmAngle(deck: 'A' | 'B') {
    return -22 + this.tonearmRatio(deck) * 44;
  }

  tonearmCueLabel(deck: 'A' | 'B') {
    if (!this.deckDuration(deck)) return '--:--';
    return this.formatTimecode(this.engine.getDeckProgress(deck).position);
  }

  onTonearmDown(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const box = target?.getBoundingClientRect?.();
    if (box && box.width) {
      this.tonearmBounds[deck] = { left: box.left, width: box.width };
    }
    this.tonearmDragging.set(deck);
    this.haptics.impact('light');
    this.seekFromTonearm(deck, event);
  }

  private handleTonearmMove(event: MouseEvent | TouchEvent) {
    const deck = this.tonearmDragging();
    if (deck) this.seekFromTonearm(deck, event);
  }

  onTonearmUp() {
    this.tonearmDragging.set(null);
  }

  /**
   * Needle drop: the arm rail spans the record face, so the pointer's x maps
   * straight onto track time. A real arm cannot reach the label or the lead-in
   * rim, which is why the travel is inset instead of a flat 0..1.
   */
  private seekFromTonearm(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    let box = this.tonearmBounds[deck];
    if (!box) {
      const target = event.currentTarget as HTMLElement | null;
      const rect = target?.getBoundingClientRect?.();
      if (!rect || !rect.width) return;
      box = { left: rect.left, width: rect.width };
      this.tonearmBounds[deck] = box;
    }
    const duration = this.deckDuration(deck);
    if (!duration) return;
    const point = this.pointerPoint(event);
    const ratio = this.clampRange((point.x - box.left) / box.width, 0, 1);
    const travel = this.clampRange(
      (ratio - TONEARM_TRAVEL_START) /
        (TONEARM_TRAVEL_END - TONEARM_TRAVEL_START),
      0,
      1
    );
    this.engine.seekDeck(deck, travel * duration);
    this.deckService.syncProgress();
    this.requestRepaint();
  }

  private pointerPoint(event: MouseEvent | TouchEvent) {
    const touchEvent = event as TouchEvent;
    const touch =
      touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0] ?? null;
    if (touch) return { x: touch.clientX, y: touch.clientY };
    const mouseEvent = event as MouseEvent;
    return { x: mouseEvent.clientX, y: mouseEvent.clientY };
  }

  /** Motor speed lever: 33 or 45 RPM, exactly like the hardware. */
  togglePlatterRpm(deck: 'A' | 'B') {
    const next: 33 | 45 = this.platterRpm()[deck] === 33 ? 45 : 33;
    const state = { ...this.platterRpm() };
    state[deck] = next;
    this.platterRpm.set(state);
    this.haptics.preset('snap');
    this.sessionNotice.set(`Deck ${deck} motor set to ${next} RPM.`);
  }

  toggleSlip(deck: 'A' | 'B') {
    this.deckService.toggleSlip(deck);
    this.sessionNotice.set(
      `Deck ${deck} slip mode ${
        this.getDeckState(deck).slip ? 'engaged' : 'released'
      }.`
    );
  }

  /** Drop the painted loop marks for a deck (loop released or new record). */
  private resetLoopMarkers(deck: 'A' | 'B') {
    const next = { ...this.loopRegion() };
    next[deck] = null;
    this.loopRegion.set(next);
  }

  /** Analog filter select: the physical HPF/LPF switch on a mixer channel. */
  setFilterMode(deck: 'A' | 'B', mode: 'lowpass' | 'highpass') {
    this.deckService.setDeckFilterMode(deck, mode);
    this.sessionNotice.set(
      `Deck ${deck} filter set to ${mode === 'highpass' ? 'HPF' : 'LPF'}.`
    );
  }

  /**
   * Normalised 0..1 knob position. Every rotary control on the booth shares one
   * sweep model, so the drag gesture, the engraved pointer and the readout can
   * never disagree about where a control sits.
   */
  knobNormalized(param: DjKnobParam, deck: 'A' | 'B') {
    const state = this.getDeckState(deck);
    switch (param) {
      case 'eqHigh':
        return this.clampRange(state.eqHigh / 2, 0, 1);
      case 'eqMid':
        return this.clampRange(state.eqMid / 2, 0, 1);
      case 'eqLow':
        return this.clampRange(state.eqLow / 2, 0, 1);
      case 'filter':
        return this.clampRange(
          Math.log(state.filterFreq / FILTER_FREQ_MIN) /
            Math.log(FILTER_FREQ_MAX / FILTER_FREQ_MIN),
          0,
          1
        );
      case 'gain':
        return this.clampRange(state.gain / 2, 0, 1);
      case 'fxAmount':
        return this.clampRange(state.fxAmount, 0, 1);
      case 'master':
        return this.clampRange(this.masterVolume() / MASTER_VOLUME_MAX, 0, 1);
      case 'drive':
        return this.clampRange(this.saturation(), 0, 1);
      default:
        return 0;
    }
  }

  /** Engraved-scale angle for a knob (7 o'clock to 5 o'clock). */
  knobRotation(param: DjKnobParam, deck: 'A' | 'B') {
    return -135 + this.knobNormalized(param, deck) * 270;
  }

  knobReadout(param: DjKnobParam, deck: 'A' | 'B') {
    const value = this.knobNormalized(param, deck);
    switch (param) {
      case 'eqHigh':
      case 'eqMid':
      case 'eqLow': {
        const db = (value * 2 - 1) * 12;
        return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
      }
      case 'filter': {
        const hz =
          FILTER_FREQ_MIN * Math.pow(FILTER_FREQ_MAX / FILTER_FREQ_MIN, value);
        return hz >= 1000
          ? `${(hz / 1000).toFixed(1)} kHz`
          : `${Math.round(hz)} Hz`;
      }
      case 'gain': {
        const db = value <= 0 ? -60 : 20 * Math.log10(value * 2);
        return `${db >= 0 ? '+' : ''}${Math.max(-60, db).toFixed(1)} dB`;
      }
      default:
        return `${Math.round(value * 100)}%`;
    }
  }

  isKnobActive(param: DjKnobParam, deck: 'A' | 'B') {
    const active = this.activeKnob();
    return !!active && active.param === param && active.deck === deck;
  }

  onKnobDown(
    param: DjKnobParam,
    deck: 'A' | 'B',
    event: MouseEvent | TouchEvent
  ) {
    event.preventDefault();
    const point = this.pointerPoint(event);
    this.knobDrag = {
      param,
      deck,
      startY: point.y,
      startNormalized: this.knobNormalized(param, deck),
      fine: !!(event as MouseEvent).shiftKey,
    };
    this.activeKnob.set({ deck, param });
    this.haptics.preset('detent');
  }

  private handleKnobMove(event: MouseEvent | TouchEvent) {
    const drag = this.knobDrag;
    if (!drag) return;
    event.preventDefault();
    const point = this.pointerPoint(event);
    const range = drag.fine ? KNOB_FINE_DRAG_RANGE_PX : KNOB_DRAG_RANGE_PX;
    const next = this.clampRange(
      drag.startNormalized + (drag.startY - point.y) / range,
      0,
      1
    );
    this.applyKnobNormalized(drag.param, drag.deck, next);
  }

  endKnobDrag() {
    if (!this.knobDrag) return;
    this.knobDrag = null;
    this.activeKnob.set(null);
    this.haptics.preset('tick');
  }

  /** Snap a rotary control back to its hardware detent (neutral) position. */
  resetKnob(param: DjKnobParam, deck: 'A' | 'B') {
    const neutral: Record<DjKnobParam, number> = {
      eqHigh: 0.5,
      eqMid: 0.5,
      eqLow: 0.5,
      filter: 1,
      gain: 0.5,
      fxAmount: 0,
      master: 0.85 / MASTER_VOLUME_MAX,
      drive: 0.1,
    };
    this.applyKnobNormalized(param, deck, neutral[param]);
    this.haptics.preset('faderUnity');
    this.sessionNotice.set(`${this.knobName(param)} on deck ${deck} reset.`);
  }

  knobName(param: DjKnobParam) {
    const names: Record<DjKnobParam, string> = {
      eqHigh: 'HIGH',
      eqMid: 'MID',
      eqLow: 'LOW',
      filter: 'FILTER',
      gain: 'CHANNEL LEVEL',
      fxAmount: 'FX DEPTH',
      master: 'MASTER OUTPUT',
      drive: 'DRIVE',
    };
    return names[param];
  }

  /**
   * Route a normalised knob sweep to the same deck-service call the previous
   * tap-to-toggle controls used, so the audio path is untouched — only the
   * gesture (a continuous drag instead of an on/off click) is new.
   */
  private applyKnobNormalized(
    param: DjKnobParam,
    deck: 'A' | 'B',
    value: number
  ) {
    const normalized = this.clampRange(value, 0, 1);
    switch (param) {
      case 'eqHigh':
        this.updateEq(deck, 'high', normalized * 2);
        return;
      case 'eqMid':
        this.updateEq(deck, 'mid', normalized * 2);
        return;
      case 'eqLow':
        this.updateEq(deck, 'low', normalized * 2);
        return;
      case 'filter':
        this.updateFilter(
          deck,
          FILTER_FREQ_MIN *
            Math.pow(FILTER_FREQ_MAX / FILTER_FREQ_MIN, normalized)
        );
        return;
      case 'gain':
        this.setGain(deck, normalized * 2);
        return;
      case 'fxAmount':
        this.setFxAmount(deck, normalized);
        return;
      case 'master':
        this.setMasterVolume(normalized * MASTER_VOLUME_MAX);
        return;
      case 'drive':
        this.setSaturation(normalized);
        return;
      default:
        return;
    }
  }

  seekTo(deck: 'A' | 'B', seconds: number) {
    const duration = this.deckDuration(deck);
    if (!duration) return;
    const target = this.clampRange(this.toFiniteNumber(seconds), 0, duration);
    this.engine.seekDeck(deck, target);
    this.deckService.syncProgress();
    this.requestRepaint();
  }

  nudgePosition(deck: 'A' | 'B', deltaSeconds: number) {
    const position = this.engine.getDeckProgress(deck).position;
    this.seekTo(deck, position + deltaSeconds);
  }

  /** Keyboard transport on the platter: a deck you can work without a pointer. */
  onPlatterKeydown(deck: 'A' | 'B', event: KeyboardEvent) {
    const step = event.shiftKey ? 5 : 0.5;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.nudgePosition(deck, -step);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.nudgePosition(deck, step);
        return;
      case 'Home':
        event.preventDefault();
        this.seekTo(deck, 0);
        return;
      case 'End':
        event.preventDefault();
        this.seekTo(deck, this.deckDuration(deck));
        return;
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.deckService.togglePlay(deck);
        return;
      default:
        return;
    }
  }

  /** `m:ss.t` timecode for the booth readouts. */
  formatTimecode(seconds: number) {
    const total = Math.max(0, seconds || 0);
    const minutes = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    const tenths = Math.floor((total % 1) * 10);
    return `${minutes}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }

  /** Which side of the crossfader is on air — drives the live-master rail. */
  isDeckLeading(deck: 'A' | 'B') {
    const mix = deck === 'A' ? this.crossfadeMixA() : this.crossfadeMixB();
    return mix > 52;
  }

  /** Both decks matched in tempo — the mixer's SYNC lamp. */
  syncLocked = computed(() => {
    const a = this.deckService.deckA();
    const b = this.deckService.deckB();
    if (!a.track?.name || !b.track?.name || !a.bpm || !b.bpm) return false;
    return Math.abs(this.deckATempo() - this.deckBTempo()) < 0.5;
  });

  trackLoaded(deck: 'A' | 'B') {
    return !!this.getDeckState(deck).track?.name;
  }

  /**
   * Live loop bounds straight from the audio engine, so a beat-quantized loop
   * engaged by a preset chip paints its region even though the preset path does
   * not round-trip through the signal state.
   */
  private loopRegionOf(deck: 'A' | 'B') {
    try {
      const runtime = this.engine.getDeck(deck) as
        | { loopEnabled?: boolean; loopStart?: number; loopEnd?: number }
        | undefined;
      if (!runtime?.loopEnabled) return null;
      const start = runtime.loopStart ?? 0;
      const end = runtime.loopEnd ?? 0;
      return end > start ? { start, end } : null;
    } catch {
      return null;
    }
  }

  applyScratchFx(deck: 'A' | 'B', type: 'brake' | 'spinback' | 'transform') {
    if (type === 'brake') this.engine.brakeDeck(deck);
    else if (type === 'spinback') this.engine.spinbackDeck(deck);
    else if (type === 'transform') this.engine.transformDeck(deck);
  }

  async saveSessionSnapshot() {
    const now = new Date();
    const title = `DJ Session ${now.toLocaleString()}`;
    const projectId = `dj-session-${now.getTime()}`;
    const userId = this.profileService.profile().id || 'anonymous';

    try {
      await this.databaseService.saveProject(
        projectId,
        title,
        this.buildSessionSnapshot(),
        userId
      );
      this.sessionNotice.set(`${title} saved.`);
    } catch {
      this.sessionNotice.set('Session save failed.');
    }
  }

  async exportSessionSnapshot() {
    const snapshot = this.buildSessionSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });

    try {
      await this.exportService.downloadBlob(
        blob,
        `dj-session-${Date.now()}.json`
      );
      this.sessionNotice.set('Session snapshot exported.');
    } catch {
      this.sessionNotice.set('Session export failed.');
    }
  }

  private buildSessionSnapshot() {
    const deckSnapshot = (deck: ReturnType<typeof this.deckService.deckA>) => ({
      trackName: deck.track?.name || 'No Track Loaded',
      bpm: deck.bpm,
      playbackRate: deck.playbackRate,
      progress: deck.progress,
      duration: deck.duration,
      gain: deck.gain,
      filterFreq: deck.filterFreq,
      eqHigh: deck.eqHigh,
      eqMid: deck.eqMid,
      eqLow: deck.eqLow,
      slip: deck.slip,
      hotCues: [...deck.hotCues],
      samplerPads: { ...deck.samplerPads },
    });

    return {
      type: 'dj-session-snapshot',
      exportedAt: new Date().toISOString(),
      performanceMode: this.performanceMode(),
      crossfade: this.deckService.crossfade(),
      masterVolume: this.masterVolume(),
      deckA: deckSnapshot(this.deckService.deckA()),
      deckB: deckSnapshot(this.deckService.deckB()),
    };
  }

  private startRecordingTimer() {
    this.recordingStartedAt = Date.now();
    this.recordingElapsedMs.set(0);
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    this.recordingInterval = setInterval(() => {
      if (this.recordingStartedAt) {
        this.recordingElapsedMs.set(Date.now() - this.recordingStartedAt);
      }
    }, RECORDING_TIMER_UPDATE_INTERVAL_MILLIS);
  }

  private cleanupRecordingState() {
    this.recording.set(false);
    this.recorder = null;
    this.recordingStartedAt = null;
    this.recordingElapsedMs.set(0);
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
  }

  formatDuration(durationMs: number) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private formatPadWindow(durationSeconds: number) {
    return durationSeconds < 1
      ? `${durationSeconds.toFixed(2)}s`
      : `${durationSeconds.toFixed(1)}s`;
  }

  private startRoll(deck: 'A' | 'B', index: number) {
    const progress = this.engine.getDeckProgress(deck);
    const deckState = this.getDeckState(deck);
    const duration = progress.duration || deckState.duration;
    if (!duration) {
      this.sessionNotice.set(`Load a track on deck ${deck} before rolling.`);
      return;
    }

    this.stopRoll(deck, false);
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    const loopDuration = this.getBeatWindowSeconds(
      deck,
      this.rollPadBeats[index] || 1
    );
    const origin = progress.position;
    const loopStart = this.getLoopStart(origin, loopDuration);
    const wasPlaying = progress.isPlaying || deckState.isPlaying;

    this.rollState[deck] = {
      padIndex: index,
      origin,
      duration,
      loopDuration,
      startedAt: Date.now(),
      playbackRate,
      wasPlaying,
    };
    this.setActiveRollPad(deck, index);
    this.engine.seekDeck(deck, loopStart);
    this.engine.playDeck(deck);
    this.clearRollInterval(deck);
    this.rollIntervals[deck] = setInterval(
      () => {
        const state = this.rollState[deck];
        if (!state) return;
        this.engine.seekDeck(
          deck,
          this.getLoopStart(state.origin, state.loopDuration)
        );
        this.engine.playDeck(deck);
      },
      Math.max(MIN_ROLL_INTERVAL_MILLIS, loopDuration * 1000)
    );
    this.deckService.syncProgress();
    this.sessionNotice.set(
      `Deck ${deck} ${this.rollPadLabels[index]} beat slip roll engaged.`
    );
  }

  private stopRoll(deck: 'A' | 'B', announce = true) {
    const state = this.rollState[deck];
    this.clearRollInterval(deck);
    this.setActiveRollPad(deck, null);
    this.rollState[deck] = null;
    if (!state) return;

    if (state.wasPlaying) {
      const elapsed =
        ((Date.now() - state.startedAt) / 1000) * state.playbackRate;
      const resumePosition = Math.max(
        0,
        Math.min(state.duration, state.origin + elapsed)
      );
      this.engine.seekDeck(deck, resumePosition);
      this.engine.playDeck(deck);
    } else {
      this.engine.pauseDeck(deck);
      this.engine.seekDeck(deck, state.origin);
    }

    this.deckService.syncProgress();
    if (announce) {
      this.sessionNotice.set(`Deck ${deck} roll released back to groove.`);
    }
  }

  private triggerSamplerPad(deck: 'A' | 'B', index: number) {
    const deckState = this.getDeckState(deck);
    const cuePosition = deckState.samplerPads[this.samplerCategory()][index];
    if (cuePosition === null) return;

    const progress = this.engine.getDeckProgress(deck);
    const duration = progress.duration || deckState.duration;
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    const wasPlaying = progress.isPlaying || deckState.isPlaying;
    const shotDuration = Math.min(
      this.getBeatWindowSeconds(deck, this.samplerPadBeats[index] || 1),
      Math.max(0.05, duration - cuePosition)
    );
    const origin = progress.position;

    this.clearSamplerReturnTimer(deck);
    this.setActiveSamplerPad(deck, index);
    this.engine.seekDeck(deck, cuePosition);
    this.engine.playDeck(deck);
    this.samplerReturnTimers[deck] = setTimeout(
      () => {
        if (wasPlaying) {
          const resumePosition = Math.max(
            0,
            Math.min(duration, origin + shotDuration * playbackRate)
          );
          this.engine.seekDeck(deck, resumePosition);
          this.engine.playDeck(deck);
        } else {
          this.engine.pauseDeck(deck);
          this.engine.seekDeck(deck, cuePosition);
        }
        this.clearSamplerActivePad(deck);
        this.deckService.syncProgress();
      },
      Math.max(MIN_SAMPLER_RETURN_MILLIS, shotDuration * 1000)
    );
    this.deckService.syncProgress();
    this.sessionNotice.set(
      `Deck ${deck} sampler pad ${index + 1} fired for ${this.formatPadWindow(shotDuration)}.`
    );
  }

  private getDeckState(deck: 'A' | 'B') {
    return deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
  }

  private getBeatWindowSeconds(deck: 'A' | 'B', beats: number) {
    const deckState = this.getDeckState(deck);
    const bpm = Math.max(1, deckState.bpm || 128);
    const playbackRate = Math.max(0.25, Math.abs(deckState.playbackRate || 1));
    return (60 / bpm / playbackRate) * beats;
  }

  private getLoopStart(origin: number, loopDuration: number) {
    return Math.max(0, origin - loopDuration);
  }

  private setActiveRollPad(deck: 'A' | 'B', index: number | null) {
    if (deck === 'A') this.activeRollPadA.set(index);
    else this.activeRollPadB.set(index);
  }

  private setActiveSamplerPad(deck: 'A' | 'B', index: number | null) {
    if (deck === 'A') this.activeSamplerPadA.set(index);
    else this.activeSamplerPadB.set(index);
  }

  private clearRollInterval(deck: 'A' | 'B') {
    if (this.rollIntervals[deck]) {
      clearInterval(this.rollIntervals[deck]);
      this.rollIntervals[deck] = null;
    }
  }

  private clearSamplerReturnTimer(deck: 'A' | 'B') {
    if (this.samplerReturnTimers[deck]) {
      clearTimeout(this.samplerReturnTimers[deck]);
      this.samplerReturnTimers[deck] = null;
    }
  }

  private clearSamplerActivePad(deck: 'A' | 'B') {
    this.clearSamplerReturnTimer(deck);
    this.setActiveSamplerPad(deck, null);
  }

  updateGain(deck: 'A' | 'B', value: any) {
    const raw = this.toFiniteNumber(value);
    const gain = this.clampDeckGain(raw);
    if (deck === 'A') {
      this.deckService.deckA.update((d) => ({ ...d, gain }));
    } else {
      this.deckService.deckB.update((d) => ({ ...d, gain }));
    }
    this.engine.setDeckGain(deck, gain);
  }

  updateCrossfader(value: any) {
    const raw = this.toFiniteNumber(value);
    const cf = this.clampCrossfade(raw);
    this.deckService.crossfade.set(cf);
    this.engine.setCrossfader(cf);
  }

  setSamplerCategory(cat: 'drums' | 'fx' | 'vocals') {
    if (cat !== 'drums' && cat !== 'fx' && cat !== 'vocals') return;
    this.samplerCategory.set(cat);
  }

  getSamplePadLabel(index: number) {
    const parsed = Number.parseInt(
      this.activeSamplePack().replace(/\D+/g, ''),
      10
    );
    const packLabel = Number.isFinite(parsed) ? `P${parsed}` : 'P1';
    return `${packLabel}-${index + 1}`;
  }

  toggleCue(deck: 'A' | 'B') {
    this.deckService.toggleCue(deck);
  }

  setFxAmount(deck: 'A' | 'B', amount: any) {
    const val = this.toFiniteNumber(amount);
    this.deckService.setFx(deck, this.fxMode(), this.clampFxAmount(val));
  }

  getSyncDelta() {
    return Math.abs(this.deckATempo() - this.deckBTempo()).toFixed(1);
  }

  getCrossfaderStatus() {
    const cf = this.deckService.crossfade();
    if (cf < -0.25) return 'Deck A Lead';
    if (cf > 0.25) return 'Deck B Lead';
    return 'Balanced Mix';
  }

  toggleAutomix() {
    this.deckService.toggleAutomix();
  }

  syncDeck(deck: 'A' | 'B') {
    this.deckService.autoSync(deck);
  }

  // ───────────────────────────────────────────────────────────────
  // DiscDj 3D-style UX additions
  // ───────────────────────────────────────────────────────────────

  /** DiscDj-style large + / − pitch bend buttons. Each tap nudges
   * the playbackRate by ±0.01 (≈ ±1%). Holding the button speeds
   * the nudge trivially so the user can slew. */
  nudgePitch(deck: 'A' | 'B', direction: 'up' | 'down' | 'reset') {
    const state = this.getDeckState(deck);
    const delta = direction === 'up' ? 0.01 : direction === 'down' ? -0.01 : 0;
    const raw = direction === 'reset' ? 1 : state.playbackRate + delta;
    const next = this.clampPlaybackRate(raw);
    this.deckService.setPlaybackRate(deck, next);
    this.sessionNotice.set(
      `Deck ${deck} pitch ${
        direction === 'reset'
          ? 'reset to 100%'
          : `bumped to ${this.formatPct(next)}`
      }`
    );
  }

  scratchPercent(value: number): number {
    return Math.abs(value) * 100;
  }

  private formatPct(rate: number) {
    return `${Math.round(rate * 100)}%`;
  }

  /** DiscDj-style loop length preset chips (1/8, 1/4, 1/2, 1, 2, 4, 8 beats).
   *  Engages a real beat-quantized loop region on the engine: the loop
   *  snaps to the beat grid behind the playhead and spans exactly the
   *  requested beat count (clamped to the track duration). */
  setLoopLengthPreset(deck: 'A' | 'B', beats: number) {
    const state = this.getDeckState(deck);
    if (!Number.isFinite(beats)) {
      this.sessionNotice.set(`Loop length must be a finite number.`);
      return;
    }
    if (!state.track?.id) {
      this.sessionNotice.set(`Load a track on deck ${deck} to loop.`);
      return;
    }
    const safeBeats = this.clampLoopBeats(beats);
    const bpm = Math.max(1, state.bpm || 128);
    const beatSec = 60 / bpm;
    const seconds = beatSec * safeBeats;
    const progress = this.engine.getDeckProgress(deck);
    const duration = progress.duration || state.duration || 0;
    // Snap the loop start to the beat grid behind the playhead.
    const start =
      duration > 0
        ? Math.max(0, Math.min(
            Math.floor(progress.position / beatSec) * beatSec,
            Math.max(0, duration - 0.01)
          ))
        : Math.max(0, Math.floor(progress.position / beatSec) * beatSec);
    const end = duration > 0
      ? Math.min(duration, start + seconds)
      : start + seconds;
    this.engine.setDeckLoopRegion(deck, start, end);
    // Keep the booth's loop indicator in sync with the engine region.
    const deckSignal =
      deck === 'A' ? this.deckService.deckA : this.deckService.deckB;
    if (typeof deckSignal?.update === 'function') {
      deckSignal.update((d: any) => ({ ...d, loop: true }));
    }
    this.sessionNotice.set(
      `Deck ${deck} ${safeBeats}-beat loop engaged (${seconds.toFixed(2)}s).`
    );
  }

  readonly loopLengthPresets: Array<{ beats: number; label: string }> = [
    { beats: 0.125, label: '1/8' },
    { beats: 0.25, label: '1/4' },
    { beats: 0.5, label: '1/2' },
    { beats: 1, label: '1' },
    { beats: 2, label: '2' },
    { beats: 4, label: '4' },
    { beats: 8, label: '8' },
  ];

  /** Deck size mode – changes platter + panel density for ergonomics. */
  deckSize = computed<'compact' | 'normal' | 'xl'>(() => {
    if (typeof window === 'undefined') return 'normal';
    const w = window.innerWidth;
    if (w < 768) return 'compact';
    if (w < 1280) return 'normal';
    if (w < 1600) return 'normal';
    return 'xl';
  });

  private getEffectiveDeckBpm(deck: 'A' | 'B') {
    const state = this.getDeckState(deck);
    if (!state.track || !state.bpm) return 0;
    return state.bpm * Math.abs(state.playbackRate || 1);
  }

  private averageBand(values: number[], start: number, end: number) {
    if (!values.length) return 1;
    const safeStart = Math.max(0, Math.min(values.length, start));
    const safeEnd = Math.max(safeStart, Math.min(values.length, end));
    if (safeStart >= safeEnd) return 1;
    const slice = values.slice(safeStart, safeEnd);
    if (!slice.length) return 1;
    return slice.reduce((sum, current) => sum + current, 0) / slice.length;
  }
}
