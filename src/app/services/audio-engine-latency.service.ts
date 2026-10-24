import { Injectable, signal, inject, computed, effect } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';

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

  /** Latest live snapshot derived from the engine surface. */
  readonly snapshot = signal<LatencySnapshot>(this.captureSnapshot());
  /** Last up-to-10 offline render benchmarks. */
  readonly recentBenchmarks = signal<BenchmarkResult[]>([]);
  /** Most recent per-device calibration run. */
  readonly lastCalibration = signal<LatencyCalibrationResult | null>(null);
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
