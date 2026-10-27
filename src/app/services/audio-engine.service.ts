import { LoggingService } from './logging.service';
import {
  Injectable,
  signal,
  inject,
  Injector,
  untracked,
  computed,
  effect,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { StemSeparationService, Stems } from './stem-separation.service';
import { DynamicEffectsRack } from '../studio/effects/dynamic-effects-rack';
import { SampleStreamer } from './sample-streamer.service';
import {
  LoudnessMeter,
  phaseCorrelation,
  truePeakDb,
} from './loudness-meter';

export type DeckId = 'A' | 'B';

export type CrossfaderCurve = 'linear' | 'power' | 'exp' | 'cut';
/**
 * One live plugin insert slot. `kernel` is the name the
 * `plugin-chain-processor` worklet resolves on the audio thread
 * ('compressor' | 'limiter' | 'eq' | 'saturate' | 'process'); an unknown name
 * runs the worklet's identity kernel, so a chain never mutes the track.
 */
export interface LivePluginSlot {
  id: string;
  kernel: string;
  params: Float32Array;
}

/**
 * Resolves a plugin-id chain to live slots. Called from the engine's chain
 * poller rather than from an audio callback, so an implementation may touch
 * the plugin store (read params, check which modules finished loading).
 */
export type LivePluginChainProvider = (
  ids: string[]
) => Array<LivePluginSlot | null> | null;

/** A live plugin insert hosted by the audio rendering thread. */
interface LivePluginInsert {
  node: AudioWorkletNode;
  /** 1 = mono insert (track), 2 = stereo insert (master bus). */
  channels: 1 | 2;
  ids: string[];
  provider?: LivePluginChainProvider;
  /** Last chain posted to the audio thread — the poll only sends changes. */
  signature: string;
  /** Chain poller; stopped when the insert is removed. */
  poll: ReturnType<typeof setInterval> | null;
}

/** Synth LFO settings (Synth view → Filter Modulation). */
export interface LfoState {
  wave: string;
  rate: number;
  depth: number;
  target: string;
}

const DEFAULT_LFO_STATE: LfoState = {
  wave: 'sine',
  rate: 1,
  depth: 0,
  target: 'cutoff',
};

/**
 * Clamp a possibly-garbage value (undefined, NaN, a string from an input) to a
 * finite number inside [min, max], falling back to `fallback` when it is not a
 * usable number. Used by the synth/LFO controls so UI state can never push a
 * NaN into an AudioParam.
 */
export function clampFinite(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

/**
 * A live synth voice the device budget tracks. `stopAt` is the absolute
 * context time at which its envelope goes silent; `cut` releases it early —
 * the voice steal `StudioAudioBudget.maxVoices` promises ("concurrent
 * voices before the oldest is stolen").
 */
interface LiveVoice {
  /** Absolute ctx time the voice starts sounding (may be scheduler-ahead). */
  start: number;
  /** Absolute ctx time the envelope has silenced it. */
  stopAt: number;
  /** Silence this voice early, click-free (budget steal). */
  cut: () => void;
}

/**
 * Voice ceiling before the device profile classifies. Matches
 * `STUDIO_AUDIO_BUDGETS.high.maxVoices` — the desktop budget — so playback
 * is unchanged until `StudioDeviceProfileService` pushes the classified
 * ceiling through `setVoiceBudget()`.
 */
const DEFAULT_LIVE_VOICE_BUDGET = 32;

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
  /** Audible platter monitor: a source runs while a hand holds the vinyl,
   *  distinct from transport playback so `isPlaying` stays honest. */
  scratchMonitor: boolean;
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

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

const AUDIO_PARAM_PROPERTIES = new Set([
  'gain',
  'pan',
  'detune',
  'frequency',
  'Q',
  'playbackRate',
  'delayTime',
  'threshold',
  'knee',
  'ratio',
  'attack',
  'release',
  'pitch',
]);

/** Shortest loop region the DJ booth's ÷2 loop effect may shrink to (seconds). */
const MIN_LOOP_SECONDS = 0.05;

/** A small inert AudioParam used only when the browser has no Web Audio API. */
function createSilentAudioParam(initialValue = 0): AudioParam {
  let value = initialValue;
  const param = {
    get value() {
      return value;
    },
    set value(next: number) {
      value = Number.isFinite(next) ? next : initialValue;
    },
    cancelScheduledValues: () => param,
    cancelAndHoldAtTime: () => param,
    setValueAtTime: () => param,
    linearRampToValueAtTime: () => param,
    exponentialRampToValueAtTime: () => param,
    setTargetAtTime: () => param,
  };
  return param as unknown as AudioParam;
}

/**
 * Keep the shell and route components usable in embedded browsers that expose
 * no AudioContext. The graph is deliberately inert: callers still receive
 * nodes and params, but no sound is produced. This is a capability fallback,
 * not a second audio implementation.
 */
function createSilentAudioNode(): AudioNode {
  let node: AudioNode;
  const params = new Map<string, AudioParam>();
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: () => undefined,
    close: () => undefined,
  };
  const target: Record<PropertyKey, unknown> = {
    connect: () => node,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    port,
    getFloatTimeDomainData: (array: Float32Array) => array.fill(0),
    getByteFrequencyData: (array: Uint8Array) => array.fill(0),
    getFloatFrequencyData: (array: Float32Array) => array.fill(0),
  };

  node = new Proxy(target, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property !== 'string') return undefined;
      if (AUDIO_PARAM_PROPERTIES.has(property)) {
        let param = params.get(property);
        if (!param) {
          const initialValue =
            property === 'gain' || property === 'playbackRate' ? 1 : 0;
          param = createSilentAudioParam(initialValue);
          params.set(property, param);
        }
        return param;
      }
      if (property === 'fftSize') return 2048;
      if (property === 'frequencyBinCount') return 1024;
      if (property === 'channelCount' || property === 'numberOfChannels') return 2;
      if (property === 'sampleRate') return 48000;
      if (property === 'duration') return 0;
      if (property === 'buffer') return undefined;
      if (property === 'loop') return false;
      if (property === 'type') return 'sine';
      if (property === 'stream') return { getTracks: () => [] };
      return undefined;
    },
  }) as unknown as AudioNode;
  return node;
}

function createSilentAudioContext(): AudioContext {
  const context: Record<PropertyKey, unknown> = {
    sampleRate: 48000,
    currentTime: 0,
    state: 'suspended',
    destination: createSilentAudioNode(),
    onstatechange: null,
    audioWorklet: { addModule: () => Promise.resolve() },
    createAnalyser: () => createSilentAudioNode(),
    createBiquadFilter: () => createSilentAudioNode(),
    createBuffer: (channels: number, length: number) => {
      const channelData = new Map<number, Float32Array>();
      return {
        getChannelData: (channel: number) => {
          let data = channelData.get(channel);
          if (!data) {
            data = new Float32Array(length);
            channelData.set(channel, data);
          }
          return data;
        },
        copyFromChannel: (destination: Float32Array, channel: number) => {
          const data = channelData.get(channel);
          if (data) destination.set(data.subarray(0, destination.length));
        },
        numberOfChannels: channels,
        length,
        duration: length / 48000,
        sampleRate: 48000,
      } as unknown as AudioBuffer;
    },
    createBufferSource: () => createSilentAudioNode(),
    createChannelMerger: () => createSilentAudioNode(),
    createChannelSplitter: () => createSilentAudioNode(),
    createConvolver: () => createSilentAudioNode(),
    createDelay: () => createSilentAudioNode(),
    createDynamicsCompressor: () => createSilentAudioNode(),
    createGain: () => createSilentAudioNode(),
    createMediaStreamDestination: () => createSilentAudioNode(),
    createOscillator: () => createSilentAudioNode(),
    createPeriodicWave: () => createSilentAudioNode(),
    createScriptProcessor: () => createSilentAudioNode(),
    createStereoPanner: () => createSilentAudioNode(),
    createWaveShaper: () => createSilentAudioNode(),
    resume: () => {
      context.state = 'running';
      return Promise.resolve();
    },
    close: () => {
      context.state = 'closed';
      return Promise.resolve();
    },
    setSinkId: () => Promise.resolve(),
  };
  return context as unknown as AudioContext;
}

function createAudioContext(): { context: AudioContext; available: boolean } {
  if (typeof window === 'undefined') {
    return { context: createSilentAudioContext(), available: false };
  }

  const AudioContextCtor =
    window.AudioContext || (window as any).webkitAudioContext;
  if (typeof AudioContextCtor !== 'function') {
    return { context: createSilentAudioContext(), available: false };
  }

  const Ctor = AudioContextCtor as AudioContextConstructor;
  for (const sampleRate of [96000, 48000]) {
    try {
      return { context: new Ctor({ sampleRate }), available: true };
    } catch {
      // Try the next rate, then the browser's default below.
    }
  }
  try {
    return { context: new Ctor(), available: true };
  } catch {
    return { context: createSilentAudioContext(), available: false };
  }
}

