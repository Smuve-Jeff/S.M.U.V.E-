import { LoggingService } from './logging.service';
import {
  Injectable,
  signal,
  inject,
  Injector,
  untracked,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';
import { DynamicEffectsRack } from '../studio/effects/dynamic-effects-rack';

export type DeckId = 'A' | 'B';

export type CrossfaderCurve = 'linear' | 'power' | 'exp' | 'cut';

/**
 * Pure crossfader gain math. `val` is the fader position in [-1, 1]
 * (-1 = fully Deck A, +1 = fully Deck B); `curve` selects the blend law and
 * `hamster` swaps the channel orientation. Outputs are always non-negative
 * amplitude gains in [0, 1] — never phase-inverted.
 */
export function computeCrossfaderGains(
  val: number,
  curve: CrossfaderCurve = 'power',
  hamster = false
): { left: number; right: number } {
  const position = Math.max(-1, Math.min(1, Number.isFinite(val) ? val : 0));
  let v = (position + 1) / 2; // 0 = full A, 1 = full B
  if (hamster) v = 1 - v;

  let left: number;
  let right: number;
  switch (curve) {
    case 'cut': {
      // Hard switch through a narrow center band (0.48–0.52).
      const band = 0.02;
      const t = Math.max(0, Math.min(1, (v - (0.5 - band)) / (2 * band)));
      left = 1 - t;
      right = t;
      break;
    }
    case 'linear': {
      left = 1 - v;
      right = v;
      break;
    }
    case 'exp': {
      // Sharper-than-linear taper: deep dip at center for fine channel focus.
      left = Math.pow(1 - v, 1.7);
      right = Math.pow(v, 1.7);
      break;
    }
    case 'power':
    default: {
      // Equal-power blend: constant perceived loudness across the travel.
      left = Math.cos(v * 0.5 * Math.PI);
      right = Math.sin(v * 0.5 * Math.PI);
      break;
    }
  }
  return { left, right };
}

/**
 * Sprint A4 — Playback toggle for the arrangement-level transport.
 * `pattern` keeps the original loop-forever behaviour at `loopLengthSteps`.
 * `song` stops at `songLengthSteps` and raises `songEnded`.
 */
export type PlayMode = 'pattern' | 'song';

interface DeckChannel {
  id: DeckId;
  buffer: AudioBuffer | null;
  sources: { [K in keyof Stems]?: AudioBufferSourceNode | null };
  gains: { [K in keyof Stems]: GainNode };
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  /** Channel fader — driven by setDeckGain (per-deck level). */
  channelGain: GainNode;
  /** Crossfader gain — driven by setCrossfader (A/B balance). */
  gain: GainNode;
  sendA: GainNode;
  sendB: GainNode;
  /** Pre-fader headphone tap for CUE monitoring. */
  cueGain: GainNode;
  analyser: AnalyserNode;
  isPlaying: boolean;
  startTime: number;
  pauseOffset: number;
  rate: number;
  /** Key-lock: preserve pitch while changing speed (source detune comp). */
  keyLock: boolean;
  isCueing: boolean;
  loopStart: number;
  loopEnd: number;
  /** Precomputed max-abs peak buckets for the booth waveform. */
  peaks: Float32Array;
  stems: Stems | null;
  loopEnabled: boolean;
  slipEnabled: boolean;
  slipActive: boolean;
  slipStartTime: number;
  slipStartOffset: number;
  hotCues: (number | null)[];
  /** FX insert bus (echo/chorus/phaser) spliced between filter and pan. */
  fxIn: GainNode;
  fxDry: GainNode;
  fxSum: GainNode;
  fxDelay: DelayNode;
  fxDelayFb: GainNode;
  fxDelayWet: GainNode;
  fxFlanger: DelayNode;
  fxFlangerLfo: OscillatorNode;
  fxFlangerDepth: GainNode;
  fxFlangerWet: GainNode;
  fxPhaser: BiquadFilterNode[];
  fxPhaserLfo: OscillatorNode;
  fxPhaserDepth: GainNode;
  fxPhaserWet: GainNode;
}

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\d+$/;
  public static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.1;
  public static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

  // ── Pro: High-Quality Audio Context with oversampling ──────
  public readonly ctx: AudioContext = (() => {
    try {
      return new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 96000,
      });
    } catch {
      try {
        return new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000,
        });
      } catch {
        return new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
    }
  })();

  public readonly nativeSampleRate: number = this.ctx.sampleRate;
  public readonly oversampleFactor: number =
    this.nativeSampleRate >= 96000 ? 2 : this.nativeSampleRate >= 48000 ? 4 : 8;
  public readonly effectiveSampleRate: number =
    this.nativeSampleRate * this.oversampleFactor;

  private readonly antialiasEnabled = signal(true);
  private readonly ditherEnabled = signal(true);
  private ditherNode: GainNode | null = null;
  private oversampleNodes: Map<string, { up: GainNode; down: GainNode }> =
    new Map();

  public logger = inject(LoggingService);
  private injector = inject(Injector);
  private stemSeparationService = inject(StemSeparationService);

  public get recorder(): StudioRecordingEngineService {
    return this.injector.get(StudioRecordingEngineService);
  }

  public masterGain = this.ctx.createGain();
  public compressor = this.ctx.createDynamicsCompressor();
  public saturationNode = this.ctx.createWaveShaper();
  public limiter = this.ctx.createDynamicsCompressor();

  // ── Pro: Quantum Spectral Mastering & Metering Nodes ────────
  public quantumSaturation = this.ctx.createWaveShaper();
  public spectralExciter = this.ctx.createBiquadFilter();
  public subAtomicEnhancer = this.ctx.createGain();
  public lufsFilter1 = this.ctx.createBiquadFilter(); // K-weighting Stage 1
  public lufsFilter2 = this.ctx.createBiquadFilter(); // K-weighting Stage 2
  public lufsAnalyzer = this.ctx.createAnalyser();

  public masterAnalyser = this.ctx.createAnalyser();
  public masterEQ = this.ctx.createBiquadFilter();
  public masterShelf = this.ctx.createBiquadFilter();
  public masterWidener = this.ctx.createStereoPanner();

  // ── Pro: Master stereo-width (M/S) network ────────────────
  // Everything that feeds masterGain (tracks, decks, reverb, sends) funnels
  // through this stage before the pre-master bus, so the WIDTH macro affects
  // both the master-worklet path and the main-thread fallback chain.
  private readonly masterWidthSplitter = this.ctx.createChannelSplitter(2);
  private readonly masterWidthMid = this.ctx.createGain();
  private readonly masterWidthSidePos = this.ctx.createGain();
  private readonly masterWidthSideNeg = this.ctx.createGain();
  private readonly masterWidthSide = this.ctx.createGain();
  private readonly masterWidthSideL = this.ctx.createGain();
  private readonly masterWidthSideR = this.ctx.createGain();
  private readonly masterWidthMerger = this.ctx.createChannelMerger(2);
  private reverbConvolver = this.ctx.createConvolver();
  public reverbWet = this.ctx.createGain();

  public readonly sendAReturn = this.ctx.createGain();
  public readonly sendBReturn = this.ctx.createGain();

  // ── Pro: DAW Routing & Bus Logic ────────────────────────────
  public auxBuses = new Map<
    string,
    { gain: GainNode; analyser: AnalyserNode }
  >();
  private trackSendAGains = new Map<string, GainNode>();
  private trackSendBGains = new Map<string, GainNode>();
  private trackOutputs = new Map<string, GainNode>();
  /** Per-track *base* (pre-VCA) gain. Stored separately so VCA bus multiplier
   *  can re-multiply without drifting across fader edits. */
  private baseFaderGains = new Map<string, number>();
  /** Cached VCA multiplier per-track, evaluated lazily from VcaBusService.assignments. */
  private vcaMultipliers = new Map<string, number>();
  /** 20ms ramp window for VCA fader smoothing (avoids audio pops). */
  private static readonly VCA_RAMP_SECONDS = 0.02;

  /**
   * Apply a VCA multiplier onto a single track's fader gain node.
   * Base + multiplier stored in their own maps so consecutive calls do not drift.
   */
  setVcaMultiplier(trackId: string, multiplier: number): void {
    const clamped = Math.max(0, Math.min(1.5, multiplier));
    this.vcaMultipliers.set(trackId, clamped);
    const gain = this.trackFaderGains.get(trackId);
    if (!gain) return;
    const base = this.baseFaderGains.get(trackId) ?? gain.gain.value;
    const target = Math.max(0, Math.min(1.5, base * clamped));
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + AudioEngineService.VCA_RAMP_SECONDS);
  }

  /** Read-only inspector for mixer UI / tests. */
  getVcaMultiplier(trackId: string): number {
    return this.vcaMultipliers.get(trackId) ?? 1;
  }

  /**
   * Persist the post-fader *base* gain on a track. Called whenever the
   * track fader changes (UI drag, resetAllLevels, etc). The VCA multiplier
   * is reapplied on top of this base value.
   */
  setBaseFaderGain(trackId: string, baseGain: number): void {
    const clamped = Math.max(0, Math.min(1.5, baseGain));
    this.baseFaderGains.set(trackId, clamped);
    const gain = this.trackFaderGains.get(trackId);
    if (!gain) return;
    const multiplier = this.vcaMultipliers.get(trackId) ?? 1;
    const target = clamped * multiplier;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + AudioEngineService.VCA_RAMP_SECONDS);
  }
  private trackPhaseNodes = new Map<string, GainNode>();
  private trackWidthNodes = new Map<string, StereoPannerNode>();
  private trackFaderGains = new Map<string, GainNode>();
  private trackAuxSends = new Map<string, Map<string, GainNode>>();
  private trackEffectsRacks = new Map<string, DynamicEffectsRack>();
  /** Sprint B1 Phase 2 — live WASM plugin insert ScriptProcessors per track. */
  private trackPluginInserts = new Map<string, ScriptProcessorNode>();

  public tempo = signal(124.0);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public isCountIn = signal(false);

  // ── Pro: S.M.U.V.E.-MODE & Quantum State ────────────────────
  public smuveModeActive = signal(false);
  public quantumModeActive = signal(false);
  public currentLufs = signal(-14.0);

  public outputMode = signal<'speakers' | 'headphones'>('speakers');
  public performanceTier = signal<'ultra' | 'performance'>('ultra');
  public sidechainEnabled = signal(false);
  public scaleMode = signal('major');
  public scaleLock = signal(false);
  public metronomeEnabled = signal(false);
  public metronomeVolume = signal(0.5);

  public loopLengthSteps = signal(64);
  /**
   * Sprint A4 — total song length in steps. Defaults to 64 (= 4 bars),
   * MusicManagerService listens to `structure()` and pushes the real
   * length here so the song-stop boundary follows the arrangement.
   */
  public songLengthSteps = signal(64);
  /** Current playback mode (toggleable from arrangement view / transport bar). */
  public playMode = signal<PlayMode>('song');
  /** Rising-edge event: fires once when song mode reaches its end. */
  public songEnded = signal<boolean>(false);
  /** Convenience: the steps the scheduler should actually loop over. */
  public readonly effectiveLoopLength = computed<number>(() =>
    this.playMode() === 'song' ? this.songLengthSteps() : this.loopLengthSteps()
  );
  public currentBeat = signal(0);
  public visualStep = signal(0);
  private nextNoteTime = 0;
  private schedulerHandle: any = null;
  private currentStep = 0;
  private countInRemainingSteps = 0;
  public onScheduleStep?: (
    step: number,
    time: number,
    duration: number
  ) => void;
  public onCountInComplete?: () => void;
  /** Sprint A4 — fire-once callback when song-mode playback reaches the end. */
  public onSongEnded?: () => void;

  private sidechainMatrix = new Map<string, Set<string>>();
  private sidechainWorklets = new Map<string, AudioWorkletNode>();
  private sidechainRouting = new Map<string, { triggerGain: GainNode; sidechainInput: GainNode }>();
  private _sidechainWorkletLoaded = false;
  private deckA!: DeckChannel;
  private deckB!: DeckChannel;
  private crossfaderValue = 0.5;
  private crossfaderHamster = false;
  /** In-flight brake/spinback/transform intervals, keyed by deck id. */
  private pendingDeckFx = new Map<DeckId, { interval?: any }>();
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private tracksMap = new Map<string, any>();
  private masteringTargets = { lufs: -14, truePeak: -0.1 };
  private midiAccess: any = null;
  private midiOutputs: any[] = [];
  public midiClockEnabled = signal(true);
  private djTracks = new Map<number, any>();
  private workletNode: AudioWorkletNode | null = null;
  private masterWorkletNode: AudioWorkletNode | null = null;
  private _masterWorkletLoaded = false;
  private _masterWorkletInitPromise: Promise<void> | null = null;
  private _resumePromise: Promise<void> | null = null;
  readonly masterWorkletActive = signal(false);

  /** Raw master bus node BEFORE the worklet (for metronome, reverb sends, etc.) */
  private _preMasterGain = this.ctx.createGain();

  constructor() {
    this.deckA = this.createDeck('A');
    this.deckB = this.createDeck('B');

    // ── Professional Mastering Chain ───────────────────────────
    // Path: masterGain → preMasterGain → [master worklet OR fallback chain] → metering → destination
    // The main-thread chain is retained as fallback; the worklet replaces it when loaded.

    // Fallback chain (main-thread) — same as before
    this.compressor = this.ctx.createDynamicsCompressor();
    this.saturationNode = this.ctx.createWaveShaper();
    this.limiter = this.ctx.createDynamicsCompressor();

    // Master chain routing: masterGain → preMasterGain
    this.masterGain.gain.value = 1;
    this._preMasterGain.gain.value = 1;
    this.wireMasterWidthNetwork();

    // Build the fallback chain but don't connect it yet —
    // the worklet will be preferred if it loads successfully
    this._preMasterGain.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.quantumSaturation);
    this.quantumSaturation.connect(this.spectralExciter);
    this.spectralExciter.connect(this.subAtomicEnhancer);
    this.subAtomicEnhancer.connect(this.limiter);
    this.limiter.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.masterWidener);

    // Metering Chain (K-Weighting for LUFS) — after the mastering stage
    this.masterWidener.connect(this.lufsFilter1);
    this.lufsFilter1.connect(this.lufsFilter2);
    this.lufsFilter2.connect(this.lufsAnalyzer);
    this.lufsAnalyzer.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    this.reverbWet.connect(this.masterGain);
    this.sendAReturn.connect(this.masterGain);
    this.sendBReturn.connect(this.masterGain);

    // K-Weighting Filter Setup (ITU-R BS.1770-4)
    this.lufsFilter1.type = 'highshelf';
    this.lufsFilter1.frequency.value = 1500;
    this.lufsFilter1.gain.value = 4;
    this.lufsFilter2.type = 'highpass';
    this.lufsFilter2.frequency.value = 100;
    this.lufsFilter2.Q.value = 1;

    this.limiter.threshold.setValueAtTime(-0.1, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

    this.masterEQ.type = 'lowpass';
    this.masterEQ.frequency.value = 20000;
    this.masterShelf.type = 'highshelf';
    this.masterShelf.frequency.value = 5000;

    // Quantum Defaults
    this.spectralExciter.type = 'highshelf';
    this.spectralExciter.frequency.value = 8000;
    this.spectralExciter.gain.value = 0;
    this.subAtomicEnhancer.gain.value = 1;

    this.setSoftClip(0.1);
    this.setQuantumSaturation(0.0);
    this.initMasterWorklet();
    this.initMidiOut();
    // Populate the sink enumeration so the transport-bar dropdown has options on first click.
    // Device labels stay empty until the user grants permission, but deviceId entries are still
    // useful for setSinkId targeting and the empty-state hint check (`outputDevices().length === 0`).
    this.refreshOutputDevices();
    this.initWorklet();
    // Track AudioContext.state reactively so the contextState signal stays in sync
    // with engine lifecycle transitions (suspended ↔ running ↔ closed).
    this.ctx.onstatechange = this._ctxStateHandler;
    this._ctxStateHandler();
    this.startOutputMetering();
    this.autoAdjustEffect();
  }

  setQuantumSaturation(amount: number) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    this.quantumSaturation.curve = amount === 0 ? null : curve;
  }

  toggleSmuveMode(active: boolean) {
    this.smuveModeActive.set(active);
    if (this.masterWorkletNode) {
      this.masterWorkletNode.port.postMessage({
        slot: 'preset',
        payload: active ? 'smuve' : 'flat',
      });
    } else {
      if (active) {
        this.configureCompressor({
          threshold: -18,
          ratio: 4,
          attack: 0.01,
          release: 0.1,
        });
        this.configureLimiter({ threshold: -0.5, ratio: 20 });
        this.setSaturation(0.2);
      } else {
        this.configureCompressor({
          threshold: -12,
          ratio: 2,
          attack: 0.02,
          release: 0.2,
        });
        this.setSaturation(0.1);
      }
    }
  }

  toggleQuantumMode(active: boolean) {
    this.quantumModeActive.set(active);
    if (this.masterWorkletNode) {
      this.masterWorkletNode.port.postMessage({
        slot: 'preset',
        payload: active ? 'quantum' : 'smuve',
      });
    } else {
      if (active) {
        this.setQuantumSaturation(0.5);
        this.spectralExciter.gain.setTargetAtTime(3, this.ctx.currentTime, 0.1);
        this.subAtomicEnhancer.gain.setTargetAtTime(
          1.1,
          this.ctx.currentTime,
          0.1
        );
      } else {
        this.setQuantumSaturation(0);
        this.spectralExciter.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        this.subAtomicEnhancer.gain.setTargetAtTime(
          1.0,
          this.ctx.currentTime,
          0.1
        );
      }
    }
  }

  /**
   * Initialize the master bus AudioWorklet processor.
   * Replaces the main-thread compressor/saturation/limiter/EQ chain
   * with a single high-performance worklet running at native audio rate.
   */
  private initMasterWorklet(): Promise<void> {
    if (this._masterWorkletLoaded) return Promise.resolve();
    if (this._masterWorkletInitPromise) return this._masterWorkletInitPromise;

    // Keep the main-thread chain connected until the replacement node is fully
    // constructed and wired. This makes worklet loading an implementation
    // detail instead of a gap in the audible signal path.
    this._masterWorkletInitPromise = (async () => {
      try {
        await this.ctx.audioWorklet.addModule(
          'assets/worklets/master-processor.worklet.js'
        );
      } catch (err: any) {
        if (!err?.message?.includes('already')) {
          console.warn(
            'AudioEngine: Master worklet load failed, using main-thread fallback.',
            err?.message
          );
          return;
        }
      }

      let workletNode: AudioWorkletNode | null = null;
      try {
        workletNode = new AudioWorkletNode(this.ctx, 'master-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        });

        // Wire the replacement first, then remove only the fallback edge.
        // A bare disconnect() can also sever future inserts or parallel taps.
        this._preMasterGain.connect(workletNode);
        workletNode.connect(this.lufsFilter1);
        this._preMasterGain.disconnect(this.compressor);

        workletNode.port.postMessage({ slot: 'preset', payload: 'smuve' });
        this.masterWorkletNode = workletNode;
        this._masterWorkletLoaded = true;
        this.masterWorkletActive.set(true);
        this.logger.info(
          'AudioEngine: Master worklet active — 5-band EQ, compressor, saturation, lookahead limiter.'
        );
      } catch (err: any) {
        try {
          workletNode?.disconnect();
          this._preMasterGain.disconnect(workletNode);
        } catch {
          /* Keep the already-connected fallback alive. */
        }
        console.warn(
          'AudioEngine: Master worklet node creation failed, using main-thread fallback.',
          err?.message
        );
      }
    })();

    return this._masterWorkletInitPromise;
  }

  /** Configure a specific slot on the master worklet */
  configureMasterWorklet(slot: string, action: string, payload?: any): void {
    if (!this.masterWorkletNode) return;
    this.masterWorkletNode.port.postMessage({ slot, action, payload });
  }

  resume(): Promise<void> {
    if (this.ctx.state !== 'suspended') {
      this._ctxStateHandler?.();
      return Promise.resolve();
    }
    if (this._resumePromise) return this._resumePromise;

    // Keep one in-flight resume per context. This matters because Studio,
    // Transport, and the first user gesture can all call resume() together.
    this._resumePromise = this.ctx
      .resume()
      .then(() => this._ctxStateHandler?.())
      .catch((err) => {
        // Autoplay policy may reject a non-gesture resume attempt. The next
        // real pointer/keyboard gesture will retry without breaking transport.
        this._ctxStateHandler?.();
        console.warn('AudioEngine: AudioContext resume was blocked.', err);
      })
      .finally(() => {
        this._resumePromise = null;
      });

    return this._resumePromise;
  }

  startCountIn(bars: number = 1) {
    this.resume();
    if (this.isPlaying()) return;
    this.isCountIn.set(true);
    this.isPlaying.set(true);
    const safeBars = Math.max(1, Math.floor(bars));
    this.countInRemainingSteps = this.stepsPerBeat() * 4 * safeBars;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
      this.workletNode.port.postMessage({ type: 'START' });
    } else {
      this.schedulerHandle = setInterval(
        () => this.scheduler(),
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
      );
    }
  }

  start() {
    this.resume();
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.sendMidiStart();
    // Sprint A4 — fresh start resets the song-ended latching signal.
    this.songEnded.set(false);
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
      this.workletNode.port.postMessage({ type: 'START' });
    } else {
      this.schedulerHandle = setInterval(
        () => this.scheduler(),
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS
      );
    }
  }

  stop() {
    this.isPlaying.set(false);
    this.sendMidiStop();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'STOP' });
    }
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
    this.currentStep = 0;
    this.currentBeat.set(0);
    this.visualStep.set(0);
    this.stopDeck('A');
    this.stopDeck('B');
  }

  private async initWorklet() {
    try {
      await this.ctx.audioWorklet.addModule(
        'assets/audio-processor.worklet.js'
      );
      this.workletNode = new AudioWorkletNode(
        this.ctx,
        'smuve-audio-processor'
      );
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'TICK') {
          const { step, time, duration } = event.data.payload;
          this.handleTick(step, time, duration);
        }
      };
      this.workletNode.port.postMessage({
        type: 'SET_TEMPO',
        payload: this.tempo(),
      });
    } catch (err) {
      console.warn(
        'AudioWorklet load failed, falling back to setInterval',
        err
      );
    }
  }

  private async initMidiOut() {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).requestMIDIAccess
    ) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
        this.updateMidiOutputs();
        this.midiAccess.onstatechange = () => this.updateMidiOutputs();
      } catch (e) {}
    }
  }
  private updateMidiOutputs() {
    if (this.midiAccess)
      this.midiOutputs = Array.from(this.midiAccess.outputs.values());
  }
  private sendMidiToAll(data: number[]) {
    this.midiOutputs.forEach((out) => out.send(data));
  }
  private sendMidiStart() {
    this.sendMidiToAll([0xfa]);
  }
  private sendMidiStop() {
    this.sendMidiToAll([0xfc]);
  }

  private handleTick(step: number, time: number, stepDuration: number) {
    // Sprint A4 — guard against re-entrant ticks after the song has ended.
    // The worklet may emit one or two trailing TICKs after STOP is queued;
    // we drop them so they cannot re-schedule audio past the boundary.
    if (this.songEnded()) return;

    if (this.isCountIn()) {
      if (step % this.stepsPerBeat() === 0) {
        this.playMetronomeClick(time, step === 0, true);
      }
      this.countInRemainingSteps--;
      if (this.countInRemainingSteps <= 0) {
        this.isCountIn.set(false);
        this.onCountInComplete?.();
        // Reset step in worklet if possible, else handle here
        if (this.workletNode)
          this.workletNode.port.postMessage({ type: 'RESET_STEP' });
        else this.currentStep = 0;
      }
      return;
    }

    // Sprint A4 — song-mode end detector. Stops transport the moment the
    // monotonically incrementing step meets or exceeds the arrangement
    // length. displayStep is the in-range step we hand to downstream
    // consumers (no modulo in song mode so clip gating sees the right index).
    let displayStep: number;
    if (this.playMode() === 'song') {
      const length = Math.max(1, this.songLengthSteps());
      if (step >= length) {
        this.songEnded.set(true);
        // stop() is synchronous w.r.t. UI flags; queued visual setTimeouts
        // for prior ticks will still run but they are no-ops because
        // songEnded() short-circuits at the top of this function.
        this.stop();
        this.onSongEnded?.();
        return;
      }
      displayStep = step;
    } else {
      displayStep = step % this.loopLengthSteps();
    }

    const loopedStep = displayStep;

    this.onScheduleStep?.(loopedStep, time, stepDuration);

    if (this.metronomeEnabled() && loopedStep % this.stepsPerBeat() === 0) {
      this.playMetronomeClick(
        time,
        loopedStep % (this.stepsPerBeat() * 4) === 0
      );
    }

    const visualDelay = (time - this.ctx.currentTime) * 1000;
    setTimeout(
      () => {
        this.visualStep.set(loopedStep);
        this.currentBeat.set(loopedStep / this.stepsPerBeat());
      },
      Math.max(0, visualDelay)
    );
  }

  private scheduler() {
    const stepDuration = 60 / this.tempo() / this.stepsPerBeat();
    while (
      this.nextNoteTime <
      this.ctx.currentTime + AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS
    ) {
      this.handleTick(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      if (!this.isCountIn()) {
        // Sprint A4: in song mode the counter goes straight — handleTick
        // detects the boundary and calls stop() (which clears the
        // schedulerHandle on its next tick). In pattern mode we wrap to
        // the existing loopLengthSteps to preserve the original behaviour.
        if (this.playMode() === 'song') {
          this.currentStep++;
        } else {
          this.currentStep =
            (this.currentStep + 1) % this.loopLengthSteps();
        }
      } else {
        this.currentStep++;
      }
    }
  }

  private playMetronomeClick(
    time: number,
    isDownbeat: boolean,
    force: boolean = false
  ) {
    if (!this.metronomeEnabled() && !force) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(isDownbeat ? 1000 : 600, time);
    env.gain.setValueAtTime(0, time);
    env.gain.setTargetAtTime(this.metronomeVolume(), time, 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  stepsPerBeat() {
    return 4;
  }

  private createDeck(id: DeckId): DeckChannel {
    const gains: any = {};
    ['drums', 'bass', 'instrumental', 'other', 'vocals'].forEach((s) => {
      gains[s] = this.ctx.createGain();
      gains[s].gain.value = 1;
    });

    // ── Deck FX insert bus ───────────────────────────────────────
    // echo (delay + feedback), chorus (LFO-modulated flanger delay) and
    // phaser (allpass cascade swept by an LFO) mix dry/wet into the deck
    // signal between the filter and the panner. Wet gains start at 0 so
    // the chain is silent until setAdvancedFX() drives it.
    const fxIn = this.ctx.createGain();
    const fxDry = this.ctx.createGain();
    const fxSum = this.ctx.createGain();
    const fxDelay = this.ctx.createDelay(1.0);
    const fxDelayFb = this.ctx.createGain();
    const fxDelayWet = this.ctx.createGain();
    const fxFlanger = this.ctx.createDelay(0.02);
    const fxFlangerLfo = this.ctx.createOscillator();
    const fxFlangerDepth = this.ctx.createGain();
    const fxFlangerWet = this.ctx.createGain();
    const fxPhaser: BiquadFilterNode[] = Array.from({ length: 4 }, () =>
      this.ctx.createBiquadFilter()
    );
    const fxPhaserLfo = this.ctx.createOscillator();
    const fxPhaserDepth = this.ctx.createGain();
    const fxPhaserWet = this.ctx.createGain();

    const deck: DeckChannel = {
      id,
      buffer: null,
      sources: {},
      gains,
      eqLow: this.ctx.createBiquadFilter(),
      eqMid: this.ctx.createBiquadFilter(),
      eqHigh: this.ctx.createBiquadFilter(),
      filter: this.ctx.createBiquadFilter(),
      pan: this.ctx.createStereoPanner(),
      channelGain: this.ctx.createGain(),
      gain: this.ctx.createGain(),
      sendA: this.ctx.createGain(),
      sendB: this.ctx.createGain(),
      cueGain: this.ctx.createGain(),
      analyser: this.ctx.createAnalyser(),
      isPlaying: false,
      startTime: 0,
      pauseOffset: 0,
      rate: 1.0,
      keyLock: false,
      isCueing: false,
      loopStart: 0,
      loopEnd: 0,
      stems: null,
      loopEnabled: false,
      slipEnabled: false,
      slipActive: false,
      slipStartTime: 0,
      slipStartOffset: 0,
      hotCues: new Array(8).fill(null),
      peaks: new Float32Array(0),
      fxIn,
      fxDry,
      fxSum,
      fxDelay,
      fxDelayFb,
      fxDelayWet,
      fxFlanger,
      fxFlangerLfo,
      fxFlangerDepth,
      fxFlangerWet,
      fxPhaser,
      fxPhaserLfo,
      fxPhaserDepth,
      fxPhaserWet,
    };
    deck.eqLow.type = 'lowshelf';
    deck.eqLow.frequency.value = 250;
    deck.eqMid.type = 'peaking';
    deck.eqMid.frequency.value = 1000;
    deck.eqHigh.type = 'highshelf';
    deck.eqHigh.frequency.value = 4000;
    deck.filter.type = 'lowpass';
    deck.filter.frequency.value = 20000;

    fxIn.gain.value = 1;
    fxDry.gain.value = 1;
    fxSum.gain.value = 1;
    fxDelay.delayTime.value = 0.35;
    fxDelayFb.gain.value = 0.35;
    fxDelayWet.gain.value = 0;
    fxFlanger.delayTime.value = 0.004;
    fxFlangerLfo.frequency.value = 0.25;
    fxFlangerDepth.gain.value = 0.0015;
    fxFlangerWet.gain.value = 0;
    fxPhaser.forEach((f, i) => {
      f.type = 'allpass';
      f.frequency.value = 320 * Math.pow(2.2, i);
      f.Q.value = 1.2;
    });
    fxPhaserLfo.frequency.value = 0.3;
    fxPhaserDepth.gain.value = 720;
    fxPhaserWet.gain.value = 0;

    fxIn.connect(fxDry);
    fxIn.connect(fxDelay);
    fxDelay.connect(fxDelayFb);
    fxDelayFb.connect(fxDelay);
    fxDelay.connect(fxDelayWet);
    fxDelayWet.connect(fxSum);
    fxIn.connect(fxFlanger);
    fxFlanger.connect(fxFlangerWet);
    fxFlangerWet.connect(fxSum);
    fxIn.connect(fxPhaser[0]);
    fxPhaser[0].connect(fxPhaser[1]);
    fxPhaser[1].connect(fxPhaser[2]);
    fxPhaser[2].connect(fxPhaser[3]);
    fxPhaser[3].connect(fxPhaserWet);
    fxPhaserWet.connect(fxSum);
    fxDry.connect(fxSum);
    fxSum.connect(deck.pan);
    fxFlangerLfo.connect(fxFlangerDepth);
    fxFlangerDepth.connect(fxFlanger.delayTime);
    fxPhaserLfo.connect(fxPhaserDepth);
    fxPhaser.forEach((f) => fxPhaserDepth.connect(f.frequency));
    fxFlangerLfo.start();
    fxPhaserLfo.start();

    // ── Deck signal chain ───────────────────────────────────────
    // Stems (sources) → per-stem gains → EQ → filter → FX bus → pan →
    // fader → analyser → master. Pre-fader taps feed the A/B send returns
    // and the CUE (headphone) bus. Crossfader + hamster live on the fader
    // gain.
    deck.eqLow.connect(deck.eqMid);
    deck.eqMid.connect(deck.eqHigh);
    deck.eqHigh.connect(deck.filter);
    deck.filter.connect(fxIn); // (patched FX bus)
    deck.filter.connect(deck.sendA);
    deck.filter.connect(deck.sendB);
    deck.filter.connect(deck.cueGain);
    deck.sendA.connect(this.sendAReturn);
    deck.sendB.connect(this.sendBReturn);
    deck.cueGain.gain.value = 0;
    deck.cueGain.connect(this.ctx.destination);
    deck.channelGain.gain.value = 1;
    deck.pan.connect(deck.channelGain);
    deck.channelGain.connect(deck.gain);
    deck.gain.connect(deck.analyser);
    deck.analyser.connect(this.masterGain);

    deck.fxIn = fxIn;
    deck.fxDry = fxDry;
    deck.fxSum = fxSum;
    deck.fxDelay = fxDelay;
    deck.fxDelayFb = fxDelayFb;
    deck.fxDelayWet = fxDelayWet;
    deck.fxFlanger = fxFlanger;
    deck.fxFlangerLfo = fxFlangerLfo;
    deck.fxFlangerDepth = fxFlangerDepth;
    deck.fxFlangerWet = fxFlangerWet;
    deck.fxPhaser = fxPhaser;
    deck.fxPhaserLfo = fxPhaserLfo;
    deck.fxPhaserDepth = fxPhaserDepth;
    deck.fxPhaserWet = fxPhaserWet;
    return deck;
  }

  getDeck(id: DeckId) {
    return id === 'A' ? this.deckA : this.deckB;
  }
  stopDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.isPlaying = false;
    this.clearDeckFx(id);
    Object.values(deck.sources).forEach((s) => {
      if (s) {
        try {
          s.stop();
        } catch (e) {}
      }
    });
    deck.sources = {};
  }

  /**
   * Real deck playback. Creates per-stem AudioBufferSourceNodes (or a single TAP
   * full-mix source when no stems are loaded) and starts them from the deck's
   * current `pauseOffset`. Position is derived from `startTime` + wall-clock
   * elapsed so the UI can poll cheaply without extra scheduling state.
   */
  playDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    if (deck.isPlaying) return;

    // Re-engaging playback resolves a slip (scratch) back to the ghost playhead.
    if (deck.slipActive) {
      deck.pauseOffset =
        deck.slipStartOffset +
        (this.ctx.currentTime - deck.slipStartTime) * Math.max(0, deck.rate);
      deck.slipActive = false;
    }

    this.stopDeck(id);
    this.resume();

    const buffer = deck.buffer;
    const safeRate = Number.isFinite(deck.rate) ? deck.rate : 1;
    const pos = Math.max(
      0,
      Math.min(deck.pauseOffset, Math.max(0, buffer.duration - 0.001))
    );
    const now = this.ctx.currentTime;
    deck.startTime = now - pos / Math.max(0.001, Math.abs(safeRate) || 1);
    deck.isPlaying = true;

    const stems = deck.stems;
    const hasStems = !!(
      stems &&
      (stems.vocals || stems.drums || stems.bass || stems.instrumental || stems.other)
    );
    const stemsToPlay: (keyof Stems)[] = hasStems
      ? (['vocals', 'drums', 'bass', 'instrumental', 'other'] as (keyof Stems)[]).filter(
          (s) => !!stems![s]
        )
      : ['other'];

    stemsToPlay.forEach((stem, index) => {
      const stemGain = deck.gains[stem];
      if (!stemGain) return;
      const src = this.ctx.createBufferSource();
      src.buffer = stems && stems[stem] ? stems[stem]! : buffer;
      src.playbackRate.value = safeRate;
      src.detune.value = deck.keyLock
        ? -1200 * Math.log2(Math.max(0.001, Math.abs(safeRate) || 1))
        : 0;
      if (deck.loopEnabled && deck.loopEnd > deck.loopStart) {
        src.loop = true;
        src.loopStart = deck.loopStart;
        src.loopEnd = deck.loopEnd;
      }
      src.connect(stemGain);
      src.start(now, pos);
      deck.sources[stem] = src;

      // Natural-end detection on the last scheduled source. Manual stops set
      // isPlaying = false first, so this only fires on real track ends.
      if (index === stemsToPlay.length - 1) {
        src.onended = () => {
          if (!deck.isPlaying) return;
          if (deck.loopEnabled) return;
          deck.isPlaying = false;
          deck.pauseOffset = deck.loopEnd || buffer.duration;
          deck.sources = {};
        };
      }
    });
  }

  pauseDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.isPlaying) return;
    this.clearDeckFx(id);
    const progress = this.getDeckProgress(id);
    deck.pauseOffset = progress.position;
    if (deck.slipEnabled) {
      // Freeze the ghost playhead while the platter is held.
      deck.slipActive = true;
      deck.slipStartTime = this.ctx.currentTime;
      deck.slipStartOffset = deck.pauseOffset;
    }
    this.stopDeck(id);
  }

  seekDeck(id: DeckId, pos: number) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    const duration = deck.buffer.duration;
    // With a loop engaged, keep the playhead inside the loop region.
    const upper =
      deck.loopEnabled && deck.loopEnd > deck.loopStart
        ? Math.min(duration, deck.loopEnd)
        : duration;
    const safe = Number.isFinite(pos)
      ? Math.max(0, Math.min(pos, upper))
      : 0;
    deck.pauseOffset = safe;
    if (deck.isPlaying) {
      this.stopDeck(id);
      this.playDeck(id);
    }
  }

  getDeckProgress(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) {
      return { position: 0, duration: 0, isPlaying: false, slipPosition: 0 };
    }
    const duration = deck.buffer.duration;
    let position = deck.isPlaying
      ? deck.pauseOffset +
        (this.ctx.currentTime - deck.startTime) * (deck.rate || 0)
      : deck.pauseOffset;

    // Wrap the playhead inside the active loop region for display purposes.
    if (
      deck.loopEnabled &&
      deck.loopEnd > deck.loopStart &&
      position >= deck.loopEnd
    ) {
      const span = deck.loopEnd - deck.loopStart;
      position = deck.loopStart + ((position - deck.loopStart) % span);
    }
    position = Math.max(0, Math.min(position, duration));

    let slipPosition = position;
    if (deck.slipActive) {
      slipPosition =
        deck.slipStartOffset +
        (this.ctx.currentTime - deck.slipStartTime) * Math.max(0, deck.rate);
    }
    return {
      position,
      duration,
      isPlaying: deck.isPlaying,
      slipPosition,
    };
  }

  getDeckLevel(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return 0;
    const data = new Float32Array(deck.analyser.fftSize);
    deck.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.min(1, Math.sqrt(sum / data.length) * 3);
  }

  getDeckWaveformData(id: DeckId) {
    const deck = this.getDeck(id);
    return deck?.peaks ?? new Float32Array(0);
  }
  setDeckGain(id: DeckId, val: number) {
    const deck = this.getDeck(id);
    if (deck)
      deck.channelGain.gain.setTargetAtTime(
        val,
        this.ctx.currentTime,
        0.01
      );
  }
  setDeckRate(id: DeckId, rate: number, sync: boolean = false) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const safeRate = Number.isFinite(rate)
      ? Math.max(-2, Math.min(2, rate))
      : 1;
    deck.rate = safeRate;
    // The engine treats `sync` as key-lock: preserve pitch by compensating
    // the source detune (classic tape-speed + pitch-correction model).
    deck.keyLock = sync;
    const detune = sync
      ? -1200 * Math.log2(Math.max(0.001, Math.abs(safeRate) || 1))
      : 0;
    Object.values(deck.sources).forEach((s) => {
      if (!s) return;
      s.playbackRate.value = safeRate;
      s.detune.value = detune;
    });
  }

  setDeckLoop(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.loopEnabled = enabled;
    if (!enabled) {
      deck.loopStart = 0;
      deck.loopEnd = deck.buffer ? deck.buffer.duration : 0;
    }
    Object.values(deck.sources).forEach((s) => {
      if (!s) return;
      s.loop = enabled;
      if (enabled && deck.loopEnd > deck.loopStart) {
        s.loopStart = deck.loopStart;
        s.loopEnd = deck.loopEnd;
      }
    });
  }

  /**
   * Beat-quantized loop region — enables a loop between `start` and `end`
   * seconds and keeps any running playback inside the region. Powers the
   * DJ booth's loop-length presets (1/8, 1/4, 1/2, 1, 2, 4, 8 beats).
   */
  setDeckLoopRegion(id: DeckId, start: number, end: number): void { // TAP
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    const dur = deck.buffer.duration;
    const s = Number.isFinite(start) ? Math.max(0, Math.min(start, dur)) : 0;
    const e = Number.isFinite(end)
      ? Math.max(s + 0.01, Math.min(end, dur))
      : dur;
    deck.loopStart = s;
    deck.loopEnd = e;
    deck.loopEnabled = true;
    Object.values(deck.sources).forEach((src) => {
      if (!src) return;
      src.loop = true;
      src.loopStart = s;
      src.loopEnd = e;
    });
    // Keep the live playhead inside the loop region.
    if (deck.isPlaying) {
      const pos = this.getDeckProgress(id).position;
      if (pos < s || pos >= e) this.seekDeck(id, s);
    }
  }

  /** Release the deck's loop and restore full-track playback bounds. */
  clearDeckLoop(id: DeckId): void {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.loopEnabled = false;
    deck.loopStart = 0;
    deck.loopEnd = deck.buffer ? deck.buffer.duration : 0;
    Object.values(deck.sources).forEach((src) => {
      if (src) src.loop = false;
    });
  }

  setSlipMode(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    if (!deck) return;
    if (deck.slipEnabled && !enabled && deck.slipActive) {
      // Disabling slip resolves the ghost playhead back into the real one.
      deck.pauseOffset =
        deck.slipStartOffset +
        (this.ctx.currentTime - deck.slipStartTime) * Math.max(0, deck.rate);
      deck.slipActive = false;
    }
    deck.slipEnabled = enabled;
  }

  setDeckStemGain(id: DeckId, stem: string, gain: number) {
    const deck = this.getDeck(id);
    if (deck && (deck.gains as any)[stem]) {
      (deck.gains as any)[stem].gain.setTargetAtTime(
        gain,
        this.ctx.currentTime,
        0.01
      );
    }
  }

  setDeckCue(id: DeckId, active: boolean) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.isCueing = active;
    // Pre-fader headphone tap on the deck's cue bus.
    deck.cueGain.gain.setTargetAtTime(
      active ? 0.9 : 0,
      this.ctx.currentTime,
      0.01
    );
  }
  loadDeck(id: DeckId, buffer: AudioBuffer) {
    const deck = this.getDeck(id);
    if (!deck || !buffer) return;
    this.stopDeck(id);
    deck.buffer = buffer;
    deck.pauseOffset = 0;
    deck.rate = 1;
    deck.keyLock = false;
    deck.isCueing = false;
    deck.loopEnabled = false;
    deck.loopStart = 0;
    deck.loopEnd = buffer.duration;
    deck.slipEnabled = false;
    deck.slipActive = false;
    deck.hotCues = new Array(8).fill(null);
    deck.peaks = this.computeDeckPeaks(buffer);
    Object.keys(deck.gains).forEach((k) => {
      deck.gains[k as keyof Stems].gain.setTargetAtTime(
        1,
        this.ctx.currentTime,
        0.01
      );
    });
    deck.channelGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    deck.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    deck.cueGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
  }

  setHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    if (!deck || slot < 0 || slot >= deck.hotCues.length) return;
    deck.hotCues[slot] = this.getDeckProgress(id).position;
  }

  clearHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    if (!deck || slot < 0 || slot >= deck.hotCues.length) return;
    deck.hotCues[slot] = null;
  }

  jumpToHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    const pos = deck?.hotCues[slot];
    if (deck && pos !== undefined && pos !== null) {
      this.seekDeck(id, pos);
      if (!deck.isPlaying) this.playDeck(id);
    }
  }
  setDeckEq(id: DeckId, high: number, mid: number, low: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const now = this.ctx.currentTime;
    deck.eqHigh.gain.setTargetAtTime((high - 1) * 12, now, 0.02);
    deck.eqMid.gain.setTargetAtTime((mid - 1) * 12, now, 0.02);
    deck.eqLow.gain.setTargetAtTime((low - 1) * 12, now, 0.02);
  }

  setDeckFilter(id: DeckId, freq: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setDeckFilterMode(id: DeckId, type: BiquadFilterType) {
    const deck = this.getDeck(id);
    if (!deck) return;
    deck.filter.type = type;
  }
  setDeckSend(id: DeckId, send: 'A' | 'B', gain: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const node = send === 'A' ? deck.sendA : deck.sendB;
    const safe = Number.isFinite(gain) ? Math.max(0, Math.min(1.5, gain)) : 0;
    node.gain.setTargetAtTime(safe, this.ctx.currentTime, 0.01);
  }

  /** Momentary platter nudge — directly overrides live source playback rates. */
  scratch(id: DeckId, delta: number) {
    const deck = this.getDeck(id);
    if (!deck) return;
    const speed = Number.isFinite(delta)
      ? Math.max(-2, Math.min(2, delta * 4))
      : 0;
    Object.values(deck.sources).forEach((s) => {
      if (s) s.playbackRate.value = speed;
    });
  }

  /** BRAKE — exponential rate decay to a halt, then pause. */
  brakeDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.isPlaying) return;
    this.clearDeckFx(id);
    const baseRate = Math.max(0.25, Math.abs(deck.rate) || 1);
    const started = this.ctx.currentTime;
    const interval = setInterval(() => {
      const t = (this.ctx.currentTime - started) / 1.6;
      if (t >= 1) {
        this.clearDeckFx(id);
        this.pauseDeck(id);
        this.setDeckRate(id, baseRate, deck.keyLock);
        return;
      }
      const rate = baseRate * Math.pow(1 - t, 2.2);
      this.setDeckRate(id, Math.max(0.001, rate), deck.keyLock);
    }, 30);
    this.pendingDeckFx.set(id, { interval });
  }

  /** SPINBACK — negative rate that decays toward zero, then resumes. */
  spinbackDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.isPlaying) return;
    this.clearDeckFx(id);
    const baseRate = Math.max(0.25, Math.abs(deck.rate) || 1);
    const started = this.ctx.currentTime;
    const interval = setInterval(() => {
      const t = (this.ctx.currentTime - started) / 1.1;
      if (t >= 1) {
        this.clearDeckFx(id);
        this.setDeckRate(id, baseRate, deck.keyLock);
        return;
      }
      this.setDeckRate(id, -baseRate * (1 - t), deck.keyLock);
    }, 30);
    this.pendingDeckFx.set(id, { interval });
  }

  /** TRANSFORM — rapid forward/reverse rate jitter, then restore. */
  transformDeck(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.isPlaying) return;
    this.clearDeckFx(id);
    const baseRate = Math.max(0.25, Math.abs(deck.rate) || 1);
    const started = this.ctx.currentTime;
    const interval = setInterval(() => {
      const t = this.ctx.currentTime - started;
      if (t >= 0.8) {
        this.clearDeckFx(id);
        this.setDeckRate(id, baseRate, deck.keyLock);
        return;
      }
      const sign = Math.floor(t / 0.09) % 2 === 0 ? 1 : -1;
      this.setDeckRate(id, baseRate * sign, deck.keyLock);
    }, 45);
    this.pendingDeckFx.set(id, { interval });
  }

  /** Tear down any in-flight deck FX interval. */
  private clearDeckFx(id: DeckId) {
    const fx = this.pendingDeckFx.get(id);
    if (fx?.interval) clearInterval(fx.interval);
    this.pendingDeckFx.delete(id);
  }

  /** Precompute max-abs peak buckets for the booth waveform. */
  private computeDeckPeaks(buffer: AudioBuffer, buckets = 2048): Float32Array { // TAP
    const peaks = new Float32Array(buckets);
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
    const samplesPerBucket = Math.max(1, Math.floor(ch0.length / buckets));
    for (let b = 0; b < buckets; b++) {
      const start = b * samplesPerBucket;
      const end = Math.min(ch0.length, start + samplesPerBucket);
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
    return peaks;
  }

  /** Zero every deck FX wet bus (echo/chorus/phaser) at once. */
  resetDeckAdvancedFx(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.fxDelayWet) return;
    const now = this.ctx.currentTime;
    deck.fxDelayWet.gain.setTargetAtTime(0, now, 0.01);
    deck.fxFlangerWet.gain.setTargetAtTime(0, now, 0.01);
    deck.fxPhaserWet.gain.setTargetAtTime(0, now, 0.01);
  }

  /**
   * Drive the deck FX insert bus (supersedes the legacy `setAdvancedFX`
   * stub, which never touched the audio graph). `type` selects delay
   * (echo), flanger (chorus approximation) or phaser; every wet gain is
   * zeroed first so a mode switch never stacks the previous effect.
   * `amount` is a 0..1 depth mapped onto the selected wet bus.
   */
  setDeckAdvancedFx(id: DeckId, type: string, amount: number) {
    const deck = this.getDeck(id);
    if (!deck || !deck.fxDelayWet) return;
    const wet = Number.isFinite(amount)
      ? Math.max(0, Math.min(1, amount))
      : 0;
    const now = this.ctx.currentTime;
    deck.fxDelayWet.gain.setTargetAtTime(0, now, 0.01);
    deck.fxFlangerWet.gain.setTargetAtTime(0, now, 0.01);
    deck.fxPhaserWet.gain.setTargetAtTime(0, now, 0.01);
    if (type === 'delay' && wet > 0) {
      deck.fxDelay.delayTime.setTargetAtTime(0.35, now, 0.02);
      deck.fxDelayFb.gain.setTargetAtTime(0.35, now, 0.02);
      deck.fxDelayWet.gain.setTargetAtTime(wet, now, 0.01);
    } else if (type === 'flanger' && wet > 0) {
      deck.fxFlangerWet.gain.setTargetAtTime(wet * 0.9, now, 0.01);
    } else if (type === 'phaser' && wet > 0) {
      deck.fxPhaserWet.gain.setTargetAtTime(wet, now, 0.01);
    }
  }

  /**
   * Install / remove a live WASM plugin insert on the master bus with a
   * fixed splice point. The ScriptProcessor is spliced between the M/S
   * width merger and the pre-master bus — NOT at masterGain — so the width
   * network stays in the signal path and removal never leaves a bypass
   * edge behind. Supersedes the legacy `installMasterPluginInsert`, which
   * spliced at masterGain (bypassing the width stage) and re-connected a
   * direct masterGain → pre-master edge on teardown.
   */
  installMasterPluginInsertAfterWidth(
    pluginIds: string[],
    getKernels?: (ids: string[]) => Array<((input: Float32Array, output: Float32Array, params: Float32Array, sr: number) => void) | null> | null
  ): void {
    if (pluginIds.length === 0) {
      // Restore the width-merger → pre-master edge + drop the insert.
      // Only touch the graph when an insert was actually installed; the
      // default path (merger → preMasterGain) is left untouched otherwise.
      if (this.masterPluginInsert) {
        try {
          this.masterWidthMerger.disconnect(this.masterPluginInsert);
        } catch { /* already disconnected */ }
        try { this.masterPluginInsert.disconnect(); } catch { /* already disconnected */ }
        this.masterPluginInsert = null;
        this.masterWidthMerger.connect(this._preMasterGain);
      }
      this.masterPluginIds.set([]);
      return;
    }

    if (this.masterPluginInsert) return; // already installed — toggle handled elsewhere

    const sp = this.ctx.createScriptProcessor(512, 2, 2);
    // If no closure was provided, the kernel pass-through is a no-op (the
    // caller — Effects Rack UI / collab dispatch — supplies a real one).
    const kernelProvider =
      getKernels ?? ((ids: string[]) => ids.map(() => null));

    sp.onaudioprocess = (e: AudioProcessingEvent) => {
      const kernels = kernelProvider(pluginIds);
      if (!kernels || kernels.length === 0) return;
      const leftIn = e.inputBuffer.getChannelData(0);
      const rightIn = e.inputBuffer.getChannelData(1);
      const leftOut = e.outputBuffer.getChannelData(0);
      const rightOut = e.outputBuffer.getChannelData(1);
      const frames = new Float32Array(leftIn.length * 2);
      const processed = new Float32Array(frames.length);
      for (let i = 0; i < leftIn.length; i++) {
        frames[i * 2] = leftIn[i];
        frames[i * 2 + 1] = rightIn[i];
      }
      for (const kernel of kernels) {
        if (!kernel) continue;
        kernel(frames, processed, new Float32Array(), this.ctx.sampleRate);
        frames.set(processed);
      }
      for (let i = 0; i < leftOut.length; i++) {
        leftOut[i] = frames[i * 2];
        rightOut[i] = frames[i * 2 + 1];
      }
    };

    // Splice the insert between the M/S width merger and the pre-master
    // bus so the master-width network stays in the path (splicing at
    // masterGain would bypass it and double-feed the pre-master bus).
    try {
      this.masterWidthMerger.disconnect(this._preMasterGain);
    } catch { /* already disconnected */ }
    this.masterWidthMerger.connect(sp);
    sp.connect(this._preMasterGain);
    this.masterPluginInsert = sp;
    this.masterPluginIds.set([...pluginIds]);
  }

  /** Build the mid/side width stage between masterGain and the pre-master bus. */
  private wireMasterWidthNetwork(): void { // TAP
    this.masterWidthMid.gain.value = 0.5; // mid = (L+R)/2
    this.masterWidthSidePos.gain.value = 0.5; // +L/2
    this.masterWidthSideNeg.gain.value = -0.5; // -R/2
    this.masterWidthSideL.gain.value = 1; // neutral full-width default
    this.masterWidthSideR.gain.value = -1;

    // masterGain → _preMasterGain isn't a direct edge on this graph (it flows
    // through the splitter/merger), but defensively drop any prior edge so
    // double-init during HMR doesn't throw `InvalidAccessError`.
    try { this.masterGain.disconnect(this._preMasterGain); } catch { /* not connected */ }
    this.masterGain.connect(this.masterWidthSplitter);
    this.masterWidthSplitter.connect(this.masterWidthMid, 0);
    this.masterWidthSplitter.connect(this.masterWidthMid, 1);
    this.masterWidthSplitter.connect(this.masterWidthSidePos, 0);
    this.masterWidthSplitter.connect(this.masterWidthSideNeg, 1);
    this.masterWidthSidePos.connect(this.masterWidthSide);
    this.masterWidthSideNeg.connect(this.masterWidthSide);
    // L' = mid + side·width, R' = mid − side·width
    this.masterWidthMid.connect(this.masterWidthMerger, 0, 0);
    this.masterWidthSideL.connect(this.masterWidthMerger, 0, 0);
    this.masterWidthMid.connect(this.masterWidthMerger, 0, 1);
    this.masterWidthSideR.connect(this.masterWidthMerger, 0, 1);
    this.masterWidthMerger.connect(this._preMasterGain);
  }

  /**
   * Master stereo-width macro. width = 1 → neutral, 0 → mono collapse,
   * > 1 → widened (side emphasis). Clamped to [0, 2.5].
   */
  setMasterWidth(width: number): void {
    const safe = Number.isFinite(width)
      ? Math.max(0, Math.min(2.5, width))
      : 1;
    const now = this.ctx.currentTime;
    this.masterWidthSideL.gain.setTargetAtTime(safe, now, 0.02);
    this.masterWidthSideR.gain.setTargetAtTime(-safe, now, 0.02);
  }

  setCrossfader(
    val: number,
    curve: CrossfaderCurve = 'power',
    hamster: boolean = false
  ) { // TAP
    const gains = computeCrossfaderGains(val, curve, hamster);
    this.crossfaderValue = val;
    this.crossfaderHamster = hamster;
    if (this.deckA)
      this.deckA.gain.gain.setTargetAtTime(
        gains.left,
        this.ctx.currentTime,
        0.01
      );
    if (this.deckB)
      this.deckB.gain.gain.setTargetAtTime(
        gains.right,
        this.ctx.currentTime,
        0.01
      );
  }

  /**
   * Pro: High-quality antialiased oscillator engine.
   * Uses bandlimited wavetables for saw/square when antialias is enabled,
   * otherwise falls back to native oscillator types.
   */
  private createAntialiasedOscillator( // TAP
    ctx: AudioContext,
    type: string,
    freq: number,
    time: number
  ): OscillatorNode {
    const osc = ctx.createOscillator();
    if (this.antialiasEnabled() && (type === 'sawtooth' || type === 'square')) {
      // Bandlimited wavetable via oversampled harmonic synthesis
      const baseFreq = freq;
      const nyquist = ctx.sampleRate / 2;
      const maxHarmonics = Math.floor(nyquist / baseFreq);
      const real = new Float32Array(maxHarmonics + 1);
      const imag = new Float32Array(maxHarmonics + 1);

      if (type === 'sawtooth') {
        for (let h = 1; h <= maxHarmonics; h++) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3); // gentle rolloff
        }
      } else {
        // square: odd harmonics only
        for (let h = 1; h <= maxHarmonics; h += 2) {
          imag[h] = (1 / h) * Math.pow(1 - h / maxHarmonics, 0.3);
        }
      }
      const wave = ctx.createPeriodicWave(real, imag, {
        disableNormalization: false,
      });
      osc.setPeriodicWave(wave);
    } else {
      osc.type = (type as OscillatorType) || 'sine';
    }
    osc.frequency.setValueAtTime(freq, time);
    return osc;
  }

  triggerAttack(
    trackId: string | number, // TAP
    freq: number,
    time: number,
    velocity: number,
    duration: number,
    gain: number,
    pan: number,
    sendA: number,
    sendB: number,
    params: any
  ) {
    const osc = this.createAntialiasedOscillator(
      this.ctx,
      params.type || 'sine',
      freq,
      time
    );
    const panner = this.ctx.createStereoPanner();
    const vca = this.ctx.createGain();
    panner.pan.setValueAtTime(pan, time);
    vca.gain.setValueAtTime(0, time);
    vca.gain.setTargetAtTime(velocity * gain, time, params.attack || 0.01);
    vca.gain.exponentialRampToValueAtTime(
      0.001,
      time + duration + (params.release || 0.1)
    );
    osc.connect(panner);
    panner.connect(vca);
    vca.connect(this.getTrackOutput(trackId.toString()));

    // Slide note support: glide the oscillator frequency over the note duration.
    // `params.glideTo` is a target frequency; when present the pitch sweeps
    // from `freq` to `glideTo` using an exponential ramp (portamento feel).
    if (
      typeof params?.glideTo === 'number' &&
      isFinite(params.glideTo) &&
      params.glideTo > 0
    ) {
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(
        params.glideTo,
        time + Math.max(0.02, duration)
      );
    }

    osc.start(time);
    osc.stop(time + duration + (params.release || 0.1) + 0.1);

    if (this.isRecording()) {
      const pitch = Math.round(69 + 12 * Math.log2(freq / 440));
      this.recorder.pendingMidi.push({
        pitch,
        startTime: time,
        duration,
        velocity,
      });
    }
  }

  /**
   * Offline voice graph — Sprint A6.5: the exact same synth voice used live
   * (antialiased oscillator + filter + panner + ADSR VCA + glide), scheduled
   * onto an arbitrary BaseAudioContext so offline renders sound like live
   * playback instead of plain oscillators.
   */
  scheduleOfflineNote(
    ctx: BaseAudioContext,
    destination: AudioNode,
    freq: number,
    time: number,
    velocity: number,
    duration: number,
    params: any,
    pan: number
  ): void {
    const osc = this.createAntialiasedOscillator(
      ctx as AudioContext,
      params.type || 'sine',
      freq,
      time
    );

    // Filter stage (lowpass by default, cutoff/Q from the synth params)
    const filter = ctx.createBiquadFilter();
    filter.type = (params.filterType as BiquadFilterType) || 'lowpass';
    filter.frequency.setValueAtTime(params.cutoff || 8000, time);
    filter.Q.setValueAtTime(params.q || 1, time);

    const panner = ctx.createStereoPanner();
    const vca = ctx.createGain();
    panner.pan.setValueAtTime(pan, time);

    // ADSR envelope from the synth params (matches the live triggerAttack path)
    const peak = Math.min(1, Math.max(0.02, velocity * 0.9));
    const attack = params.attack || 0.01;
    const decay = params.decay || 0.1;
    const sustain = params.sustain ?? 0.7;
    const release = params.release || 0.2;

    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.exponentialRampToValueAtTime(peak, time + attack);
    vca.gain.setValueAtTime(peak, time + attack + decay);
    vca.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * sustain),
      time + attack + decay
    );
    vca.gain.setValueAtTime(
      Math.max(0.0001, peak * sustain),
      time + Math.max(attack + decay, duration - release)
    );
    vca.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(panner);
    panner.connect(vca);
    vca.connect(destination);

    // Slide/glide support — same behavior as live triggerAttack
    if (
      typeof params?.glideTo === 'number' &&
      isFinite(params.glideTo) &&
      params.glideTo > 0
    ) {
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(
        params.glideTo,
        time + Math.max(0.02, duration)
      );
    }

    osc.start(time);
    osc.stop(time + duration + release + 0.1);
  }

  /** Toggle antialiased oscillator mode */
  toggleAntialias(enabled: boolean) {
    this.antialiasEnabled.set(enabled);
  }

  /** Toggle dithering on master output (reduces quantization distortion at low levels) */
  toggleDither(enabled: boolean) {
    this.ditherEnabled.set(enabled);
    if (enabled && !this.ditherNode) {
      this.ditherNode = this.ctx.createGain();
      this.ditherNode.gain.value = 0.00003; // ~ -90dB TPDF dither
      // Inject shaped noise via script processor
      try {
        const sp = this.ctx.createScriptProcessor(256, 0, 1);
        sp.onaudioprocess = (e) => {
          const out = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < out.length; i++) {
            out[i] = (Math.random() * 2 - 1) * 0.00003;
          }
        };
        sp.connect(this.ditherNode);
        this.ditherNode!.connect(this.masterAnalyser);
      } catch {
        /* ScriptProcessor deprecated in some contexts */
      }
    } else if (!enabled && this.ditherNode) {
      this.ditherNode.disconnect();
      this.ditherNode = null;
    }
  }

  /**
   * Phase F2 — sampler trigger with optional clip fade-in / fade-out.
   * Fades are expressed in seconds and applied as linear gain ramps on the
   * per-trigger VCA, so arrangement clips with `fadeIn`/`fadeOut` set get a
   * click-free envelope exactly like a professional DAW's clip fades.
   */
  triggerSampler(
    trackId: string | number,
    buffer: AudioBuffer,
    time: number,
    velocity: number,
    pan: number,
    duration: number,
    playbackRate: number = 1,
    fadeInSec: number = 0,
    fadeOutSec: number = 0
  ) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, time);
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const gain = this.ctx.createGain();

    const safeDuration = Math.max(0.001, duration);
    const fadeIn = Math.max(0, Math.min(fadeInSec || 0, safeDuration));
    const fadeOut = Math.max(0, Math.min(fadeOutSec || 0, safeDuration));

    gain.gain.setValueAtTime(0, time);
    if (fadeIn > 0) {
      // Linear fade-in to full velocity
      gain.gain.linearRampToValueAtTime(velocity, time + fadeIn);
    } else {
      gain.gain.setTargetAtTime(velocity, time, 0.005);
    }

    if (fadeOut > 0) {
      const fadeStart = time + Math.max(fadeIn, safeDuration - fadeOut);
      gain.gain.setValueAtTime(velocity, fadeStart);
      gain.gain.linearRampToValueAtTime(0, time + safeDuration);
    } else {
      // Ensure the sustain level holds until the very end to avoid a click
      gain.gain.setValueAtTime(velocity, time + safeDuration - 0.001);
    }

    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId.toString()));
    source.start(time);
    source.stop(time + safeDuration + 0.01);
  }

  getTrackOutput(id: string): GainNode {
    if (!this.trackPhaseNodes.has(id)) {
      // Complete Pro Signal Chain
      const phase = this.ctx.createGain(); // Phase Inversion Node
      const width = this.ctx.createStereoPanner(); // Stereo Width / Pan
      const fader = this.ctx.createGain(); // Post-fader Gain
      const output = this.ctx.createGain(); // Final Track Out

      // Insert per-track effects rack between phase and width
      const rack = new DynamicEffectsRack(this.ctx);
      this.trackEffectsRacks.set(id, rack);

      // Fire-and-forget: enable worklet-based effects for this track
      // Falls back gracefully to main-thread plugins if worklet fails
      rack.enableWorklet().then((ok) => {
        if (ok) this.logger.info(`AudioEngine: Worklet effects enabled for track ${id}`);
      });

      phase.connect(rack.input);
      rack.output.connect(width);
      width.connect(fader);
      fader.connect(output);
      output.connect(this.masterGain);

      this.trackPhaseNodes.set(id, phase);
      this.trackWidthNodes.set(id, width);
      this.trackFaderGains.set(id, fader);
      this.trackOutputs.set(id, output);

      const sA = this.ctx.createGain();
      sA.gain.value = 0;
      fader.connect(sA);
      sA.connect(this.sendAReturn);
      this.trackSendAGains.set(id, sA);

      const sB = this.ctx.createGain();
      sB.gain.value = 0;
      fader.connect(sB);
      sB.connect(this.sendBReturn);
      this.trackSendBGains.set(id, sB);
    }
    return this.trackPhaseNodes.get(id)!;
  }

  /** Get (or lazily create) a per-track DynamicEffectsRack for insert/send routing */
  getTrackEffectsRack(trackId: string): DynamicEffectsRack {
    this.getTrackOutput(trackId); // ensure signal chain exists
    if (!this.trackEffectsRacks.has(trackId)) {
      const rack = new DynamicEffectsRack(this.ctx);
      this.trackEffectsRacks.set(trackId, rack);
    }
    return this.trackEffectsRacks.get(trackId)!;
  }

  /**
   * Sprint B1 Phase 2 — live WASM plugin inserts.
   * Inserts a ScriptProcessor between the track's effects rack and the width
   * node so DSP kernels run on every render quantum while playing. An empty
   * chain removes the insert and restores the direct rack → width routing.
   *
   * `getKernels` returns the loaded kernel closures for the track's plugins
   * (or null when the chain is empty); the engine handles node wiring only.
   */
  installTrackPluginInsert(
    trackId: string,
    pluginIds: string[],
    getKernels?: (ids: string[]) => Array<((input: Float32Array, output: Float32Array, params: Float32Array, sr: number) => void) | null> | null
  ): void {
    this.getTrackOutput(trackId); // ensure signal chain exists
    const rack = this.trackEffectsRacks.get(trackId);
    const width = this.trackWidthNodes.get(trackId);
    const insert = this.trackPluginInserts.get(trackId);
    if (!rack || !width) return;

    // Empty chain → remove any existing insert and restore direct routing.
    if (pluginIds.length === 0) {
      if (insert) {
        try {
          rack.output.disconnect(insert);
          insert.disconnect();
        } catch { /* already disconnected */ }
        rack.output.connect(width);
        this.trackPluginInserts.delete(trackId);
      }
      return;
    }

    if (insert) return; // already installed — chain changes rebuild on next pass

    const sp = this.ctx.createScriptProcessor(512, 1, 1);
    const kernelProvider = getKernels ?? (() => null);
    sp.onaudioprocess = (e: AudioProcessingEvent) => {
      const kernels = kernelProvider(pluginIds);
      if (!kernels || kernels.length === 0) return;
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      const frames = new Float32Array(input.length * 2);
      const processed = new Float32Array(input.length * 2);
      for (let i = 0; i < input.length; i++) {
        frames[i * 2] = input[i];
        frames[i * 2 + 1] = input[i];
      }
      for (const kernel of kernels) {
        if (!kernel) continue;
        kernel(frames, processed, new Float32Array(), this.ctx.sampleRate);
        frames.set(processed);
      }
      for (let i = 0; i < output.length; i++) output[i] = frames[i * 2];
    };

    rack.output.disconnect(width);
    rack.output.connect(sp);
    sp.connect(width);
    this.trackPluginInserts.set(trackId, sp);
  }

  // ── Master-bus live insert + audition (Sprint B1 Phase 3) ─────────────────

  /** ScriptProcessor spliced between masterGain and preMasterGain for the
   *  whole-mix live DSP chain. Null when disabled. */
  private masterPluginInsert: ScriptProcessorNode | null = null;
  /** Active plugin ids for the master-bus live insert. */
  readonly masterPluginIds = signal<string[]>([]);

  /**
   * Enable / disable a live WASM plugin insert on the master bus. Splices a
   * ScriptProcessor between masterGain and preMasterGain so every track
   * flows through the chain while playing.
   */
  installMasterPluginInsert(
    pluginIds: string[],
    getKernels?: (ids: string[]) => Array<((input: Float32Array, output: Float32Array, params: Float32Array, sr: number) => void) | null> | null
  ): void {
    if (pluginIds.length === 0) {
      // Restore direct routing + drop any existing insert.
      try {
        this.masterGain.disconnect(this.masterPluginInsert ?? this._preMasterGain);
      } catch { /* already disconnected */ }
      if (this.masterPluginInsert) {
        try { this.masterPluginInsert.disconnect(); } catch {}
        this.masterPluginInsert = null;
      }
      this.masterGain.connect(this._preMasterGain);
      this.masterPluginIds.set([]);
      return;
    }

    if (this.masterPluginInsert) return; // already installed — toggle handled elsewhere

    const sp = this.ctx.createScriptProcessor(512, 2, 2);
    // If no closure was provided, the kernel pass-through is a no-op (the
    // caller — Effects Rack UI / collab dispatch — supplies a real one).
    const kernelProvider =
      getKernels ?? ((ids: string[]) => ids.map(() => null));

    sp.onaudioprocess = (e: AudioProcessingEvent) => {
      const kernels = kernelProvider(pluginIds);
      if (!kernels || kernels.length === 0) return;
      const leftIn = e.inputBuffer.getChannelData(0);
      const rightIn = e.inputBuffer.getChannelData(1);
      const leftOut = e.outputBuffer.getChannelData(0);
      const rightOut = e.outputBuffer.getChannelData(1);
      const frames = new Float32Array(leftIn.length * 2);
      const processed = new Float32Array(frames.length);
      for (let i = 0; i < leftIn.length; i++) {
        frames[i * 2] = leftIn[i];
        frames[i * 2 + 1] = rightIn[i];
      }
      for (const kernel of kernels) {
        if (!kernel) continue;
        kernel(frames, processed, new Float32Array(), this.ctx.sampleRate);
        frames.set(processed);
      }
      for (let i = 0; i < leftOut.length; i++) {
        leftOut[i] = frames[i * 2];
        rightOut[i] = frames[i * 2 + 1];
      }
    };

    try {
      this.masterGain.disconnect(this._preMasterGain);
    } catch { /* already disconnected */ }
    this.masterGain.connect(sp);
    sp.connect(this._preMasterGain);
    this.masterPluginInsert = sp;
    this.masterPluginIds.set([...pluginIds]);
  }

  // ── Audition (Sprint B1 Phase 3) — play polished offline render via the live ctx ─

  /** Source + monitoring gain dedicated to auditioning offline buffers, wired
   *  straight to ctx.destination so it bypasses master gain + limiter. */
  private auditionSource: AudioBufferSourceNode | null = null;
  private readonly auditionMonitorGain = this.ctx.createGain();
  readonly auditionPlaying = signal(false);
  readonly auditionProgress = signal(0); // 0..1
  readonly auditionDuration = signal(0); // seconds

  /**
   * Audition a rendered AudioBuffer through the live audio context. Connects
   * via a private monitor gain to ctx.destination — never into masterGain,
   * so the loop never feeds back through the plugin chain or limiter.
   *
   * @param onEnd optional callback fired when the source finishes naturally
   *              or is stopped.
   */
  playAudition(buffer: AudioBuffer, onEnd?: () => void): void {
    this.stopAudition();
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    this.auditionMonitorGain.connect(this.ctx.destination);
    this.auditionMonitorGain.gain.value = 0.95;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.auditionMonitorGain);
    const startTs = performance.now();
    this.auditionSource = src;
    this.auditionPlaying.set(true);
    this.auditionDuration.set(buffer.duration);
    this.auditionProgress.set(0);

    const tick = () => {
      if (this.auditionSource !== src) return;
      const elapsed = (performance.now() - startTs) / 1000;
      const ratio = Math.min(1, elapsed / Math.max(0.001, buffer.duration));
      this.auditionProgress.set(ratio);
      if (ratio < 1 && this.auditionPlaying()) {
        requestAnimationFrame(tick);
      }
    };
    src.onended = () => {
      if (this.auditionSource !== src) return;
      this.auditionSource = null;
      this.auditionPlaying.set(false);
      this.auditionProgress.set(0);
      onEnd?.();
    };
    src.start();
    requestAnimationFrame(tick);
  }

  stopAudition(): void {
    const src = this.auditionSource;
    if (!src) return;
    try {
      src.stop();
    } catch { /* already stopped */ }
  }

  updateTrack(id: string | number, patch: any) {
    const idStr = id.toString();
    this.getTrackOutput(idStr); // Ensure nodes exist

    const fader = this.trackFaderGains.get(idStr);
    const phase = this.trackPhaseNodes.get(idStr);
    const width = this.trackWidthNodes.get(idStr);

    if (patch.gain !== undefined && fader)
      fader.gain.setTargetAtTime(patch.gain, this.ctx.currentTime, 0.05);

    if (patch.phaseInvert !== undefined && phase)
      phase.gain.setTargetAtTime(
        patch.phaseInvert ? -1 : 1,
        this.ctx.currentTime,
        0.01
      );

    if (patch.pan !== undefined && width)
      width.pan.setTargetAtTime(patch.pan, this.ctx.currentTime, 0.05);

    if (patch.sendA !== undefined)
      this.trackSendAGains
        .get(idStr)
        ?.gain.setTargetAtTime(patch.sendA, this.ctx.currentTime, 0.05);
    if (patch.sendB !== undefined)
      this.trackSendBGains
        .get(idStr)
        ?.gain.setTargetAtTime(patch.sendB, this.ctx.currentTime, 0.05);

    this.tracksMap.set(idStr, {
      ...(this.tracksMap.get(idStr) || {}),
      ...patch,
    });
  }

  applyProductionParameter(
    trackId: string,
    parameter: string,
    value: number,
    duration: number = 0.01
  ) {
    if (trackId === '0' && parameter === 'tempo') {
      this.tempo.set(value);
      return;
    }
    this.updateTrack(trackId, { [parameter]: value });
  }

  setMasterOutputLevel(val: number) {
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
  }

  // ============================================================
  //  Sprint A4 — Song-Mode API
  // ============================================================

  /**
   * Toggle Pattern ↔ Song playback. Validation rejects any string other
   * than the literals. While playing, switching modes resets the playhead
   * so a song→pattern flip doesn't leave the counter past the new
   * loopLengthSteps boundary (and vice-versa).
   */
  setPlayMode(mode: PlayMode): void {
    if (mode !== 'pattern' && mode !== 'song') return;
    if (this.playMode() === mode) return;
    this.playMode.set(mode);
    if (this.isPlaying()) {
      this.currentStep = 0;
      this.visualStep.set(0);
      this.currentBeat.set(0);
      // Tell the worklet to restart its step counter from 0 so the
      // next TICK aligns with our Angular-side state.
      this.workletNode?.port.postMessage({ type: 'RESET_STEP' });
    }
  }

  /**
   * Update the song-mode total length. Safe to call while playing —
   * the next handleTick will observe the new value inside the playMode
   * branch and clamp at the new boundary.
   */
  setSongLengthSteps(steps: number): void {
    const safe = Math.max(1, Math.floor(steps));
    this.songLengthSteps.set(safe);
  }
  toggleMetronome() {
    this.metronomeEnabled.update((v) => !v);
    return this.metronomeEnabled();
  }
  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(Math.max(0, Math.min(1, val)));
  }
  setSoftClip(amount: number) {
    const k = amount * 100,
      n = 256,
      curve = new Float32Array(n),
      deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.saturationNode.curve = amount === 0 ? null : curve;
  }
  setSaturation(val: number) {
    this.setSoftClip(val);
  }
  getContext() {
    return this.ctx;
  }
  getMasterAnalyser() {
    return this.masterAnalyser;
  }
  getAnalyser() {
    return this.masterAnalyser;
  }
  ensureTrack(data: any) {
    if (!this.trackOutputs.has(data.id.toString()))
      this.updateTrack(data.id, data);
  }
  playSynth(
    time: number,
    freq: number,
    duration: number,
    velocity: number,
    pan: number,
    params?: any
  ) {
    this.triggerAttack(
      '0',
      freq,
      time,
      velocity,
      duration,
      1.0,
      pan,
      0,
      0,
      params ?? { type: 'sine' }
    );
  }
  updateAdaptivePerformance(load: number) {
    this.performanceTier.set(load > 70 ? 'performance' : 'ultra');
  }
  connectSidechain(trigger: string, target: string) {
    if (!this.sidechainMatrix.has(trigger)) {
      this.sidechainMatrix.set(trigger, new Set<string>());
    }
    this.sidechainMatrix.get(trigger)!.add(target);
    this.sidechainEnabled.set(true);
    // Also connect via worklet if loaded
    this.createSidechainWorklet(trigger, target);
  }
  disconnectSidechain(trigger: string, target: string) {
    const targets = this.sidechainMatrix.get(trigger);
    if (targets) {
      targets.delete(target);
      if (targets.size === 0) {
        this.sidechainMatrix.delete(trigger);
      }
    }
    this.sidechainEnabled.set(this.sidechainMatrix.size > 0);
    this.removeSidechainWorklet(trigger, target);
  }

  /**
   * Create a sidechain AudioWorklet connection: trigger signal (input 1)
   * ducks the target track (input 0). Falls back to the existing
   * main-thread routing if the worklet fails to load.
   */
  async createSidechainWorklet(triggerTrackId: string, targetTrackId: string): Promise<void> {
    const key = `${triggerTrackId}→${targetTrackId}`;
    if (this.sidechainWorklets.has(key)) return;

    // Ensure tracks exist
    this.getTrackOutput(triggerTrackId);
    this.getTrackOutput(targetTrackId);

    // Try to load the worklet module once
    if (!this._sidechainWorkletLoaded) {
      try {
        await this.ctx.audioWorklet.addModule(
          'assets/worklets/sidechain-processor.worklet.js'
        );
        this._sidechainWorkletLoaded = true;
      } catch (err: any) {
        if (!err?.message?.includes('already')) {
          this.logger.warn(
            `AudioEngine: Sidechain worklet load failed, using main-thread fallback.`,
            err?.message
          );
          return;
        }
        this._sidechainWorkletLoaded = true;
      }
    }

    try {
      // Create the worklet node with TWO inputs:
      //   input 0 = target track (the one being ducked)
      //   input 1 = trigger track (the kick/drum doing the ducking)
      const workletNode = new AudioWorkletNode(this.ctx, 'sidechain-processor', {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });

      // Configure the sidechain parameters
      workletNode.port.postMessage({
        type: 'CONFIGURE',
        payload: {
          thresholdDb: -30,
          ratio: 8,
          attack: 0.002,
          release: 0.08,
          kneeDb: 4,
          rangeDb: -24,
          makeupDb: 3,
        },
      });

      // Re-route the target track signal through the worklet
      const targetPhase = this.trackPhaseNodes.get(targetTrackId);
      const targetWidth = this.trackWidthNodes.get(targetTrackId);
      const triggerOutput = this.trackOutputs.get(triggerTrackId) || this.trackFaderGains.get(triggerTrackId);

      if (targetPhase && targetWidth && triggerOutput) {
        // Disconnect the existing phase → width connection
        targetPhase.disconnect();

        // Re-route: phase → worklet (input 0) → width
        targetPhase.connect(workletNode);
        workletNode.connect(targetWidth);

        // Route: trigger output → worklet (input 1) — for envelope detection only
        // The trigger signal enters on input 1, channels 0-1
        const triggerTap = this.ctx.createGain();
        triggerTap.gain.value = 1.0;
        triggerOutput.connect(triggerTap);
        triggerTap.connect(workletNode, 0, 1); // connect to input 1

        this.sidechainRouting.set(key, { triggerGain: triggerTap, sidechainInput: triggerTap });
        this.sidechainWorklets.set(key, workletNode);

        this.logger.info(
          `AudioEngine: Sidechain worklet connected: ${triggerTrackId} → ${targetTrackId}`
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `AudioEngine: Sidechain worklet node creation failed, using main-thread fallback.`,
        err?.message
      );
    }
  }

  /** Disconnect a sidechain worklet and restore direct routing */
  removeSidechainWorklet(triggerTrackId: string, targetTrackId: string): void {
    const key = `${triggerTrackId}→${targetTrackId}`;
    const workletNode = this.sidechainWorklets.get(key);
    const routing = this.sidechainRouting.get(key);

    if (workletNode && routing) {
      // Disconnect worklet
      workletNode.port.postMessage({ type: 'RESET' });
      workletNode.disconnect();
      routing.triggerGain.disconnect();

      // Restore direct routing: phase → width
      const targetPhase = this.trackPhaseNodes.get(targetTrackId);
      const targetWidth = this.trackWidthNodes.get(targetTrackId);

      if (targetPhase && targetWidth) {
        targetPhase.disconnect();
        targetPhase.connect(targetWidth);
      }

      this.sidechainWorklets.delete(key);
      this.sidechainRouting.delete(key);

      this.logger.info(
        `AudioEngine: Sidechain worklet removed: ${triggerTrackId} → ${targetTrackId}`
      );
    }
  }
  getSidechainRouting() {
    const routes: { triggerTrackId: string; targetTrackIds: string[] }[] = [];
    this.sidechainMatrix.forEach((targets, trigger) => {
      routes.push({
        triggerTrackId: trigger,
        targetTrackIds: Array.from(targets),
      });
    });
    return routes;
  }
  calculatePlaybackRate(bpm: number) {
    return this.tempo() / bpm;
  }
  setMasteringTargets(targets: { lufs: number; truePeak: number }) {
    this.masteringTargets = { ...targets };
    // Apply a safe ceiling through the limiter/compressor chain
    this.compressor.threshold.setTargetAtTime(
      targets.lufs,
      this.ctx.currentTime,
      0.05
    );
  }
  getMasteringTargets() {
    return { ...this.masteringTargets };
  }

  /** Pro: Aux Bus Architecture */
  createAuxBus(id: string) {
    if (this.auxBuses.has(id)) return;
    const gain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    gain.connect(analyser);
    analyser.connect(this.masterGain);
    this.auxBuses.set(id, { gain, analyser });
  }

  setTrackAuxSend(trackId: string, auxId: string, level: number) {
    let trackSends = this.trackAuxSends.get(trackId);
    if (!trackSends) {
      trackSends = new Map<string, GainNode>();
      this.trackAuxSends.set(trackId, trackSends);
    }

    let sendNode = trackSends.get(auxId);
    if (!sendNode) {
      sendNode = this.ctx.createGain();
      const trackOut = this.trackFaderGains.get(trackId);
      const bus = this.auxBuses.get(auxId);
      if (trackOut && bus) {
        trackOut.connect(sendNode);
        sendNode.connect(bus.gain);
        trackSends.set(auxId, sendNode);
      }
    }

    if (sendNode) {
      sendNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }
  }

  /** Pro: Auto-optimize limiter based on live LUFS */
  autoOptimizeLimiter(targetLufs: number) {
    const current = this.outputLufs();
    if (current < -60) return; // No audio

    const delta = targetLufs - current;
    if (Math.abs(delta) < 0.2) return; // Within tolerance

    const currentThreshold = this.limiter.threshold.value;
    // Gentle adjustment towards target
    const step = delta > 0 ? -0.5 : 0.5;
    const nextThreshold = Math.max(
      -30,
      Math.min(-0.1, currentThreshold + step)
    );

    this.limiter.threshold.setTargetAtTime(
      nextThreshold,
      this.ctx.currentTime,
      1.0
    );
    this.currentLufs.set(current); // Update reported LUFS signal
  }

  configureCompressor(p: any) {
    if (!this.compressor) return;
    if (p?.threshold !== undefined)
      this.compressor.threshold.setTargetAtTime(
        p.threshold,
        this.ctx.currentTime,
        0.01
      );
    if (p?.ratio !== undefined)
      this.compressor.ratio.setTargetAtTime(
        p.ratio,
        this.ctx.currentTime,
        0.01
      );
    if (p?.attack !== undefined)
      this.compressor.attack.setTargetAtTime(
        p.attack,
        this.ctx.currentTime,
        0.01
      );
    if (p?.release !== undefined)
      this.compressor.release.setTargetAtTime(
        p.release,
        this.ctx.currentTime,
        0.01
      );
  }

  configureLimiter(p: any) {
    if (!this.limiter) return;
    if (p?.threshold !== undefined)
      this.limiter.threshold.setTargetAtTime(
        p.threshold,
        this.ctx.currentTime,
        0.05
      );
    if (p?.ratio !== undefined)
      this.limiter.ratio.setTargetAtTime(p.ratio, this.ctx.currentTime, 0.05);
  }

  syncDecks(m: DeckId, s: DeckId) {}
  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
  }
  setAdvancedFX(id: DeckId, type: string, amount: number) {
    /* fx logic */
  }

  // ============================================================
  //  Output Level Metering (LUFS / RMS / PEAK)
  // ============================================================
  readonly outputPeak = signal<number>(0);
  readonly outputRms = signal<number>(0);
  readonly outputLufs = signal<number>(-70);

  readonly outputLevelDb = computed(() => {
    const p = Math.max(this.outputPeak(), 1e-6);
    return 20 * Math.log10(p);
  });

  readonly autoAdjustEnabled = signal<boolean>(true);
  readonly monitorBlend = signal<number>(0.5);
  readonly outputProfile = signal<
    'flat' | 'speakers-bright' | 'headphones-flat' | 'auto'
  >('auto');

  // ── Pro: Output Device & Engine Session State ──────────
  readonly outputProfileLabel = computed(() => {
    switch (this.outputProfile()) {
      case 'flat':
        return 'Flat';
      case 'speakers-bright':
        return 'Speakers · Bright';
      case 'headphones-flat':
        return 'Headphones · Flat';
      case 'auto':
      default:
        return 'Auto';
    }
  });

  readonly userGestureSeen = signal<boolean>(false);

  armOnFirstUserGesture(): void {
    if (this.userGestureSeen()) return;
    if (typeof document === 'undefined') return;

    const body = document.body;
    const onGesture = () => {
      this.resume();
      this.userGestureSeen.set(true);
      // Clean up peer listeners safely
      ['click', 'touchstart', 'keydown'].forEach((e) =>
        body.removeEventListener(e, onGesture, { capture: true })
      );
    };

    ['click', 'touchstart', 'keydown'].forEach((e) =>
      body.addEventListener(e, onGesture, { once: true, capture: true })
    );
  }

  readonly selectedOutputDeviceId = signal<string>('');
  readonly outputDevices = signal<MediaDeviceInfo[]>([]);
  readonly outputDeviceName = signal<string>('System Default');
  readonly externalOutputActive = computed(
    () => this.selectedOutputDeviceId() !== ''
  );

  supportsSinkId(): boolean {
    return (
      typeof HTMLAudioElement !== 'undefined' &&
      'setSinkId' in HTMLAudioElement.prototype
    );
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.supportsSinkId()) return false;
    try {
      if ('setSinkId' in this.ctx) {
        await (this.ctx as any).setSinkId(deviceId);
      } else {
        return false;
      }
      this.selectedOutputDeviceId.set(deviceId);

      // Update friendly name
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const target = devices.find(
          (d) => d.kind === 'audiooutput' && d.deviceId === deviceId
        );
        this.outputDeviceName.set(
          deviceId === ''
            ? 'System Default'
            : target?.label || 'External Output'
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  async refreshOutputDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
      // Surface the full enumeration so the transport-bar dropdown can list every sink.
      this.outputDevices.set(audioOutputs);
      const match = audioOutputs.find(
        (d) => d.deviceId === this.selectedOutputDeviceId()
      );
      if (match?.label) {
        this.outputDeviceName.set(
          this.selectedOutputDeviceId() === '' ? 'System Default' : match.label
        );
      }
    } catch {
      /* enumeration blocked (e.g. insecure context) — keep current name */
    }
  }

  // ── Pro: Settings setters (mirror the existing setOutputMode shape) ──
  setMonitorBlend(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.monitorBlend.set(clamped);
  }

  setAutoAdjust(enabled: boolean): void {
    this.autoAdjustEnabled.set(!!enabled);
  }

  // ── Pro: AudioContext state surfaced as a signal ─────────
  readonly contextState = signal<AudioContextState>('suspended');
  private _ctxStateHandler = (): void => {
    this.contextState.set(this.ctx.state);
  };

  private _meteringBuffer = new Float32Array(1024);
  private _meteringRAF: number | null = null;
  private startOutputMetering(): void {
    if (typeof window === 'undefined') return;
    this._meteringBuffer = new Float32Array(this.masterAnalyser.fftSize);
    const FRAME_MS = 50;
    let last = 0;
    const tick = (now: number) => {
      if (this.ctx.state !== 'running') {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      if (now - last < FRAME_MS) {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      last = now;

      // Peak & RMS from Master Analyser
      this.masterAnalyser.getFloatTimeDomainData(this._meteringBuffer);
      let peak = 0;
      let sumSq = 0;
      for (let i = 0; i < this._meteringBuffer.length; i++) {
        const x = this._meteringBuffer[i];
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        sumSq += x * x;
      }
      const rms = Math.sqrt(sumSq / this._meteringBuffer.length);
      this.outputPeak.set(Math.min(1.5, peak));
      this.outputRms.set(Math.min(1.5, rms));

      // LUFS from K-weighted Analyser
      const lufsData = new Float32Array(this.lufsAnalyzer.fftSize);
      this.lufsAnalyzer.getFloatTimeDomainData(lufsData);
      let lufsSumSq = 0;
      for (let i = 0; i < lufsData.length; i++) {
        lufsSumSq += lufsData[i] * lufsData[i];
      }
      const lufsMs = lufsSumSq / lufsData.length;
      const lufs = 10 * Math.log10(lufsMs + 1e-10) - 0.691;
      this.outputLufs.set(Math.max(-70, lufs));

      this._meteringRAF = requestAnimationFrame(tick);
    };
    this._meteringRAF = requestAnimationFrame(tick);
  }

  private autoAdjustEffect(): void {
    /* auto adjustment logic */
  }

  getMasterStream(): MediaStreamAudioDestinationNode {
    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordingDestination);
    }
    return this.recordingDestination;
  }

  /**
   * Adjust a single track's aux-send level (A or B) with the same drift-safe
   * exponential ramp the existing updateTrack() path uses. No-op if the
   * track has not yet been initialized into the send map.
   *
   * Clamps to [0, 1.5] to match VCA bus range. Existing shrink pathways
   * (TrackModel.sendA/sendB → updateTrack → setTargetAtTime) remain unchanged;
   * this is a fast narrow entry point for live aux-send nudging from the mixer.
   */
  setSendLevel(trackId: string, sendId: 'A' | 'B', level: number): void {
    if (sendId !== 'A' && sendId !== 'B') return;
    const safe = Math.max(0, Math.min(1.5, level));
    const map = sendId === 'A' ? this.trackSendAGains : this.trackSendBGains;
    const node = map.get(String(trackId));
    if (!node) return;
    node.gain.setTargetAtTime(safe, this.ctx.currentTime, 0.05);
  }
}
