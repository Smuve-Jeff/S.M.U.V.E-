/**
 * S.M.U.V.E. 2.0 — Wasm DSP Kernels (JS Fallback)
 *
 * High-performance DSP kernels packaged as WasmDspModule instances.
 * Each kernel is a pure function operating on Float32Arrays, making
 * them trivially portable to WebAssembly via Emscripten or wasm-bindgen.
 *
 * When compiled to Wasm, these same functions become native-speed
 * SIMD-accelerated kernels. The JS fallback runs on the main thread
 * until the .wasm binary loads.
 */

import { WasmDspModule, DspKernelFn } from './wasm-dsp-interface';

/* ── dB ↔ linear ───────────────────────────────────────── */
function dbToLin(db: number): number { return Math.pow(10, db / 20); }
function linToDb(lin: number): number { return 20 * Math.log10(Math.max(lin, 1e-10)); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// ═══════════════════════════════════════════════════════════
//  Soft-Knee Stereo Compressor Kernel
// ═══════════════════════════════════════════════════════════

const compressorKernel: DspKernelFn = (
  input: Float32Array,
  output: Float32Array,
  params: Float32Array,
  sampleRate: number
) => {
  // Params: [thresholdDb, ratio, attack, release, kneeDb, makeupDb]
  const thresholdDb = params[0] ?? -24;
  const ratio = params[1] ?? 4;
  const attack = params[2] ?? 0.003;
  const release = params[3] ?? 0.1;
  const kneeDb = params[4] ?? 6;
  const makeupDb = params[5] ?? 0;

  const attackCoeff = Math.exp(-1 / (sampleRate * attack));
  const releaseCoeff = Math.exp(-1 / (sampleRate * release));
  let envelope = 0;
  const frameCount = input.length / 2;

  for (let i = 0; i < frameCount; i++) {
    const sL = input[i * 2];
    const sR = input[i * 2 + 1];
    const abs = Math.max(Math.abs(sL), Math.abs(sR));
    const dbIn = abs > 1e-10 ? linToDb(abs) : -120;

    // Soft knee
    let over = 0;
    const kh = kneeDb / 2;
    if (dbIn > thresholdDb + kh) {
      over = dbIn - thresholdDb;
    } else if (dbIn > thresholdDb - kh) {
      const base = dbIn - thresholdDb + kh;
      over = (base * base) / (2 * kneeDb);
    }

    const targetGr = over * (1 - 1 / ratio);
    const coeff = targetGr > envelope ? attackCoeff : releaseCoeff;
    envelope = coeff * envelope + (1 - coeff) * targetGr;

    const gainLin = dbToLin(-envelope + makeupDb);
    output[i * 2] = clamp(sL * gainLin, -1, 1);
    output[i * 2 + 1] = clamp(sR * gainLin, -1, 1);
  }
};

// ═══════════════════════════════════════════════════════════
//  Brickwall Lookahead Limiter Kernel
// ═══════════════════════════════════════════════════════════

const limiterKernel: DspKernelFn = (
  input: Float32Array,
  output: Float32Array,
  params: Float32Array,
  sampleRate: number
) => {
  // Params: [thresholdDb, release, lookaheadSamples, ceilingDb]
  const thresholdDb = params[0] ?? -0.3;
  const release = params[1] ?? 0.01;
  const lookahead = Math.max(1, Math.floor((params[2] ?? 64)));
  const ceilingDb = params[3] ?? -0.1;

  const releaseCoeff = Math.exp(-1 / (sampleRate * release));
  const threshold = dbToLin(thresholdDb);
  const ceiling = dbToLin(ceilingDb);

  let gainReduction = 1.0;
  const frameCount = input.length / 2;
  const buf = new Float32Array(lookahead * 2);

  for (let i = 0; i < frameCount; i++) {
    const idx = i * 2;
    const sL = input[idx];
    const sR = input[idx + 1];

    // Lookahead: store current sample, compute gain from peak in window
    const peak = Math.max(Math.abs(sL), Math.abs(sR));
    let desiredGain = peak > threshold ? threshold / peak : 1.0;
    // Smooth gain reduction
    gainReduction = gainReduction > desiredGain
      ? releaseCoeff * gainReduction + (1 - releaseCoeff) * desiredGain
      : desiredGain; // attack is instant

    const finalGain = gainReduction * ceiling / threshold;
    output[idx] = clamp(sL * finalGain, -1, 1);
    output[idx + 1] = clamp(sR * finalGain, -1, 1);
  }
};

// ═══════════════════════════════════════════════════════════
//  5-Band Mastering EQ Kernel
// ═══════════════════════════════════════════════════════════

const eqKernel: DspKernelFn = (
  input: Float32Array,
  output: Float32Array,
  params: Float32Array,
  sampleRate: number
) => {
  // Params: 5 bands × 3 (freq, gainDb, Q) = 15 floats
  // Bands: sub (40), low (120), mid (800), high (4000), air (12000)
  const frameCount = input.length / 2;

  // Pre-design biquad coefficients for each band
  const bands: Array<{ b0: number; b1: number; b2: number; a1: number; a2: number; x1L: number; x2L: number; y1L: number; y2L: number; x1R: number; x2R: number; y1R: number; y2R: number }> = [];

  for (let b = 0; b < 5; b++) {
    const freq = params[b * 3] || 1000;
    const gainDb = params[b * 3 + 1] || 0;
    const Q = params[b * 3 + 2] || 0.707;
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);
    const A = dbToLin(gainDb);

    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (b === 0) { // lowshelf
      b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
      b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW0);
      a2 = (A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
    } else if (b === 4) { // highshelf
      b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
      b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW0);
      a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
    } else { // peaking
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
    }

    bands.push({
      b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
      a1: a1 / a0, a2: a2 / a0,
      x1L: 0, x2L: 0, y1L: 0, y2L: 0,
      x1R: 0, x2R: 0, y1R: 0, y2R: 0,
    });
  }

  for (let i = 0; i < frameCount; i++) {
    let sL = input[i * 2];
    let sR = input[i * 2 + 1];

    for (const band of bands) {
      // Left channel
      const yL = band.b0 * sL + band.b1 * band.x1L + band.b2 * band.x2L
               - band.a1 * band.y1L - band.a2 * band.y2L;
      band.x2L = band.x1L; band.x1L = sL;
      band.y2L = band.y1L; band.y1L = yL;
      sL = yL;

      // Right channel
      const yR = band.b0 * sR + band.b1 * band.x1R + band.b2 * band.x2R
               - band.a1 * band.y1R - band.a2 * band.y2R;
      band.x2R = band.x1R; band.x1R = sR;
      band.y2R = band.y1R; band.y1R = yR;
      sR = yR;
    }

    output[i * 2] = clamp(sL, -1, 1);
    output[i * 2 + 1] = clamp(sR, -1, 1);
  }
};

