import {
  Injectable,
  signal,
  inject,
  computed,
  effect,
  Injector,
} from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import {
  findClickBursts,
  loopbackConfidence,
  loopbackQuality,
  loopbackRoundTripMs,
  medianOf,
  type LoopbackClickQuality,
  type LoopbackConfidence,
} from './loopback-latency.util';

/** Timing and retry controls for a loopback measurement. */
export interface LoopbackOptions {
  /** Seconds between arming capture and the first click of a pass. */
  leadSeconds?: number;
  /** Seconds of input to record after the last click of a pass. */
  tailSeconds?: number;
  /** Number of clicks wanted; the median of their trips is the result. */
  clicks?: number;
  /** Seconds between clicks. */
  spacingSeconds?: number;
  /** Capture passes allowed when clicks go missing; 1 disables retries. */
  maxAttempts?: number;
}

/**
 * Sprint C1 — Engine latency profile + on-demand audit.
 *
 * Decoupled from `AudioEngineService`'s scheduler so we don't have to
 * surgically patch a 1900-line hot path. Instead:
 *   • We read the public surface of the engine (sample rate, base/output
 *     latency, worklet activity, performance tier) on every signal change
 *     and surface a single snapshot.
 *   • We run a tiny OfflineAudioContext render on demand to predict how
 *     fast a real bounce would run on this device.
 *   • Plus a lightweight rolling-window of these benchmark runs so the
 *     UI can show stability over time.
 *
 * This surface is enough for the /produce side-card and the future
 * engine diagnostics panel to give the user a credible "engine audit"
 * without reproducing logic from services it shouldn't reach into.
 */

export interface LatencySnapshot {
  sampleRateHz: number;
  baseLatencySec: number;
  outputLatencySec: number;
  /** baseLatencySec + outputLatencySec expressed in milliseconds. */
  totalLatencyMs: number;
  schedulerLookaheadMs: number;
  schedulerIntervalMs: number;
  masterWorkletActive: boolean;
  performanceTier: 'ultra' | 'performance';
  cpuHeadroomHint: 'headroom' | 'near' | 'tight';
  contextState: AudioContextState;
}

export interface BenchmarkResult {
  durationSec: number;
  offlineRenderMs: number;
  /**
   * Buffer duration ÷ offline render wall-clock. 1 = real-time; >1
   * means the device rendered faster than playback (great for bouncing
   * while editing); <1 means it crawled slower than real-time.
   */
  speedRatio: number;
  capturedAt: number;
}

export interface ProfileSummary {
  snapshot: LatencySnapshot;
  recentBenchmarks: BenchmarkResult[];
  recommendations: string[];
}

export interface LatencyCalibrationResult {
  measuredLatencyMs: number;
  recommendedCompensationMs: number;
  benchmarkSpeedRatio: number;
  capturedAt: number;
}

/**
 * A real output→input round trip: a click was scheduled on the audio clock and
 * then found in the captured microphone signal. Unlike the engine estimate
 * (`baseLatency + outputLatency`), this includes the input path and whatever
 * acoustic or cable route the sound took.
 */
/** One captured click from a loopback run. */
export interface LoopbackClickMeasurement {
  /** This click's output→input round trip, in milliseconds. */
  roundTripMs: number;
  /** AudioContext time this click was scheduled for. */
  scheduledAt: number;
  /** AudioContext time this click's onset was captured. */
  detectedAt: number;
  /** Frame index of this click's onset inside the captured take. */
  onsetFrame: number;
  /** Loudest captured sample for this click (0-1). */
  peak: number;
  /** Click peak divided by the room-noise floor. */
  signalToNoise: number;
  /** Clean and close to the median → good; weak or an outlier → poor. */
  quality: LoopbackClickQuality;
}

export interface LoopbackMeasurement {
  /** Median round trip across the captured clicks, in milliseconds. */
  roundTripMs: number;
  /** Quality of the click that supplied the median. */
  quality: LoopbackClickQuality;
  /** How much the median deserves to be trusted after retries. */
  confidence: LoopbackConfidence;
  /** Capture passes used; more than 1 means at least one click was retried. */
  attempts: number;
  /** Slowest minus fastest captured click, in milliseconds. */
  spreadMs: number;
  /** Each captured click, in playback order. */
  clicks: LoopbackClickMeasurement[];
  /** AudioContext time the median click was scheduled for. */
  clickScheduledAt: number;
  /** AudioContext time that click's onset was captured. */
  detectedAt: number;
  /** Frame index of that click's onset inside the captured take. */
  onsetFrame: number;
  sampleRate: number;
  capturedAt: number;
}

