import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { LoggingService } from './logging.service';

/**
 * Studio device profile — capability detection for the audio budget.
 *
 * Why this exists: `AudioEngineService.updateAdaptivePerformance(load)` has
 * always been able to drop the engine to the low-power tier, but nothing ever
 * called it, so a 4-core Android phone booted the studio with the same voice /
 * effects budget as a desktop and only found out the hard way (dropouts,
 * thermal throttling, background kills). This service is the missing caller:
 * it classifies the device from capabilities the browser already exposes,
 * publishes a budget, and pushes capability pressure into the engine so the
 * existing low-power path (visuals + ambience + tier CSS) actually engages.
 *
 * Classification is intentionally, deliberately *not* a CPU benchmark: it is a
 * deterministic function of the reported signals, so the same device always
 * gets the same tier and the tier can be asserted in a unit test. Live
 * audio-thread load (render-quantum overruns) would be a better second input
 * and is tracked as follow-up work in docs/STUDIO_PARITY_RISK_AUDIT.md.
 */

/** Device class S.M.U.V.E. sizes its audio budget to. */
export type StudioDeviceTier = 'high' | 'mid' | 'low';

/** Everything the classifier is allowed to look at. */
export interface StudioDeviceSignals {
  /** `navigator.hardwareConcurrency`; 0 when the browser refuses to report. */
  cores: number;
  /** `navigator.deviceMemory` (GiB, capped at 8 by the spec); null when absent. */
  memoryGb: number | null;
  /** Phone/tablet-class device (WebView on Android is the latency worst case). */
  mobile: boolean;
  /** AudioWorklet is available, i.e. DSP can leave the main thread. */
  audioWorklet: boolean;
  /** WebAssembly is usable (plugin kernels get the fast path). */
  webAssembly: boolean;
  /** WebAssembly SIMD (`-msimd128`) validated on this engine. */
  wasmSimd: boolean;
  /** Data Saver is on — the artist wants less work happening in the background. */
  saveData: boolean;
  /** `prefers-reduced-motion: reduce` — cheap win for the render budget. */
  reducedMotion: boolean;
}

/** Per-tier ceilings a consuming surface can honour. */
export interface StudioAudioBudget {
  /** Concurrent synth/sampler voices before the oldest is stolen. */
  maxVoices: number;
  /** Live plugin inserts / effect slots on the hot path. */
  maxActiveEffects: number;
  /** Audio tracks kept in the live graph. */
  maxTracks: number;
}

export interface StudioDeviceProfile {
  tier: StudioDeviceTier;
  /** Engine tier the classifier recommends. `ultra` keeps every feature on. */
  performanceTier: 'ultra' | 'performance';
  /**
   * 0–100 capability pressure, in the scale
   * `AudioEngineService.updateAdaptivePerformance(load)` expects (>70 =
   * low-power tier). Derived from the device class, not a live CPU sample.
   */
  capabilityPressure: number;
  budget: StudioAudioBudget;
  /** True when the device should be nudged into the low-power mode by default. */
  lowPowerSuggested: boolean;
  /** True when heavy visuals should be deferred / skipped. */
  reducedVisuals: boolean;
  signals: StudioDeviceSignals;
  /** Human-readable justification for the tier, in the order it was applied. */
  reasons: string[];
}

export const STUDIO_AUDIO_BUDGETS: Record<StudioDeviceTier, StudioAudioBudget> = {
  high: { maxVoices: 32, maxActiveEffects: 8, maxTracks: 24 },
  mid: { maxVoices: 16, maxActiveEffects: 4, maxTracks: 12 },
  low: { maxVoices: 8, maxActiveEffects: 2, maxTracks: 6 },
};

/**
 * Standard WebAssembly SIMD feature probe (same binary used by
 * `wasm-feature-detect`): a minimal module whose body is `v128.const` +
 * `i8x16.splat`, which only validates on an engine with SIMD enabled.
 */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

/**
 * Classify a device from its reported signals. Pure + deterministic so the
 * tier is reproducible and testable; unknown signals fall back to the middle
 * tier rather than guessing the worst case.
 */
