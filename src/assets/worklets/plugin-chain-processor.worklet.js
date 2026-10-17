/**
 * S.M.U.V.E. 2.0 — Live Plugin Chain Processor (AudioWorklet)
 *
 * Hosts the WASM plugin framework's DSP on the audio rendering thread.
 *
 * The live inserts used to run inside `createScriptProcessor` callbacks on the
 * main thread: a 512-frame block at 48 kHz is ~10.7 ms of DSP done on the same
 * thread that renders the arrangement, the piano roll and the mixer, so every
 * enabled plugin made note-entry jitter worse. The kernels themselves are pure
 * `(input, output, params, sampleRate) => void` functions, which is what makes
 * this move possible — the audio thread becomes the host for the same maths.
 *
 * Message protocol (main thread → processor):
 *
 *   { type: 'chain', slots: [{ id, kernel, params }] }
 *
 *   `kernel` is one of the names below; `params` is the kernel's Float32Array
 *   in kernel order (a plain array is accepted too). An empty slot list is a
 *   pure pass-through — never silence.
 *
 * Kernel names: 'compressor' · 'limiter' · 'eq' · 'saturate' · 'process'
 * ('process' is the monolithic mastering chain: EQ → comp → saturator →
 * limiter, 28 params). Any other name — an unloaded module, a community plugin
 * with a kernel this build does not ship — degrades to `identityKernel`, so an
 * unknown chain passes audio instead of muting the track.
 *
 * State policy: `wasm-dsp-kernels.ts` declares kernel state (compressor
 * envelope, biquad memory, limiter gain) *inside* the function body, so the
 * offline path treats one call as the whole signal. A real-time host cannot: a
 * per-quantum reset re-attacks the compressor every 2.7 ms. Each kernel is
 * therefore built once per slot by a factory that owns the state for the life
 * of the chain, and the first quantum is numerically identical to a single
 * call of the offline kernel (see `plugin-chain-processor.spec.ts`, which pins
 * that parity so the two paths cannot drift apart silently).
 *
 * NOTE: this file is a hand-maintained asset. Angular copies `src/assets`
 * verbatim; there is no TS → worklet bundling step, which is exactly why the
 * parity spec exists.
 */

/* ── Shared scalar helpers (identical to wasm-dsp-kernels.ts) ────────────── */

