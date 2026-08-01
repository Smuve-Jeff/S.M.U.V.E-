import { Injectable, signal, inject, computed } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';

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
   * Ratio of offline render wall-clock vs the buffer duration. Lower is
   * faster — anything ≤1 means real-time-or-better, ≥2 means the device
   * is materially slower than real-time.
   */
  speedRatio: number;
  capturedAt: number;
}

export interface ProfileSummary {
  snapshot: LatencySnapshot;
  recentBenchmarks: BenchmarkResult[];
  recommendations: string[];
}

@Injectable({ providedIn: 'root' })
export class AudioEngineLatencyService {
  private engine = inject(AudioEngineService);
  private logger = inject(LoggingService);

  /** Latest live snapshot derived from the engine surface. */
  readonly snapshot = signal<LatencySnapshot>(this.captureSnapshot());
  /** Last up-to-10 offline render benchmarks. */
  readonly recentBenchmarks = signal<BenchmarkResult[]>([]);
  /** Latest full profile summary — recomputed on demand. */
  readonly profileSummary = computed<ProfileSummary>(() =>
    this.buildSummary()
  );

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
  }

  /**
   * Capture a fresh snapshot of the engine surface. Safe to call from
   * test fixtures (no AudioContext work happens here).
   */
  captureSnapshot(): LatencySnapshot {
    const ctx = this.engine.ctx;
    const base =
      typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0;
    const out =
      typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0;
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
      sampleRateHz: this.engine.nativeSampleRate,
      baseLatencySec: base,
      outputLatencySec: out,
      totalLatencyMs: totalLatencyMs,
      schedulerLookaheadMs:
        AudioEngineService.DEFAULT_LOOKAHEAD_SECONDS * 1000,
      schedulerIntervalMs:
        AudioEngineService.DEFAULT_SCHEDULER_INTERVAL_MS,
      masterWorkletActive: this.engine.masterWorkletActive(),
      performanceTier: this.engine.performanceTier(),
      cpuHeadroomHint,
      contextState: ctx.state,
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
    const ctx = this.engine.ctx;
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
    const sampleRate = ctx.sampleRate || 44100;
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
      // speedRatio = 1 means real-time; <1 means we're faster than
      // playback (great); >1 means slower (visible crawl on bounces).
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
    return {
      snapshot: snap,
      recentBenchmarks: bench,
      recommendations,
    };
  }
}