export function classifyStudioDevice(
  signals: StudioDeviceSignals
): StudioDeviceProfile {
  const reasons: string[] = [];
  let score = 0;

  // CPU cores — the strongest single predictor of polyphony headroom.
  if (signals.cores >= 8) score += 3;
  else if (signals.cores >= 6) score += 2;
  else if (signals.cores >= 4) score += 1;
  else if (signals.cores > 0) {
    score -= 1;
    reasons.push(`only ${signals.cores} CPU cores reported`);
  } else {
    // 0 = the browser refused to report (older WebViews). Neutral, not a
    // penalty: a device we cannot measure is treated as mid.
    reasons.push('CPU core count unavailable');
  }

  // Device memory. Absent means the API is missing (Safari, some WebViews),
  // which is not evidence of a weak device: assume ample and say so in the
  // reasons rather than punishing a desktop we simply cannot measure.
  if (signals.memoryGb === null) {
    score += 2;
    reasons.push('device memory not reported — assuming ample');
  }
  else if (signals.memoryGb >= 8) score += 2;
  else if (signals.memoryGb >= 4) score += 1;
  else {
    reasons.push(`${signals.memoryGb}GB device memory`);
  }

  // Mobile WebView costs headroom for the same graph (AAudio via WebView is
  // never as tight as a native backend).
  if (signals.mobile) {
    score -= 1;
    reasons.push('mobile WebView audio path');
  }

  // Without AudioWorklet the DSP cannot leave the main thread at all.
  if (!signals.audioWorklet) {
    score -= 3;
    reasons.push('AudioWorklet unavailable — DSP falls back to the main thread');
  }

  // Without SIMD the plugin kernels lose their vectorised inner loops.
  if (signals.webAssembly && !signals.wasmSimd) {
    score -= 1;
    reasons.push('WebAssembly SIMD unavailable — scalar DSP kernels');
  } else if (!signals.webAssembly) {
    score -= 2;
    reasons.push('WebAssembly unavailable — JS DSP kernels only');
  }

  if (signals.saveData) {
    score -= 1;
    reasons.push('Data Saver enabled');
  }

  const tier: StudioDeviceTier =
    score >= 5 ? 'high' : score >= 2 ? 'mid' : 'low';
  const lowPowerSuggested = tier === 'low';
  if (lowPowerSuggested) {
    reasons.push('device class is below the real-time audio floor');
  }

  return {
    tier,
    // Only the genuinely constrained class is pushed to the low-power engine
    // tier: mid-range phones keep the full feature set (the mid-tier budget
    // still caps voices/effects for consumers that opt in).
    performanceTier: lowPowerSuggested ? 'performance' : 'ultra',
    capabilityPressure: tier === 'low' ? 100 : tier === 'mid' ? 55 : 10,
    budget: { ...STUDIO_AUDIO_BUDGETS[tier] },
    lowPowerSuggested,
    reducedVisuals: lowPowerSuggested || signals.reducedMotion,
    signals,
    reasons,
  };
}

/** Reads the classifier's inputs from a `navigator`-shaped object. */
export function readStudioDeviceSignals(
  source: any = typeof navigator !== 'undefined' ? navigator : {}
): StudioDeviceSignals {
  const ua = String(source?.userAgent ?? '');
  const cores = Number(source?.hardwareConcurrency);
  const memory = Number(source?.deviceMemory);
  return {
    cores: Number.isFinite(cores) && cores > 0 ? cores : 0,
    memoryGb: Number.isFinite(memory) && memory > 0 ? memory : null,
    // `userAgentData.mobile` is the modern signal; the UA string is the
    // fallback for the Chromium WebView versions that do not expose it yet.
    mobile: Boolean(
      source?.userAgentData?.mobile ??
        /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    ),
    audioWorklet: typeof globalThis.AudioWorkletNode !== 'undefined',
    webAssembly:
      typeof globalThis.WebAssembly !== 'undefined' &&
      typeof globalThis.WebAssembly.instantiate === 'function',
    wasmSimd: probeWasmSimd(),
    saveData: Boolean(source?.connection?.saveData),
    reducedMotion: typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  };
}

function probeWasmSimd(): boolean {
  try {
    if (
      typeof globalThis.WebAssembly === 'undefined' ||
      typeof globalThis.WebAssembly.validate !== 'function'
    ) {
      return false;
    }
    return globalThis.WebAssembly.validate(WASM_SIMD_PROBE);
  } catch {
    // A validating engine never throws here, but a stub/mocked WebAssembly
    // can — absence of proof is treated as absence of SIMD.
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class StudioDeviceProfileService {
  private engine = inject(AudioEngineService, { optional: true });
  private logger = inject(LoggingService, { optional: true });

  /** Detected profile. Computed once at construction from live signals. */
  readonly profile = signal<StudioDeviceProfile>(
    classifyStudioDevice(readStudioDeviceSignals())
  );
  readonly tier = computed(() => this.profile().tier);
  readonly budget = computed(() => this.profile().budget);
  readonly lowPowerSuggested = computed(() => this.profile().lowPowerSuggested);
  readonly reasons = computed(() => this.profile().reasons);

  constructor() {
    this.applyToEngine();
  }

  /**
   * Re-read the signals (a device can be un-throttled, Data Saver toggled, or
   * the WebView upgraded between sessions) and re-apply the tier.
   */
  refresh(): StudioDeviceProfile {
    const next = classifyStudioDevice(readStudioDeviceSignals());
    this.profile.set(next);
    this.applyToEngine();
    return next;
  }

  /**
   * Push capability pressure into the engine's adaptive tier. This is the call
   * that was missing: without it `performanceTier` stayed `ultra` on devices
   * that cannot sustain it. Guarded so test doubles without the method (and
   * hosts without an engine at all) degrade silently.
   */
  private applyToEngine(): void {
    const { tier, capabilityPressure, budget } = this.profile();
    try {
      if (typeof this.engine?.updateAdaptivePerformance === 'function') {
        this.engine.updateAdaptivePerformance(capabilityPressure);
      }
      // The voice ceiling travels the same road: this profile imports the
      // engine (the reverse would be a construction cycle), so the
      // classified `budget().maxVoices` is pushed down and enforced in
      // `AudioEngineService`'s live voice path. Guarded like the tier push
      // so test doubles without the method — and hosts without an engine —
      // degrade silently.
      if (typeof this.engine?.setVoiceBudget === 'function') {
        this.engine.setVoiceBudget(budget.maxVoices);
      }
      this.logger?.info(
        `StudioDeviceProfile: classified as ${tier} (pressure ${capabilityPressure}).`
      );
    } catch (error) {
      this.logger?.warn('StudioDeviceProfile: could not apply the engine tier', error);
    }
  }
}