/**
 * A calibration run as recorded for THIS device (parity audit §5). The
 * residual gap was never the number written into settings — it was that
 * nothing durable came out of a real device run: `lastCalibration` died
 * with the tab, so there was no per-model/API baseline to reason about or
 * to pre-fill from on the next session.
 */
export interface DeviceLatencyBaseline {
  /** Best-effort model string from the UA, e.g. `Pixel 8`. */
  deviceModel: string;
  /** Android API level when the UA exposes it; null on other platforms. */
  apiLevel: number | null;
  /** Round-trip latency the engine reported at capture time, in ms. */
  totalLatencyMs: number;
  /** Offline render speed ratio from the same run. */
  benchmarkSpeedRatio: number;
  /** Epoch ms of the run. */
  capturedAt: number;
}

/** localStorage key for the device baseline — device-local by nature. */
const DEVICE_BASELINE_KEY = 'smuve_device_latency_baseline';

/** Android release → API level for the releases a UA can report. */
const ANDROID_API_LEVELS: Record<string, number> = {
  '16': 36,
  '15': 35,
  '14': 34,
  '13': 33,
  '12L': 32,
  '12': 31,
  '11': 30,
  '10': 29,
  '9': 28,
  '8.1': 27,
  '8': 26,
  '7.1': 25,
  '7': 24,
  '6': 23,
  '5.1': 22,
  '5': 21,
};

/**
 * Chrome's reduced UA freezes every Android handset to `Android 10; K`, so the
 * pair below names no real device — never store it as one.
 */
const REDUCED_UA_ANDROID_RELEASE = '10';
const REDUCED_UA_ANDROID_MODEL = 'K';

/**
 * Identify the device from the UA alone. An un-reduced Android UA carries both
 * the release and the model — `(Linux; Android 14; Pixel 8 Build/…)` — which is
 * exactly the `{ deviceModel, apiLevel }` pair the audit asks for. Chrome's
 * reduced UA (`Android 10; K`) names no device, so it reports an unknown
 * Android device and a null API level rather than a wrongly-labelled one;
 * `resolveDeviceIdentity()` recovers the real model via client hints when the
 * host supports them. Other platforms report their platform name and a null
 * API level rather than a guess.
 */
export function readDeviceIdentity(
  source: any = typeof navigator !== 'undefined' ? navigator : {}
): { deviceModel: string; apiLevel: number | null } {
  const ua = String(source?.userAgent ?? '');
  const android = /Android\s+([\d.]+L?)\s*;\s*([^;)]+)/.exec(ua);
  if (android) {
    const release = android[1];
    const model = android[2].replace(/\s+Build\/.*$/, '').trim();
    const reduced =
      release === REDUCED_UA_ANDROID_RELEASE && model === REDUCED_UA_ANDROID_MODEL;
    if (reduced) {
      return { deviceModel: 'Unknown Android device', apiLevel: null };
    }
    return {
      deviceModel: model || 'Unknown Android device',
      apiLevel: ANDROID_API_LEVELS[release] ?? null,
    };
  }
  const platform = String(
    source?.userAgentData?.platform ?? source?.platform ?? ''
  ).trim();
  return { deviceModel: platform || 'Unknown device', apiLevel: null };
}

/**
 * Resolve the device a calibration ran on, preferring User-Agent Client Hints.
 * The UA cannot name a modern Android handset (see above), but the
 * high-entropy `model`/`platformVersion` hints can — they are just async and
 * user-gated. Any unsupported host, refusal or rejection falls back to the
 * pure UA parse, so a baseline is never worse off than before.
 */
export async function resolveDeviceIdentity(
  source: any = typeof navigator !== 'undefined' ? navigator : {}
): Promise<{ deviceModel: string; apiLevel: number | null }> {
  const fallback = readDeviceIdentity(source);
  const hints = source?.userAgentData;
  if (!hints || typeof hints.getHighEntropyValues !== 'function') {
    return fallback;
  }
  try {
    const values = await hints.getHighEntropyValues(['model', 'platformVersion']);
    const model = String(values?.model ?? '').trim();
    if (!model) return fallback;
    // `platformVersion` is the Android release ("14.0.0") on Android hosts and
    // a platform build string elsewhere, so only a leading integer is meaningful.
    const release = /^(\d+)/.exec(String(values?.platformVersion ?? '').trim());
    return {
      deviceModel: model,
      apiLevel: release ? ANDROID_API_LEVELS[release[1]] ?? null : null,
    };
  } catch {
    // Hints are optional; a refusal must not fail the calibration run.
    return fallback;
  }
}