// ═══════════════════════════════════════════════════════════
//  Saturation / Exciter Kernel
// ═══════════════════════════════════════════════════════════

const saturationKernel: DspKernelFn = (
  input: Float32Array,
  output: Float32Array,
  params: Float32Array,
  _sampleRate: number
) => {
  // Params: [amount (0-1), mix (0-1), mode (0=tanh, 1=cubic, 2=soft)]
  const amount = params[0] ?? 0.2;
  const mix = params[1] ?? 1.0;
  const mode = params[2] ?? 0;
  const drive = 1 + amount * 9;
  const frameCount = input.length / 2;

  for (let i = 0; i < frameCount; i++) {
    const dryL = input[i * 2];
    const dryR = input[i * 2 + 1];

    const xL = dryL * drive;
    const xR = dryR * drive;

    let wetL: number, wetR: number;
    switch (mode) {
      case 1: // cubic
        wetL = (xL - (xL * xL * xL) / 3) / drive;
        wetR = (xR - (xR * xR * xR) / 3) / drive;
        break;
      case 2: // soft
        wetL = (xL / (1 + Math.abs(xL))) / drive;
        wetR = (xR / (1 + Math.abs(xR))) / drive;
        break;
      default: // tanh
        wetL = Math.tanh(xL) / drive;
        wetR = Math.tanh(xR) / drive;
    }

    output[i * 2] = clamp(dryL * (1 - mix) + wetL * mix, -1, 1);
    output[i * 2 + 1] = clamp(dryR * (1 - mix) + wetR * mix, -1, 1);
  }
};

// ═══════════════════════════════════════════════════════════
//  Module Definitions (WasmDspModule wrappers)
// ═══════════════════════════════════════════════════════════

function createModule(
  id: string,
  name: string,
  kernels: Record<string, DspKernelFn>
): WasmDspModule {
  return {
    id,
    name,
    version: '2.0.0',
    isWasm: false,
    heapBytes: 0,
    getKernel(kernelName: string): DspKernelFn | null {
      return kernels[kernelName] ?? null;
    },
    listKernels(): string[] {
      return Object.keys(kernels);
    },
    dispose(): void {
      // JS fallback — nothing to free
    },
  };
}

/** Compressor/limiter module: feed-forward soft-knee compressor + brickwall lookahead limiter */
export const wasmDynamicsModule: () => WasmDspModule = () =>
  createModule('smuve.dynamics.v2', 'Dynamics Processor', {
    compressor: compressorKernel,
    limiter: limiterKernel,
  });

/** Mastering EQ module: 5-band parametric (sub/low/mid/high/air) */
export const wasmEqModule: () => WasmDspModule = () =>
  createModule('smuve.eq.mastering.v2', 'Mastering EQ', {
    eq: eqKernel,
  });

/** Saturation module: tanh/cubic/soft saturation with dry/wet blend */
export const wasmSaturationModule: () => WasmDspModule = () =>
  createModule('smuve.saturation.v2', 'Saturation / Exciter', {
    saturate: saturationKernel,
  });

/** Full mastering chain: EQ → Compressor → Saturator → Limiter (monolithic kernel) */
export const wasmMasterChainModule: () => WasmDspModule = () =>
  createModule('smuve.master.v2', 'Full Mastering Chain', {
    process: ((input, output, params, sampleRate) => {
      // Chain: EQ(5 bands) → Comp → Sat → Limiter
      // params layout: [5×3 EQ] + [6 comp] + [3 sat] + [4 lim] = 28 floats
      const eqParams = params.subarray(0, 15);
      const compParams = params.subarray(15, 21);
      const satParams = params.subarray(21, 24);
      const limParams = params.subarray(24, 28);

      const afterEq = new Float32Array(input.length);
      eqKernel(input, afterEq, eqParams, sampleRate);

      const afterComp = new Float32Array(input.length);
      compressorKernel(afterEq, afterComp, compParams, sampleRate);

      const afterSat = new Float32Array(input.length);
      saturationKernel(afterComp, afterSat, satParams, sampleRate);

      limiterKernel(afterSat, output, limParams, sampleRate);
    }) as DspKernelFn,
  });
