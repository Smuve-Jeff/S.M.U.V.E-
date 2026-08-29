import {
  Injectable,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

/**
 * RecordingLimiterService — headroom detection & clipping prevention.
 * Inserts a soft-knee DynamicsCompressor (brick-wall style limiter) into the
 * recording capture chain so hot input can't hard-clip the captured WAV, and
 * exposes pre/post gain metering so the UI can show live headroom and whether
 * limiting is engaged.
 *
 * The service is intentionally inert until {@link connectToRecordingChain} is
 * called with the capture source node, so simply being injected (as it is by
 * the recording engine) has no side effects.
 */
@Injectable({ providedIn: 'root' })
export class RecordingLimiterService implements OnDestroy {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);

  /** Master on/off switch — when off the chain passes through untouched. */
  enabled = signal(true);
  /** Limiter threshold in dBFS (−∞..0). Input above this is attenuated. */
  thresholdDb = signal(-6);
  /** Compression ratio — 20 ≈ brick-wall limiter. */
  ratio = signal(20);
  /** Soft-knee width in dB for a musical transition into limiting. */
  kneeDb = signal(12);
  /** Attack time in ms. */
  attackTimeMs = signal(1);
  /** Release time in ms — how fast the gain returns after the peak. */
  releaseTimeMs = signal(100);

  /** Pre-limiter input peak (dBFS). Drives the "headroom / clipping" meter. */
  peakInputDb = signal(-60);
  /** Post-limiter output peak (dBFS). */
  peakOutputDb = signal(-60);

  /** Whether the limiter is engaged AND currently reducing gain. */
  isLimitingActive = computed(
    () => this.enabled() && this.peakInputDb() > this.thresholdDb()
  );

  /** Perceptual fill percentage (0-100) for a headroom meter. */
  headroomPercent = computed(() => {
    const db = this.peakInputDb();
    // Map -60..0 dBFS → 0..100%.
    if (!isFinite(db) || db <= -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  });

  private compressor: DynamicsCompressorNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private meterRaf: number | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;

  /**
   * Insert the limiter between `sourceNode` and whatever it feeds. Returns the
   * node that downstream capture should connect to (the compressor when
   * enabled, otherwise the untouched source). Safe/idempotent — rebuilds the
   * graph on each call and tears down the previous one.
   */
  connectToRecordingChain(sourceNode: AudioNode): AudioNode {
    this.disconnect();
    if (!this.enabled()) {
      return sourceNode;
    }
    const ctx = this.audioEngine.ctx;
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = this.thresholdDb();
      comp.ratio.value = this.ratio();
      comp.knee.value = this.kneeDb();
      comp.attack.value = this.attackTimeMs() / 1000;
      comp.release.value = this.releaseTimeMs() / 1000;

      // Pre (input) analyser taps the raw source; post (output) analyser taps
      // the limited signal so headroom vs delivered level are both visible.
      const inputAnalyser = ctx.createAnalyser();
      inputAnalyser.fftSize = 2048;
      const outputAnalyser = ctx.createAnalyser();
      outputAnalyser.fftSize = 2048;

      sourceNode.connect(inputAnalyser);
      sourceNode.connect(comp);
      comp.connect(outputAnalyser);

      this.compressor = comp;
      this.inputAnalyser = inputAnalyser;
      this.outputAnalyser = outputAnalyser;
      this.startMetering();

      this.logger.info(
        'RecordingLimiter: engaged in capture chain ' +
          `(threshold ${this.thresholdDb()} dB, ratio ${this.ratio()}:1)`
      );
      return comp;
    } catch (e) {
      // Never break the capture path — fall back to a direct connection.
      this.logger.warn(
        'RecordingLimiter: could not engage limiter; recording without it.',
        e
      );
      this.disconnect();
      return sourceNode;
    }
  }

  /** Route a source into the limiter chain up to a downstream node. */
  connectToRecordingChainWith(
    sourceNode: AudioNode,
    downstream: AudioNode
  ): void {
    const tail = this.connectToRecordingChain(sourceNode);
    tail.connect(downstream);
  }

  // ── Live control — update an engaged limiter reactively ──
  setEnabled(enabled: boolean) {
    this.enabled.set(enabled);
    if (this.compressor && !enabled) {
      this.compressor.disconnect();
      this.compressor = null;
      this.inputAnalyser?.disconnect();
      this.inputAnalyser = null;
      this.outputAnalyser?.disconnect();
      this.outputAnalyser = null;
      this.stopMetering();
    }
  }

  setThresholdDb(db: number) {
    this.thresholdDb.set(db);
    if (this.compressor) this.compressor.threshold.value = db;
  }

  setRatio(ratio: number) {
    this.ratio.set(ratio);
    if (this.compressor) this.compressor.ratio.value = ratio;
  }

  setKneeDb(db: number) {
    this.kneeDb.set(db);
    if (this.compressor) this.compressor.knee.value = db;
  }

  setReleaseTimeMs(ms: number) {
    this.releaseTimeMs.set(ms);
    if (this.compressor) this.compressor.release.value = ms / 1000;
  }

  // ── Metering ──
  private startMetering() {
    if (this.meterRaf !== null || !this.inputAnalyser || !this.outputAnalyser) {
      return;
    }
    const size = 2048;
    this.meterBuf = new Float32Array(size);
    const input = this.inputAnalyser;
    const output = this.outputAnalyser;
    const buf = this.meterBuf;

    const readPeak = (analyser: AnalyserNode): number => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < size; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
      }
      return peak <= 0 ? -60 : 20 * Math.log10(peak);
    };

    const tick = () => {
      if (!this.enabled() || !this.compressor) {
        // Slow decay when idle so the meter visually releases.
        this.peakInputDb.update((v) => Math.max(-60, v - 0.5));
        this.peakOutputDb.update((v) => Math.max(-60, v - 0.5));
        this.meterRaf = requestAnimationFrame(tick);
        return;
      }
      this.peakInputDb.set(readPeak(input));
      this.peakOutputDb.set(readPeak(output));
      this.meterRaf = requestAnimationFrame(tick);
    };
    this.meterRaf = requestAnimationFrame(tick);
  }

  private stopMetering() {
    if (this.meterRaf !== null) {
      cancelAnimationFrame(this.meterRaf);
      this.meterRaf = null;
    }
    this.meterBuf = null;
  }

  /** Tear down the limiter graph. Safe to call repeatedly. */
  disconnect() {
    this.stopMetering();
    this.compressor?.disconnect();
    this.inputAnalyser?.disconnect();
    this.outputAnalyser?.disconnect();
    this.compressor = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
  }

  ngOnDestroy() {
    this.disconnect();
  }
}