function dbToLin(db) {
  return Math.pow(10, db / 20);
}
function linToDb(lin) {
  return 20 * Math.log10(Math.max(lin, 1e-10));
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ── Param plumbing ─────────────────────────────────────────────────────── */

/** Accept a Float32Array (structured clone) or a plain array of numbers. */
function toFloat32(value) {
  if (value instanceof Float32Array) return value;
  if (value && typeof value.length === 'number') return Float32Array.from(value);
  return new Float32Array(0);
}

/** Value-wise equality across two param vectors (subarray views included). */
function sameParams(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Pass-through used for unknown kernels and for an empty chain. */
function identityKernel(input, output) {
  const frames = Math.min(input.length, output.length);
  for (let i = 0; i < frames; i++) output[i] = input[i];
}

/* ══════════════════════════════════════════════════════════════════════════
   Soft-Knee Stereo Compressor
   Params: [thresholdDb, ratio, attack, release, kneeDb, makeupDb]
   Persists: envelope follower
   ══════════════════════════════════════════════════════════════════════════ */

function createCompressorKernel() {
  let envelope = 0;

  return function compressor(input, output, params, sampleRate) {
    const thresholdDb = params[0] ?? -24;
    const ratio = params[1] ?? 4;
    const attack = params[2] ?? 0.003;
    const release = params[3] ?? 0.1;
    const kneeDb = params[4] ?? 6;
    const makeupDb = params[5] ?? 0;

    const attackCoeff = Math.exp(-1 / (sampleRate * attack));
    const releaseCoeff = Math.exp(-1 / (sampleRate * release));
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
}

/* ══════════════════════════════════════════════════════════════════════════
   Brickwall Lookahead Limiter
   Params: [thresholdDb, release, lookaheadSamples, ceilingDb]
   Persists: gain reduction
   ══════════════════════════════════════════════════════════════════════════ */

function createLimiterKernel() {
  let gainReduction = 1.0;

  return function limiter(input, output, params, sampleRate) {
    const thresholdDb = params[0] ?? -0.3;
    const release = params[1] ?? 0.01;
    // Params[2] (lookahead samples) is carried for ABI parity with the offline
    // kernel, which allocates a lookahead window it never reads from either.
    const ceilingDb = params[3] ?? -0.1;

    const releaseCoeff = Math.exp(-1 / (sampleRate * release));
    const threshold = dbToLin(thresholdDb);
    const ceiling = dbToLin(ceilingDb);

    const frameCount = input.length / 2;

    for (let i = 0; i < frameCount; i++) {
      const idx = i * 2;
      const sL = input[idx];
      const sR = input[idx + 1];

      const peak = Math.max(Math.abs(sL), Math.abs(sR));
      const desiredGain = peak > threshold ? threshold / peak : 1.0;
      // Smooth gain reduction — attack is instant, release is exponential.
      gainReduction =
        gainReduction > desiredGain
          ? releaseCoeff * gainReduction + (1 - releaseCoeff) * desiredGain
          : desiredGain;

      const finalGain = (gainReduction * ceiling) / threshold;
      output[idx] = clamp(sL * finalGain, -1, 1);
      output[idx + 1] = clamp(sR * finalGain, -1, 1);
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   5-Band Mastering EQ
   Params: 5 bands × (freq, gainDb, Q) = 15 floats
   Persists: biquad memory per band, per channel
   ══════════════════════════════════════════════════════════════════════════ */

function createEqKernel() {
  const bands = [];
  let designed = false;
  let lastParams = null;

  function design(params, sampleRate) {
    for (let b = 0; b < 5; b++) {
      const freq = params[b * 3] || 1000;
      const gainDb = params[b * 3 + 1] || 0;
      const Q = params[b * 3 + 2] || 0.707;
      const w0 = (2 * Math.PI * freq) / sampleRate;
      const cosW0 = Math.cos(w0);
      const sinW0 = Math.sin(w0);
      const alpha = sinW0 / (2 * Q);
      const A = dbToLin(gainDb);

      let b0 = 1,
        b1 = 0,
        b2 = 0,
        a0 = 1,
        a1 = 0,
        a2 = 0;
      if (b === 0) {
        // lowshelf
        b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
        b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = A + 1 + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = -2 * (A - 1 + (A + 1) * cosW0);
        a2 = A + 1 + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
      } else if (b === 4) {
        // highshelf
        b0 = A * (A + 1 + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
        b2 = A * (A + 1 + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = A + 1 - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = 2 * (A - 1 - (A + 1) * cosW0);
        a2 = A + 1 - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
      } else {
        // peaking
        b0 = 1 + alpha * A;
        b1 = -2 * cosW0;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cosW0;
        a2 = 1 - alpha / A;
      }

      // Reuse the band's delay memory: a knob move must not spit the filter
      // state out, or every EQ tweak clicks.
      const band = bands[b] ?? {
        x1L: 0,
        x2L: 0,
        y1L: 0,
        y2L: 0,
        x1R: 0,
        x2R: 0,
        y1R: 0,
        y2R: 0,
      };
      band.b0 = b0 / a0;
      band.b1 = b1 / a0;
      band.b2 = b2 / a0;
      band.a1 = a1 / a0;
      band.a2 = a2 / a0;
      bands[b] = band;
    }
  }

  return function eq(input, output, params, sampleRate) {
    if (!designed || !sameParams(lastParams, params)) {
      design(params, sampleRate);
      lastParams = toFloat32(params).slice();
      designed = true;
    }

    const frameCount = input.length / 2;

    for (let i = 0; i < frameCount; i++) {
      let sL = input[i * 2];
      let sR = input[i * 2 + 1];

      for (let b = 0; b < bands.length; b++) {
        const band = bands[b];

        // Left channel
        const yL =
          band.b0 * sL +
          band.b1 * band.x1L +
          band.b2 * band.x2L -
          band.a1 * band.y1L -
          band.a2 * band.y2L;
        band.x2L = band.x1L;
        band.x1L = sL;
        band.y2L = band.y1L;
        band.y1L = yL;
        sL = yL;

        // Right channel
        const yR =
          band.b0 * sR +
          band.b1 * band.x1R +
          band.b2 * band.x2R -
          band.a1 * band.y1R -
          band.a2 * band.y2R;
        band.x2R = band.x1R;
        band.x1R = sR;
        band.y2R = band.y1R;
        band.y1R = yR;
        sR = yR;
      }

      output[i * 2] = clamp(sL, -1, 1);
      output[i * 2 + 1] = clamp(sR, -1, 1);
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Saturation / Exciter
   Params: [amount (0-1), mix (0-1), mode (0=tanh, 1=cubic, 2=soft)]
   Stateless — the curve is a pure function of the sample.
   ══════════════════════════════════════════════════════════════════════════ */

function createSaturationKernel() {
  return function saturate(input, output, params) {
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

      let wetL, wetR;
      switch (mode) {
        case 1: // cubic
          wetL = (xL - (xL * xL * xL) / 3) / drive;
          wetR = (xR - (xR * xR * xR) / 3) / drive;
          break;
        case 2: // soft
          wetL = xL / (1 + Math.abs(xL)) / drive;
          wetR = xR / (1 + Math.abs(xR)) / drive;
          break;
        default: // tanh
          wetL = Math.tanh(xL) / drive;
          wetR = Math.tanh(xR) / drive;
      }

      output[i * 2] = clamp(dryL * (1 - mix) + wetL * mix, -1, 1);
      output[i * 2 + 1] = clamp(dryR * (1 - mix) + wetR * mix, -1, 1);
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Full Mastering Chain (monolithic)
   Params: [5×3 EQ] + [6 comp] + [3 sat] + [4 limiter] = 28 floats
   Persists: the state of every stage
   ══════════════════════════════════════════════════════════════════════════ */

function createMasterChainKernel() {
  const eqKernel = createEqKernel();
  const compressorKernel = createCompressorKernel();
  const saturationKernel = createSaturationKernel();
  const limiterKernel = createLimiterKernel();

  let afterEq = null;
  let afterComp = null;
  let afterSat = null;

  return function process(input, output, params, sampleRate) {
    const length = input.length;
    if (!afterEq || afterEq.length !== length) {
      afterEq = new Float32Array(length);
      afterComp = new Float32Array(length);
      afterSat = new Float32Array(length);
    }

    const eqParams = params.subarray(0, 15);
    const compParams = params.subarray(15, 21);
    const satParams = params.subarray(21, 24);
    const limParams = params.subarray(24, 28);

    eqKernel(input, afterEq, eqParams, sampleRate);
    compressorKernel(afterEq, afterComp, compParams, sampleRate);
    saturationKernel(afterComp, afterSat, satParams, sampleRate);
    limiterKernel(afterSat, output, limParams, sampleRate);
  };
}

/* ── Kernel registry ────────────────────────────────────────────────────── */

const KERNEL_FACTORIES = {
  compressor: createCompressorKernel,
  limiter: createLimiterKernel,
  eq: createEqKernel,
  saturate: createSaturationKernel,
  process: createMasterChainKernel,
};

/**
 * Build one live kernel instance for a slot. Unknown names return the
 * pass-through kernel — a chain that cannot resolve a module must never mute
 * the track, which is what the `onaudioprocess` early-return used to do.
 */
function createKernelInstance(name) {
  const factory = KERNEL_FACTORIES[name];
  return factory ? factory() : identityKernel;
}

/* ══════════════════════════════════════════════════════════════════════════
   Processor
   ══════════════════════════════════════════════════════════════════════════ */

class PluginChainProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const opts = (options && options.processorOptions) || {};

    /** 1 = mono insert (track), 2 = stereo insert (master bus). */
    this._channels = opts.channels === 1 ? 1 : 2;
    /** Render quantum is 128 frames; grow only if a host ever exceeds it. */
    this._frames = new Float32Array(128 * 2);
    this._processed = new Float32Array(128 * 2);
    this._slots = [];

    this.setChain(opts.chain || []);

    this.port.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'chain') this.setChain(msg.slots || []);
    };
  }

  /** Resolve a chain description into live kernel instances. */
  setChain(slots) {
    const next = [];
    for (const slot of slots) {
      if (!slot) continue;
      next.push({
        id: slot.id || '',
        kernel: slot.kernel || 'identity',
        params: toFloat32(slot.params),
        run: createKernelInstance(slot.kernel),
      });
    }
    this._slots = next;
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0 || !output[0]) return true;

    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    const frames = outL.length;
    if (frames === 0) return true;

    if (this._frames.length < frames * 2) {
      this._frames = new Float32Array(frames * 2);
      this._processed = new Float32Array(frames * 2);
    }
    const interleaved = this._frames;
    const processed = this._processed;

    // Interleave the input. A mono insert mirrors its single channel into both
    // lanes, exactly like the ScriptProcessor insert it replaced; a missing
    // upstream connection reads as silence rather than stale data.
    const input = inputs[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input.length > 1 && input[1] ? input[1] : inL;
    for (let i = 0; i < frames; i++) {
      const left = inL ? inL[i] || 0 : 0;
      interleaved[i * 2] = left;
      interleaved[i * 2 + 1] = inR ? inR[i] || 0 : left;
    }

    for (let s = 0; s < this._slots.length; s++) {
      const slot = this._slots[s];
      slot.run(interleaved, processed, slot.params, sampleRate);
      interleaved.set(processed.subarray(0, frames * 2));
    }

    for (let i = 0; i < frames; i++) {
      outL[i] = interleaved[i * 2];
    }
    if (outR) {
      for (let i = 0; i < frames; i++) {
        outR[i] = interleaved[i * 2 + 1];
      }
    }

    // Keep the processor alive for the life of the node.
    return true;
  }
}

registerProcessor('plugin-chain-processor', PluginChainProcessor);