@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  private static readonly INTEGER_TRACK_ID_PATTERN = /^-?\d+$/;
  public static readonly DEFAULT_LOOKAHEAD_SECONDS = 0.1;
  public static readonly DEFAULT_SCHEDULER_INTERVAL_MS = 25;

  // ── Pro: High-Quality Audio Context with oversampling ──────
  private readonly audioContext = createAudioContext();
  public readonly ctx: AudioContext = this.audioContext.context;
  /** False only when the host has no usable Web Audio implementation. */
  public readonly audioAvailable = this.audioContext.available;

  public readonly nativeSampleRate: number = this.ctx.sampleRate;
  public readonly oversampleFactor: number =
    this.nativeSampleRate >= 96000 ? 2 : this.nativeSampleRate >= 48000 ? 4 : 8;
  public readonly effectiveSampleRate: number =
    this.nativeSampleRate * this.oversampleFactor;

  private readonly antialiasEnabled = signal(true);
  private readonly ditherEnabled = signal(true);
  private ditherNode: GainNode | null = null;
  /** Looping noise buffer feeding `ditherNode` while dithering is on. */
  private ditherNoiseSource: AudioBufferSourceNode | null = null;
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

  /**
   * The single master output node. Everything the artist hears passes through
   * it exactly once, and every meter reads it as a parallel dead-end tap, so
   * measurement can never change the sound.
   */
  public masterOutput = this.ctx.createGain();

  /**
   * Stereo metering tap. Left and right are kept separate because BS.1770
   * sums the weighted energy of real channels; a single AnalyserNode would
   * downmix to mono and lose that ~3 LU of channel sum.
   */
  public lufsSplitter = this.ctx.createChannelSplitter(2);
  public lufsAnalyserLeft = this.ctx.createAnalyser();
  public lufsAnalyserRight = this.ctx.createAnalyser();

  public masterAnalyser = this.ctx.createAnalyser();
  public masterEQ = this.ctx.createBiquadFilter();
  public masterShelf = this.ctx.createBiquadFilter();

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

  /** Send B's processor (tempo-synced echo) and its wet return trim. */
  private readonly echoDelay = this.ctx.createDelay(2);
  private readonly echoFeedback = this.ctx.createGain();
  private readonly echoDamp = this.ctx.createBiquadFilter();
  public readonly echoWet = this.ctx.createGain();

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
  /** Sprint B1 Phase 2 — live WASM plugin insert worklets per track. */
  private trackPluginInserts = new Map<string, LivePluginInsert>();

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
  /** Transport A/B loop, end-exclusive in sixteenth-note steps. */
  public playbackLoopEnabled = signal(false);
  public playbackLoopStart = signal<number | null>(null);
  public playbackLoopEnd = signal<number | null>(null);
  private transportGeneration = 0;

  setPlaybackLoop(start: number | null, end: number | null): boolean {
    if (start === null || end === null) {
      this.playbackLoopStart.set(start);
      this.playbackLoopEnd.set(end);
      this.playbackLoopEnabled.set(false);
      return false;
    }
    const length = this.playMode() === 'song' ? this.songLengthSteps() : this.loopLengthSteps();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > length) return false;
    this.playbackLoopStart.set(Math.floor(start));
    this.playbackLoopEnd.set(Math.floor(end));
    return true;
  }
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

  /**
   * Persistent master tone-shaping EQ. The AI mastering pass used to allocate a
   * fresh low-shelf/low-mid biquad pair on every run and disconnect
   * `_preMasterGain`, which left the orphaned biquads feeding the compressor in
   * parallel and cut the active master worklet out of the graph. These nodes
   * are created once and spliced into the fallback chain exactly once;
   * `setMasterToneEq()` only ever moves their gains (or forwards to the worklet
   * when it owns the output).
   */
  private readonly masterToneLowShelf = this.ctx.createBiquadFilter();
  private readonly masterToneLowMid = this.ctx.createBiquadFilter();
  private masterToneEqState = { lowShelfDb: 0, lowMidDb: 0, highShelfDb: 0 };

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
    this.masterToneLowShelf.type = 'lowshelf';
    this.masterToneLowShelf.frequency.value = 60;
    this.masterToneLowMid.type = 'peaking';
    this.masterToneLowMid.frequency.value = 300;
    this.masterToneLowMid.Q.value = 0.7;
    this.masterToneLowShelf.gain.value = 0;
    this.masterToneLowMid.gain.value = 0;
    this._preMasterGain.connect(this.masterToneLowShelf);
    this.masterToneLowShelf.connect(this.masterToneLowMid);
    this.masterToneLowMid.connect(this.compressor);
    this.compressor.connect(this.saturationNode);
    this.saturationNode.connect(this.quantumSaturation);
    this.quantumSaturation.connect(this.spectralExciter);
    this.spectralExciter.connect(this.subAtomicEnhancer);
    this.subAtomicEnhancer.connect(this.limiter);
    this.limiter.connect(this.masterEQ);
    this.masterEQ.connect(this.masterShelf);
    this.masterShelf.connect(this.masterOutput);

    // The master output feeds the speakers directly, and the meters observe it
    // through parallel taps. The BS.1770 K-weighting used to be wired in series
    // right here, which meant everything the artist heard was high-passed at
    // 100 Hz and lifted +4 dB above 1.5 kHz while the bounced file was not —
    // the mix being judged was not the mix being exported. K-weighting now
    // lives inside the shared meter, where it cannot touch the audio path.
    this.masterOutput.connect(this.ctx.destination);
    this.masterOutput.connect(this.masterAnalyser);
    this.masterOutput.connect(this.lufsSplitter);
    this.lufsSplitter.connect(this.lufsAnalyserLeft, 0);
    this.lufsSplitter.connect(this.lufsAnalyserRight, 1);

    // ── Master FX returns (Send A = reverb, Send B = tempo-synced echo) ──
    // The returns used to loop straight back into masterGain with nothing on
    // the return path, so raising a send only re-added the DRY track — it acted
    // as a second gain stage instead of a send — and the master reverb, whose
    // wet gain both FxMacrosService and the Master Controls fader drive, had no
    // input at all (its convolver was built but never fed). Both returns now
    // terminate on real processors. No feedback risk: the send taps come from
    // the per-track faders, never from masterGain.
    this.reverbConvolver.buffer = this.createReverbImpulse();
    this.reverbWet.gain.value = 0.1; // mirrors the Master Controls fader default
    this.sendAReturn.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);

    this.echoFeedback.gain.value = 0.32;
    this.echoDamp.type = 'lowpass';
    this.echoDamp.frequency.value = 3200;
    this.echoWet.gain.value = 0.45;
    this.sendBReturn.connect(this.echoDelay);
    this.echoDelay.connect(this.echoDamp);
    this.echoDamp.connect(this.echoFeedback);
    // A cycle is legal in Web Audio as long as it contains a DelayNode, which
    // makes this the standard low-passed feedback echo.
    this.echoFeedback.connect(this.echoDelay);
    this.echoDelay.connect(this.echoWet);
    this.echoWet.connect(this.masterGain);

    // Keep the echo on a dotted eighth so the repeats stay musical at any
    // tempo; every tempo write in the app goes through this signal.
    effect(() => {
      const bpm = Math.max(1, this.tempo());
      const seconds = Math.max(0.02, Math.min(2, (60 / bpm) * 0.75));
      try {
        this.echoDelay.delayTime.setTargetAtTime(
          seconds,
          this.ctx.currentTime,
          0.05
        );
      } catch {
        /* AudioParam not started yet — the next tempo change retries. */
      }
    });

    // Metering tap sizing: an 85 ms analyser window at 48 kHz, so a 50 ms poll
    // always holds a fresh contiguous hop for the loudness meter. A shorter
    // window than the poll would silently miss frames.
    for (const analyser of [this.lufsAnalyserLeft, this.lufsAnalyserRight]) {
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
    }

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
    if (this.audioAvailable) {
      this.initMidiOut();
      // Populate the sink enumeration so the transport-bar dropdown has options on first click.
      // Device labels stay empty until the user grants permission, but deviceId entries are still
      // useful for setSinkId targeting and the empty-state hint check (`outputDevices().length === 0`).
      this.refreshOutputDevices();
      const canUseWorklet =
        typeof (this.ctx as any).audioWorklet?.addModule === 'function' &&
        typeof AudioWorkletNode !== 'undefined';
      if (canUseWorklet) {
        this.initMasterWorklet();
        this.initWorklet();
        this.initPluginChainWorklet();
      } else {
        this.logger.info(
          'AudioWorklet unavailable in this host; using the main-thread audio path.'
        );
      }
    } else {
      this.logger.info(
        'Audio engine unavailable in this host; continuing with a silent capability fallback.'
      );
    }
    // Track AudioContext.state reactively so the contextState signal stays in sync
    // with engine lifecycle transitions (suspended ↔ running ↔ closed).
    this.ctx.onstatechange = this._ctxStateHandler;
    this._ctxStateHandler();
    if (this.audioAvailable) this.startOutputMetering();
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
        // The worklet carries its own EQ/compression/limiting, so it feeds the
        // master output directly — never a metering filter.
        workletNode.connect(this.masterOutput);
        this._preMasterGain.disconnect(this.masterToneLowShelf);

        workletNode.port.postMessage({ slot: 'preset', payload: 'smuve' });
        workletNode.port.postMessage({
          slot: 'limiter',
          action: 'configure',
          payload: { ceilingDb: this.masteringTargets.truePeak },
        });
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

  /**
   * Apply the master tone-shaping stage. Idempotent by design: repeated calls
   * only move gains on the persistent biquads (fallback chain) or update the
   * worklet's 5-band EQ, so a second AI mastering pass can never stack parallel
   * paths into the master compressor or sever the active worklet.
   *
   * @param tone Low-shelf (~60 Hz), low-mid (~300 Hz) and high-shelf (~5 kHz)
   *   gains in dB. Each is clamped to +/-18 and defaults to the last applied
   *   value so a partial call never resets the stage.
   */
  setMasterToneEq(tone: {
    lowShelfDb?: number;
    lowMidDb?: number;
    highShelfDb?: number;
  }): void {
    const clamp = (value: number | undefined, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.max(-18, Math.min(18, value))
        : fallback;
    const lowShelfDb = clamp(tone.lowShelfDb, this.masterToneEqState.lowShelfDb);
    const lowMidDb = clamp(tone.lowMidDb, this.masterToneEqState.lowMidDb);
    const highShelfDb = clamp(
      tone.highShelfDb,
      this.masterToneEqState.highShelfDb,
    );
    const now = this.ctx.currentTime;

    if (this.masterWorkletActive()) {
      // Worklet bands: 0 sub(40) · 1 low(120) · 2 mid(800) · 3 high(4000) · 4 air(12000)
      this.configureMasterWorklet('eq', 'configure', {
        band: 0,
        gain: lowShelfDb,
      });
      this.configureMasterWorklet('eq', 'configure', {
        band: 2,
        gain: lowMidDb,
      });
      this.configureMasterWorklet('eq', 'configure', {
        band: 3,
        gain: highShelfDb,
      });
    } else {
      this.masterToneLowShelf.gain.setTargetAtTime(lowShelfDb, now, 0.05);
      this.masterToneLowMid.gain.setTargetAtTime(lowMidDb, now, 0.05);
    }
    // The shared high-shelf node lives on the fallback path only; updating it
    // while the worklet owns the output is harmless and keeps the two paths in
    // agreement for the moment the worklet is torn down.
    this.masterShelf.gain.setTargetAtTime(highShelfDb, now, 0.05);
    this.masterToneEqState = { lowShelfDb, lowMidDb, highShelfDb };
  }

  /** Read-back of the last applied master tone EQ (idempotency + UI). */
  getMasterToneEq(): {
    lowShelfDb: number;
    lowMidDb: number;
    highShelfDb: number;
  } {
    return { ...this.masterToneEqState };
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
    // Integrated loudness describes a program from where it began, so the
    // measurement window restarts with the transport.
    this.resetLoudnessMeasurement();
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
    this.resetLoudnessMeasurement();
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
    this.transportGeneration++;
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
    if (this.songEnded() || !this.isPlaying()) return;

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
    const loopStart = this.playbackLoopStart();
    const loopEnd = this.playbackLoopEnd();
    const hasRegion = loopStart !== null && loopEnd !== null && loopEnd > loopStart;
    if (this.playbackLoopEnabled()) {
      const start = hasRegion ? loopStart : 0;
      const end = hasRegion ? loopEnd : (this.playMode() === 'song' ? this.songLengthSteps() : this.loopLengthSteps());
      displayStep = start + (step % Math.max(1, end - start));
    } else if (this.playMode() === 'song') {
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
    const generation = this.transportGeneration;
    setTimeout(
      () => {
        if (!this.isPlaying() || generation !== this.transportGeneration) return;
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
      if (!this.isPlaying()) break;
      this.nextNoteTime += stepDuration;
      if (!this.isCountIn()) {
        // Sprint A4: in song mode the counter goes straight — handleTick
        // detects the boundary and calls stop() (which clears the
        // schedulerHandle on its next tick). In pattern mode we wrap to
        // the existing loopLengthSteps to preserve the original behaviour.
        if (this.playMode() === 'song' || this.playbackLoopEnabled()) {
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
    // the chain is silent until setDeckAdvancedFx() drives it.
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
      scratchMonitor: false,
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

    // Sends are pre-fader taps into the master return buses. A fresh
    // createGain() defaults to unity, which would double the deck through
    // the returns on top of the main path — zero them explicitly so the
    // FX wash only appears when a reverb/rotate mode drives them.
    deck.sendA.gain.value = 0;
    deck.sendB.gain.value = 0;

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
    // The per-stem gains are the deck's input stage — route them into the
    // EQ first, or the sources feed dangling nodes and the turntable is
    // silent (scratch included).
    Object.values(deck.gains).forEach((g) => g.connect(deck.eqLow));
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
    // Transport playback supersedes a platter monitor.
    deck.scratchMonitor = false;
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
    deck.scratchMonitor = false;
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
    } else if (deck.scratchMonitor) {
      // The hand moved the groove: re-cue the monitor so the scrub is heard.
      this.startScratchMonitorSource(id);
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
   * Start the audible platter monitor for a deck that is being held.
   *
   * A platter grab stops the transport (so a slip scratch can resolve back to
   * the ghost playhead), which also stops every buffer source — and a scratch
   * on a stopped graph is silent. The monitor plays the deck's own buffer from
   * the current playhead *without* touching `isPlaying`, so `scratch()` and
   * `seekDeck()` modulate real audio while the hand is on the vinyl. Release
   * with `endScratchMonitor()`, which leaves the needle where the hand let go.
   */
  beginScratchMonitor(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return;
    deck.scratchMonitor = true;
    this.startScratchMonitorSource(id);
  }

  /** Stop the platter monitor, keeping the playhead where it was left. */
  endScratchMonitor(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.scratchMonitor) return;
    this.stopDeckSources(deck);
    deck.scratchMonitor = false;
  }

  /**
   * Single full-mix source for the platter monitor, cued at `pauseOffset` and
   * running at the deck's current rate (negative while scratching backwards).
   * It enters the graph through the `other` stem gain, so the scratch respects
   * the channel EQ, filter, FX, pan and fader like any other deck audio.
   */
  private startScratchMonitorSource(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer || !deck.scratchMonitor) return;
    this.stopDeckSources(deck);
    const buffer = deck.buffer;
    const rate = Number.isFinite(deck.rate) && deck.rate !== 0 ? deck.rate : 1;
    const pos = Math.max(
      0,
      Math.min(deck.pauseOffset, Math.max(0, buffer.duration - 0.001))
    );
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const target = deck.gains.other ?? deck.gains.instrumental ?? deck.gains.drums;
    src.connect(target ?? deck.eqLow);
    src.start(this.ctx.currentTime, pos);
    deck.sources = { other: src };
  }

  private stopDeckSources(deck: DeckChannel) {
    Object.values(deck.sources).forEach((s) => {
      if (!s) return;
      try {
        s.stop();
      } catch (e) {}
    });
    deck.sources = {};
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
    // Read the playhead before the loop is engaged: progress is reported
    // wrapped inside the region once loopEnabled is set, so the real offset of
    // a parked deck would look like it was already inside.
    const pos = this.getDeckProgress(id).position;
    deck.loopStart = s;
    deck.loopEnd = e;
    deck.loopEnabled = true;
    Object.values(deck.sources).forEach((src) => {
      if (!src) return;
      src.loop = true;
      src.loopStart = s;
      src.loopEnd = e;
    });
    // Keep the live playhead inside the loop region. A parked deck has to be
    // re-cued too — otherwise the loop is engaged outside its own bounds and
    // the first press of play never repeats.
    if (pos < s || pos >= e) this.seekDeck(id, s);
  }

  /**
   * Loop length effect — halve (`÷2`) or double (`×2`) the active loop region
   * while holding its in-point steady. Returns false when no region is engaged
   * so the caller can report the miss instead of silently doing nothing.
   */
  scaleDeckLoop(id: DeckId, factor: number): boolean {
    const deck = this.getDeck(id);
    if (!deck || !deck.buffer) return false;
    if (!Number.isFinite(factor) || factor <= 0) return false;
    if (!deck.loopEnabled || deck.loopEnd <= deck.loopStart) return false;
    const duration = deck.buffer.duration;
    const start = deck.loopStart;
    const span = Math.max(
      MIN_LOOP_SECONDS,
      (deck.loopEnd - start) * factor
    );
    const end = Math.max(
      start + MIN_LOOP_SECONDS,
      Math.min(duration, start + span)
    );
    this.setDeckLoopRegion(id, start, end);
    return true;
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
   * Install / remove a live plugin insert on the master bus with a fixed
   * splice point. The plugin-chain worklet is spliced between the M/S width
   * merger and the pre-master bus — NOT at masterGain — so the width network
   * stays in the signal path and removal never leaves a bypass edge behind.
   *
   * The chain runs on the audio rendering thread. A 512-frame
   * `createScriptProcessor` block at 48 kHz is ~10.7 ms of DSP, and it used to
   * run on the same thread that renders the arrangement, the piano roll and the
   * mixer — which is what made every enabled plugin a note-entry jitter source,
   * i.e. the "feels cheap on Android" symptom.
   *
   * `getChain` resolves the live chain to slot descriptions (kernel name plus
   * the kernel's params in kernel order) and is polled while the insert is
   * installed, so a knob move — or a module that finishes loading
   * asynchronously — reaches the audio thread on the next tick.
   */
  installMasterPluginInsertAfterWidth(
    pluginIds: string[],
    getChain?: LivePluginChainProvider
  ): void {
    if (pluginIds.length === 0) {
      // Restore the width-merger → pre-master edge + drop the insert.
      // Only touch the graph when an insert was actually installed; the
      // default path (merger → preMasterGain) is left untouched otherwise.
      const insert = this.masterPluginInsert;
      if (insert) {
        try {
          this.masterWidthMerger.disconnect(insert.node);
        } catch {
          /* already disconnected */
        }
        this.stopPluginChainPoll(insert);
        try {
          insert.node.disconnect();
        } catch {
          /* already disconnected */
        }
        this.masterPluginInsert = null;
        this.masterWidthMerger.connect(this._preMasterGain);
      }
      this.masterPluginIds.set([]);
      return;
    }

    if (this.masterPluginInsert) return; // already installed — toggle handled elsewhere

    // The worklet module loads asynchronously; re-enter this install once it
    // lands so a plugin toggled during boot still reaches the audio thread.
    if (
      !this.whenPluginChainWorkletReady(() =>
        this.installMasterPluginInsertAfterWidth(pluginIds, getChain)
      )
    ) {
      return;
    }

    const insert = this.createLivePluginInsert(pluginIds, getChain, 2);
    if (!insert) return;

    // Splice the insert between the M/S width merger and the pre-master
    // bus so the master-width network stays in the path (splicing at
    // masterGain would bypass it and double-feed the pre-master bus).
    try {
      this.masterWidthMerger.disconnect(this._preMasterGain);
    } catch {
      /* already disconnected */
    }
    this.masterWidthMerger.connect(insert.node);
    insert.node.connect(this._preMasterGain);
    this.masterPluginInsert = insert;
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
    const voiceGain = Number.isFinite(gain) ? gain : 1;
    const peak = Math.max(0.0001, velocity * voiceGain);
    this.buildVoiceGraph(
      this.ctx,
      this.getTrackOutput(trackId.toString()),
      freq,
      time,
      peak,
      duration,
      pan,
      params,
      // Live path only: hands the built voice to the device budget so
      // `budget().maxVoices` is enforced where the artist actually hears
      // notes. The offline bounce omits the hook, so an export is never
      // throttled by the interactive ceiling.
      (voice) => this.admitLiveVoice(voice)
    );

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

  // ── Device voice budget (StudioDeviceProfileService.budget()) ──────────

  /** Live voices holding a budget slot; see `ensureLiveVoices` for why lazy. */
  private liveVoices?: LiveVoice[];
  /** Last ceiling pushed by the device profile; `undefined` = default. */
  private voiceBudget?: number;

  /**
   * Apply the device's voice ceiling. `StudioDeviceProfileService` pushes
   * `budget().maxVoices` here the moment the Studio classifies the device —
   * the same road it already walks for `updateAdaptivePerformance`.
   *
   * Why the live path and not the `Instrument` constructors the audit first
   * suggested: those subclasses are imported only by `synth-classes.spec.ts`
   * (dead code in the app), while every note the artist actually hears runs
   * `triggerAttack` → `buildVoiceGraph`. One ceiling there covers
   * arrangement playback, the piano roll, drum pads and the AI musicians.
   *
   * A lower ceiling takes effect immediately — sounding voices above it are
   * shed now, not at the next note. A non-finite or sub-1 value is ignored,
   * so a bad push can never reset or crash the ceiling.
   */
  setVoiceBudget(maxVoices: number): void {
    const parsed = Math.floor(Number(maxVoices));
    if (!Number.isFinite(parsed) || parsed < 1) return;
    this.voiceBudget = parsed;

    const voices = this.pruneLiveVoices(this.ctx.currentTime);
    while (voices.length > parsed) {
      this.stealOldestVoice(voices);
    }
  }

  /**
   * Live voices currently holding a budget slot (finished envelopes pruned).
   * Diagnostics for tests; the Engine Metrics card reads the ceiling itself
   * straight from the device profile.
   */
  activeVoiceCount(): number {
    return this.pruneLiveVoices(this.ctx.currentTime).length;
  }

  /**
   * Registry + ceiling are lazily initialised for the same reason
   * `ensureLfoState` is: several unit tests build this service with
   * `Object.create(AudioEngineService.prototype)`, where field initialisers
   * never run.
   */
  private ensureLiveVoices(): LiveVoice[] {
    if (!this.liveVoices) this.liveVoices = [];
    return this.liveVoices;
  }

  /** Drop voices whose envelope has already finished; returns the registry. */
  private pruneLiveVoices(now: number): LiveVoice[] {
    const voices = this.ensureLiveVoices();
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].stopAt <= now) voices.splice(i, 1);
    }
    return voices;
  }

  /** Cut the oldest occupying voice (the steal) and drop it from the count. */
  private stealOldestVoice(voices: LiveVoice[]): void {
    let oldest = 0;
    for (let i = 1; i < voices.length; i++) {
      if (voices[i].start < voices[oldest].start) oldest = i;
    }
    voices[oldest].cut();
    voices.splice(oldest, 1);
  }

  /**
   * Admit a newly built live voice under the ceiling: prune voices that have
   * ended, then — while the budget is full — steal the oldest (a voice that
   * already started sorts before a scheduler-ahead one because its `start`
   * sits in the past). The new voice always gets in; that is what "before
   * the oldest is stolen" means.
   */
  private admitLiveVoice(voice: LiveVoice): void {
    const voices = this.pruneLiveVoices(this.ctx.currentTime);
    const budget = this.voiceBudget ?? DEFAULT_LIVE_VOICE_BUDGET;
    while (voices.length >= budget) {
      this.stealOldestVoice(voices);
    }
    voices.push(voice);
  }

  /**
   * Release a live voice early without a click: cancel the scheduled
   * envelope (otherwise the sustain/release automation would bring the voice
   * straight back after the cut), decay it over a few milliseconds, and stop
   * every source at — never after — its already-scheduled end, so a steal
   * can never extend a voice that was about to finish on its own.
   */
  private cutVoice(
    ctx: BaseAudioContext,
    vca: GainNode,
    sources: (OscillatorNode | null)[],
    stopAt: number
  ): void {
    const now = ctx.currentTime;
    vca.gain.cancelScheduledValues?.(now);
    this.targetParam(vca.gain, 0.0001, now, 0.005);
    const halt = Math.min(now + 0.05, stopAt);
    for (const source of sources) {
      if (!source) continue;
      try {
        source.stop(halt);
      } catch {
        // Already stopped, or a host that refuses a second stop — the gain
        // decay has silenced the voice either way.
      }
    }
  }

  /**
   * Synth LFO (the Synth view's "Filter Modulation" section).
   *
   * `setLfoParam` used to be called through an optional-chained cast that no
   * one had implemented, so the whole LFO section — wave, rate, depth and all
   * four targets — was a dead control, and the WOBBLE patch's "turn up the LFO
   * rate" tip could never come true. Voices built after a change now carry the
   * modulation. Depth 0 leaves it bypassed, so nothing that already shipped
   * changes sound until the artist touches the section.
   */
  private lfoState?: LfoState;

  /**
   * LFO state, created on demand: a bare `Object.create(prototype)` instance
   * (the shape several unit tests use) never runs field initialisers.
   */
  private ensureLfoState(): LfoState {
    if (!this.lfoState) this.lfoState = { ...DEFAULT_LFO_STATE };
    return this.lfoState;
  }

  /** Update one LFO parameter (`wave` | `rate` | `depth` | `target`). */
  setLfoParam(param: string, value: unknown): void {
    const state = this.ensureLfoState();
    switch (param) {
      case 'wave':
        state.wave = String(value || 'sine');
        break;
      case 'target':
        state.target = String(value || 'cutoff');
        break;
      case 'rate':
        state.rate = clampFinite(value, 0.01, 40, state.rate);
        break;
      case 'depth':
        state.depth = clampFinite(value, 0, 1, state.depth);
        break;
      default:
        break;
    }
  }

  /** Replace the whole LFO snapshot in one call (used when a patch loads). */
  setLfoParams(params: Partial<LfoState> | null | undefined): void {
    if (!params) return;
    if (params.wave !== undefined) this.setLfoParam('wave', params.wave);
    if (params.target !== undefined) this.setLfoParam('target', params.target);
    if (params.rate !== undefined) this.setLfoParam('rate', params.rate);
    if (params.depth !== undefined) this.setLfoParam('depth', params.depth);
  }

  /** Current LFO snapshot (read-only copy). */
  getLfoParams(): LfoState {
    return { ...this.ensureLfoState() };
  }

  /**
   * One voice builder, shared by live playback and the offline bounce.
   *
   * Previously `triggerAttack` and `scheduleOfflineNote` were two divergent
   * copies of the same idea: the live path ignored the voice's filter, sub
   * oscillator and ADSR outright, so a Synth patch did not sound like its own
   * export, and the Synth UI's envelope and SUB OSC controls changed nothing
   * at all. Both paths now build the identical graph:
   *
   *     osc (+ sub osc) → [filter] → panner → VCA → destination
   *
   * The envelope shape follows the voice's own params so nothing that already
   * sounded right changes:
   *   · `sustain` is a number → full ADSR (exactly what the Synth UI draws).
   *   · otherwise → the percussive decay envelope drum pads and preview
   *     voices have always used.
   *
   * Returns the absolute time at which the voice is silenced. Callers that
   * pass `onVoice` (the live path does) get the built voice handle handed
   * back so the device budget can count it and, at the ceiling, steal it.
   */
  private buildVoiceGraph(
    ctx: BaseAudioContext,
    destination: AudioNode,
    freq: number,
    time: number,
    peak: number,
    duration: number,
    pan: number,
    params: any,
    onVoice?: (voice: LiveVoice) => void
  ): number {
    const p = params ?? {};
    const oscType = p.oscillator || p.type || 'sine';
    const osc = this.createAntialiasedOscillator(
      ctx as AudioContext,
      oscType,
      freq,
      time
    );

    // Filter stage — present when the voice declares a cutoff or an explicit
    // filter type. Applying the preset/pad cutoff is what makes a patch sound
    // like its export, and what makes the Drum Machine's per-pad CUTOFF / RES
    // knobs (both were dead controls) reach the audio graph.
    // A voice may carry its own LFO — it lives on the track's synth patch, so
    // it persists with the project and exports with the mix. Voices without a
    // patch fall back to the engine-wide LFO default. Depth 0 is bypassed.
    const lfoState = {
      ...this.ensureLfoState(),
      ...((p.lfo as Partial<LfoState> | undefined) ?? {}),
    } as LfoState;
    const lfoDepth = clampFinite(lfoState.depth, 0, 1, 0);
    const lfoTarget = lfoState.target || "cutoff";
    const lfoSweepsFilter =
      lfoDepth > 0 &&
      lfoTarget !== "pitch" &&
      lfoTarget !== "volume" &&
      lfoTarget !== "pan";
    const hasFilter =
      Number.isFinite(p.cutoff) || Boolean(p.filterType) || lfoSweepsFilter;
    let filter: BiquadFilterNode | null = null;
    let baseCutoffValue = 20000;
    if (hasFilter) {
      filter = ctx.createBiquadFilter();
      filter.type = (p.filterType as BiquadFilterType) || 'lowpass';
      const cutoff = Number.isFinite(p.cutoff)
        ? Math.max(20, Math.min(20000, p.cutoff))
        : lfoSweepsFilter
          ? 20000 // LFO-only filter stays wide open, so the dry tone is intact
          : 8000;
      baseCutoffValue = cutoff;
      const qSource = Number.isFinite(p.q) ? p.q : p.resonance;
      const q = Number.isFinite(qSource)
        ? Math.max(0.0001, Math.min(30, qSource))
        : 1;
      filter.frequency.setValueAtTime(cutoff, time);
      filter.Q.setValueAtTime(q, time);
    }

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const vca = ctx.createGain();

    const safeDuration = Math.max(0.001, duration);
    const attack = Math.max(0.0001, Number(p.attack) || 0.01);
    const release = Math.max(0.005, Number(p.release) || 0.1);
    let stopAt: number;

    if (Number.isFinite(p.sustain)) {
      // Full ADSR — the note holds its sustain level, then releases after it.
      const decay = Math.max(0.0001, Number(p.decay) || 0.1);
      const sustainLevel = Math.max(
        0.0001,
        peak * Math.max(0, Math.min(1, p.sustain))
      );
      vca.gain.setValueAtTime(0.0001, time);
      this.rampParam(vca.gain, 'exp', peak, time + attack);
      vca.gain.setValueAtTime(peak, time + attack + decay);
      this.rampParam(vca.gain, 'exp', sustainLevel, time + attack + decay);
      const releaseStart = time + Math.max(attack + decay, safeDuration);
      vca.gain.setValueAtTime(sustainLevel, releaseStart);
      this.rampParam(vca.gain, 'exp', 0.0001, releaseStart + release);
      stopAt = releaseStart + release + 0.05;
    } else {
      // Percussive decay — the envelope the drum pads, metronome blips,
      // preview voices and every un-patched track play with.
      //
      // The attack must be a *bounded* ramp, not `setTargetAtTime`. A
      // target is an open-ended exponential approach that never lands on a
      // value in the automation timeline, so the decay ramp below had no
      // departure point and started from zero: the voice peaked at ~5e-4
      // (≈ −57 dB) and the offline export rendered near-silence.
      // A linear ramp reaches `peak` exactly at `time + attack`, which is
      // the value the decay then departs from.
      vca.gain.setValueAtTime(0, time);
      this.rampParam(vca.gain, 'linear', peak, time + attack);
      vca.gain.exponentialRampToValueAtTime(
        0.001,
        time + safeDuration + release
      );
      stopAt = time + safeDuration + release + 0.1;
    }

    if (filter) {
      osc.connect(filter);
      filter.connect(panner);
    } else {
      osc.connect(panner);
    }
    panner.connect(vca);
    vca.connect(destination);

    // ── LFO ───────────────────────────────────────────────────────────────
    // The Synth's Filter Modulation section is applied per voice, on the same
    // graph the offline bounce uses, so a wobble survives an export. Depth 0
    // keeps it fully bypassed.
    let lfoOsc: OscillatorNode | null = null;
    if (lfoDepth > 0) {
      let lfoDestination: AudioParam | null = null;
      let lfoAmount = 0;
      if (lfoTarget === "pitch") {
        lfoDestination = osc.detune;
        lfoAmount = 100 * lfoDepth; // cents — a semitone at full depth
      } else if (lfoTarget === "volume") {
        lfoDestination = vca.gain;
        lfoAmount = peak * lfoDepth;
      } else if (lfoTarget === "pan") {
        lfoDestination = panner.pan;
        lfoAmount = lfoDepth;
      } else if (filter) {
        lfoDestination = filter.frequency;
        lfoAmount = baseCutoffValue * 0.8 * lfoDepth;
      }
      if (lfoDestination) {
        lfoOsc = ctx.createOscillator();
        lfoOsc.type = (lfoState.wave as OscillatorType) || "sine";
        const lfoRate = clampFinite(lfoState.rate, 0.01, 40, 1);
        lfoOsc.frequency.setValueAtTime(lfoRate, time);
        const lfoDepthGain = ctx.createGain();
        lfoDepthGain.gain.setValueAtTime(lfoAmount, time);
        lfoOsc.connect(lfoDepthGain);
        lfoDepthGain.connect(lfoDestination);
        lfoOsc.start(time);
        lfoOsc.stop(stopAt);
      }
    }

    // Sub oscillator — the Synth's SUB OSC toggle finally reaches the graph.
    // Gated at 40Hz so a low note cannot push its own sub-bass into the
    // inaudible/DC region.
    let subOsc: OscillatorNode | null = null;
    if (p.subOsc && Number(p.subGain) > 0 && freq >= 40) {
      subOsc = this.createAntialiasedOscillator(
        ctx as AudioContext,
        p.subType || 'sine',
        freq * 0.5,
        time
      );
      const subGainNode = ctx.createGain();
      subGainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, Number(p.subGain))),
        time
      );
      subOsc.connect(subGainNode);
      subGainNode.connect(filter ?? panner);
    }

    // Slide note support: glide the oscillator frequency over the note
    // duration. `glideTo` is a target frequency; the pitch sweeps from `freq`
    // to `glideTo` with an exponential ramp (portamento feel).
    if (
      typeof p.glideTo === 'number' &&
      isFinite(p.glideTo) &&
      p.glideTo > 0
    ) {
      const glideEnd = time + Math.max(0.02, safeDuration);
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(p.glideTo, glideEnd);
      if (subOsc) {
        subOsc.frequency.setValueAtTime(freq * 0.5, time);
        subOsc.frequency.exponentialRampToValueAtTime(
          p.glideTo * 0.5,
          glideEnd
        );
      }
    }

    osc.start(time);
    osc.stop(stopAt);
    if (subOsc) {
      subOsc.start(time);
      subOsc.stop(stopAt);
    }

    onVoice?.({
      start: time,
      stopAt,
      cut: () => this.cutVoice(ctx, vca, [osc, subOsc, lfoOsc], stopAt),
    });

    return stopAt;
  }

  /**
   * Mirror an envelope point onto an AudioParam with an exponential approach
   * (the hardware-style "attack" curve). Falls back to a ramp when a host or
   * mocked param does not expose `setTargetAtTime`.
   */
  private targetParam(
    param: AudioParam,
    value: number,
    time: number,
    timeConstant: number
  ): void {
    if (typeof (param as any).setTargetAtTime === 'function') {
      param.setTargetAtTime(value, time, timeConstant);
      return;
    }
    this.rampParam(param, 'exp', value, time + timeConstant);
  }

  /**
   * Mirror an envelope point onto an AudioParam. Real browsers expose both
   * ramp methods, but a bare/mocked param (or a stripped-down WebView) may
   * not — falling back to setTargetAtTime keeps the voice sounding instead of
   * throwing out of the scheduler.
   */
  private rampParam(
    param: AudioParam,
    mode: 'linear' | 'exp',
    value: number,
    time: number
  ): void {
    const target = mode === 'exp' ? Math.max(0.0001, value) : value;
    const ramp =
      mode === 'linear'
        ? (param as any).linearRampToValueAtTime
        : (param as any).exponentialRampToValueAtTime;
    if (typeof ramp === 'function') {
      ramp.call(param, target, time);
      return;
    }
    param.setTargetAtTime(target, time, 0.01);
  }

  /**
   * Offline voice graph — Sprint A6.5. This is now literally the same builder
   * the live engine uses (`buildVoiceGraph`), so an exported render sounds like
   * the session that was played instead of a plain-oscillator approximation of
   * it. `velocity` keeps the offline bounce's 0.9 headroom trim.
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
    const peak = Math.min(1, Math.max(0.02, velocity * 0.9));
    this.buildVoiceGraph(
      ctx,
      destination,
      freq,
      time,
      peak,
      duration,
      pan,
      params
    );
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
      // The noise is pure data, so it comes from a looping buffer instead of a
      // `createScriptProcessor` callback: one allocation, and zero per-block JS
      // on the main thread. Same amplitude and distribution as the old source.
      try {
        const frames = Math.max(1, Math.floor(this.ctx.sampleRate * 2));
        const noise = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < frames; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.00003;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        source.connect(this.ditherNode);
        // Dither belongs in the signal the listener hears, not in a meter tap.
        this.ditherNode.connect(this.masterOutput);
        source.start();
        this.ditherNoiseSource = source;
      } catch {
        /* This host cannot build a noise source — dither stays off. */
      }
    } else if (!enabled && this.ditherNode) {
      try {
        this.ditherNoiseSource?.stop();
      } catch {
        /* already stopped */
      }
      this.ditherNoiseSource = null;
      this.ditherNode.disconnect();
      this.ditherNode = null;
    }
  }

  /**
   * Phase F2 / Phase H — sampler trigger with optional clip fade-in / fade-out
   * and SampleStreamer window support for long imported clips.
   * Fades are expressed in seconds and applied as linear gain ramps on the
   * per-trigger VCA, so arrangement clips with `fadeIn`/`fadeOut` set get a
   * click-free envelope exactly like a professional DAW's clip fades.
   */
  triggerSampler(
    trackId: string | number,
    bufferOrStreamer: AudioBuffer | SampleStreamer,
    time: number,
    velocity: number,
    pan: number,
    duration: number,
    playbackRate: number = 1,
    fadeInSec: number = 0,
    fadeOutSec: number = 0,
    clipOriginSeconds: number = 0,
    clipLengthSeconds: number = 0,
    sampleRate: number = 48000,
    _channels: number = 2
  ) {
    const isStreamer =
      bufferOrStreamer instanceof SampleStreamer ||
      (bufferOrStreamer !== null &&
        typeof bufferOrStreamer === 'object' &&
        typeof (bufferOrStreamer as unknown as SampleStreamer).getResidentBuffer ===
          'function' &&
        typeof (bufferOrStreamer as unknown as SampleStreamer).advancePlayhead ===
          'function');

    const streamer = isStreamer ? bufferOrStreamer as SampleStreamer : null;
    const buffer = streamer
      ? this.sampleStreamerToWindow(streamer, clipOriginSeconds, sampleRate)
      : bufferOrStreamer as AudioBuffer;
    if (!buffer) return;
    const initialOffset = streamer
      ? Math.max(0, clipOriginSeconds - (streamer.getResidentStartSeconds?.() ?? 0))
      : 0;

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const gain = this.ctx.createGain();
    const safeDuration = Math.max(0.001, duration);
    const fadeIn = Math.max(0, Math.min(fadeInSec || 0, safeDuration));
    const fadeOut = Math.max(0, Math.min(fadeOutSec || 0, safeDuration));
    gain.gain.setValueAtTime(0, time);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(velocity, time + fadeIn);
    else gain.gain.setTargetAtTime(velocity, time, 0.005);
    if (fadeOut > 0) {
      const fadeStart = time + Math.max(fadeIn, safeDuration - fadeOut);
      gain.gain.setValueAtTime(velocity, fadeStart);
      gain.gain.linearRampToValueAtTime(0, time + safeDuration);
    } else {
      gain.gain.setValueAtTime(velocity, time + safeDuration - 0.001);
    }
    panner.connect(gain);
    gain.connect(this.getTrackOutput(trackId.toString()));

    if (!streamer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, time);
      source.connect(panner);
      source.start(time);
      source.stop(time + safeDuration + 0.01);
      return;
    }

    // Schedule adjacent resident windows so long streamed clips continue beyond
    // the first bounded buffer without decoding/retaining the entire source.
    const rate = Math.max(0.01, playbackRate || 1);
    const sr = sampleRate || streamer.getSampleRate();
    const remainingSeconds = typeof streamer.getRemainingSecondsFrom === 'function'
      ? streamer.getRemainingSecondsFrom(clipOriginSeconds)
      : Math.max(0, streamer.getDuration?.() - clipOriginSeconds || buffer.duration - initialOffset);
    const playableDuration = Math.min(safeDuration, remainingSeconds / rate);
    let elapsed = 0;
    let sourcePosition = Math.max(0, clipOriginSeconds || 0);
    let currentBuffer: AudioBuffer | null = buffer;
    let isFirstWindow = true;
    while (elapsed < playableDuration - 0.000001 && currentBuffer) {
      const residentStartSeconds = typeof streamer.getResidentStartSeconds === 'function'
        ? streamer.getResidentStartSeconds()
        : 0;
      const offset = isFirstWindow
        ? initialOffset
        : Math.max(0, sourcePosition - residentStartSeconds);
      const available = Math.max(0, currentBuffer.duration - offset);
      const consumed = Math.min((playableDuration - elapsed) * rate, available);
      if (consumed <= 0.000001) break;
      const source = this.ctx.createBufferSource();
      source.buffer = currentBuffer;
      source.playbackRate.setValueAtTime(rate, time + elapsed);
      source.connect(panner);
      source.start(time + elapsed, offset, consumed);
      const playedSeconds = consumed / rate;
      elapsed += playedSeconds;
      sourcePosition += consumed;
      isFirstWindow = false;
      if (elapsed < playableDuration - 0.000001) {
        streamer.setPlayhead(sourcePosition * sr);
        currentBuffer = streamer.getResidentBuffer();
      }
    }
  }

  private sampleStreamerToWindow(
    streamer: SampleStreamer,
    clipOriginSeconds: number,
    sampleRate: number
  ): AudioBuffer | null {
    streamer.setPlayhead(
      Math.max(0, (clipOriginSeconds || 0) * (sampleRate || 48000))
    );
    return streamer.getResidentBuffer() ?? null;
  }


  /**
   * Reverse an AudioBuffer in place by producing a new buffer whose per-channel
   * PCM is the source playback buffer flipped in time. Used only when a clip is
   * reversed and has no SampleStreamer, so the resulting buffer is durably cached
   * by `stemAudioCache` and reused by both the live path and the export path.
   *
   * The `channels` callback is intentionally supplied by the caller so this helper
   * stays oblivious to the source layout (raw Float32Array[] vs the streamed-window
   * layout) and remains a pure transform.
   */
  reverseBuffer(
    source: AudioBuffer,
    channelFactory: (channelIndex: number, source: AudioBuffer) => Float32Array,
  ): AudioBuffer {
    const out = this.ctx.createBuffer(
      source.numberOfChannels,
      source.length,
      source.sampleRate,
    );
    for (let c = 0; c < source.numberOfChannels; c++) {
      out.getChannelData(c).set(channelFactory(c, source).slice());
    }
    return out;
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
   *
   * Hosts the track's chain in a `plugin-chain-processor` worklet spliced
   * between the effects rack and the width node, so the DSP runs on the audio
   * rendering thread. An empty chain removes the insert and restores the
   * direct rack → width routing.
   *
   * `getChain` resolves the live chain to slot descriptions (kernel name +
   * params); the engine only wires nodes and pushes the chain to the audio
   * thread. A plugin whose kernel has not loaded resolves to the worklet's
   * identity kernel, i.e. audio passes through — the ScriptProcessor this
   * replaced returned early on a missing provider *without* writing its output
   * buffer, which silenced the track.
   */
  installTrackPluginInsert(
    trackId: string,
    pluginIds: string[],
    getChain?: LivePluginChainProvider
  ): void {
    this.getTrackOutput(trackId); // ensure signal chain exists
    const rack = this.trackEffectsRacks.get(trackId);
    const width = this.trackWidthNodes.get(trackId);
    const insert = this.trackPluginInserts.get(trackId);
    if (!rack || !width) return;

    // Empty chain → remove any existing insert and restore direct routing.
    if (pluginIds.length === 0) {
      if (insert) {
        this.releaseTrackPluginInsert(trackId);
        rack.output.connect(width);
      }
      return;
    }

    if (insert) return; // already installed — chain changes rebuild on next pass

    if (
      !this.whenPluginChainWorkletReady(() =>
        this.installTrackPluginInsert(trackId, pluginIds, getChain)
      )
    ) {
      return;
    }

    const next = this.createLivePluginInsert(pluginIds, getChain, 1);
    if (!next) return;

    rack.output.disconnect(width);
    rack.output.connect(next.node);
    next.node.connect(width);
    this.trackPluginInserts.set(trackId, next);
  }

  /**
   * Drop a track's live plugin insert and its chain poller without touching the
   * mixer graph — for a deleted track, where rewiring the rack would be wrong.
   */
  releaseTrackPluginInsert(trackId: string): void {
    const insert = this.trackPluginInserts.get(trackId);
    if (!insert) return;
    // Sever both edges, so a re-install (undo of a track deletion) cannot leave
    // the old node silently fed by the rack.
    try {
      this.trackEffectsRacks.get(trackId)?.output.disconnect(insert.node);
    } catch {
      /* not connected */
    }
    this.stopPluginChainPoll(insert);
    try {
      insert.node.disconnect();
    } catch {
      /* already disconnected */
    }
    this.trackPluginInserts.delete(trackId);
  }

  // ── Live plugin insert host (plugin-chain-processor worklet) ─────────────

  /**
   * Chain poll period: fast enough that a knob move is audible on the next
   * tick, slow enough that the signature diff costs nothing next to a render
   * quantum on the audio thread.
   */
  private static readonly PLUGIN_CHAIN_POLL_MS = 200;

  /** Live DSP insert spliced between the width merger and the pre-master bus. */
  private masterPluginInsert: LivePluginInsert | null = null;
  /** Active plugin ids for the master-bus live insert. */
  readonly masterPluginIds = signal<string[]>([]);

  private _pluginChainWorkletLoaded = false;
  private _pluginChainWorkletInitPromise: Promise<boolean> | null = null;

  /**
   * Register the plugin-chain worklet module once. Resolves false when this
   * host cannot host AudioWorklet DSP; a live insert then stays dry
   * (unprocessed, never silent) rather than falling back to main-thread DSP,
   * which is the cost this worklet exists to remove.
   */
  private initPluginChainWorklet(): Promise<boolean> {
    if (this._pluginChainWorkletLoaded) return Promise.resolve(true);
    if (this._pluginChainWorkletInitPromise) {
      return this._pluginChainWorkletInitPromise;
    }

    this._pluginChainWorkletInitPromise = (async () => {
      try {
        if (
          typeof (this.ctx as any).audioWorklet?.addModule !== 'function' ||
          typeof AudioWorkletNode === 'undefined'
        ) {
          this.logger.warn(
            'AudioEngine: this host has no AudioWorklet, so live plugin inserts stay dry.'
          );
        } else {
          await this.ctx.audioWorklet.addModule(
            'assets/worklets/plugin-chain-processor.worklet.js'
          );
          this._pluginChainWorkletLoaded = true;
          this.logger.info(
            'AudioEngine: plugin-chain worklet active — live plugin inserts run on the audio thread.'
          );
        }
      } catch (err: any) {
        this.logger.warn(
          'AudioEngine: plugin-chain worklet load failed, live plugin inserts stay dry.',
          err?.message
        );
      }
      // Only a successful load is cached: a transient failure (offline boot, a
      // cancelled fetch) must not disable live inserts for the whole session.
      if (!this._pluginChainWorkletLoaded) {
        this._pluginChainWorkletInitPromise = null;
      }
      return this._pluginChainWorkletLoaded;
    })();

    return this._pluginChainWorkletInitPromise;
  }

  /**
   * True when the worklet module is already registered. Otherwise the module
   * load is kicked off and `apply` runs as soon as it lands, so a plugin
   * toggled during boot still reaches the audio thread.
   */
  private whenPluginChainWorkletReady(apply: () => void): boolean {
    if (this._pluginChainWorkletLoaded) return true;
    void this.initPluginChainWorklet().then((ready) => {
      if (ready) apply();
    });
    return false;
  }

  /** Build the worklet node and start polling the chain into it. */
  private createLivePluginInsert(
    pluginIds: string[],
    provider: LivePluginChainProvider | undefined,
    channels: 1 | 2
  ): LivePluginInsert | null {
    let node: AudioWorkletNode;
    try {
      node = new AudioWorkletNode(this.ctx, 'plugin-chain-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: channels,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        outputChannelCount: [channels],
        processorOptions: { channels },
      });
    } catch (err: any) {
      this.logger.warn(
        'AudioEngine: plugin-chain node creation failed, insert stays dry.',
        err?.message
      );
      return null;
    }

    const insert: LivePluginInsert = {
      node,
      channels,
      ids: [...pluginIds],
      provider,
      signature: '',
      poll: null,
    };
    this.pushPluginChain(insert);
    insert.poll = setInterval(
      () => this.pushPluginChain(insert),
      AudioEngineService.PLUGIN_CHAIN_POLL_MS
    );
    return insert;
  }

  /**
   * Resolve the chain and hand it to the audio thread — but only when it
   * actually changed, since the poll runs five times a second for the life of
   * the insert.
   */
  private pushPluginChain(insert: LivePluginInsert): void {
    const slots = this.resolveLiveChain(insert.ids, insert.provider);
    const signature = slots
      .map(
        (slot) => `${slot.id}:${slot.kernel}:${Array.from(slot.params).join(',')}`
      )
      .join('|');
    if (signature === insert.signature) return;
    insert.signature = signature;
    try {
      insert.node.port.postMessage({ type: 'chain', slots });
    } catch (err: any) {
      // A closed context or a detached port must never take the engine down.
      this.logger.warn(
        'AudioEngine: could not push the live plugin chain.',
        err?.message
      );
    }
  }

  /**
   * One slot per requested plugin id, in chain order. A plugin with no loaded
   * kernel — a module still in flight, a community kernel this build does not
   * ship — resolves to the worklet's identity kernel, so the running chain
   * matches the rack the artist is looking at and never turns into silence.
   */
  private resolveLiveChain(
    ids: string[],
    provider: LivePluginChainProvider | undefined
  ): LivePluginSlot[] {
    const provided = provider ? provider(ids) : null;
    return ids.map((id, index) => {
      const slot = provided?.[index];
      if (!slot) return { id, kernel: 'identity', params: new Float32Array(0) };
      return {
        id: slot.id || id,
        kernel: slot.kernel || 'identity',
        params: slot.params?.length ? slot.params : new Float32Array(0),
      };
    });
  }

  /** Stop an insert's chain poller. Safe to call twice. */
  private stopPluginChainPoll(insert: LivePluginInsert): void {
    if (insert.poll !== null) {
      clearInterval(insert.poll);
      insert.poll = null;
    }
  }

  // ── Master-bus live insert + audition (Sprint B1 Phase 3) ─────────────────

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
  setMasteringTargets(targets: Partial<{ lufs: number; truePeak: number }>) {
    const next = {
      lufs: Number.isFinite(targets.lufs)
        ? Math.max(-36, Math.min(-5, targets.lufs!))
        : this.masteringTargets.lufs,
      truePeak: Number.isFinite(targets.truePeak)
        ? Math.max(-6, Math.min(-0.01, targets.truePeak!))
        : this.masteringTargets.truePeak,
    };
    this.masteringTargets = next;
    // LUFS is a measured program target, not a compressor threshold. Apply
    // the independent peak ceiling to the active limiter path instead.
    this.setMasterLimiterThreshold(next.truePeak);
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
    const threshold = p?.threshold === undefined
      ? undefined
      : clampFinite(p.threshold, -60, 0, -18);
    const ratio = p?.ratio === undefined
      ? undefined
      : clampFinite(p.ratio, 1, 20, 4);
    const attack = p?.attack === undefined
      ? undefined
      : clampFinite(p.attack, 0.001, 1, 0.01);
    const release = p?.release === undefined
      ? undefined
      : clampFinite(p.release, 0.01, 3, 0.1);
    if (this.masterWorkletActive()) {
      this.configureMasterWorklet('compressor', 'configure', {
        ...(threshold !== undefined ? { thresholdDb: threshold } : {}),
        ...(ratio !== undefined ? { ratio } : {}),
        ...(attack !== undefined ? { attack } : {}),
        ...(release !== undefined ? { release } : {}),
      });
      return;
    }
    if (threshold !== undefined) this.compressor.threshold.setTargetAtTime(threshold, this.ctx.currentTime, 0.01);
    if (ratio !== undefined) this.compressor.ratio.setTargetAtTime(ratio, this.ctx.currentTime, 0.01);
    if (attack !== undefined) this.compressor.attack.setTargetAtTime(attack, this.ctx.currentTime, 0.01);
    if (release !== undefined) this.compressor.release.setTargetAtTime(release, this.ctx.currentTime, 0.01);
  }

  configureLimiter(p: any) {
    if (!this.limiter) return;
    const threshold = p?.threshold === undefined
      ? undefined
      : clampFinite(p.threshold, -6, -0.01, -0.5);
    if (this.masterWorkletActive()) {
      if (threshold !== undefined) {
        this.masteringTargets = { ...this.masteringTargets, truePeak: threshold };
        this.configureMasterWorklet('limiter', 'configure', { ceilingDb: threshold });
      }
      return;
    }
    if (threshold !== undefined) this.limiter.threshold.setTargetAtTime(threshold, this.ctx.currentTime, 0.05);
    if (p?.ratio !== undefined) this.limiter.ratio.setTargetAtTime(p.ratio, this.ctx.currentTime, 0.05);
  }

  /**
   * Resting defaults for the master-bus parameters that FX macros modulate.
   * The canonical source of truth for macro reset — callers must use these
   * values (via FxMacrosService) instead of re-hardcoding them, so the
   * master bus, the mixer surface, and the macro HUD can never disagree.
   */
  public static readonly MASTER_DEFAULTS = {
    masterFilterHz: 20000, // lowpass above Nyquist/2 ⇒ effectively open
    limiterThresholdDb: -0.5, // matches the worklet smuve preset / macro rest
    limiterRatio: 20,
    compressorRatio: 4, // matches the smuve preset / worklet default
  } as const;

  /**
   * Set the master filter cutoff (lowpass). Routes to whichever master
   * processing path is live: the worklet filter stage when the
   * master worklet is active, otherwise the fallback chain masterEQ node.
   */
  setMasterFilterHz(hz: number): void {
    const clamped = Math.max(20, Math.min(20000, hz));
    if (this.masterWorkletActive()) {
      this.configureMasterWorklet('filter', 'configure', { frequency: clamped });
    } else {
      this.masterEQ.frequency.setTargetAtTime(
        clamped,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  /**
   * Reference-matching makeup stage.
   *
   * A dB offset applied at `_preMasterGain`, the one gain stage that sits in
   * front of BOTH the worklet chain and the fallback chain, so the loudness a
   * reference A/B match asks for survives whichever master path is live. The
   * limiter downstream keeps any made-up peak inside the configured true-peak
   * ceiling, so louder never means clipping.
   */
  private masterMakeupDb = 0;

  setMasterMakeupDb(db: number): void {
    const clamped = Number.isFinite(db) ? Math.max(-12, Math.min(12, db)) : 0;
    this.masterMakeupDb = clamped;
    this._preMasterGain.gain.setTargetAtTime(
      Math.pow(10, clamped / 20),
      this.ctx.currentTime,
      0.05,
    );
  }

  /** Currently applied reference-matching makeup, in dB (0 = neutral). */
  getMasterMakeupDb(): number {
    return this.masterMakeupDb;
  }

  /**
   * Set the master limiter threshold (dB). Routes to the worklet limiter when
   * active, otherwise the fallback chain limiter node.
   */
  setMasterLimiterThreshold(db: number): void {
    const clamped = Number.isFinite(db)
      ? Math.max(-6, Math.min(-0.01, db))
      : this.masteringTargets.truePeak;
    this.masteringTargets = { ...this.masteringTargets, truePeak: clamped };
    if (this.masterWorkletActive()) {
      this.configureMasterWorklet('limiter', 'configure', { ceilingDb: clamped });
    } else {
      this.limiter.threshold.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Set the master compressor ratio. Routes to the worklet compressor when
   * active, otherwise the fallback chain compressor node.
   */
  setMasterCompressorRatio(ratio: number): void {
    if (this.masterWorkletActive()) {
      this.configureMasterWorklet('compressor', 'configure', { ratio });
    } else {
      this.compressor.ratio.setTargetAtTime(ratio, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Set the master reverb return level (0..1). This gain node sits on the
   * main thread in both paths, so both paths share this setter.
   */
  setMasterReverbWet(wet: number): void {
    const clamped = Math.max(0, Math.min(1, wet));
    this.reverbWet.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
  }

  /** Set the master echo (Send B) return level (0..1). */
  setMasterEchoWet(wet: number): void {
    const clamped = Math.max(0, Math.min(1, wet));
    this.echoWet.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
  }

  /**
   * Procedural stereo impulse response for the master reverb — a sparse set of
   * early reflections plus an exponential diffuse tail. The noise comes from a
   * seeded xorshift32 rather than Math.random so the live graph and an
   * OfflineAudioContext bounce share one room instead of two subtly different
   * ones.
   */
  private createReverbImpulse(seconds = 2.4, decay = 2.6): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = this.ctx.createBuffer(2, length, rate);
    const earlyReflections = [0.011, 0.019, 0.027, 0.041, 0.058, 0.079];

    let seed = 0x9e3779b9;
    const nextNoise = () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        data[i] = (nextNoise() * 2 - 1) * Math.pow(1 - progress, decay);
      }
      earlyReflections.forEach((arrival, index) => {
        // Offset the right channel so the two sides decorrelate into width.
        const pos = Math.floor((arrival + channel * 0.0023) * rate);
        if (pos < length) {
          data[pos] += (index % 2 === 0 ? 1 : -1) * (0.45 / (index + 1));
        }
      });
    }
    return impulse;
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.outputMode.set(mode);
  }

  // ============================================================
  //  Output Level Metering (LUFS / RMS / PEAK)
  // ============================================================
  readonly outputPeak = signal<number>(0);
  readonly outputRms = signal<number>(0);
  readonly outputLufs = signal<number>(-70);
  /** Live L/R phase correlation in [-1, 1], measured from the metering tap. */
  readonly outputCorrelation = signal<number>(0);
  /** Live loudness range in LU, refreshed once a second (a slow statistic). */
  readonly outputLra = signal<number>(0);
  /**
   * Live true peak in dBFS (4x oversampled, peak-hold since the transport
   * started). The plain `outputPeak` is a sample peak and sits up to ~3 dB
   * below this, so a ceiling checked against it can still clip on transcode.
   */
  readonly outputTruePeak = signal<number>(-120);

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

  /**
   * Live integrated loudness, measured by the same BS.1770 meter the offline
   * render analysis uses — so the panel and the bounce cannot disagree.
   * "Integrated" means since the transport started, so it resets on play.
   */
  private loudnessMeter: LoudnessMeter | null = null;
  // Hoisted: allocating these per poll churned the GC on every frame.
  private _lufsLeftBuffer = new Float32Array(0);
  private _lufsRightBuffer = new Float32Array(0);
  private _meterPollsSinceLra = 0;
  private _liveTruePeakDb = -120;

  /** Restart the integrated loudness window (call whenever playback starts). */
  resetLoudnessMeasurement(): void {
    this.loudnessMeter?.reset();
    this._meterPollsSinceLra = 0;
    this._liveTruePeakDb = -120;
    this.outputLufs.set(-70);
    this.outputCorrelation.set(0);
    this.outputLra.set(0);
    this.outputTruePeak.set(-120);
  }

  private startOutputMetering(): void {
    if (typeof window === 'undefined') return;
    this._meteringBuffer = new Float32Array(this.masterAnalyser.fftSize);
    this._lufsLeftBuffer = new Float32Array(this.lufsAnalyserLeft.fftSize);
    this._lufsRightBuffer = new Float32Array(this.lufsAnalyserRight.fftSize);
    this.loudnessMeter = new LoudnessMeter(this.ctx.sampleRate, 2);
    const FRAME_MS = 50;
    let last = 0;
    const tick = (now: number) => {
      if (this.ctx.state !== 'running') {
        this._meteringRAF = requestAnimationFrame(tick);
        return;
      }
      const elapsedMs = now - last;
      if (elapsedMs < FRAME_MS) {
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

      // Loudness: hand the frames that actually arrived since the last poll to
      // the shared meter, which applies K-weighting and the BS.1770 gates
      // itself. The previous code read one K-weighted analyser frame and
      // reported the momentary value as "integrated", with no gating at all.
      //
      // The span is measured from the clock rather than assumed: animation
      // frames land 50-67 ms apart, so a fixed 50 ms slice would leave the
      // remainder of every slower frame unmeasured and read persistently low.
      // The analyser window (85 ms at 48 kHz) is longer than the poll, so a
      // full span is always available; a stalled tab just measures less.
      this.lufsAnalyserLeft.getFloatTimeDomainData(this._lufsLeftBuffer);
      this.lufsAnalyserRight.getFloatTimeDomainData(this._lufsRightBuffer);
      const span = Math.max(
        1,
        Math.min(
          this._lufsLeftBuffer.length,
          Math.round(this.ctx.sampleRate * (elapsedMs / 1000)),
        ),
      );
      const from = this._lufsLeftBuffer.length - span;
      const left = this._lufsLeftBuffer.subarray(from);
      const right = this._lufsRightBuffer.subarray(from);
      this.loudnessMeter?.push([left, right], left.length);

      const integrated = this.loudnessMeter?.integratedLufs();
      this.outputLufs.set(
        integrated !== undefined && Number.isFinite(integrated)
          ? Math.max(-70, Math.round(integrated * 10) / 10)
          : -70,
      );
      this.outputCorrelation.set(
        Math.round(phaseCorrelation(left, right) * 100) / 100,
      );
      // True peak is a peak-hold for the program, so it only ever grows until
      // the transport restarts.
      const hopTruePeak = truePeakDb([left, right]);
      if (hopTruePeak > this._liveTruePeakDb) {
        this._liveTruePeakDb = hopTruePeak;
        this.outputTruePeak.set(Math.round(hopTruePeak * 10) / 10);
      }
      // Loudness range is a slow statistic; once a second is plenty and keeps
      // the percentile pass off the animation frame.
      if (++this._meterPollsSinceLra >= 20) {
        this._meterPollsSinceLra = 0;
        const lra = this.loudnessMeter?.loudnessRangeLu() ?? 0;
        this.outputLra.set(Math.round(lra * 10) / 10);
      }

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
      this.masterOutput.connect(this.recordingDestination);
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
