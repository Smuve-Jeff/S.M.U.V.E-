import { Injectable } from '@angular/core';

/**
 * Time-stretch / pitch-shift / tempo-match engine (Sprint A1 of the
 * Mobile DAW Supremacy Master Plan — docs/MASTER_PLAN.md).
 *
 * Closes the biggest cross-competitor gap vs FL Studio Mobile, Cubasis 3,
 * n-Track, Audio Evolution Mobile and BandLab: high-quality offline
 * time-stretching and pitch-shifting of audio buffers.
 *
 * Techniques:
 *  - Time-stretch: WSOLA (Waveform Similarity Overlap-Add) with
 *    cross-correlation search — preserves transients far better than naive
 *    OLA and is the standard approach used by pro DAWs.
 *  - Pitch-shift: resample (linear interp) by `2^(semitones/12)`, then
 *    time-stretch by the reciprocal factor to preserve duration.
 *  - Tempo-match: time-stretch by `sourceBpm / targetBpm`.
 *
 * Pure TS, no Web Audio dependency — works in workers, WASM fallbacks and
 * offline render contexts.
 */
@Injectable({ providedIn: 'root' })
export class AudioStretchService {
  /**
   * Time-stretch a mono float buffer.
   * `ratio > 1` slows the audio down (longer), `ratio < 1` speeds it up.
   * Returns a new Float32Array; the input is never mutated.
   */
  timeStretch(
    input: Float32Array,
    ratio: number,
    options: TimeStretchOptions = {}
  ): Float32Array {
    if (input.length === 0 || !Number.isFinite(ratio) || ratio <= 0.0001) {
      return new Float32Array(input);
    }

    const windowSize = options.windowSize ?? 2048;
    const overlap = options.overlap ?? 0.25; // 75% overlap
    const synthHop = Math.max(1, Math.round(windowSize * overlap));
    // Output length ≈ (input / Ha) * Hs must equal ratio * input, so Ha = Hs / ratio.
    const analysisHop = Math.max(1, synthHop / ratio);
    const searchRadius =
      options.searchRadius ?? Math.max(4, Math.floor(windowSize / 8));

    const win = this.hannWindow(windowSize);
    const outLength =
      Math.ceil((input.length / analysisHop) * synthHop) + windowSize;
    const out = new Float32Array(outLength);
    const windowSum = new Float32Array(outLength);

    let analysisPos = 0;
    let synthesisPos = 0;
    let firstFrame = true;

    while (
      analysisPos + windowSize < input.length &&
      synthesisPos + windowSize < outLength
    ) {
      const expected = Math.round(analysisPos);
      let offset = 0;

      // WSOLA: find the analysis position whose first `synthHop` samples best
      // match the previous output overlap region (transient preservation).
      if (!firstFrame && synthesisPos - synthHop >= 0) {
        let bestScore = -Infinity;
        for (let d = -searchRadius; d <= searchRadius; d++) {
          const cand = expected + d;
          if (cand < 0 || cand + windowSize > input.length) continue;
          const score = this.correlate(
            input,
            cand,
            out,
            synthesisPos - synthHop,
            synthHop
          );
          if (score > bestScore) {
            bestScore = score;
            offset = d;
          }
        }
      }
      firstFrame = false;

      const start = Math.max(
        0,
        Math.min(input.length - windowSize, expected + offset)
      );

      // Overlap-add the windowed frame into the output
      for (let i = 0; i < windowSize; i++) {
        const w = win[i];
        const outIdx = synthesisPos + i;
        out[outIdx] += input[start + i] * w;
        windowSum[outIdx] += w;
      }

      analysisPos += analysisHop;
      synthesisPos += synthHop;
    }

    // Normalize by accumulated window weights (Hann windows overlap-add to >1)
    for (let i = 0; i < outLength; i++) {
      if (windowSum[i] > 1e-6) out[i] /= windowSum[i];
    }

    return out;
  }

  /**
   * Pitch-shift by `semitones` while preserving duration.
   * Positive = higher, negative = lower. Uses resample + reciprocal stretch.
   */
  pitchShift(
    input: Float32Array,
    semitones: number,
    options: TimeStretchOptions = {}
  ): Float32Array {
    if (input.length === 0 || !Number.isFinite(semitones)) {
      return new Float32Array(input);
    }
    const factor = Math.pow(2, semitones / 12);
    const resampled = this.resample(input, factor);
    // Restore original duration (factor > 1 shortens, so stretch by factor)
    return this.timeStretch(resampled, factor, options);
  }

  /**
   * Resample by `factor` using linear interpolation.
   * `factor > 1` produces fewer samples (pitch up), `< 1` more samples.
   */
  resample(input: Float32Array, factor: number): Float32Array {
    if (input.length === 0 || !Number.isFinite(factor) || factor <= 0) {
      return new Float32Array(input);
    }
    const outLength = Math.max(1, Math.floor(input.length / factor));
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const srcPos = i * factor;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(input.length - 1, i0 + 1);
      const frac = srcPos - i0;
      out[i] = input[i0] + (input[i1] - input[i0]) * frac;
    }
    return out;
  }

  /**
   * Tempo-match: stretch so audio recorded at `sourceBpm` plays at `targetBpm`.
   * Ratio > 1 (slower source) lengthens the buffer; < 1 shortens it.
   */
  tempoMatch(
    input: Float32Array,
    sourceBpm: number,
    targetBpm: number,
    options: TimeStretchOptions = {}
  ): Float32Array {
    if (
      input.length === 0 ||
      !Number.isFinite(sourceBpm) ||
      !Number.isFinite(targetBpm) ||
      sourceBpm <= 0 ||
      targetBpm <= 0
    ) {
      return new Float32Array(input);
    }
    return this.timeStretch(input, sourceBpm / targetBpm, options);
  }

  // ── DSP primitives ──────────────────────────────────────

  /** Normalized cross-correlation of `len` samples at two offsets. */
  private correlate(
    a: Float32Array,
    aOffset: number,
    b: Float32Array,
    bOffset: number,
    len: number
  ): number {
    let sum = 0;
    let aEnergy = 0;
    let bEnergy = 0;
    for (let i = 0; i < len; i++) {
      const av = a[aOffset + i];
      const bv = b[bOffset + i];
      sum += av * bv;
      aEnergy += av * av;
      bEnergy += bv * bv;
    }
    const norm = Math.sqrt(aEnergy * bEnergy);
    return norm > 1e-9 ? sum / norm : 0;
  }

  private hannWindow(size: number): Float32Array {
    const w = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return w;
  }
}

export interface TimeStretchOptions {
  /** Analysis window size in samples (power of 2 recommended). Default 2048. */
  windowSize?: number;
  /** Synthesis hop as a fraction of the window (0 < overlap < 1). Default 0.25. */
  overlap?: number;
  /** Cross-correlation search radius in samples. Default windowSize / 8. */
  searchRadius?: number;
}