/**
 * Baselines written before client hints existed can still hold the reduced-UA
 * placeholder (`K` / API 29). Report those honestly rather than as a device.
 */
function normalizeStoredIdentity(
  deviceModel: string,
  apiLevel: number | null
): { deviceModel: string; apiLevel: number | null } {
  const placeholderApiLevel = ANDROID_API_LEVELS[REDUCED_UA_ANDROID_RELEASE];
  if (
    deviceModel === REDUCED_UA_ANDROID_MODEL &&
    apiLevel === placeholderApiLevel
  ) {
    return { deviceModel: 'Unknown Android device', apiLevel: null };
  }
  return { deviceModel, apiLevel };
}

/** Load this device's stored baseline; corrupt storage reads as absent. */
function readStoredBaseline(): DeviceLatencyBaseline | null {
  try {
    const raw = localStorage.getItem(DEVICE_BASELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.totalLatencyMs !== 'number' ||
      !Number.isFinite(parsed.totalLatencyMs) ||
      typeof parsed.benchmarkSpeedRatio !== 'number'
    ) {
      return null;
    }
    const identity = normalizeStoredIdentity(
      String(parsed.deviceModel ?? 'Unknown device'),
      typeof parsed.apiLevel === 'number' ? parsed.apiLevel : null
    );
    return {
      ...identity,
      totalLatencyMs: parsed.totalLatencyMs,
      benchmarkSpeedRatio: parsed.benchmarkSpeedRatio,
      capturedAt: Number(parsed.capturedAt) || 0,
    };
  } catch {
    // Locked, unavailable or corrupt storage must never break calibration.
    return null;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clampSeconds(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Join the recorder's chunk groups into one continuous channel. */
function joinCaptureChunks(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((frames, chunk) => frames + chunk.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/** Persist this device's baseline; failure keeps the in-memory signal. */
function writeStoredBaseline(baseline: DeviceLatencyBaseline): void {
  try {
    localStorage.setItem(DEVICE_BASELINE_KEY, JSON.stringify(baseline));
  } catch {
    // Quota/privacy-mode failures only cost cross-session pre-fill; the
    // compensation the artist just accepted is already in the profile.
  }
}

@Injectable({ providedIn: 'root' })
export class AudioEngineLatencyService {
  private engine = inject(AudioEngineService);
  private logger = inject(LoggingService);
  private userProfile = inject(UserProfileService, { optional: true });
  /**
   * Lazy recorder lookup. The recording engine depends on this service, so a
   * direct injection would be a DI cycle; resolving it only when a loopback
   * run starts keeps construction acyclic.
   */
  private injector = inject(Injector);

  /** Latest live snapshot derived from the engine surface. */
  readonly snapshot = signal<LatencySnapshot>(this.captureSnapshot());
  /** Last up-to-10 offline render benchmarks. */
  readonly recentBenchmarks = signal<BenchmarkResult[]>([]);
  /** Most recent per-device calibration run. */
  readonly lastCalibration = signal<LatencyCalibrationResult | null>(null);
  /** Most recent true output→input round-trip measurement. */
  readonly lastLoopback = signal<LoopbackMeasurement | null>(null);
  /** Baseline persisted by the last calibration run on this device. */
  readonly storedBaseline = signal<DeviceLatencyBaseline | null>(
    readStoredBaseline()
  );
  /** One-shot guard: the baseline pre-fill runs at most once per session. */
  private baselinePrefillDone = false;
  /** Latest full profile summary — recomputed on demand. */
  readonly profileSummary = computed<ProfileSummary>(() =>
    this.buildSummary()
  );
  /** Active record-offset compensation pulled from profile settings. */
  readonly appliedCompensationMs = computed(() => {
    const raw =
      this.userProfile?.profile()?.settings?.studio?.latencyCompensation ?? 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
  });

  constructor() {
    // Cheap signal refresh every time the engine's profile-relevant
    // signals update. Engine signals don't expose a unified event, so we
    // stack three reactive subscriptions.
    queueMicrotask(() => {
      // We avoid touching the engine internals and instead rely on a
      // periodic refresh. The signals we read are stable primitives.
      if (typeof window !== 'undefined') {
        window.setInterval(() => this.snapshot.set(this.captureSnapshot()), 1500);
      }
    });

    // Pre-fill compensation from this device's stored baseline the first time a
    // HYDRATED profile has no compensation of its own — the audit's "use it to
    // pre-fill compensation" half. Hydration is the gate: before `loadProfile()`
    // resolves the store still holds `initialProfile`, whose compensation is 0,
    // and writing through `updateProfile` would persist that placeholder (local
    // backup + cloud sync) over the artist's real profile. A value the artist
    // already chose (anything non-zero) is never touched, no baseline means a
    // no-op, and the guard keeps the attempt to once per session.
    effect(() => {
      const userProfile = this.userProfile;
      const baseline = this.storedBaseline();
      // Optional call so a test double without `hydrated` simply never
      // pre-fills instead of throwing inside the effect.
      const hydrated = userProfile?.hydrated?.() ?? false;
      const profile = userProfile?.profile();
      const current = Number(
        profile?.settings?.studio?.latencyCompensation ?? 0
      );
      // `false` is the artist's explicit opt-out; absent (older profiles) means
      // the automatic pre-fill stays on.
      const autoApply =
        profile?.settings?.studio?.autoLatencyCompensation !== false;
      if (!hydrated || !userProfile || !baseline || !profile?.settings) return;
      if (!autoApply) return;
      if (this.baselinePrefillDone || !Number.isFinite(current) || current !== 0)
        return;
      this.baselinePrefillDone = true;
      const settings = profile.settings;
      void Promise.resolve(
        userProfile.updateProfile({
          ...profile,
          settings: {
            ...settings,
            studio: {
              ...settings.studio,
              latencyCompensation: baseline.totalLatencyMs,
            },
          },
        })
      ).catch((error) =>
        this.logger.warn('Latency baseline pre-fill failed', error)
      );
    });
  }

  /**
   * Capture a fresh snapshot of the engine surface. Safe to call from
   * test fixtures (no AudioContext work happens here).
   */
  captureSnapshot(): LatencySnapshot {
    const ctx = this.engine?.ctx as Partial<AudioContext> | undefined;
    const base =
      typeof ctx?.baseLatency === 'number' ? ctx.baseLatency : 0;
    const out =
      typeof ctx?.outputLatency === 'number' ? ctx.outputLatency : 0;
    const sampleRate =
      Number(this.engine?.nativeSampleRate) ||
      Number(ctx?.sampleRate) ||
      44100;
    const masterWorkletActive =
      typeof this.engine?.masterWorkletActive === 'function'
        ? this.engine.masterWorkletActive()
        : false;
    const performanceTier =
      typeof this.engine?.performanceTier === 'function'
        ? this.engine.performanceTier()
        : 'performance';
    // Heads-up: if the engine's native sample rate is below 44.1kHz OR
    // base+output latency > 60ms, the device is on the wire-thin side.
    const totalLatencyMs = (base + out) * 1000;
    const cpuHeadroomHint: LatencySnapshot['cpuHeadroomHint'] =
      totalLatencyMs < 30
        ? 'headroom'
        : totalLatencyMs < 60
          ? 'near'
          : 'tight';
    return {
      sampleRateHz: sampleRate,
      baseLatencySec: base,
      outputLatencySec: out,
      totalLatencyMs: totalLatencyMs,
      schedulerLookaheadMs:
        AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS * 1000,
      schedulerIntervalMs:
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS,
      masterWorkletActive,
      performanceTier,
      cpuHeadroomHint,
      contextState: ctx?.state ?? 'suspended',
    };
  }

  /**
   * Run a tiny offline render to benchmark the engine's throughput.
   * Generates a 1-second offline buffer with a handful of oscillators —
   * cheap enough to run on demand without blocking the UI.
   *
   * Returns the wallclock duration vs the buffer duration so callers can
   * assert "this device is faster / slower than real-time".
   */
  async runOfflineBenchmark(
    durationSec: number = 1
  ): Promise<BenchmarkResult> {
    const ctx = this.engine?.ctx as Partial<AudioContext> | undefined;
    if (typeof OfflineAudioContext === 'undefined') {
      const result: BenchmarkResult = {
        durationSec,
        offlineRenderMs: 0,
        speedRatio: 1,
        capturedAt: Date.now(),
      };
      this.appendBenchmark(result);
      return result;
    }
    const sampleRate =
      Number(ctx?.sampleRate) ||
      Number(this.engine?.nativeSampleRate) ||
      44100;
    // Sprint C1 — keep the OfflineAudioContext constructor signature
    // normalised. (channels, frames, sampleRate)
    const offline = new OfflineAudioContext(
      2,
      Math.max(1, Math.ceil(durationSec * sampleRate)),
      sampleRate
    );
    for (let i = 0; i < 4; i++) {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.frequency.setValueAtTime(220 * (i + 1), 0);
      gain.gain.setValueAtTime(0.2, 0);
      gain.gain.exponentialRampToValueAtTime(0.001, durationSec);
      osc.connect(gain).connect(offline.destination);
      osc.start(0);
      osc.stop(durationSec);
    }
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      await offline.startRendering();
    } catch (e: any) {
      this.logger.warn(
        'C1 latency benchmark: OfflineAudioContext.startRendering failed',
        e?.message
      );
    }
    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const offlineRenderMs = Math.max(0, t1 - t0);
    const result: BenchmarkResult = {
      durationSec,
      offlineRenderMs,
      // Buffer duration / render wall-clock: 1 = real-time, >1 = faster
      // than real-time (great), <1 = slower than real-time.
      speedRatio: durationSec * 1000 / Math.max(1, offlineRenderMs),
      capturedAt: Date.now(),
    };
    this.appendBenchmark(result);
    return result;
  }

  private appendBenchmark(result: BenchmarkResult): void {
    this.recentBenchmarks.update((list) => {
      const next = [...list, result];
      if (next.length > 10) next.shift();
      return next;
    });
  }

  /**
   * Plain-object snapshot for callers that prefer a non-signal shape
   * (tests, JSON dumps). Returns the latest `snapshot()` value.
   */
  readSnapshot(): LatencySnapshot {
    return this.snapshot();
  }

  /** Public alias of `readSnapshot()` — kept under the more familiar
   *  `get…` shape so dashboard callers can read metrics without
   *  subscribing to the signal directly. */
  getEngineMetrics(): LatencySnapshot {
    return this.snapshot();
  }

  getAppliedCompensationMs(): number {
    return this.appliedCompensationMs();
  }

  /**
   * Calibrate this device and persist the result as the record compensation.
   *
   * Settings already exposes this, but calibration now belongs next to the
   * recording surface too: placed takes read `appliedCompensationMs()`, so an
   * explicit Studio calibration is what makes the next pass align. Only a
   * hydrated profile is written — before hydration the store still holds the
   * initial profile, and saving it would overwrite the artist's real settings.
   */
  async calibrateAndApply(
    durationSec: number = 1
  ): Promise<LatencyCalibrationResult> {
    const result = await this.calibrateFromCurrentDevice(durationSec);
    await this.applyCompensation(result.recommendedCompensationMs);
    return result;
  }

  /**
   * Write a measured compensation to the hydrated profile. Returns false when
   * no write happened (no profile yet, or storage refused it) so callers can
   * report "measured but not applied" instead of pretending success.
   */
  private async applyCompensation(compensationMs: number): Promise<boolean> {
    const userProfile = this.userProfile;
    const profile = userProfile?.profile();
    const hydrated = userProfile?.hydrated?.() ?? false;
    if (!userProfile || !hydrated || !profile?.settings) return false;

    const settings = profile.settings;
    try {
      await userProfile.updateProfile({
        ...profile,
        settings: {
          ...settings,
          studio: {
            ...settings.studio,
            latencyCompensation: Math.max(0, Math.round(compensationMs)),
          },
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        'Latency calibration could not be saved to the profile',
        error
      );
      return false;
    }
  }

  async calibrateFromCurrentDevice(
    durationSec: number = 1
  ): Promise<LatencyCalibrationResult> {
    const snap = this.captureSnapshot();
    const bench = await this.runOfflineBenchmark(durationSec);
    const result: LatencyCalibrationResult = {
      measuredLatencyMs: Math.max(0, Math.round(snap.totalLatencyMs || 0)),
      recommendedCompensationMs: Math.max(
        0,
        Math.round(snap.totalLatencyMs || 0)
      ),
      benchmarkSpeedRatio: bench.speedRatio,
      capturedAt: Date.now(),
    };
    this.lastCalibration.set(result);
    // Persist the run as THIS device's baseline: identity + latency +
    // render ratio, durable across sessions (parity audit §5). A fresh run
    // is also the source of truth, so the pre-fill never echoes it back.
    const identity = await resolveDeviceIdentity();
    const baseline: DeviceLatencyBaseline = {
      deviceModel: identity.deviceModel,
      apiLevel: identity.apiLevel,
      totalLatencyMs: result.measuredLatencyMs,
      benchmarkSpeedRatio: result.benchmarkSpeedRatio,
      capturedAt: result.capturedAt,
    };
    this.storedBaseline.set(baseline);
    writeStoredBaseline(baseline);
    this.baselinePrefillDone = true;
    return result;
  }

  private get recorder(): StudioRecordingEngineService | null {
    try {
      return this.injector.get(StudioRecordingEngineService);
    } catch {
      return null;
    }
  }

  /**
   * Measure the real output→input round trip.
   *
   * This plays a short 1 kHz click on the audio output and captures it back
   * through the Studio's input, either acoustically (mic pointed at the
   * speakers) or through a loopback cable. The worklet timestamps its first
   * captured block, so the onset frame maps to an absolute AudioContext time;
   * the gap from the scheduled click is the true latency this device adds.
   *
   * The capture is discarded (`persist: false`): calibration audio must never
   * appear in the artist's take lane.
   */
  async measureLoopbackLatency(
    options: LoopbackOptions = {}
  ): Promise<LoopbackMeasurement> {
    const recorder = this.recorder;
    if (!recorder) {
      throw new Error(
        'The Studio recorder is unavailable — open the Studio and try again.'
      );
    }
    if (
      typeof this.engine.isPlaying === 'function' &&
      this.engine.isPlaying()
    ) {
      throw new Error('Stop playback before measuring loopback.');
    }
    if (recorder.isRecording()) {
      throw new Error('Stop recording before measuring loopback.');
    }

    await this.engine.resume();
    const ctx = this.engine.ctx;
    if (ctx.state !== 'running') {
      throw new Error('Start the audio engine with Play once, then measure again.');
    }
    if (!recorder.hasInputCapture?.() && !(await recorder.initialize())) {
      throw new Error(
        'No microphone input. Allow access and connect an input, then retry.'
      );
    }

    const leadSeconds = clampSeconds(options.leadSeconds ?? 0.25, 0.1, 0.6);
    const tailSeconds = clampSeconds(options.tailSeconds ?? 0.4, 0.2, 1.5);
    const requestedClicksRaw = Math.floor(options.clicks ?? 3);
    const requestedClicks = Number.isFinite(requestedClicksRaw)
      ? Math.min(5, Math.max(1, requestedClicksRaw))
      : 3;
    const spacingSeconds = clampSeconds(
      options.spacingSeconds ?? 0.35,
      0.2,
      1,
    );
    const attemptsRaw = Math.floor(options.maxAttempts ?? 3);
    const maxAttempts = Number.isFinite(attemptsRaw)
      ? Math.min(4, Math.max(1, attemptsRaw))
      : 3;
    const sampleRate =
      Number(ctx.sampleRate) ||
      Number(this.engine.nativeSampleRate) ||
      48000;

    // A pass that loses a click does not discard the clicks it did capture:
    // retry only the missing ones, then judge the combined set.
    const captured: LoopbackClickMeasurement[] = [];
    let attempts = 0;
    while (captured.length < requestedClicks && attempts < maxAttempts) {
      attempts++;
      const pass = await this.captureLoopbackPass({
        recorder,
        ctx,
        sampleRate,
        clicks: requestedClicks - captured.length,
        leadSeconds,
        spacingSeconds,
        tailSeconds,
      });
      captured.push(...pass);
    }

    if (captured.length === 0) {
      throw new Error(
        `No calibration clicks were captured after ${attempts} attempt${attempts === 1 ? '' : 's'} — turn up the output, point the mic at the speakers, or use a loopback cable.`
      );
    }

    const roundTripMs = medianOf(captured.map((click) => click.roundTripMs));
    if (roundTripMs <= 0 || roundTripMs > 2000) {
      throw new Error(
        `Loopback timing read ${roundTripMs} ms, which is not a usable measurement. Check the input and output routing, then retry.`
      );
    }
    for (const click of captured) {
      click.quality = loopbackQuality(
        click.signalToNoise,
        Math.abs(click.roundTripMs - roundTripMs),
      );
    }
    const medianClick = captured.reduce((closest, click) =>
      Math.abs(click.roundTripMs - roundTripMs) <
      Math.abs(closest.roundTripMs - roundTripMs)
        ? click
        : closest,
    );
    // The median can stay clean even when one click is an outlier; report the
    // quality of the click that actually supplied the median.
    const quality = medianClick.quality;
    const spreadMs =
      Math.max(...captured.map((click) => click.roundTripMs)) -
      Math.min(...captured.map((click) => click.roundTripMs));
    const confidence = loopbackConfidence({
      capturedClickCount: captured.length,
      requestedClickCount: requestedClicks,
      medianQuality: quality,
      spreadMs,
    });

    const capturedAt = Date.now();
    const measurement: LoopbackMeasurement = {
      roundTripMs,
      quality,
      confidence,
      attempts,
      spreadMs,
      clicks: captured,
      clickScheduledAt: medianClick.scheduledAt,
      detectedAt: medianClick.detectedAt,
      onsetFrame: medianClick.onsetFrame,
      sampleRate,
      capturedAt,
    };
    const identity = await resolveDeviceIdentity();
    const benchmarkSpeedRatio =
      this.storedBaseline()?.benchmarkSpeedRatio ?? 1;
    const baseline: DeviceLatencyBaseline = {
      deviceModel: identity.deviceModel,
      apiLevel: identity.apiLevel,
      totalLatencyMs: roundTripMs,
      benchmarkSpeedRatio,
      capturedAt,
    };
    this.storedBaseline.set(baseline);
    writeStoredBaseline(baseline);
    this.lastLoopback.set(measurement);
    this.lastCalibration.set({
      measuredLatencyMs: roundTripMs,
      recommendedCompensationMs: roundTripMs,
      benchmarkSpeedRatio,
      capturedAt,
    });
    this.baselinePrefillDone = true;
    return measurement;
  }

  /**
   * One capture pass: arm the input, play `clicks` bursts, and measure the ones
   * that came back. The caller retries any missing clicks in a later pass.
   */
  private async captureLoopbackPass(options: {
    recorder: StudioRecordingEngineService;
    ctx: AudioContext;
    sampleRate: number;
    clicks: number;
    leadSeconds: number;
    spacingSeconds: number;
    tailSeconds: number;
  }): Promise<LoopbackClickMeasurement[]> {
    const {
      recorder,
      ctx,
      sampleRate,
      clicks,
      leadSeconds,
      spacingSeconds,
      tailSeconds,
    } = options;
    const handles: { oscillator: OscillatorNode; gain: GainNode }[] = [];

    recorder.startRecording();
    if (!recorder.isRecording()) {
      throw new Error('The recorder could not start capturing.');
    }

    try {
      // Let the worklet produce its first quantum before scheduling the clicks,
      // so the capture anchor definitely precedes the first burst.
      await wait(120);
      const firstClickAt = ctx.currentTime + leadSeconds;
      for (let index = 0; index < clicks; index++) {
        handles.push(
          this.playCalibrationClick(
            ctx,
            firstClickAt + index * spacingSeconds,
          ),
        );
      }
      await wait(
        (leadSeconds + (clicks - 1) * spacingSeconds + tailSeconds) * 1000,
      );

      const captureStartedAt = recorder.getCaptureStartedAt?.() ?? null;
      if (!captureStartedAt) return [];
      const raw = recorder.getRecordedBuffers?.(false) ?? {
        left: [],
        right: [],
      };
      const bursts = findClickBursts(
        [joinCaptureChunks(raw.left), joinCaptureChunks(raw.right)],
        {
          expected: clicks,
          // A click ends well before the next one; cap the peak search so a
          // reflection cannot be mistaken for a separate burst.
          burstWindowFrames: Math.round(spacingSeconds * sampleRate * 0.4),
        },
      );
      const scheduledTimes = Array.from(
        { length: clicks },
        (_, index) => firstClickAt + index * spacingSeconds,
      );
      const claimed = new Set<number>();
      return bursts
        .map((burst) => {
          const detectedAt =
            captureStartedAt + burst.onsetFrame / sampleRate;
          // A missed click shifts every later burst: match each detection to
          // its own scheduled slot instead of assuming the set is contiguous.
          let scheduledIndex = 0;
          let closest = Number.POSITIVE_INFINITY;
          for (let index = 0; index < scheduledTimes.length; index++) {
            if (claimed.has(index)) continue;
            const distance = Math.abs(scheduledTimes[index] - detectedAt);
            if (distance < closest) {
              closest = distance;
              scheduledIndex = index;
            }
          }
          claimed.add(scheduledIndex);
          const scheduledAt = scheduledTimes[scheduledIndex];
          return {
            roundTripMs: loopbackRoundTripMs({
              clickScheduledAt: scheduledAt,
              captureStartedAt,
              onsetFrame: burst.onsetFrame,
              sampleRate,
            }),
            scheduledAt,
            detectedAt,
            onsetFrame: burst.onsetFrame,
            peak: burst.peak,
            signalToNoise: burst.signalToNoise,
            quality: 'poor' as LoopbackClickQuality,
          };
        })
        .sort((a, b) => a.scheduledAt - b.scheduledAt);
    } finally {
      for (const click of handles) {
        try {
          click.oscillator.stop();
        } catch {
          // Already stopped by its scheduled end.
        }
        click.oscillator.disconnect();
        click.gain.disconnect();
      }
      if (recorder.isRecording()) {
        try {
          await recorder.stopRecording({ persist: false });
        } catch (error) {
          this.logger.warn(
            'Loopback calibration could not flush its capture',
            error
          );
        }
      }
    }
  }

  /** Measure the true loopback and use it as the applied compensation. */
  async calibrateWithLoopback(
    options: LoopbackOptions = {}
  ): Promise<LoopbackMeasurement> {
    const measurement = await this.measureLoopbackLatency(options);
    await this.applyCompensation(measurement.roundTripMs);
    return measurement;
  }

  private playCalibrationClick(
    ctx: AudioContext,
    at: number
  ): { oscillator: OscillatorNode; gain: GainNode } {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1000, at);
    // Fast attack, short decay: an unmistakable transient that survives a room
    // noise floor but is over before any reverb tail can smear the onset.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.9, at + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.015);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.02);
    return { oscillator, gain };
  }

  trimChannels(channels: Float32Array[], sampleRate: number): Float32Array[] {
    const framesToTrim = this.compensationFrames(sampleRate);
    if (framesToTrim <= 0 || channels.length === 0) {
      return channels.map((channel) => channel.slice());
    }
    const frameCount = Math.max(...channels.map((channel) => channel.length));
    if (framesToTrim >= frameCount) {
      return channels.map(() => new Float32Array(0));
    }
    return channels.map((channel) => channel.subarray(framesToTrim).slice());
  }

  trimAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const framesToTrim = this.compensationFrames(buffer.sampleRate);
    if (framesToTrim <= 0) {
      return buffer;
    }
    const createBuffer = this.engine?.ctx?.createBuffer?.bind(this.engine.ctx);
    if (!createBuffer) {
      return buffer;
    }
    if (framesToTrim >= buffer.length) {
      return createBuffer(buffer.numberOfChannels, 1, buffer.sampleRate);
    }
    const nextLength = Math.max(1, buffer.length - framesToTrim);
    const trimmed = createBuffer(
      buffer.numberOfChannels,
      nextLength,
      buffer.sampleRate
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      trimmed.copyToChannel(
        buffer.getChannelData(channel).subarray(framesToTrim),
        channel
      );
    }
    return trimmed;
  }

  /**
   * Build a human-readable profile summary, including actionable
   * recommendations keyed off the live snapshot + benchmark history.
   */
  buildSummary(): ProfileSummary {
    const snap = this.snapshot();
    const bench = this.recentBenchmarks();
    const recommendations: string[] = [];
    if (snap.contextState !== 'running') {
      recommendations.push(
        `AudioContext is ${snap.contextState} — tap Play once to unlock the engine.`
      );
    }
    if (snap.totalLatencyMs !== undefined && snap.totalLatencyMs > 60)
      recommendations.push(
        `Round-trip latency exceeds 60ms — switch to a wired output, drop the Bluetooth path, or lower the buffer.`
      );
    if (snap.sampleRateHz < 44100) {
      recommendations.push(
        `Sample rate below 44.1 kHz — most DSP presets are tuned for 48 kHz+.`
      );
    }
    if (bench.length > 0) {
      const avgSpeed =
        bench.reduce((a, b) => a + b.speedRatio, 0) / bench.length;
      if (avgSpeed < 0.5) {
        recommendations.push(
          `Offload a slower-than-real-time render — pre-render bounces in the background.`
        );
      } else if (avgSpeed > 2) {
        recommendations.push(
          `Render is faster than real-time — bounce while you keep editing.`
        );
      } else {
        recommendations.push(
          `Render is balanced — keep the latest preset, room to spare.`
        );
      }
    }
    if (!snap.masterWorkletActive) {
      recommendations.push(
        `Master worklet is off — the limiter/audio chain is on the main thread.`
      );
    }
    if (this.appliedCompensationMs() > 0) {
      recommendations.push(
        `Record compensation is active at ${this.appliedCompensationMs()} ms for this device.`
      );
    }
    return {
      snapshot: snap,
      recentBenchmarks: bench,
      recommendations,
    };
  }

  private compensationFrames(sampleRate: number): number {
    const sr = Number(sampleRate) || 0;
    if (sr <= 0) return 0;
    return Math.max(
      0,
      Math.round((this.appliedCompensationMs() / 1000) * sr)
    );
  }
}
